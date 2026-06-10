import { describe, it, expect } from 'vitest';
import { createRunDispatch } from './run-dispatch.js';

describe('createRunDispatch', () => {
  function createExecuteTaskContract(commandSurfaceId?: string) {
    return {
      schemaVersion: '1.0' as const,
      requestId: 'req_1',
      rawInput: '帮我诊断一下这个项目',
      normalizedGoal: '帮我诊断一下这个项目',
      confidence: 1,
      language: 'zh-CN' as const,
      internalSignals: {
        intentCandidates: ['doctor'],
        routeSource: 'capability' as const,
      },
      kind: 'execute' as const,
      taskKind: 'diagnose' as const,
      operation: 'doctor',
      target: {
        scope: 'project' as const,
      },
      constraints: {
        requiresConfirmation: false,
        requiresVerification: false,
        sideEffects: ['command' as const],
      },
      executionStrategy: {
        mode: 'capability' as const,
        commandSurfaceId,
      },
      expectedOutput: {
        format: 'text' as const,
        audience: 'system' as const,
      },
    };
  }

  describe('validateStep for vectahub subcommands', () => {
    it('should block unregistered vectahub subcommand', () => {
      const result = createRunDispatch({
        text: 'test',
        steps: [{ cli: 'vectahub', args: ['tool', 'run', 'ls'] }],
      });
      expect(result.kind).toBe('blocked');
      expect(result.executable).toBe(false);
      expect(result.reason).toContain('not registered');
    });

    it('should allow run-command subcommand for tool_run intent', () => {
      const result = createRunDispatch({
        text: 'list all files',
        steps: [{ cli: 'vectahub', args: ['run-command', 'ls'] }],
      });
      expect(result.kind).toBe('workflow');
      expect(result.executable).toBe(true);
    });

    it('should allow run-command subcommand with additional args', () => {
      const result = createRunDispatch({
        text: 'list all files with details',
        steps: [{ cli: 'vectahub', args: ['run-command', 'ls', '-la'] }],
      });
      expect(result.kind).toBe('workflow');
      expect(result.executable).toBe(true);
    });
  });

  describe('direct local commands', () => {
    it('should classify ls as direct-command', () => {
      const result = createRunDispatch({
        text: 'list files',
        steps: [{ cli: 'ls', args: [] }],
      });
      expect(result.kind).toBe('direct-command');
      expect(result.executable).toBe(true);
    });

    it('should classify git as direct-command', () => {
      const result = createRunDispatch({
        text: 'git status',
        steps: [{ cli: 'git', args: ['status'] }],
      });
      expect(result.kind).toBe('direct-command');
      expect(result.executable).toBe(true);
    });
  });

  describe('empty steps', () => {
    it('should return clarify when no steps and no reply', () => {
      const result = createRunDispatch({
        text: 'something unclear',
        steps: [],
      });
      expect(result.kind).toBe('clarify');
      expect(result.executable).toBe(false);
    });

    it('should return dialog when no steps but has reply', () => {
      const result = createRunDispatch({
        text: 'hello',
        steps: [],
        reply: 'Hi there!',
      });
      expect(result.kind).toBe('dialog');
      expect(result.executable).toBe(false);
    });

    it('should use task contract execution strategy when steps are empty', () => {
      const result = createRunDispatch({
        text: '帮我诊断一下这个项目',
        steps: [],
        taskContract: createExecuteTaskContract('vectahub doctor'),
      });
      expect(result.kind).toBe('workflow');
      expect(result.executable).toBe(true);
    });

    it('should block task contract execution when vectahub subcommand is not registered', () => {
      const result = createRunDispatch({
        text: '帮我诊断 CI',
        steps: [],
        taskContract: createExecuteTaskContract('vectahub ci diagnose'),
      });

      expect(result.kind).toBe('blocked');
      expect(result.executable).toBe(false);
      expect(result.reason).toContain('not registered');
    });

    it('should block task contract execution when commandSurfaceId is missing', () => {
      const result = createRunDispatch({
        text: '帮我诊断一下这个项目',
        steps: [],
        taskContract: createExecuteTaskContract(undefined),
      });

      expect(result.kind).toBe('blocked');
      expect(result.executable).toBe(false);
      expect(result.reason).toContain('missing a valid command surface id');
    });

    it('should return agent-task when task contract mode is agent-runtime and commandSurfaceId is missing', () => {
      const contract = createExecuteTaskContract(undefined);
      contract.executionStrategy.mode = 'agent-runtime' as const;

      const result = createRunDispatch({
        text: '修改一些代码',
        steps: [],
        taskContract: contract,
      });

      expect(result.kind).toBe('agent-task');
      expect(result.executable).toBe(false);
      expect(result.reason).toContain('agent-runtime');
      expect(result.suggestedAction).toContain('Agent runtime');
    });
  });

  describe('missing cli in step', () => {
    it('should block step with empty cli', () => {
      const result = createRunDispatch({
        text: 'test',
        steps: [{ cli: '', args: ['something'] }],
      });
      expect(result.kind).toBe('blocked');
      expect(result.executable).toBe(false);
      expect(result.reason).toContain('missing cli');
    });
  });
});
