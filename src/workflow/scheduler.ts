import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'child_process';
import type { WorkflowEngine } from './engine.js';
import type { Workflow } from '../types/index.js';
import { getAuditInstance, audit } from '../infrastructure/audit/index.js';
import { createDetector } from '../sandbox/detector.js';
import { getVectaHubHome, getVectaHubPath } from '../utils/paths.js';

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
  return isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

async function executeCommand(entry: ScheduleEntry): Promise<{ success: boolean; error?: string }> {
  const command = entry.command;
  if (!command) return { success: false, error: 'No command to execute' };

  const detector = createDetector();
  const detection = detector.detect(command);
  
  if (detection.isDangerous) {
    audit.sandboxDetect(
      command,
      detection.isDangerous,
      detection.level || 'none',
      getAuditInstance().getSessionId()
    );
    return { 
      success: false, 
      error: `Dangerous command blocked: ${detection.reason} (level: ${detection.level})` 
    };
  }

  return new Promise((resolve) => {
    const child = spawn(command, entry.args || [], { stdio: 'pipe' });
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

async function executeWorkflow(entry: ScheduleEntry, engine?: WorkflowEngine): Promise<{ success: boolean; error?: string }> {
  if (!entry.workflowFile) return { success: false, error: 'workflowFile is required for workflow schedule execution' };
  if (!engine) return { success: false, error: 'Workflow engine is required for workflow schedule execution' };

  const content = await readFile(entry.workflowFile, 'utf-8');
  const workflow = JSON.parse(content) as Workflow;
  const result = await engine.execute(workflow);
  return { success: result.status === 'COMPLETED', error: result.warnings?.join('; ') };
}

async function updateEntryStatus(entry: ScheduleEntry, result: { success: boolean; error?: string }): Promise<void> {
  const schedules = await loadSchedules();
  const idx = schedules.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    schedules[idx].lastRun = new Date().toISOString();
    schedules[idx].lastStatus = result.success ? 'SUCCESS' : 'FAILED';
    schedules[idx].lastError = result.error;
    schedules[idx].runCount = (schedules[idx].runCount || 0) + 1;
    await saveSchedules(schedules);
  }
}

async function ensureSchedulesDir(): Promise<void> {
  await mkdir(getVectaHubHome(), { recursive: true });
}

async function loadSchedules(): Promise<ScheduleEntry[]> {
  await ensureSchedulesDir();
  const schedulesFile = getVectaHubPath('schedules.json');
  try {
    const raw = await readFile(schedulesFile, 'utf-8');
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

async function runEntry(entry: ScheduleEntry, engine?: WorkflowEngine): Promise<{ success: boolean; error?: string }> {
  if (entry.workflowFile) {
    return executeWorkflow(entry, engine);
  }
  if (entry.workflowId) {
    return missingWorkflowFileError(entry);
  }
  if (entry.command) {
    return executeCommand(entry);
  }
  return { success: false, error: 'No workflow or command configured' };
}

async function runTaskAndPersist(entry: ScheduleEntry, engine?: WorkflowEngine): Promise<void> {
  const result = await runEntry(entry, engine);
  await updateEntryStatus(entry, result);

  audit.workflowStep(
    `schedule:${entry.id}`,
    entry.workflowFile || entry.command || '',
    entry.args || [],
    getAuditInstance().getSessionId(),
    { scheduleId: entry.id, status: result.success ? 'SUCCESS' : 'FAILED', error: result.error }
  );
}

async function runTask(entry: ScheduleEntry, engine?: WorkflowEngine): Promise<void> {
  try {
    await runTaskAndPersist(entry, engine);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateEntryStatus(entry, { success: false, error: message });
    throw error;
  }
}

async function runScheduledEntry(entry: ScheduleEntry, engine?: WorkflowEngine): Promise<void> {
  await runTask(entry, engine);
}

export function createScheduleManager(options: ScheduleManagerOptions = {}): ScheduleManager {
  const timers: Map<string, NodeJS.Timeout> = new Map();
  const { engine } = options;

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
      void runScheduledEntry(entry, engine);
    }, interval);

    timers.set(entry.id, timer);
  }

  return {
    async add(entry): Promise<ScheduleEntry> {
      const schedules = await loadSchedules();
      const newEntry: ScheduleEntry = {
        ...entry,
        id: `sched_${Date.now()}`,
        createdAt: new Date().toISOString(),
        enabled: true,
        runCount: 0,
      };
      schedules.push(newEntry);
      await saveSchedules(schedules);
      scheduleEntry(newEntry);
      return newEntry;
    },

    async remove(id: string): Promise<boolean> {
      let schedules = await loadSchedules();
      const before = schedules.length;
      schedules = schedules.filter((e) => e.id !== id);
      if (schedules.length < before) {
        await saveSchedules(schedules);
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
      return loadSchedules();
    },

    async start(): Promise<void> {
      const schedules = await loadSchedules();
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

async function saveSchedules(entries: ScheduleEntry[]): Promise<void> {
  await ensureSchedulesDir();
  await writeFile(getVectaHubPath('schedules.json'), JSON.stringify(entries, null, 2), 'utf-8');
}

function parseCronInterval(cron: string): number {
  const match = cron.match(/^(\*|0) \/(\d+) (\*|\*) (\*|\*) (\*|\*)$/);
  if (match) {
    const minutes = parseInt(match[2], 10);
    return minutes * 60 * 1000;
  }

  if (cron === '* * * * *') return 60 * 1000;
  if (cron.startsWith('*/')) {
    const mins = parseInt(cron.split(' ')[1] || '5', 10);
    return mins * 60 * 1000;
  }

  return 5 * 60 * 1000;
}
