import { mkdirSync, existsSync, appendFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { VectaHubError, ErrorType } from '../errors/index.js';
import { redactSensitiveData } from '../../utils/sensitive-data.js';
import { getVectaHubPath } from '../paths/index.js';

// 导出 AuditService
export { AuditService } from './service.js';

/**
 * @deprecated 使用 InfrastructureContext.audit 或 new AuditLogger() 构造函数代替，支持依赖注入
 */
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
  ENV_AUDIT = 'ENV_AUDIT',
}

export * from './env-audit.js';

export interface AuditEvent {
  event: AuditEventType;
  timestamp: string;
  sessionId: string;
  user?: string;
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

function getAuditFilePath(baseDir: string, date: Date = new Date()): string {
  const dateStr = date.toISOString().split('T')[0];
  return join(baseDir, `${dateStr}.jsonl`);
}

function isAuditDisabled(): boolean {
  return process.env.VECTAHUB_AUDIT_DISABLED === '1';
}

/**
 * 审计日志记录器
 * 支持依赖注入：通过 new AuditLogger(sessionId, baseDir) 创建独立实例
 */
export class AuditLogger {
  private sessionId: string;
  private baseDir: string;
  private filePath: string;
  private readonly onError: (error: Error) => void;

  constructor(sessionId?: string, baseDir?: string, options?: { onError?: (error: Error) => void }) {
    this.sessionId = sessionId || generateSessionId();
    this.baseDir = baseDir ?? getVectaHubPath('logs', 'audit');
    this.filePath = getAuditFilePath(this.baseDir);
    this.onError = options?.onError ?? ((error) => {
      throw error;
    });
    if (!isAuditDisabled()) {
      ensureDir(this.baseDir);
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  write(event: AuditEvent): void {
    if (isAuditDisabled()) {
      return;
    }

    try {
      ensureDir(this.baseDir);
      const sanitizedEvent = this.sanitizeEvent(event);
      const line = JSON.stringify(sanitizedEvent) + '\n';
      appendFileSync(this.filePath, line, 'utf-8');
    } catch (error) {
      const err = error as Error;
      this.onError(err);
    }
  }

  private sanitizeEvent(event: AuditEvent): AuditEvent {
    return {
      ...event,
      input: redactSensitiveData(event.input),
      output: redactSensitiveData(event.output),
      error: event.error ? redactSensitiveData(event.error) as string : undefined,
      metadata: event.metadata ? redactSensitiveData(event.metadata) as Record<string, unknown> : undefined,
    };
  }

  query(options: {
    startDate?: Date;
    endDate?: Date;
    eventType?: string;
    module?: string;
    user?: string;
    command?: string;
    limit?: number;
  } = {}): AuditEvent[] {
    const { eventType, module, user, command, limit = 100 } = options;
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
          if (user && event.user !== user) continue;
          if (command && event.action !== command) continue;
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

  export(format: 'json' | 'csv'): string {
    const events = this.query({ limit: 10000 });

    if (format === 'csv') {
      const header = 'timestamp,sessionId,user,module,action,success\n';
      const rows = events.map((e) =>
        `${e.timestamp},${e.sessionId},${e.user || ''},${e.module},${e.action},${e.success}`
      ).join('\n');
      return header + rows;
    }

    return JSON.stringify(events, null, 2);
  }

  private listAuditFiles(): string[] {
    if (!existsSync(this.baseDir)) return [];

    const files = readdirSync(this.baseDir)
      .filter((f: string) => f.endsWith('.jsonl'))
      .map((f: string) => join(this.baseDir, f))
      .sort();

    return files;
  }
}

export function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function initAuditLogger(sessionId?: string, baseDir?: string): AuditLogger {
  auditInstance = new AuditLogger(sessionId, baseDir);
  return auditInstance;
}

/**
 * @deprecated 使用 new AuditLogger() 构造函数代替，支持依赖注入
 */
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

/**
 * 审计便捷方法接口
 * 定义 audit 对象的完整类型，便于依赖注入和测试替换
 */
export interface AuditHelper {
  log(event: AuditEvent): void;
  cliCommand(cmd: string, args: string[], sessionId: string): void;
  cliOutput(cmd: string, output: string, sessionId: string): void;
  workflowStart(workflowId: string, intent: string, sessionId: string, metadata?: Record<string, unknown>): void;
  workflowEnd(workflowId: string, status: string, duration: number, sessionId: string): void;
  workflowStep(stepId: string, cli: string, args: string[], sessionId: string, metadata?: Record<string, unknown>): void;
  securityAlert(ruleId: string, command: string, severity: string, sessionId: string): void;
  securityAction(action: string, target: string, result: string, sessionId: string): void;
  configChange(module: string, key: string, oldVal: unknown, newVal: unknown, sessionId: string): void;
  intentMatch(intent: string, confidence: number, params: Record<string, unknown>, sessionId: string, metadata?: Record<string, unknown>): void;
  executorResult(stepId: string, cli: string, exitCode: number, duration: number, sessionId: string, metadata?: Record<string, unknown>): void;
  fileOperation(operation: string, path: string, sessionId: string, success: boolean, error?: string): void;
  sandboxDetect(command: string, isDangerous: boolean, severity: string, sessionId: string): void;
}

export function createNoopAuditHelper(): AuditHelper {
  return {
    log(): void {},
    cliCommand(): void {},
    cliOutput(): void {},
    workflowStart(): void {},
    workflowEnd(): void {},
    workflowStep(): void {},
    securityAlert(): void {},
    securityAction(): void {},
    configChange(): void {},
    intentMatch(): void {},
    executorResult(): void {},
    fileOperation(): void {},
    sandboxDetect(): void {},
  };
}

/**
 * 创建审计便捷方法集
 * 接受 AuditLogger 实例注入，返回与全局 audit 对象相同接口的便捷方法
 * @param logger - AuditLogger 实例
 */
export function createAuditHelper(logger: AuditLogger): AuditHelper {
  return {
    log(event: AuditEvent): void {
      logger.write(event);
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
        action: 'step_complete',
        input: { stepId, cli },
        output: { exitCode },
        duration,
        success: exitCode === 0,
        metadata,
      });
    },

    fileOperation(operation: string, path: string, sessionId: string, success: boolean, error?: string): void {
      this.log({
        event: AuditEventType.FILE_OPERATION,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Filesystem',
        action: operation,
        input: { path },
        success,
        error,
      });
    },

    sandboxDetect(command: string, isDangerous: boolean, severity: string, sessionId: string): void {
      this.log({
        event: AuditEventType.SANDBOX_DETECT,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'Sandbox',
        action: 'detection',
        input: { command, isDangerous, severity },
        success: !isDangerous,
      });
    },
  };
}

/**
 * 兼容桥接层：历史全局 audit 对象仍通过全局 AuditLogger 转发。
 * @deprecated 推荐使用 createAuditHelper(logger) 注入 AuditLogger 实例
 */
export function createCompatAuditHelper(): AuditHelper {
  const resolveHelper = (): AuditHelper => createAuditHelper(getAuditInstance());

  return {
    log(event: AuditEvent): void {
      resolveHelper().log(event);
    },
    cliCommand(cmd: string, args: string[], sessionId: string): void {
      resolveHelper().cliCommand(cmd, args, sessionId);
    },
    cliOutput(cmd: string, output: string, sessionId: string): void {
      resolveHelper().cliOutput(cmd, output, sessionId);
    },
    workflowStart(workflowId: string, input: string, sessionId: string): void {
      resolveHelper().workflowStart(workflowId, input, sessionId);
    },
    workflowEnd(workflowId: string, status: string, duration: number, sessionId: string): void {
      resolveHelper().workflowEnd(workflowId, status, duration, sessionId);
    },
    workflowStep(stepId: string, cli: string, args: string[], sessionId: string, metadata?: Record<string, unknown>): void {
      resolveHelper().workflowStep(stepId, cli, args, sessionId, metadata);
    },
    securityAlert(ruleId: string, command: string, severity: string, sessionId: string): void {
      resolveHelper().securityAlert(ruleId, command, severity, sessionId);
    },
    securityAction(action: string, target: string, result: string, sessionId: string): void {
      resolveHelper().securityAction(action, target, result, sessionId);
    },
    configChange(module: string, key: string, oldValue: unknown, newValue: unknown, sessionId: string): void {
      resolveHelper().configChange(module, key, oldValue, newValue, sessionId);
    },
    intentMatch(intent: string, confidence: number, params: Record<string, unknown>, sessionId: string): void {
      resolveHelper().intentMatch(intent, confidence, params, sessionId);
    },
    executorResult(stepId: string, cli: string, exitCode: number, duration: number, sessionId: string, metadata?: Record<string, unknown>): void {
      resolveHelper().executorResult(stepId, cli, exitCode, duration, sessionId, metadata);
    },
    fileOperation(operation: string, path: string, sessionId: string, success: boolean, error?: string): void {
      resolveHelper().fileOperation(operation, path, sessionId, success, error);
    },
    sandboxDetect(command: string, isDangerous: boolean, severity: string, sessionId: string): void {
      resolveHelper().sandboxDetect(command, isDangerous, severity, sessionId);
    },
  };
}

/**
 * 全局审计便捷方法对象（向后兼容）
 * @deprecated 推荐使用 createAuditHelper(logger) 注入 AuditLogger 实例
 */
export const audit: AuditHelper = createCompatAuditHelper();
