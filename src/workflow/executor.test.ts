import { describe, it, expect, beforeEach } from 'vitest';
import { createExecutor, type Executor } from './executor.js';
import type { Step } from '../types/index.js';

describe('Executor', () => {
  let executor: Executor;

  beforeEach(() => {
    executor = createExecutor();
  });

  it('should execute a simple command', async () => {
    const result = await executor.exec('echo', ['hello'], { mode: 'RELAXED' });
    
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('should handle command with arguments', async () => {
    const result = await executor.exec('echo', ['hello', 'world'], { mode: 'RELAXED' });
    
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe('hello world');
  });

  it('should handle command failure', async () => {
    const result = await executor.exec('false', [], { mode: 'RELAXED' });
    
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it('should execute step with dry run', async () => {
    const step: Step = { id: 'step1', type: 'exec', cli: 'echo', args: ['test'] };
    const result = await executor.execute(step, { mode: 'RELAXED', dryRun: true });
    
    expect(result.status).toBe('COMPLETED');
    expect(result.output?.[0]).toContain('[DRY RUN]');
    expect(result.output?.[0]).toContain('echo test');
  });

  it('should execute step successfully', async () => {
    const step: Step = { id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] };
    const result = await executor.execute(step, { mode: 'RELAXED' });
    
    expect(result.status).toBe('COMPLETED');
    expect(result.stepId).toBe('step1');
    expect(result.output?.[0]?.trim()).toBe('hello');
  });

  it('should handle failed step', async () => {
    const step: Step = { id: 'step1', type: 'exec', cli: 'false', args: [] };
    const result = await executor.execute(step, { mode: 'RELAXED' });
    
    expect(result.status).toBe('FAILED');
    expect(result.stepId).toBe('step1');
  });

  it('should execute workflow steps', async () => {
    const steps: Step[] = [
      { id: 'step1', type: 'exec', cli: 'echo', args: ['first'] },
      { id: 'step2', type: 'exec', cli: 'echo', args: ['second'] },
    ];
    const results = await executor.executeWorkflow(steps, { mode: 'RELAXED' });
    
    expect(results.length).toBe(2);
    expect(results[0].status).toBe('COMPLETED');
    expect(results[1].status).toBe('COMPLETED');
  });

  it('should validate step with missing id', () => {
    const step = { type: 'exec' as const, cli: 'echo' };
    const result = executor.validateStep(step as Step);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Step must have an id');
  });

  it('should validate step with invalid type', () => {
    const step = { id: 'step1', type: 'invalid' as const, cli: 'echo' };
    const result = executor.validateStep(step as unknown as Step);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid step type: invalid');
  });

  it('should validate exec step without cli', () => {
    const step = { id: 'step1', type: 'exec' as const };
    const result = executor.validateStep(step as Step);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('exec step must have a cli command');
  });

  it('should validate for_each step without items', () => {
    const step = { id: 'step1', type: 'for_each' as const, body: [] };
    const result = executor.validateStep(step as Step);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('for_each step must have items and body');
  });

  it('should validate if step without condition', () => {
    const step = { id: 'step1', type: 'if' as const, body: [] };
    const result = executor.validateStep(step as Step);
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('if step must have a condition');
  });

  it('should validate valid exec step', () => {
    const step: Step = { id: 'step1', type: 'exec', cli: 'echo', args: ['test'] };
    const result = executor.validateStep(step);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should use default timeout when not specified', async () => {
    const result = await executor.exec('sleep', ['0.1'], { mode: 'RELAXED' });
    expect(result.success).toBe(true);
    expect(result.duration).toBeGreaterThan(0);
  });
});
