import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';
import type { WorkflowEngine } from './engine.js';
import type { Workflow } from '../types/index.js';
import { getAuditInstance, AuditEventType, audit } from '../infrastructure/audit/index.js';

const SCHEDULES_FILE = join(homedir(), '.vectahub', 'schedules.json');

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
  add(entry: Omit<ScheduleEntry, 'id' | 'createdAt' | 'enabled' | 'runCount'>): ScheduleEntry;
  remove(id: string): boolean;
  list(): ScheduleEntry[];
  start(): void;
  stop(): void;
}

async function executeCommand(entry: ScheduleEntry): Promise<{ success: boolean; error?: string }> {
  const command = entry.command;
  if (!command) return { success: false, error: 'No command to execute' };

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
  if (!entry.workflowFile || !engine) return { success: false, error: 'No workflow or engine' };

  try {
    const content = readFileSync(entry.workflowFile, 'utf-8');
    const workflow = JSON.parse(content) as Workflow;
    const result = await engine.execute(workflow);
    return { success: result.status === 'COMPLETED', error: result.warnings?.join('; ') };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function updateEntryStatus(entry: ScheduleEntry, result: { success: boolean; error?: string }): void {
  const schedules = loadSchedules();
  const idx = schedules.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    schedules[idx].lastRun = new Date().toISOString();
    schedules[idx].lastStatus = result.success ? 'SUCCESS' : 'FAILED';
    schedules[idx].lastError = result.error;
    schedules[idx].runCount = (schedules[idx].runCount || 0) + 1;
    saveSchedules(schedules);
  }
}

function ensureSchedulesDir(): void {
  const dir = join(homedir(), '.vectahub');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function loadSchedules(): ScheduleEntry[] {
  ensureSchedulesDir();
  if (!existsSync(SCHEDULES_FILE)) {
    return [];
  }
  try {
    const raw = readFileSync(SCHEDULES_FILE, 'utf-8');
    return JSON.parse(raw) as ScheduleEntry[];
  } catch {
    return [];
  }
}

function saveSchedules(entries: ScheduleEntry[]): void {
  ensureSchedulesDir();
  writeFileSync(SCHEDULES_FILE, JSON.stringify(entries, null, 2), 'utf-8');
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

export function createScheduleManager(options: ScheduleManagerOptions = {}): ScheduleManager {
  let timers: Map<string, NodeJS.Timeout> = new Map();
  const { engine } = options;

  async function runTask(entry: ScheduleEntry): Promise<void> {
    let result: { success: boolean; error?: string };
    
    if (entry.workflowFile && engine) {
      result = await executeWorkflow(entry, engine);
    } else if (entry.command) {
      result = await executeCommand(entry);
    } else {
      result = { success: false, error: 'No workflow or command configured' };
    }

    updateEntryStatus(entry, result);

    audit.workflowStep(
      `schedule:${entry.id}`,
      entry.workflowFile || entry.command || '',
      entry.args || [],
      getAuditInstance().getSessionId(),
      { scheduleId: entry.id, status: result.success ? 'SUCCESS' : 'FAILED', error: result.error }
    );
  }

  function scheduleEntry(entry: ScheduleEntry): void {
    if (timers.has(entry.id)) {
      clearInterval(timers.get(entry.id));
    }

    const interval = parseCronInterval(entry.cron);
    const timer = setInterval(async () => {
      if (entry.enabled) {
        await runTask(entry);
      }
    }, interval);

    timers.set(entry.id, timer);
  }

  return {
    add(entry): ScheduleEntry {
      const schedules = loadSchedules();
      const newEntry: ScheduleEntry = {
        ...entry,
        id: `sched_${Date.now()}`,
        createdAt: new Date().toISOString(),
        enabled: true,
        runCount: 0,
      };
      schedules.push(newEntry);
      saveSchedules(schedules);
      scheduleEntry(newEntry);
      return newEntry;
    },

    remove(id: string): boolean {
      let schedules = loadSchedules();
      const before = schedules.length;
      schedules = schedules.filter((e) => e.id !== id);
      if (schedules.length < before) {
        saveSchedules(schedules);
        const timer = timers.get(id);
        if (timer) {
          clearInterval(timer);
          timers.delete(id);
        }
        return true;
      }
      return false;
    },

    list(): ScheduleEntry[] {
      return loadSchedules();
    },

    start(): void {
      const schedules = loadSchedules();
      for (const entry of schedules) {
        if (entry.enabled) {
          scheduleEntry(entry);
        }
      }
    },

    stop(): void {
      for (const [id, timer] of timers) {
        clearInterval(timer);
      }
      timers.clear();
    },
  };
}
