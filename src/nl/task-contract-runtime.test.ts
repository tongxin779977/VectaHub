import { describe, it, expect } from 'vitest';
import {
  resolveTaskContractAction,
  formatBridgeCommandText,
  buildDispatchFeedbackText,
} from './task-contract-runtime.js';
import type { NLResult } from './core/types.js';
import type { TaskContractEnvelope } from '../types/task-contract.js';
import type { RunDispatchResult } from '../commands/run-dispatch.js';

function makeExecuteContract(overrides: {
  commandSurfaceId?: string;
  mode?: 'capability' | 'direct-command' | 'workflow-draft' | 'agent-runtime';
  rawInput?: string;
} = {}) {
  const rawInput = overrides.rawInput ?? '帮我诊断一下这个项目';
  return {
    schemaVersion: '1.0' as const,
    requestId: 'exec_req',
    rawInput,
    normalizedGoal: rawInput,
    confidence: 1,
    language: 'zh-CN' as const,
    internalSignals: {
      intentCandidates: ['doctor'],
      routeSource: 'capability' as const,
    },
    kind: 'execute' as const,
    taskKind: 'diagnose' as const,
    operation: 'doctor',
    target: { scope: 'project' as const },
    constraints: {
      requiresConfirmation: false,
      requiresVerification: false,
      sideEffects: ['command' as const],
    },
    executionStrategy: {
      mode: overrides.mode ?? 'capability',
      commandSurfaceId: overrides.commandSurfaceId ?? 'vectahub doctor',
    },
    expectedOutput: {
      format: 'text' as const,
      audience: 'system' as const,
    },
  };
}

function makeEnvelope(
  contract: ReturnType<typeof makeExecuteContract> | { kind: string; [k: string]: unknown },
  legacy: NLResult,
): TaskContractEnvelope<NLResult> {
  return { taskContract: contract as TaskContractEnvelope<NLResult>['taskContract'], legacy };
}

function makeNLResult(overrides: Partial<NLResult> = {}): NLResult {
  return {
    success: true,
    intent: 'test',
    confidence: 0.9,
    metadata: { path: 'category-router' },
    ...overrides,
  };
}

describe('formatBridgeCommandText', () => {
  it('formats vectahub subcommand', () => {
    expect(formatBridgeCommandText('vectahub', ['doctor'])).toBe('doctor');
  });

  it('formats vectahub subcommand with args', () => {
    expect(formatBridgeCommandText('vectahub', ['run', '--dry-run'])).toBe('run --dry-run');
  });

  it('returns null for non-vectahub cli', () => {
    expect(formatBridgeCommandText('echo', ['hello'])).toBeNull();
  });

  it('returns null for empty subcommand', () => {
    expect(formatBridgeCommandText('vectahub', [])).toBeNull();
    expect(formatBridgeCommandText('vectahub', ['  '])).toBeNull();
  });
});

describe('buildDispatchFeedbackText', () => {
  it('includes blocked message', () => {
    const dispatch: RunDispatchResult = {
      kind: 'blocked',
      executable: false,
      reason: 'test',
    };
    const text = buildDispatchFeedbackText(['摘要'], dispatch, 'REPL');
    expect(text).toContain('任务执行已阻断');
    expect(text).toContain('摘要');
  });

  it('includes direct-command message with context label', () => {
    const dispatch: RunDispatchResult = {
      kind: 'direct-command',
      executable: true,
      reason: 'test',
    };
    expect(buildDispatchFeedbackText([], dispatch, 'REPL')).toContain('REPL 不会');
    expect(buildDispatchFeedbackText([], dispatch, 'vectahub chat')).toContain('vectahub chat 不会');
  });

  it('includes agent-task message', () => {
    const dispatch: RunDispatchResult = {
      kind: 'agent-task',
      executable: false,
      reason: 'test',
      suggestedAction: '建议内容',
    };
    const text = buildDispatchFeedbackText([], dispatch, 'REPL');
    expect(text).toContain('Agent runtime');
    expect(text).toContain('建议：建议内容');
  });

  it('includes clarify message', () => {
    const dispatch: RunDispatchResult = { kind: 'clarify', executable: false, reason: 'test' };
    expect(buildDispatchFeedbackText([], dispatch, 'REPL')).toContain('补充信息');
  });

  it('includes dialog message', () => {
    const dispatch: RunDispatchResult = { kind: 'dialog', executable: false, reason: 'test' };
    expect(buildDispatchFeedbackText([], dispatch, 'REPL')).toContain('直接回复');
  });

  it('workflow kind adds no extra message', () => {
    const dispatch: RunDispatchResult = { kind: 'workflow', executable: true, reason: 'test' };
    expect(buildDispatchFeedbackText(['摘要'], dispatch, 'REPL')).toBe('摘要');
  });
});

describe('resolveTaskContractAction', () => {
  it('returns reply action for reply contract', () => {
    const envelope = makeEnvelope(
      {
        kind: 'reply' as const,
        schemaVersion: '1.0',
        requestId: 'r1',
        rawInput: 'hello',
        normalizedGoal: 'hello',
        confidence: 0.9,
        language: 'en-US' as const,
        internalSignals: { intentCandidates: ['QUERY_INFO'], routeSource: 'mixed' as const },
        replyMode: 'answer' as const,
        answerTopic: 'general',
      },
      makeNLResult({ reply: '项目状态正常。' }),
    );
    const action = resolveTaskContractAction(envelope, 'hello', 'REPL');
    expect(action.kind).toBe('reply');
    expect((action as { reply?: string }).reply).toBe('项目状态正常。');
  });

  it('returns clarify action for clarify contract', () => {
    const envelope = makeEnvelope(
      {
        kind: 'clarify' as const,
        schemaVersion: '1.0',
        requestId: 'c1',
        rawInput: '模糊请求',
        normalizedGoal: '模糊请求',
        confidence: 0.5,
        language: 'zh-CN' as const,
        internalSignals: { intentCandidates: ['UNKNOWN'], routeSource: 'mixed' as const },
        missing: [],
        question: '请说明具体目标',
      },
      makeNLResult(),
    );
    const action = resolveTaskContractAction(envelope, '模糊请求', 'REPL');
    expect(action.kind).toBe('clarify');
    expect((action as { question: string }).question).toBe('请说明具体目标');
  });

  it('returns blocked action for blocked contract', () => {
    const envelope = makeEnvelope(
      {
        kind: 'blocked' as const,
        schemaVersion: '1.0',
        requestId: 'b1',
        rawInput: '危险操作',
        normalizedGoal: '危险操作',
        confidence: 0.3,
        language: 'zh-CN' as const,
        internalSignals: { intentCandidates: ['UNKNOWN'], routeSource: 'mixed' as const },
        reason: '不支持的操作',
      },
      makeNLResult(),
    );
    const action = resolveTaskContractAction(envelope, '危险操作', 'REPL');
    expect(action.kind).toBe('blocked');
    expect((action as { reason: string }).reason).toBe('不支持的操作');
  });

  it('returns execute-bridge for vectahub doctor', () => {
    const envelope = makeEnvelope(
      makeExecuteContract({ commandSurfaceId: 'vectahub doctor' }),
      makeNLResult({ intent: 'doctor' }),
    );
    const action = resolveTaskContractAction(envelope, '帮我诊断', 'REPL');
    expect(action.kind).toBe('execute-bridge');
    expect((action as { bridgeCommand: string }).bridgeCommand).toBe('doctor');
  });

  it('returns execute-dispatch-feedback for invalid vectahub ci diagnose', () => {
    const envelope = makeEnvelope(
      makeExecuteContract({ commandSurfaceId: 'vectahub ci diagnose' }),
      makeNLResult({ intent: 'doctor' }),
    );
    const action = resolveTaskContractAction(envelope, '帮我诊断 CI', 'REPL');
    expect(action.kind).toBe('execute-dispatch-feedback');
    expect((action as { feedback: string }).feedback).toContain('任务执行已阻断');
  });

  it('returns execute-continue for direct-command', () => {
    const envelope = makeEnvelope(
      makeExecuteContract({ mode: 'direct-command', commandSurfaceId: 'git status' }),
      makeNLResult({ intent: 'git_status' }),
    );
    const action = resolveTaskContractAction(envelope, '帮我执行 git status', 'REPL');
    expect(action.kind).toBe('execute-continue');
  });

  it('execute contract takes precedence over legacy reply', () => {
    const envelope = makeEnvelope(
      makeExecuteContract({ commandSurfaceId: 'vectahub doctor' }),
      makeNLResult({ intent: 'doctor', reply: '我先解释一下' }),
    );
    const action = resolveTaskContractAction(envelope, '帮我诊断并说明原因', 'REPL');
    expect(action.kind).toBe('execute-bridge');
    expect((action as { bridgeCommand: string }).bridgeCommand).toBe('doctor');
  });

  it('returns execute-continue for non-vectahub workflow', () => {
    const envelope = makeEnvelope(
      makeExecuteContract({ commandSurfaceId: 'echo hello' }),
      makeNLResult({
        intent: 'test',
        workflowYAML: 'steps:\n  - id: step1\n    type: exec\n    cli: echo\n    args: ["hello"]',
        taskList: { tasks: [{ commands: [{ cli: 'echo', args: ['hello'] }] }] },
      }),
    );
    const action = resolveTaskContractAction(envelope, 'echo hello', 'REPL');
    expect(action.kind).toBe('execute-continue');
  });
});
