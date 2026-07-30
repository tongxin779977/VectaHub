import { describe, it, expect, vi } from 'vitest';

vi.mock('./factory.js', () => ({
  getSecurityGuard: vi.fn(),
}));

vi.mock('../nl/intent-classifier.js', () => ({
  classifyIntent: vi.fn(),
}));

import { SecurityGuardImpl } from './guard.js';
import type { SecurityEvaluator, CommandIntention, SecurityContext, SecurityDecision } from '../types/security.js';

const testContext: SecurityContext = {
  cwd: '/test',
  sessionId: 'test-session',
};

function makeIntention(command: string, tool?: string): CommandIntention {
  return { rawCommand: command, tool };
}

function makeEvaluator(name: string, decision: SecurityDecision): SecurityEvaluator {
  return {
    name,
    evaluate: vi.fn().mockResolvedValue(decision),
  };
}

const passedDecision: SecurityDecision = {
  decision: 'PASSED',
  riskLevel: 'none',
};

const blockedDecision: SecurityDecision = {
  decision: 'BLOCKED',
  riskLevel: 'critical',
  ruleName: 'TestRule',
  reason: 'blocked for testing',
  suggestion: 'do not do this',
};

const confirmDecision: SecurityDecision = {
  decision: 'REQUIRES_CONFIRMATION',
  riskLevel: 'high',
  ruleName: 'HighRisk',
  reason: 'requires review',
};

describe('SecurityGuardImpl', () => {
  it('should return PASSED when no evaluators are registered', async () => {
    const guard = new SecurityGuardImpl([]);
    const result = await guard.assess(makeIntention('echo hello'), testContext);
    expect(result.decision).toBe('PASSED');
    expect(result.riskLevel).toBe('none');
  });

  it('should return PASSED when all evaluators pass', async () => {
    const guard = new SecurityGuardImpl([
      makeEvaluator('Eval1', passedDecision),
      makeEvaluator('Eval2', passedDecision),
    ]);

    const result = await guard.assess(makeIntention('git status'), testContext);
    expect(result.decision).toBe('PASSED');
    expect(result.riskLevel).toBe('none');
  });

  it('should return BLOCKED when any evaluator blocks', async () => {
    const guard = new SecurityGuardImpl([
      makeEvaluator('Eval1', passedDecision),
      makeEvaluator('Eval2', blockedDecision),
    ]);

    const result = await guard.assess(makeIntention('sudo rm -rf /'), testContext);
    expect(result.decision).toBe('BLOCKED');
    expect(result.riskLevel).toBe('critical');
    expect(result.ruleName).toBe('TestRule');
  });

  it('should return REQUIRES_CONFIRMATION when evaluator requires it', async () => {
    const guard = new SecurityGuardImpl([
      makeEvaluator('Eval1', passedDecision),
      makeEvaluator('Eval2', confirmDecision),
    ]);

    const result = await guard.assess(makeIntention('iptables -F'), testContext);
    expect(result.decision).toBe('REQUIRES_CONFIRMATION');
    expect(result.riskLevel).toBe('high');
  });

  it('should prioritize BLOCKED over REQUIRES_CONFIRMATION', async () => {
    const guard = new SecurityGuardImpl([
      makeEvaluator('Eval1', confirmDecision),
      makeEvaluator('Eval2', blockedDecision),
    ]);

    const result = await guard.assess(makeIntention('sudo iptables -F'), testContext);
    expect(result.decision).toBe('BLOCKED');
  });

  it('should use highest risk level among evaluators', async () => {
    const mediumDecision: SecurityDecision = {
      decision: 'PASSED',
      riskLevel: 'medium',
    };
    const guard = new SecurityGuardImpl([
      makeEvaluator('Eval1', passedDecision),
      makeEvaluator('Eval2', mediumDecision),
    ]);

    const result = await guard.assess(makeIntention('some cmd'), testContext);
    expect(result.riskLevel).toBe('medium');
  });

  it('should short-circuit on BLOCKED (circuit breaker)', async () => {
    const eval2Decision = { ...passedDecision };
    const eval2 = makeEvaluator('Eval2', eval2Decision);
    const guard = new SecurityGuardImpl([
      makeEvaluator('Eval1', blockedDecision),
      eval2,
    ]);

    await guard.assess(makeIntention('rm -rf /'), testContext);
    expect(eval2.evaluate).not.toHaveBeenCalled();
  });

  it('should propagate evaluator errors to caller', async () => {
    const errorEvaluator: SecurityEvaluator = {
      name: 'ErrorEval',
      evaluate: vi.fn().mockRejectedValue(new Error('evaluator crashed')),
    };
    const guard = new SecurityGuardImpl([errorEvaluator]);

    await expect(guard.assess(makeIntention('ls'), testContext)).rejects.toThrow('evaluator crashed');
  });

  it('should pass intention and context to each evaluator', async () => {
    const mockEvaluate = vi.fn().mockResolvedValue(passedDecision);
    const evaluator: SecurityEvaluator = { name: 'MockEval', evaluate: mockEvaluate };
    const guard = new SecurityGuardImpl([evaluator]);

    const intention = makeIntention('git push', 'git');
    await guard.assess(intention, testContext);

    expect(mockEvaluate).toHaveBeenCalledWith(intention, testContext);
  });

  it('should include ruleName and reason from blocking evaluator', async () => {
    const guard = new SecurityGuardImpl([
      makeEvaluator('SafeEval', passedDecision),
      makeEvaluator('BlockEval', blockedDecision),
    ]);

    const result = await guard.assess(makeIntention('rm -rf /'), testContext);
    expect(result.ruleName).toBe('TestRule');
    expect(result.reason).toBe('blocked for testing');
    expect(result.suggestion).toBe('do not do this');
  });

  it('should use default suggestion when evaluator does not provide one', async () => {
    const noSuggestion: SecurityDecision = {
      decision: 'BLOCKED',
      riskLevel: 'critical',
      ruleName: 'Rule',
      reason: 'reason',
    };
    const guard = new SecurityGuardImpl([makeEvaluator('Eval', noSuggestion)]);

    const result = await guard.assess(makeIntention('cmd'), testContext);
    expect(result.suggestion).toContain('阻断');
  });

  it('should redact output via redactor', () => {
    const guard = new SecurityGuardImpl([]);
    const result = guard.redactOutput('api_key=secret123', testContext);
    expect(result).not.toContain('secret123');
  });
});
