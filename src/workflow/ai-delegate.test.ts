import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createSessionManager,
  createTaskQueue,
  createDaemonManager,
  createDelegateExecutor,
  type SessionManager,
  type TaskQueue,
  type DaemonManager,
  type DelegateExecutor,
} from './ai-delegate.js';

describe('AI Delegate', () => {
  describe('SessionManager', () => {
    let sessionManager: SessionManager;

    beforeEach(() => {
      sessionManager = createSessionManager();
    });

    it('should create a session', () => {
      const session = sessionManager.createSession('claude', { test: true });
      expect(session.id).toBeDefined();
      expect(session.provider).toBe('claude');
      expect(session.status).toBe('active');
      expect(session.context).toEqual({ test: true });
    });

    it('should get a session by id', () => {
      const session = sessionManager.createSession('gemini');
      const retrieved = sessionManager.getSession(session.id);
      expect(retrieved?.id).toBe(session.id);
    });

    it('should update a session', () => {
      const session = sessionManager.createSession('aider');
      sessionManager.updateSession(session.id, { messageCount: 5 });
      const updated = sessionManager.getSession(session.id);
      expect(updated?.messageCount).toBe(5);
    });

    it('should delete a session', () => {
      const session = sessionManager.createSession('claude');
      sessionManager.deleteSession(session.id);
      const retrieved = sessionManager.getSession(session.id);
      expect(retrieved).toBeUndefined();
    });

    it('should list sessions', () => {
      const s1 = sessionManager.createSession('claude');
      const s2 = sessionManager.createSession('gemini');
      const sessions = sessionManager.listSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(2);
      expect(sessions.map(s => s.id)).toContain(s1.id);
      expect(sessions.map(s => s.id)).toContain(s2.id);
    });

    it('should get or create session', () => {
      const session1 = sessionManager.getOrCreateSession('claude');
      const session2 = sessionManager.getOrCreateSession('claude');
      expect(session1.id).toBe(session2.id);
    });
  });

  describe('TaskQueue', () => {
    let taskQueue: TaskQueue;

    beforeEach(() => {
      taskQueue = createTaskQueue();
    });

    it('should enqueue and dequeue tasks', () => {
      const task = {
        id: 'task_1',
        prompt: 'test',
        context: {},
        status: 'pending' as const,
        createdAt: new Date(),
        priority: 5,
      };
      taskQueue.enqueue(task);
      expect(taskQueue.size()).toBe(1);
      const dequeued = taskQueue.dequeue();
      expect(dequeued?.id).toBe('task_1');
      expect(taskQueue.size()).toBe(0);
    });

    it('should respect priority ordering', () => {
      const lowPriority = { id: 'low', prompt: '', context: {}, status: 'pending' as const, createdAt: new Date(), priority: 1 };
      const highPriority = { id: 'high', prompt: '', context: {}, status: 'pending' as const, createdAt: new Date(), priority: 10 };
      taskQueue.enqueue(lowPriority);
      taskQueue.enqueue(highPriority);
      const first = taskQueue.dequeue();
      expect(first?.id).toBe('high');
    });

    it('should clear all tasks', () => {
      taskQueue.enqueue({ id: '1', prompt: '', context: {}, status: 'pending' as const, createdAt: new Date(), priority: 5 });
      taskQueue.enqueue({ id: '2', prompt: '', context: {}, status: 'pending' as const, createdAt: new Date(), priority: 5 });
      taskQueue.clear();
      expect(taskQueue.size()).toBe(0);
    });
  });

  describe('DaemonManager', () => {
    let daemonManager: DaemonManager;
    const daemonIds: string[] = [];

    afterEach(async () => {
      for (const id of daemonIds) {
        await daemonManager.stop(id);
      }
      daemonIds.length = 0;
    });

    beforeEach(() => {
      daemonManager = createDaemonManager();
    });

    it('should start and stop a daemon', async () => {
      const daemonId = await daemonManager.start('claude');
      daemonIds.push(daemonId);
      expect(daemonId).toBeDefined();
      const status = daemonManager.getStatus(daemonId);
      expect(status.running).toBe(true);
      await daemonManager.stop(daemonId);
      const stopped = daemonManager.getStatus(daemonId);
      expect(stopped.running).toBe(false);
      daemonIds.pop();
    });

    it('should list daemons', async () => {
      const id1 = await daemonManager.start('claude');
      const id2 = await daemonManager.start('gemini');
      daemonIds.push(id1, id2);
      const daemons = daemonManager.listDaemons();
      expect(daemons.length).toBeGreaterThanOrEqual(2);
    });

    it('should perform health check', async () => {
      const daemonId = await daemonManager.start('aider');
      daemonIds.push(daemonId);
      const health = await daemonManager.healthCheck(daemonId);
      expect(health.isHealthy).toBe(true);
      expect(health.provider).toBe('aider');
    });
  });

  describe('DelegateExecutor', () => {
    let delegateExecutor: DelegateExecutor;

    beforeEach(() => {
      delegateExecutor = createDelegateExecutor();
    });

    it('should create a session', () => {
      const session = delegateExecutor.createSession('claude');
      expect(session.id).toBeDefined();
      expect(session.provider).toBe('claude');
    });

    it('should get a session', () => {
      const session = delegateExecutor.createSession('gemini');
      const retrieved = delegateExecutor.getSession(session.id);
      expect(retrieved?.id).toBe(session.id);
    });

    it('should submit a task', () => {
      const taskId = delegateExecutor.submitTask('test prompt', {}, 5);
      expect(taskId).toBeDefined();
    });

    it('should get task result', () => {
      const taskId = delegateExecutor.submitTask('test');
      const task = delegateExecutor.getTaskResult(taskId);
      expect(task?.id).toBe(taskId);
    });

    it('should delegate to provider (placeholder)', async () => {
      const result = await delegateExecutor.delegate({
        provider: 'aider',
        prompt: 'test prompt',
      });
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.output).toContain('[AIDER]');
    });
  });
});