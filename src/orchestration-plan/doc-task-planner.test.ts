import { describe, it, expect } from 'vitest';
import { planFromDocTasks } from './doc-task-planner.js';
import type { DocTask } from '../types/index.js';

describe('planFromDocTasks', () => {
  it('should return reply when no tasks are provided', async () => {
    const result = await planFromDocTasks([]);
    expect(result.kind).toBe('reply');
    expect(result.message).toBe('No tasks found in the document.');
  });

  it('should create plan from single doc task', async () => {
    const docTask: DocTask = {
      id: 'TASK-001',
      label: 'Fix the login bug',
    };

    const result = await planFromDocTasks([docTask], {
      docPath: 'test.md',
    });

    expect(result.kind).toBe('plan');
    if (result.kind === 'plan') {
      expect(result.plan).toBeDefined();
      expect(result.plan.goal).toBe('Fix the login bug');
      expect(result.plan.source).toBe('document');
      expect(result.plan.tasks.length).toBe(1);
      expect(result.plan.tasks[0].id).toBe('doc-task-TASK-001');
      expect(result.plan.tasks[0].title).toBe('Fix the login bug');
      expect(result.plan.tasks[0].executor).toBe('agent');
      expect(result.plan.tasks[0].delegateTo).toBe('codex');
    }
  });

  it('should create plan from multiple doc tasks', async () => {
    const tasks: DocTask[] = [
      { id: 'TASK-001', label: 'Fix the login bug' },
      { id: 'TASK-002', label: 'Update the documentation' },
    ];

    const result = await planFromDocTasks(tasks);

    expect(result.kind).toBe('plan');
    if (result.kind === 'plan') {
      expect(result.plan).toBeDefined();
      expect(result.plan.goal).toBe('Execute 2 tasks from document');
      expect(result.plan.tasks.length).toBe(2);
      expect(result.plan.tasks[0].id).toBe('doc-task-TASK-001');
      expect(result.plan.tasks[1].id).toBe('doc-task-TASK-002');
      expect(result.plan.tasks[1].dependsOn).toEqual(['doc-task-TASK-001']);
    }
  });
});

