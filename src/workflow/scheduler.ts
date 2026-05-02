import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SCHEDULES_FILE = join(homedir(), '.vectahub', 'schedules.json');

export interface ScheduleEntry {
  id: string;
  name: string;
  cron: string;
  workflowId?: string;
  command?: string;
  args?: string[];
  enabled: boolean;
  lastRun?: string;
  createdAt: string;
}

export interface ScheduleManager {
  add(entry: Omit<ScheduleEntry, 'id' | 'createdAt' | 'enabled'>): ScheduleEntry;
  remove(id: string): boolean;
  list(): ScheduleEntry[];
  start(): void;
  stop(): void;
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

export function createScheduleManager(): ScheduleManager {
  let timers: Map<string, NodeJS.Timeout> = new Map();

  function runTask(entry: ScheduleEntry): void {
    entry.lastRun = new Date().toISOString();
    saveSchedules(loadSchedules());
  }

  function scheduleEntry(entry: ScheduleEntry): void {
    if (timers.has(entry.id)) {
      clearInterval(timers.get(entry.id));
    }

    const interval = parseCronInterval(entry.cron);
    const timer = setInterval(() => {
      if (entry.enabled) {
        runTask(entry);
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
