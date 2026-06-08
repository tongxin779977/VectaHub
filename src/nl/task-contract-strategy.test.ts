import { describe, expect, it } from 'vitest';
import type { TaskContract } from '../types/task-contract.js';
import { canAutoExecuteTaskContract, resolveTaskContractCommand } from './task-contract-strategy.js';

function createExecuteContract(overrides: Partial<Extract<TaskContract, { kind: 'execute' }>> = {}): Extract<TaskContract, { kind: 'execute' }> {
  return {
    schemaVersion: '1.0',
    requestId: 'req_1',
    rawInput: '帮我诊断一下这个项目',
    normalizedGoal: '帮我诊断一下这个项目',
    confidence: 1,
    language: 'zh-CN',
    internalSignals: {
      intentCandidates: ['doctor'],
      routeSource: 'capability',
    },
    kind: 'execute',
    taskKind: 'diagnose',
    operation: 'doctor',
    target: {
      scope: 'project',
    },
    constraints: {
      requiresConfirmation: false,
      requiresVerification: false,
      sideEffects: ['command'],
    },
    executionStrategy: {
      mode: 'capability',
      commandSurfaceId: 'vectahub doctor',
    },
    expectedOutput: {
      format: 'text',
      audience: 'system',
    },
    ...overrides,
  };
}

describe('task-contract strategy', () => {
  it('resolves command from execution strategy command surface id', () => {
    const command = resolveTaskContractCommand(createExecuteContract());

    expect(command).toEqual({
      cli: 'vectahub',
      args: ['doctor'],
      commandText: 'vectahub doctor',
    });
  });

  it('allows auto execution for capability and direct-command strategies', () => {
    expect(canAutoExecuteTaskContract(createExecuteContract())).toBe(true);
    expect(canAutoExecuteTaskContract(createExecuteContract({
      executionStrategy: {
        mode: 'direct-command',
        commandSurfaceId: 'git status',
      },
    }))).toBe(true);
  });

  it('blocks auto execution when confirmation is required', () => {
    expect(canAutoExecuteTaskContract(createExecuteContract({
      constraints: {
        requiresConfirmation: true,
        requiresVerification: false,
        sideEffects: ['command'],
      },
    }))).toBe(false);
  });
});
