import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createScheduleManager, type ScheduleEntry } from './scheduler.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SCHEDULES_FILE = join(homedir(), '.vectahub', 'schedules.json');

describe('scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    if (existsSync(SCHEDULES_FILE)) {
      unlinkSync(SCHEDULES_FILE);
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('creates a new schedule entry', () => {
    const manager = createScheduleManager();
    const entry = manager.add({
      name: 'test schedule',
      cron: '*/5 * * * *',
      workflowId: 'wf_1',
    });

    expect(entry.id).toMatch(/^sched_/);
    expect(entry.name).toBe('test schedule');
    expect(entry.enabled).toBe(true);
    expect(entry.createdAt).toBeDefined();
  });

  it('lists all schedules', () => {
    const manager = createScheduleManager();
    manager.add({ name: 'schedule 1', cron: '*/5 * * * *', workflowId: 'wf_1' });
    manager.add({ name: 'schedule 2', cron: '* * * * *', command: 'git status', args: [] });

    expect(manager.list().length).toBe(2);
  });

  it('removes a schedule', () => {
    const manager = createScheduleManager();
    const entry = manager.add({ name: 'to remove', cron: '* * * * *', workflowId: 'wf_1' });

    expect(manager.remove(entry.id)).toBe(true);
    expect(manager.list().length).toBe(0);
    expect(manager.remove('nonexistent')).toBe(false);
  });

  it('start schedules existing entries', () => {
    const manager = createScheduleManager();
    manager.add({ name: 'running', cron: '* * * * *', workflowId: 'wf_1' });
    manager.start();

    expect(manager.list().length).toBe(1);
  });

  it('stop clears all timers', () => {
    const manager = createScheduleManager();
    manager.add({ name: 'stopping', cron: '* * * * *', workflowId: 'wf_1' });
    manager.start();
    manager.stop();

    expect(manager.list().length).toBe(1);
  });
});
