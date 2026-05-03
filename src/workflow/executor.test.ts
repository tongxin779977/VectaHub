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

  describe('for_each step', () => {
    it('should iterate over items and run body for each', async () => {
      const step: Step = {
        id: 'loop',
        type: 'for_each',
        items: 'alpha\nbeta\ngamma',
        body: [
          { id: 'echo-item', type: 'exec', cli: 'echo', args: ['item=${item}'] },
        ],
      };
      const result = await executor.execute(step, { mode: 'RELAXED' });

      expect(result.status).toBe('COMPLETED');
      expect(result.iterations).toBe(3);
    });

    it('should stop early when body step fails', async () => {
      const step: Step = {
        id: 'loop',
        type: 'for_each',
        items: 'a\nb\nc',
        body: [
          { id: 'fail-step', type: 'exec', cli: 'false', args: [] },
        ],
      };
      const result = await executor.execute(step, { mode: 'RELAXED' });

      expect(result.status).toBe('FAILED');
    });

    it('should complete with zero iterations for whitespace-only items', async () => {
      const step: Step = {
        id: 'loop',
        type: 'for_each',
        items: '\n\n\n',
        body: [
          { id: 'echo-item', type: 'exec', cli: 'echo', args: ['never'] },
        ],
      };
      const result = await executor.execute(step, { mode: 'RELAXED' });

      expect(result.status).toBe('COMPLETED');
      expect(result.iterations).toBe(0);
    });

    it('should pass item value via context variables', async () => {
      const step: Step = {
        id: 'loop',
        type: 'for_each',
        items: 'hello',
        body: [
          { id: 'print', type: 'exec', cli: 'echo', args: ['${item}'] },
        ],
      };
      const context = { variables: {}, previousOutputs: {} };
      const result = await executor.execute(step, { mode: 'RELAXED' }, context);

      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('if step', () => {
    it('should execute body when condition matches variable', async () => {
      const step: Step = {
        id: 'cond',
        type: 'if',
        condition: 'debug == true',
        body: [
          { id: 'then', type: 'exec', cli: 'echo', args: ['matched'] },
        ],
      };
      const context = { variables: { debug: ['true'] }, previousOutputs: {} };
      const result = await executor.execute(step, { mode: 'RELAXED' }, context);

      expect(result.status).toBe('COMPLETED');
    });

    it('should skip body when condition does not match', async () => {
      const step: Step = {
        id: 'cond',
        type: 'if',
        condition: 'debug == true',
        body: [
          { id: 'then', type: 'exec', cli: 'echo', args: ['should-not-run'] },
        ],
      };
      const context = { variables: { debug: ['false'] }, previousOutputs: {} };
      const result = await executor.execute(step, { mode: 'RELAXED' }, context);

      expect(result.status).toBe('COMPLETED');
      expect(result.output).toBeUndefined();
    });

    it('should evaluate exitCode condition with empty outputs', async () => {
      const step: Step = {
        id: 'cond',
        type: 'if',
        condition: '${buildStep.exitCode} == 0',
        body: [
          { id: 'then', type: 'exec', cli: 'echo', args: ['ok'] },
        ],
      };
      const context = {
        variables: {},
        previousOutputs: { buildStep: [] },
      };
      const result = await executor.execute(step, { mode: 'RELAXED' }, context);

      expect(result.status).toBe('COMPLETED');
    });

    it('should fail when body step fails', async () => {
      const step: Step = {
        id: 'cond',
        type: 'if',
        condition: 'x == 1',
        body: [
          { id: 'bad', type: 'exec', cli: 'false', args: [] },
        ],
      };
      const context = { variables: { x: ['1'] }, previousOutputs: {} };
      const result = await executor.execute(step, { mode: 'RELAXED' }, context);

      expect(result.status).toBe('FAILED');
    });

    it('should return COMPLETED for unknown condition format', async () => {
      const step: Step = {
        id: 'cond',
        type: 'if',
        condition: 'totally invalid condition syntax',
        body: [
          { id: 'then', type: 'exec', cli: 'echo', args: ['nope'] },
        ],
      };
      const context = { variables: {}, previousOutputs: {} };
      const result = await executor.execute(step, { mode: 'RELAXED' }, context);

      expect(result.status).toBe('COMPLETED');
      expect(result.output).toBeUndefined();
    });
  });

  describe('parallel step', () => {
    it('should execute all body steps concurrently', async () => {
      const step: Step = {
        id: 'par',
        type: 'parallel',
        body: [
          { id: 'p1', type: 'exec', cli: 'echo', args: ['one'] },
          { id: 'p2', type: 'exec', cli: 'echo', args: ['two'] },
          { id: 'p3', type: 'exec', cli: 'echo', args: ['three'] },
        ],
      };
      const result = await executor.execute(step, { mode: 'RELAXED' });

      expect(result.status).toBe('COMPLETED');
      expect(result.iterations).toBe(3);
    });

    it('should fail if any body step fails', async () => {
      const step: Step = {
        id: 'par',
        type: 'parallel',
        body: [
          { id: 'ok', type: 'exec', cli: 'echo', args: ['ok'] },
          { id: 'fail', type: 'exec', cli: 'false', args: [] },
        ],
      };
      const result = await executor.execute(step, { mode: 'RELAXED' });

      expect(result.status).toBe('FAILED');
    });

    it('should complete with empty body', async () => {
      const step: Step = {
        id: 'par',
        type: 'parallel',
        body: [],
      };
      const result = await executor.execute(step, { mode: 'RELAXED' });

      expect(result.status).toBe('COMPLETED');
      expect(result.iterations).toBe(0);
    });
  });

  describe('opencli step', () => {
    it('should return FAILED when opencli is not available', async () => {
      const step: Step = {
        id: 'ocli',
        type: 'opencli',
        site: 'example.com',
        command: 'list-items',
      };
      const result = await executor.execute(step, { mode: 'RELAXED' });

      expect(result.status).toBe('FAILED');
      expect(result.stepId).toBe('ocli');
      expect(result.error).toBeDefined();
    });

    it('should interpolate site and command in opencli step', async () => {
      const step: Step = {
        id: 'ocli',
        type: 'opencli',
        site: '${site}',
        command: '${cmd}',
      };
      const context = {
        variables: { site: ['mysite.com'], cmd: ['do-thing'] },
        previousOutputs: {},
      };
      const result = await executor.execute(step, { mode: 'RELAXED' }, context);

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('opencli');
    });
  });

  describe('validateStep', () => {
    it('should reject opencli step without site', () => {
      const step = { id: 's1', type: 'opencli' as const, command: 'list' };
      const result = executor.validateStep(step as Step);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('opencli step must have site and command');
    });

    it('should reject opencli step without command', () => {
      const step = { id: 's1', type: 'opencli' as const, site: 'example.com' };
      const result = executor.validateStep(step as Step);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('opencli step must have site and command');
    });

    it('should accept valid opencli step', () => {
      const step: Step = { id: 's1', type: 'opencli', site: 'example.com', command: 'list' };
      const result = executor.validateStep(step);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept valid for_each step', () => {
      const step: Step = { id: 's1', type: 'for_each', items: 'a\nb', body: [] };
      const result = executor.validateStep(step);
      expect(result.valid).toBe(true);
    });

    it('should accept valid if step', () => {
      const step: Step = { id: 's1', type: 'if', condition: 'x == 1' };
      const result = executor.validateStep(step);
      expect(result.valid).toBe(true);
    });

    it('should accept valid parallel step', () => {
      const step: Step = { id: 's1', type: 'parallel', body: [] };
      const result = executor.validateStep(step);
      expect(result.valid).toBe(true);
    });
  });

  describe('executeWorkflow', () => {
    it('should stop in STRICT mode when step fails', async () => {
      const steps: Step[] = [
        { id: 's1', type: 'exec', cli: 'echo', args: ['first'] },
        { id: 's2', type: 'exec', cli: 'false', args: [] },
        { id: 's3', type: 'exec', cli: 'echo', args: ['third'] },
      ];
      const results = await executor.executeWorkflow(steps, { mode: 'STRICT' });

      expect(results.length).toBe(2);
      expect(results[0].status).toBe('COMPLETED');
      expect(results[1].status).toBe('FAILED');
    });

    it('should continue in RELAXED mode after failure', async () => {
      const steps: Step[] = [
        { id: 's1', type: 'exec', cli: 'echo', args: ['first'] },
        { id: 's2', type: 'exec', cli: 'false', args: [] },
        { id: 's3', type: 'exec', cli: 'echo', args: ['third'] },
      ];
      const results = await executor.executeWorkflow(steps, { mode: 'RELAXED' });

      expect(results.length).toBe(3);
      expect(results[0].status).toBe('COMPLETED');
      expect(results[1].status).toBe('FAILED');
      expect(results[2].status).toBe('COMPLETED');
    });

    it('should store output in context previousOutputs', async () => {
      const steps: Step[] = [
        { id: 's1', type: 'exec', cli: 'echo', args: ['data'] },
      ];
      const context: { variables: Record<string, string[]>; previousOutputs: Record<string, string[]> } = { variables: {}, previousOutputs: {} };
      await executor.executeWorkflow(steps, { mode: 'RELAXED' }, context);

      expect(context.previousOutputs['s1']).toBeDefined();
      expect(context.previousOutputs['s1'][0]?.trim()).toBe('data');
    });
  });

  describe('interpolateString', () => {
    it('should replace variable references', () => {
      const context = { variables: { name: ['world'] }, previousOutputs: {} };
      const result = executor.interpolateString('hello ${name}', context);
      expect(result).toBe('hello world');
    });

    it('should join array values with newline', () => {
      const context = { variables: { items: ['a', 'b', 'c'] }, previousOutputs: {} };
      const result = executor.interpolateString('${items}', context);
      expect(result).toBe('a\nb\nc');
    });

    it('should leave unresolved variables as-is', () => {
      const context = { variables: {}, previousOutputs: {} };
      const result = executor.interpolateString('hello ${missing}', context);
      expect(result).toBe('hello ${missing}');
    });
  });
});
