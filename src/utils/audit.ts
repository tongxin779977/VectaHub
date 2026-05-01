import { mkdirSync, existsSync, appendFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { VectaHubError, ErrorType } from './errors.js';

const AUDIT_DIR = join(homedir(), '.vectahub', 'logs', 'audit');

let auditInstance: AuditLogger | null = null;

export enum AuditEventType {
  CLI_COMMAND = 'CLI_COMMAND',
  CLI_OUTPUT = 'CLI_OUTPUT',
  WORKFLOW_START = 'WORKFLOW_START',
  WORKFLOW_END = 'WORKFLOW_END',
  WORKFLOW_STEP = 'WORKFLOW_STEP',
  SANDBOX_DETECT = 'SANDBOX_DETECT',
  SECURITY_ALERT = 'SECURITY_ALERT',
  SECURITY_ACTION = 'SECURITY_ACTION',
  CONFIG_CHANGE = 'CONFIG_CHANGE',
  FILE_OPERATION = 'FILE_OPERATION',
  INTENT_MATCH = 'INTENT_MATCH',
  EXECUTOR_RESULT = 'EXECUTOR_RESULT',
}

export interface AuditEvent {
  event: AuditEventType;
  timestamp: string;
  sessionId: string;
  module: string;
  action: string;
  input?: unknown;
  output?: unknown;
  duration?: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

function ensureDir(dir: string): void {
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  } catch (error) {
    throw new VectaHubError(
      `无法创建审计日志目录: ${dir}`,
      ErrorType.FILESYSTEM,
      error,
    );
  }
}

function getAuditFilePath(date: Date = new Date()): string {
  const dateStr = date.toISOString().split('T')[0];
  return join(AUDIT_DIR, `${dateStr}.jsonl`);
}

class AuditLogger {
  private sessionId: string;
  private filePath: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || generateSessionId();
    ensureDir(AUDIT_DIR);
    this.filePath = getAuditFilePath();
  }

  getSessionId(): string {
    return this.sessionId;
  }

  write(event: AuditEvent): void {
    try {
      const line = JSON.stringify(event) + '\n';
      appendFileSync(this.filePath, line, 'utf-8');
    } catch {
      // Silently ignore write errors (e.g., permission denied in sandbox)
    }
  }

  query(options: {
    startDate?: Date;
    endDate?: Date;
    eventType?: string;
    module?: string;
    limit?: number;
  } = {}): AuditEvent[] {
    const { eventType, module, limit = 100 } = options;
    const results: AuditEvent[] = [];

    const files = this.listAuditFiles();

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as AuditEvent;
          if (eventType && event.event !== eventType) continue;
          if (module && event.module !== module) continue;
          results.push(event);
          if (results.length >= limit) break;
        } catch {
          continue;
        }
      }
      if (results.length >= limit) break;
    }

    return results;
  }

  private listAuditFiles(): string[] {
    if (!existsSync(AUDIT_DIR)) return [];

    const files = readdirSync(AUDIT_DIR)
      .filter((f: string) => f.endsWith('.jsonl'))
      .map((f: string) => join(AUDIT_DIR, f))
      .sort();

    return files;
  }
}

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function initAuditLogger(sessionId?: string): AuditLogger {
  auditInstance = new AuditLogger(sessionId);
  return auditInstance;
}

export function getAuditInstance(): AuditLogger {
  if (!auditInstance) {
    auditInstance = initAuditLogger();
  }
  return auditInstance;
}

export function queryAuditLogs(options: {
  startDate?: Date;
  endDate?: Date;
  eventType?: string;
  module?: string;
  limit?: number;
} = {}): AuditEvent[] {
  const auditLogger = getAuditInstance();
  return auditLogger.query(options);
}

export function getCurrentSessionId(): string {
  return getAuditInstance().getSessionId();
}

export const audit = {
  log(event: AuditEvent): void {
    getAuditInstance().write(event);
  },

  cliCommand(cmd: string, args: string[], sessionId: string): void {
    this.log({
      event: AuditEventType.CLI_COMMAND,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'CLI',
      action: cmd,
      input: args,
      success: true,
    });
  },

  cliOutput(cmd: string, output: string, sessionId: string): void {
    this.log({
      event: AuditEventType.CLI_OUTPUT,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'CLI',
      action: cmd,
      output: output.substring(0, 1000),
      success: true,
    });
  },

  workflowStart(workflowId: string, intent: string, sessionId: string, metadata?: Record<string, unknown>): void {
    this.log({
      event: AuditEventType.WORKFLOW_START,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Workflow',
      action: 'start',
      input: { workflowId, intent },
      success: true,
      metadata,
    });
  },

  workflowEnd(workflowId: string, status: string, duration: number, sessionId: string): void {
    this.log({
      event: AuditEventType.WORKFLOW_END,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Workflow',
      action: 'end',
      input: { workflowId },
      output: { status },
      duration,
      success: status === 'COMPLETED',
    });
  },

  workflowStep(stepId: string, cli: string, args: string[], sessionId: string, metadata?: Record<string, unknown>): void {
    this.log({
      event: AuditEventType.WORKFLOW_STEP,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Executor',
      action: 'step_execute',
      input: { stepId, cli, args },
      success: true,
      metadata,
    });
  },

  securityAlert(ruleId: string, command: string, severity: string, sessionId: string): void {
    this.log({
      event: AuditEventType.SECURITY_ALERT,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Security',
      action: 'dangerous_command_detected',
      input: { ruleId, command, severity },
      success: true,
      metadata: { severity },
    });
  },

  securityAction(action: string, target: string, result: string, sessionId: string): void {
    this.log({
      event: AuditEventType.SECURITY_ACTION,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Security',
      action,
      input: { target },
      output: { result },
      success: result === 'BLOCKED' || result === 'ALLOWED',
    });
  },

  configChange(module: string, key: string, oldVal: unknown, newVal: unknown, sessionId: string): void {
    this.log({
      event: AuditEventType.CONFIG_CHANGE,
      timestamp: new Date().toISOString(),
      sessionId,
      module,
      action: 'config_update',
      input: { key, oldVal, newVal },
      success: true,
    });
  },

  intentMatch(intent: string, confidence: number, params: Record<string, unknown>, sessionId: string, metadata?: Record<string, unknown>): void {
    this.log({
      event: AuditEventType.INTENT_MATCH,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'NLP',
      action: 'intent_matched',
      input: { intent, confidence },
      output: params,
      success: confidence >= 0.7,
      metadata,
    });
  },

  executorResult(stepId: string, cli: string, exitCode: number, duration: number, sessionId: string, metadata?: Record<string, unknown>): void {
    this.log({
      event: AuditEventType.EXECUTOR_RESULT,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Executor',
      action: 'step_result',
      input: { stepId, cli, exitCode },
      duration,
      success: exitCode === 0,
      metadata,
    });
  },

  sandboxDetect(isDangerous: boolean, level: string, command: string, sessionId: string): void {
    this.log({
      event: AuditEventType.SANDBOX_DETECT,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'Sandbox',
      action: 'detect',
      input: { command, level },
      output: { isDangerous },
      success: true,
    });
  },
};
