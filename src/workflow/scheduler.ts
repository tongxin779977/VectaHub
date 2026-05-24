import type { WorkflowEngine } from './engine.js';
import type { Workflow } from '../types/index.js';
import type { AuditHelper } from '../infrastructure/audit/index.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import { createDetector } from '../sandbox/detector.js';

export interface ScheduleEntry {
  id: string;
  name: string;
  cron: string;
  workflowId?: string;
  workflowFile?: string;
  command?: string;
  args?: string[];
  enabled: boolean;
  lastRun?: string;
  lastStatus?: 'SUCCESS' | 'FAILED' | 'RUNNING';
  lastError?: string;
  runCount: number;
  createdAt: string;
}

export interface ScheduleManagerOptions {
  engine?: WorkflowEngine;
  audit: AuditHelper;
  environment: IEnvironmentService;
}

export interface ScheduleManager {
  add(entry: Omit<ScheduleEntry, 'id' | 'createdAt' | 'enabled' | 'runCount'>): Promise<ScheduleEntry>;
  remove(id: string): Promise<boolean>;
  list(): Promise<ScheduleEntry[]>;
  start(): Promise<void>;
  stop(): void;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function isNotFoundError(error: unknown): boolean {
  if (isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
    return true;
  }
  if (typeof error === 'object' && error !== null && 'cause' in error) {
    return isNotFoundError((error as { cause: unknown }).cause);
  }
  return false;
}

/**
 * 执行调度命令，注入审计助手
 */
async function executeCommand(
  entry: ScheduleEntry,
  auditHelper: AuditHelper,
  sessionId: string,
  environment: IEnvironmentService
): Promise<{ success: boolean; error?: string }> {
  const command = entry.command;
  if (!command) return { success: false, error: 'No command to execute' };

  const detector = createDetector();
  const detection = detector.detect(command);

  if (detection.isDangerous) {
    auditHelper.sandboxDetect(
      command,
      detection.isDangerous,
      detection.level || 'none',
      sessionId
    );
    return {
      success: false,
      error: `Dangerous command blocked: ${detection.reason} (level: ${detection.level})`
    };
  }

  return new Promise((resolve) => {
    const child = environment.spawn(command, entry.args || [], { stdio: 'pipe' });
    let stderr = '';
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
    child.on('close', (code: number | null) => {
      resolve({ success: code === 0, error: code !== 0 ? stderr.trim() : undefined });
    });
    child.on('error', (err: Error) => {
      resolve({ success: false, error: err.message });
    });
  });
}

async function executeWorkflow(entry: ScheduleEntry, engine: WorkflowEngine | undefined, environment: IEnvironmentService): Promise<{ success: boolean; error?: string }> {
  if (!entry.workflowFile) return { success: false, error: 'workflowFile is required for workflow schedule execution' };
  if (!engine) return { success: false, error: 'Workflow engine is required for workflow schedule execution' };

  const content = await environment.readFileAsync(entry.workflowFile);
  const workflow = JSON.parse(content) as Workflow;
  const result = await engine.execute(workflow);
  return { success: result.status === 'COMPLETED', error: result.warnings?.join('; ') };
}

async function updateEntryStatus(entry: ScheduleEntry, result: { success: boolean; error?: string }, environment: IEnvironmentService): Promise<void> {
  const schedules = await loadSchedules(environment);
  const idx = schedules.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    schedules[idx].lastRun = new Date().toISOString();
    schedules[idx].lastStatus = result.success ? 'SUCCESS' : 'FAILED';
    schedules[idx].lastError = result.error;
    schedules[idx].runCount = (schedules[idx].runCount || 0) + 1;
    await saveSchedules(schedules, environment);
  }
}

async function ensureSchedulesDir(environment: IEnvironmentService): Promise<void> {
  await environment.mkdirAsync(environment.getHomePath(), { recursive: true });
}

async function loadSchedules(environment: IEnvironmentService): Promise<ScheduleEntry[]> {
  await ensureSchedulesDir(environment);
  const schedulesFile = environment.getPath('schedules.json');
  try {
    const raw = await environment.readFileAsync(schedulesFile);
    return JSON.parse(raw) as ScheduleEntry[];
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

function missingWorkflowFileError(entry: ScheduleEntry): { success: boolean; error: string } {
  return {
    success: false,
    error: `workflowFile is required when workflowId is set: ${entry.workflowId}`,
  };
}

/**
 * 运行调度条目，注入审计助手
 */
async function runEntry(
  entry: ScheduleEntry,
  engine: WorkflowEngine | undefined,
  auditHelper: AuditHelper,
  sessionId: string,
  environment: IEnvironmentService
): Promise<{ success: boolean; error?: string }> {
  if (entry.workflowFile) {
    return executeWorkflow(entry, engine, environment);
  }
  if (entry.workflowId) {
    return missingWorkflowFileError(entry);
  }
  if (entry.command) {
    return executeCommand(entry, auditHelper, sessionId, environment);
  }
  return { success: false, error: 'No workflow or command configured' };
}

/**
 * 运行任务并持久化结果，注入审计助手
 */
async function runTaskAndPersist(
  entry: ScheduleEntry,
  engine: WorkflowEngine | undefined,
  auditHelper: AuditHelper,
  sessionId: string,
  environment: IEnvironmentService
): Promise<void> {
  const result = await runEntry(entry, engine, auditHelper, sessionId, environment);
  await updateEntryStatus(entry, result, environment);

  auditHelper.workflowStep(
    `schedule:${entry.id}`,
    entry.workflowFile || entry.command || '',
    entry.args || [],
    sessionId,
    { scheduleId: entry.id, status: result.success ? 'SUCCESS' : 'FAILED', error: result.error }
  );
}

async function runTask(
  entry: ScheduleEntry,
  engine: WorkflowEngine | undefined,
  auditHelper: AuditHelper,
  sessionId: string,
  environment: IEnvironmentService
): Promise<void> {
  try {
    await runTaskAndPersist(entry, engine, auditHelper, sessionId, environment);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateEntryStatus(entry, { success: false, error: message }, environment);
    throw error;
  }
}

async function runScheduledEntry(
  entry: ScheduleEntry,
  engine: WorkflowEngine | undefined,
  auditHelper: AuditHelper,
  sessionId: string,
  environment: IEnvironmentService
): Promise<void> {
  await runTask(entry, engine, auditHelper, sessionId, environment);
}

export function createScheduleManager(options: ScheduleManagerOptions): ScheduleManager {
  const timers: Map<string, NodeJS.Timeout> = new Map();
  const { engine, environment } = options;
  const auditHelper: AuditHelper = options.audit;

  function scheduleEntry(entry: ScheduleEntry): void {
    if (timers.has(entry.id)) {
      const existing = timers.get(entry.id);
      if (existing) {
        clearInterval(existing);
      }
    }

    const interval = parseCronInterval(entry.cron);
    const timer = setInterval(() => {
      if (!entry.enabled) return;
      const sessionId = `schedule:${entry.id}`;
      void runScheduledEntry(entry, engine, auditHelper, sessionId, environment);
    }, interval);

    timers.set(entry.id, timer);
  }

  return {
    async add(entry): Promise<ScheduleEntry> {
      const schedules = await loadSchedules(environment);
      const newEntry: ScheduleEntry = {
        ...entry,
        id: `sched_${Date.now()}`,
        createdAt: new Date().toISOString(),
        enabled: true,
        runCount: 0,
      };
      schedules.push(newEntry);
      await saveSchedules(schedules, environment);
      scheduleEntry(newEntry);
      return newEntry;
    },

    async remove(id: string): Promise<boolean> {
      let schedules = await loadSchedules(environment);
      const before = schedules.length;
      schedules = schedules.filter((e) => e.id !== id);
      if (schedules.length < before) {
        await saveSchedules(schedules, environment);
        const timer = timers.get(id);
        if (timer) {
          clearInterval(timer);
          timers.delete(id);
        }
        return true;
      }
      return false;
    },

    async list(): Promise<ScheduleEntry[]> {
      return loadSchedules(environment);
    },

    async start(): Promise<void> {
      const schedules = await loadSchedules(environment);
      for (const entry of schedules) {
        if (entry.enabled) {
          scheduleEntry(entry);
        }
      }
    },

    stop(): void {
      for (const [, timer] of timers) {
        clearInterval(timer);
      }
      timers.clear();
    },
  };
}

async function saveSchedules(entries: ScheduleEntry[], environment: IEnvironmentService): Promise<void> {
  await ensureSchedulesDir(environment);
  environment.writeFile(environment.getPath('schedules.json'), JSON.stringify(entries, null, 2));
}

function parseCronInterval(cron: string): number {
  const everyMinutesMatch = cron.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (everyMinutesMatch) {
    const minutes = Number.parseInt(everyMinutesMatch[1], 10);
    if (Number.isFinite(minutes) && minutes > 0) {
      return minutes * 60 * 1000;
    }
  }
  if (cron === '* * * * *') return 60 * 1000;

  return 5 * 60 * 1000;
}
