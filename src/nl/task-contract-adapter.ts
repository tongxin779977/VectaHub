import type { NLResult } from './types.js';
import type {
  BlockedTaskContract,
  ClarifyTaskContract,
  ExecutionTaskContract,
  ReplyTaskContract,
  TaskContract,
  TaskContractEnvelope,
  TaskContractLanguage,
  TaskContractRouteSource,
} from '../types/task-contract.js';

function detectLanguage(input: string): TaskContractLanguage {
  const hasChinese = /[\u4e00-\u9fff]/.test(input);
  const hasLatin = /[A-Za-z]/.test(input);

  if (hasChinese && hasLatin) {
    return 'mixed';
  }
  if (hasChinese) {
    return 'zh-CN';
  }
  if (hasLatin) {
    return 'en-US';
  }
  return 'unknown';
}

function mapRouteSource(result: NLResult): TaskContractRouteSource {
  switch (result.metadata.path) {
    case 'category-router':
      return 'capability';
    case 'rule-based':
      return 'rule-based';
    case 'direct-query':
      return 'rule';
    default:
      return 'mixed';
  }
}

function createBase(
  rawInput: string,
  result: NLResult,
): Omit<ReplyTaskContract, 'kind' | 'replyMode' | 'answerTopic'> {
  const intentCandidate = result.intent ?? result.taskList?.intent ?? 'UNKNOWN';

  return {
    schemaVersion: '1.0',
    requestId: `nlreq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    rawInput,
    normalizedGoal: rawInput.trim(),
    confidence: result.confidence,
    language: detectLanguage(rawInput),
    internalSignals: {
      intentCandidates: [intentCandidate],
      routeSource: mapRouteSource(result),
    },
  };
}

function inferExecuteTaskKind(result: NLResult): ExecutionTaskContract['taskKind'] {
  const intent = result.intent ?? result.taskList?.intent ?? 'UNKNOWN';
  if (intent === 'doctor') {
    return 'diagnose';
  }
  if (intent === 'workflow_generate' || intent === 'workflow_run' || result.workflowYAML) {
    return 'workflow';
  }
  if (intent.startsWith('file_') || intent.startsWith('git_') || intent === 'tool_run') {
    return 'modify';
  }
  if (intent === 'session_list' || intent === 'session_inspect' || intent === 'QUERY_INFO') {
    return 'inspect';
  }
  const agentIntents = ['refactor', 'implement', 'fix_code', 'code_review', 'cross_file'];
  if (agentIntents.includes(intent as string)) {
    return 'delegate';
  }
  return 'inspect';
}

function inferTargetScope(result: NLResult): ExecutionTaskContract['target']['scope'] {
  const intent = result.intent ?? result.taskList?.intent ?? 'UNKNOWN';
  if (intent === 'doctor') {
    return 'project';
  }
  if (intent.startsWith('file_')) {
    return 'file';
  }
  if (intent.startsWith('session_')) {
    return 'session';
  }
  return 'unknown';
}

function inferExecutionStrategy(result: NLResult): ExecutionTaskContract['executionStrategy'] {
  const firstCommand = result.taskList?.tasks[0]?.commands?.[0];
  const intent = result.intent ?? result.taskList?.intent ?? 'UNKNOWN';

  const taskKind = inferExecuteTaskKind(result);
  if (taskKind === 'diagnose' || taskKind === 'delegate') {
    return { mode: 'agent-runtime' };
  }

  if (result.workflowYAML) {
    return { mode: 'workflow-draft', commandSurfaceId: firstCommand ? [firstCommand.cli, ...(firstCommand.args ?? [])].join(' ') : undefined };
  }

  const agentIntents = ['refactor', 'implement', 'fix_code', 'code_review', 'cross_file'];
  if (agentIntents.includes(intent as string)) {
    return { mode: 'agent-runtime' };
  }

  if (result.metadata.path === 'category-router') {
    return {
      mode: 'capability',
      capabilityId: result.metadata.fallbackReason,
      commandSurfaceId: firstCommand ? [firstCommand.cli, ...(firstCommand.args ?? [])].join(' ') : undefined,
    };
  }
  return {
    mode: 'direct-command',
    commandSurfaceId: firstCommand ? [firstCommand.cli, ...(firstCommand.args ?? [])].join(' ') : undefined,
  };
}

function createReplyTaskContract(rawInput: string, result: NLResult): ReplyTaskContract {
  const base = createBase(rawInput, result);
  return {
    ...base,
    kind: 'reply',
    replyMode: 'answer',
    answerTopic: result.intent ?? result.taskList?.intent ?? 'general',
  };
}

function createClarifyTaskContract(rawInput: string, result: NLResult): ClarifyTaskContract {
  const base = createBase(rawInput, result);
  const warning = result.taskList?.warnings?.[0] ?? result.metadata.fallbackReason ?? 'clarification required';
  return {
    ...base,
    kind: 'clarify',
    missing: [],
    question: warning,
  };
}

function createBlockedTaskContract(rawInput: string, result: NLResult): BlockedTaskContract {
  const base = createBase(rawInput, result);
  return {
    ...base,
    kind: 'blocked',
    reason: result.metadata.fallbackReason ?? 'request is blocked',
    safetyCategory: 'unsupported',
  };
}

function createExecutionTaskContract(rawInput: string, result: NLResult): ExecutionTaskContract {
  const base = createBase(rawInput, result);
  return {
    ...base,
    kind: 'execute',
    taskKind: inferExecuteTaskKind(result),
    operation: result.intent ?? result.taskList?.tasks[0]?.description ?? 'execute task',
    target: {
      scope: inferTargetScope(result),
    },
    constraints: {
      requiresConfirmation: false,
      requiresVerification: Boolean(result.workflowYAML),
      sideEffects: ['command'],
    },
    executionStrategy: inferExecutionStrategy(result),
    expectedOutput: {
      format: result.workflowYAML ? 'workflow' : 'text',
      audience: 'system',
    },
  };
}

export function toTaskContract(rawInput: string, result: NLResult): TaskContract {
  if (result.taskList?.tasks?.length || result.workflowYAML) {
    return createExecutionTaskContract(rawInput, result);
  }

  if (result.reply) {
    return createReplyTaskContract(rawInput, result);
  }

  const fallbackReason = result.metadata.fallbackReason ?? '';
  const warning = result.taskList?.warnings?.[0] ?? '';
  const combinedReason = `${fallbackReason} ${warning}`.toLowerCase();
  if (combinedReason.includes('clarif')) {
    return createClarifyTaskContract(rawInput, result);
  }

  return createBlockedTaskContract(rawInput, result);
}

export function toTaskContractEnvelope(rawInput: string, result: NLResult): TaskContractEnvelope<NLResult> {
  return {
    taskContract: toTaskContract(rawInput, result),
    legacy: result,
  };
}
