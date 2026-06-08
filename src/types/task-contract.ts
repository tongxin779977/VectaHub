export type TaskContractLanguage = 'zh-CN' | 'en-US' | 'mixed' | 'unknown';

export type TaskContractRouteSource = 'capability' | 'llm-tool-calling' | 'rule' | 'mixed';

export interface TaskContractBase {
  schemaVersion: '1.0';
  requestId: string;
  rawInput: string;
  normalizedGoal: string;
  confidence: number;
  language: TaskContractLanguage;
  internalSignals: {
    intentCandidates: string[];
    routeSource: TaskContractRouteSource;
  };
}

export interface ReplyTaskContract extends TaskContractBase {
  kind: 'reply';
  replyMode: 'answer' | 'explain' | 'status-summary';
  answerTopic: string;
}

export interface ClarifyTaskContract extends TaskContractBase {
  kind: 'clarify';
  missing: string[];
  question: string;
}

export interface BlockedTaskContract extends TaskContractBase {
  kind: 'blocked';
  reason: string;
  safetyCategory?: 'policy' | 'permission' | 'unsupported' | 'ambiguous';
}

export interface ExecutionTaskContract extends TaskContractBase {
  kind: 'execute';
  taskKind: 'diagnose' | 'inspect' | 'modify' | 'generate' | 'delegate' | 'workflow';
  operation: string;
  target: {
    scope: 'project' | 'repo' | 'file' | 'session' | 'environment' | 'unknown';
    identifier?: string;
  };
  constraints: {
    requiresConfirmation: boolean;
    requiresVerification: boolean;
    sideEffects: Array<'read' | 'write' | 'command' | 'network'>;
  };
  executionStrategy: {
    mode: 'capability' | 'direct-command' | 'workflow-draft' | 'agent-runtime';
    capabilityId?: string;
    commandSurfaceId?: string;
  };
  expectedOutput: {
    format: 'text' | 'json' | 'report' | 'workflow';
    audience: 'user' | 'system';
  };
}

export type TaskContract =
  | ReplyTaskContract
  | ClarifyTaskContract
  | BlockedTaskContract
  | ExecutionTaskContract;

export interface TaskContractEnvelope<TLegacy = unknown> {
  taskContract: TaskContract;
  legacy?: TLegacy;
}
