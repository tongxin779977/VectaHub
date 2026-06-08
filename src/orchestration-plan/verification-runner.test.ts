import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runVerificationPlan } from './verification-runner.js';
import { createTestInfrastructureContext } from '../infrastructure/testing/index.js';
import { createSecurityGuard, resetSecurityGuard } from '../security-protocol/factory.js';
import type { InfrastructureContext } from '../infrastructure/context.js';

describe('verification-runner', () => {
  let context: InfrastructureContext;

  beforeEach(() => {
    resetSecurityGuard();
    context = createTestInfrastructureContext();
  });

  it('should pass when all verification commands succeed', async () => {
    vi.spyOn(context.environment, 'exec').mockResolvedValue({
      stdout: 'ok\n',
      stderr: '',
    });

    const result = await runVerificationPlan({
      planId: 'plan-pass',
      cwd: '/repo',
      context,
      verificationPlan: {
        required: true,
        commands: [
          { cli: 'npm', args: ['test'] },
        ],
        semanticChecks: [],
        successCriteria: ['Tests pass'],
      },
    });

    expect(result.status).toBe('pass');
    expect(result.failureKind).toBeUndefined();
    expect(result.commandResults).toHaveLength(1);
    expect(result.commandResults[0].ok).toBe(true);
    expect(result.allSuccessCriteriaMet).toBe(true);
  });

  it('should fail with safety_blocked semantics when a verification command is blocked', async () => {
    const blockedGuard = createSecurityGuard({
      evaluators: [
        {
          name: 'blocked-evaluator',
          async evaluate() {
            return {
              decision: 'BLOCKED',
              riskLevel: 'critical',
              reason: 'blocked for test',
            };
          },
        },
      ],
    });
    vi.spyOn(blockedGuard, 'assess');

    const factory = await import('../security-protocol/factory.js');
    vi.spyOn(factory, 'getSecurityGuard').mockReturnValue(blockedGuard);

    const result = await runVerificationPlan({
      planId: 'plan-blocked',
      cwd: '/repo',
      context,
      verificationPlan: {
        required: true,
        commands: [
          { cli: 'rm', args: ['-rf', '/'] },
        ],
        semanticChecks: [],
        successCriteria: ['Should not run blocked command'],
      },
    });

    expect(result.status).toBe('fail');
    expect(result.failureKind).toBe('command_failure');
    expect(result.commandResults).toHaveLength(1);
    expect(result.commandResults[0].ok).toBe(false);
    expect(result.commandResults[0].exitCode).toBeNull();
  });

  it('should fail when a verification command exits with an error', async () => {
    const passedGuard = createSecurityGuard({
      evaluators: [
        {
          name: 'passed-evaluator',
          async evaluate() {
            return {
              decision: 'PASSED',
              riskLevel: 'none',
            };
          },
        },
      ],
    });
    const factory = await import('../security-protocol/factory.js');
    vi.spyOn(factory, 'getSecurityGuard').mockReturnValue(passedGuard);

    vi.spyOn(context.environment, 'exec').mockRejectedValue(
      Object.assign(new Error('command failed'), {
        status: 2,
        stdout: 'partial output',
        stderr: 'test failed',
      }),
    );

    const result = await runVerificationPlan({
      planId: 'plan-fail',
      cwd: '/repo',
      context,
      verificationPlan: {
        required: true,
        commands: [
          { cli: 'echo', args: ['test'] },
        ],
        semanticChecks: [],
        successCriteria: ['Verification command returns zero'],
      },
    });

    expect(result.status).toBe('fail');
    expect(result.failureKind).toBe('command_failure');
    expect(result.commandResults).toHaveLength(1);
    expect(result.commandResults[0].ok).toBe(false);
    expect(result.commandResults[0].exitCode).toBe(2);
    expect(result.commandResults[0].stderrSummary).toContain('test failed');
  });
});
