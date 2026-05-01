import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWorkflowEngine, type WorkflowEngine } from './engine.js';
import type { Step } from '../types/index.js';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = createWorkflowEngine();
  });

  it('should create a workflow', () => {
    const steps: Step[] = [
      { id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] },
    ];
    const workflow = engine.createWorkflow('test-workflow', steps);

    expect(workflow.id).toBeDefined();
    expect(workflow.name).toBe('test-workflow');
    expect(workflow.steps).toEqual(steps);
    expect(workflow.createdAt).toBeInstanceOf(Date);
  });

  it('should get a workflow by id', () => {
    const steps: Step[] = [{ id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] }];
    const workflow = engine.createWorkflow('test-workflow', steps);

    const retrieved = engine.getWorkflow(workflow.id);
    expect(retrieved).toEqual(workflow);
  });

  it('should return undefined for non-existent workflow', () => {
    const result = engine.getWorkflow('non-existent');
    expect(result).toBeUndefined();
  });

  it('should list all workflows', () => {
    engine.createWorkflow('workflow1', []);
    engine.createWorkflow('workflow2', []);

    const list = engine.listWorkflows();
    expect(list.length).toBe(2);
    expect(list[0].name).toBe('workflow1');
    expect(list[1].name).toBe('workflow2');
  });

  it('should add a step to workflow', () => {
    const workflow = engine.createWorkflow('test', []);
    const newStep: Step = { id: 'step1', type: 'exec', cli: 'ls' };

    engine.addStep(workflow.id, newStep);

    expect(workflow.steps.length).toBe(1);
    expect(workflow.steps[0]).toEqual(newStep);
  });

  it('should remove a step from workflow', () => {
    const steps: Step[] = [
      { id: 'step1', type: 'exec', cli: 'echo' },
      { id: 'step2', type: 'exec', cli: 'ls' },
    ];
    const workflow = engine.createWorkflow('test', steps);

    engine.removeStep(workflow.id, 'step1');

    expect(workflow.steps.length).toBe(1);
    expect(workflow.steps[0].id).toBe('step2');
  });

  it('should execute workflow with dry run', async () => {
    const steps: Step[] = [
      { id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] },
    ];
    const workflow = engine.createWorkflow('test-workflow', steps);

    const result = await engine.execute(workflow, { dryRun: true });

    expect(result.status).toBe('COMPLETED');
    expect(result.steps.length).toBe(1);
    expect(result.steps[0].output?.[0]).toContain('[DRY RUN]');
  });

  it('should pause and resume execution', async () => {
    const steps: Step[] = [
      { id: 'step1', type: 'exec', cli: 'sleep', args: ['0.1'] },
      { id: 'step2', type: 'exec', cli: 'echo', args: ['done'] },
    ];
    const workflow = engine.createWorkflow('test-workflow', steps);

    setTimeout(() => {
      engine.pause();
      setTimeout(() => {
        engine.resume();
      }, 100);
    }, 50);

    const result = await engine.execute(workflow);

    expect(result.status).toBe('COMPLETED');
  });

  it('should abort execution', async () => {
    const steps: Step[] = [
      { id: 'step1', type: 'exec', cli: 'sleep', args: ['1'] },
    ];
    const workflow = engine.createWorkflow('test-workflow', steps);

    setTimeout(() => {
      engine.abort();
    }, 50);

    const result = await engine.execute(workflow);

    expect(result.status).toBe('FAILED');
  });

  it('should get current execution status', async () => {
    const steps: Step[] = [{ id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] }];
    const workflow = engine.createWorkflow('test-workflow', steps);

    const statusBefore = engine.getStatus();
    expect(statusBefore).toBeUndefined();

    const executionPromise = engine.execute(workflow);
    const statusDuring = engine.getStatus();
    expect(statusDuring).toBeDefined();
    expect(statusDuring?.status).toBe('RUNNING');
    
    await executionPromise;
    const statusAfter = engine.getStatus();
    expect(statusAfter?.status).toBe('COMPLETED');
  });
});