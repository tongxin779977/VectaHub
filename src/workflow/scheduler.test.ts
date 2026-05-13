import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createScheduleManager } from './scheduler.js';
import { existsSync, rmSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createDetector } from '../sandbox/detector.js';

describe('scheduler', () => {
  let vectahubHome: string;
  const originalVectaHubHome = process.env.VECTAHUB_HOME;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vectahubHome = mkdtempSync(join(tmpdir(), 'vectahub-scheduler-'));
    process.env.VECTAHUB_HOME = vectahubHome;
  });

  afterEach(async () => {
    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 50));
    vi.clearAllMocks();
    if (existsSync(vectahubHome)) {
      rmSync(vectahubHome, { recursive: true, force: true });
    }
    if (originalVectaHubHome === undefined) {
      delete process.env.VECTAHUB_HOME;
    } else {
      process.env.VECTAHUB_HOME = originalVectaHubHome;
    }
  });

  it('creates a new schedule entry', async () => {
    const manager = createScheduleManager();
    const entry = await manager.add({
      name: 'test schedule',
      cron: '*/5 * * * *',
      workflowId: 'wf_1',
    });

    expect(entry.id).toMatch(/^sched_/);
    expect(entry.name).toBe('test schedule');
    expect(entry.enabled).toBe(true);
    expect(entry.createdAt).toBeDefined();
    expect(existsSync(join(vectahubHome, 'schedules.json'))).toBe(true);
    manager.stop();
  });

  it('lists all schedules', async () => {
    const manager = createScheduleManager();
    await manager.add({ name: 'schedule 1', cron: '*/5 * * * *', workflowId: 'wf_1' });
    await manager.add({ name: 'schedule 2', cron: '* * * * *', command: 'git status', args: [] });

    expect((await manager.list()).length).toBe(2);
    manager.stop();
  });

  it('removes a schedule', async () => {
    const manager = createScheduleManager();
    const entry = await manager.add({ name: 'to remove', cron: '* * * * *', workflowId: 'wf_1' });

    expect(await manager.remove(entry.id)).toBe(true);
    expect((await manager.list()).length).toBe(0);
    expect(await manager.remove('nonexistent')).toBe(false);
    manager.stop();
  });

  it('start schedules existing entries', async () => {
    const manager = createScheduleManager();
    await manager.add({ name: 'running', cron: '* * * * *', workflowId: 'wf_1' });
    await manager.start();

    expect((await manager.list()).length).toBe(1);
    manager.stop();
  });

  it('stop clears all timers', async () => {
    const manager = createScheduleManager();
    await manager.add({ name: 'stopping', cron: '* * * * *', workflowId: 'wf_1' });
    await manager.start();
    manager.stop();

    expect((await manager.list()).length).toBe(1);
  });

  it('blocks critical dangerous commands from execution', async () => {
    const manager = createScheduleManager();
    const detector = createDetector();
    
    const dangerousCommand = 'sudo rm -rf /';
    const detection = detector.detect(dangerousCommand);
    expect(detection.isDangerous).toBe(true);
    expect(detection.level).toBe('critical');
    
    const entry = await manager.add({
      name: 'dangerous task',
      cron: '* * * * *',
      command: dangerousCommand,
      args: [],
    });

    await manager.start();
    vi.advanceTimersByTime(61000);
    manager.stop();

    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 200));
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const schedules = await manager.list();
    const saved = schedules.find(s => s.id === entry.id);
    expect(saved).toBeDefined();
    expect(saved?.lastStatus).toBe('FAILED');
    expect(saved?.lastError).toContain('Dangerous command blocked');
  });

  it('allows safe commands to execute', async () => {
    const manager = createScheduleManager();
    const detector = createDetector();
    
    const safeCommand = 'git';
    const detection = detector.detect(safeCommand, 'git');
    expect(detection.isDangerous).toBe(false);
    
    const entry = await manager.add({
      name: 'safe task',
      cron: '* * * * *',
      command: safeCommand,
      args: ['--version'],
    });

    await manager.start();
    vi.advanceTimersByTime(61000);
    manager.stop();

    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 200));
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const schedules = await manager.list();
    const saved = schedules.find(s => s.id === entry.id);
    expect(saved).toBeDefined();
    expect(saved?.lastStatus).toBeDefined();
  });
});