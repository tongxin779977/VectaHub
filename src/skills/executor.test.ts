import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSkillExecutor } from './executor.js';
import type { Skill, SkillContext, SkillResult, CompositeSkill } from './types.js';

function createMockSkill<TInput = unknown, TOutput = unknown>(
  id: string,
  resultFn: (input: TInput) => SkillResult<TOutput> = () => ({ success: true, confidence: 1 }),
  options?: { canHandle?: boolean; delay?: number }
): Skill<TInput, TOutput> {
  return {
    id,
    name: `Skill ${id}`,
    version: '1.0.0',
    description: `Mock ${id}`,
    tags: ['mock'],
    canHandle: async () => options?.canHandle ?? true,
    execute: async (input: TInput) => {
      if (options?.delay) {
        await new Promise(resolve => setTimeout(resolve, options.delay));
      }
      return resultFn(input);
    },
  };
}

function createMockCompositeSkill(
  strategy: CompositeSkill['strategy'],
  skills: Skill[]
): CompositeSkill {
  return {
    id: 'composite',
    name: 'Composite Skill',
    version: '1.0.0',
    description: 'Mock composite',
    tags: ['composite'],
    canHandle: async () => true,
    execute: async () => ({ success: true, confidence: 1 }),
    skills,
    strategy,
  };
}

const mockContext: SkillContext = { userInput: 'test' };

describe('SkillExecutor', () => {
  let executor: ReturnType<typeof createSkillExecutor>;

  beforeEach(() => {
    executor = createSkillExecutor({ maxRetries: 2, timeout: 5000 });
  });

  describe('execute (single skill)', () => {
    it('should execute a skill and return result', async () => {
      const skill = createMockSkill<string, string>('s1', () => ({
        success: true,
        data: 'output',
        confidence: 0.9,
      }));

      const result = await executor.execute(skill, 'input', mockContext);
      expect(result.success).toBe(true);
      expect(result.data).toBe('output');
      expect(result.confidence).toBe(0.9);
    });

    it('should retry on failure up to maxRetries', async () => {
      let attempts = 0;
      const skill = createMockSkill<string, string>('flaky', () => {
        attempts++;
        if (attempts < 3) throw new Error('transient failure');
        return { success: true, data: 'recovered', confidence: 0.8 };
      });

      const result = await executor.execute(skill, 'input', mockContext);
      expect(result.success).toBe(true);
      expect(result.data).toBe('recovered');
      expect(attempts).toBe(3);
    });

    it('should return failure after exhausting retries', async () => {
      const skill = createMockSkill<string, string>('always-fail', () => {
        throw new Error('permanent failure');
      });

      const result = await executor.execute(skill, 'input', mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain('retries');
    });

    it('should return failure when skill returns success:false', async () => {
      const skill = createMockSkill<string, string>('soft-fail', () => ({
        success: false,
        error: 'bad input',
        confidence: 0,
      }));

      const result = await executor.execute(skill, 'input', mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toBe('bad input');
    });
  });

  describe('executeComposite - sequential', () => {
    it('should execute skills in order, passing output as next input', async () => {
      const order: string[] = [];
      const skill1 = createMockSkill<string, object>('s1', (input) => {
        order.push('s1');
        return { success: true, data: { step: 1, from: input }, confidence: 0.9 };
      });
      const skill2 = createMockSkill<object, object>('s2', (input) => {
        order.push('s2');
        return { success: true, data: { step: 2, prev: input }, confidence: 0.8 };
      });
      const skill3 = createMockSkill<object, object>('s3', (input) => {
        order.push('s3');
        return { success: true, data: { step: 3, prev: input }, confidence: 0.7 };
      });

      const composite = createMockCompositeSkill('sequential', [skill1, skill2, skill3]);
      const result = await executor.executeComposite(composite, 'start', mockContext);

      expect(order).toEqual(['s1', 's2', 's3']);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ step: 3, prev: { step: 2, prev: { step: 1, from: 'start' } } });
    });

    it('should stop and fail on first skill failure', async () => {
      const order: string[] = [];
      const skill1 = createMockSkill('s1', () => {
        order.push('s1');
        return { success: true, data: 'ok', confidence: 0.9 };
      });
      const skill2 = createMockSkill('s2', () => {
        order.push('s2');
        return { success: false, error: 's2 failed', confidence: 0 };
      });
      const skill3 = createMockSkill('s3', () => {
        order.push('s3');
        return { success: true, data: 'ok', confidence: 0.8 };
      });

      const composite = createMockCompositeSkill('sequential', [skill1, skill2, skill3]);
      const result = await executor.executeComposite(composite, 'input', mockContext);

      expect(order).toEqual(['s1', 's2']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('s2');
    });

    it('should return failure for empty skills array', async () => {
      const composite = createMockCompositeSkill('sequential', []);
      const result = await executor.executeComposite(composite, 'input', mockContext);
      expect(result.success).toBe(false);
    });
  });

  describe('executeComposite - parallel', () => {
    it('should execute all skills concurrently', async () => {
      const skill1 = createMockSkill<string, string>('s1', () => ({
        success: true, data: 'result-1', confidence: 0.9,
      }), { delay: 50 });
      const skill2 = createMockSkill<string, string>('s2', () => ({
        success: true, data: 'result-2', confidence: 0.8,
      }), { delay: 30 });
      const skill3 = createMockSkill<string, string>('s3', () => ({
        success: true, data: 'result-3', confidence: 0.7,
      }), { delay: 10 });

      const composite = createMockCompositeSkill('parallel', [skill1, skill2, skill3]);
      const start = Date.now();
      const result = await executor.executeComposite(composite, 'input', mockContext);
      const elapsed = Date.now() - start;

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as Record<string, unknown>;
      expect(data['s1']).toBe('result-1');
      expect(data['s2']).toBe('result-2');
      expect(data['s3']).toBe('result-3');
      expect(elapsed).toBeLessThan(200);
    });

    it('should succeed if at least one skill succeeds', async () => {
      const skill1 = createMockSkill('s1', () => ({
        success: false, error: 's1 failed', confidence: 0,
      }));
      const skill2 = createMockSkill('s2', () => ({
        success: true, data: 'winner', confidence: 0.9,
      }));

      const composite = createMockCompositeSkill('parallel', [skill1, skill2]);
      const result = await executor.executeComposite(composite, 'input', mockContext);

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['s2']).toBe('winner');
    });

    it('should fail if all skills fail', async () => {
      const skill1 = createMockSkill('s1', () => ({
        success: false, error: 's1', confidence: 0,
      }));
      const skill2 = createMockSkill('s2', () => ({
        success: false, error: 's2', confidence: 0,
      }));

      const composite = createMockCompositeSkill('parallel', [skill1, skill2]);
      const result = await executor.executeComposite(composite, 'input', mockContext);

      expect(result.success).toBe(false);
    });
  });

  describe('executeComposite - conditional', () => {
    it('should execute first skill that canHandle returns true', async () => {
      const skill1 = createMockSkill('s1', () => ({
        success: true, data: 'matched-s1', confidence: 0.9,
      }), { canHandle: false });
      const skill2 = createMockSkill('s2', () => ({
        success: true, data: 'matched-s2', confidence: 0.8,
      }), { canHandle: true });
      const skill3 = createMockSkill('s3', () => ({
        success: true, data: 'matched-s3', confidence: 0.7,
      }), { canHandle: true });

      const composite = createMockCompositeSkill('conditional', [skill1, skill2, skill3]);
      const result = await executor.executeComposite(composite, 'input', mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBe('matched-s2');
    });

    it('should fail when no skill canHandle', async () => {
      const skill1 = createMockSkill('s1', () => ({
        success: true, data: 'nope', confidence: 0.9,
      }), { canHandle: false });
      const skill2 = createMockSkill('s2', () => ({
        success: true, data: 'nope', confidence: 0.8,
      }), { canHandle: false });

      const composite = createMockCompositeSkill('conditional', [skill1, skill2]);
      const result = await executor.executeComposite(composite, 'input', mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No skill');
    });

    it('should not execute subsequent skills after first match', async () => {
      let s2Executed = false;
      let s3Executed = false;
      const skill1 = createMockSkill('s1', () => ({
        success: true, data: 'first', confidence: 0.9,
      }), { canHandle: true });
      const skill2 = createMockSkill('s2', () => {
        s2Executed = true;
        return { success: true, data: 'second', confidence: 0.8 };
      }, { canHandle: true });
      const skill3 = createMockSkill('s3', () => {
        s3Executed = true;
        return { success: true, data: 'third', confidence: 0.7 };
      }, { canHandle: true });

      const composite = createMockCompositeSkill('conditional', [skill1, skill2, skill3]);
      await executor.executeComposite(composite, 'input', mockContext);

      expect(s2Executed).toBe(false);
      expect(s3Executed).toBe(false);
    });

    it('should handle first skill failure and try next', async () => {
      const skill1 = createMockSkill('s1', () => {
        throw new Error('s1 crashed');
      }, { canHandle: true });
      const skill2 = createMockSkill('s2', () => ({
        success: true, data: 'recovered', confidence: 0.8,
      }), { canHandle: true });

      const composite = createMockCompositeSkill('conditional', [skill1, skill2]);
      const result = await executor.executeComposite(composite, 'input', mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBe('recovered');
    });
  });

  describe('unknown strategy', () => {
    it('should return failure for unknown strategy', async () => {
      const composite = createMockCompositeSkill('unknown' as any, []);
      const result = await executor.executeComposite(composite, 'input', mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown');
    });
  });
});
