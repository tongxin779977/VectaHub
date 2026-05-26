export type TaskComplexityLevel = 'tiny' | 'small' | 'medium' | 'large';

export interface AgentRuntimeProfileKey {
  agentId: string;
  adapterId?: string;
  model?: string;
  workspaceHash: string;
}

export interface TaskRuntimeFeatureInput {
  taskId: string;
  allowedFileCount: number;
  newSourceFileCount: number;
  newTestFileCount: number;
  validationCommandCount: number;
  hasVitest: boolean;
  hasTypecheck: boolean;
  hasLint: boolean;
  modifiesTests: boolean;
  requiresReadableAndJsonOutput: boolean;
  requiresAsyncProcessTimeoutTests: boolean;
  hasCliRegistration: boolean;
  changesPublicContract: boolean;
  changesRuntimeBehavior: boolean;
  changesPersistence: boolean;
  changesSecurityOrSandbox: boolean;
  mustReuseForbiddenFileLogic: boolean;
  hasStopIfBroadRefactorNote: boolean;
  isDocsOnly: boolean;
  isContractOnly: boolean;
  isSinglePureFunction: boolean;
  noRuntimeBehaviorChange: boolean;
}

export interface LLMRuntimeEstimate {
  estimatedDurationMs: number;
  confidence: 'low' | 'medium' | 'high';
  splitRecommended: boolean;
  reasons: string[];
}

export interface AgentRuntimeSample {
  profileKey: AgentRuntimeProfileKey;
  taskShapeHash: string;
  complexity: TaskComplexityLevel;
  score: number;
  actualDurationMs: number;
  success: boolean;
  failureKind?: string;
  completionSignal?: string;
  recordedAt: string;
}

export interface TaskRuntimeEstimate {
  taskId: string;
  complexity: TaskComplexityLevel;
  score: number;
  expectedDurationMs: number;
  heuristicEstimateMs: number;
  llmEstimateMs?: number;
  historicalEstimateMs?: number;
  noCloseTimeoutMs: number;
  extensionMs: number;
  maxExtensions: number;
  maxWallClockMs: number;
  progressIntervalMs: number;
  splitRecommended: boolean;
  reasons: string[];
  weights: {
    heuristic: number;
    llm: number;
    historical: number;
  };
}

export interface CombineRuntimeEstimateInput {
  profileKey: AgentRuntimeProfileKey;
  taskShapeHash: string;
  features: TaskRuntimeFeatureInput;
  llmEstimate?: LLMRuntimeEstimate;
  history?: AgentRuntimeSample[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function getComplexity(score: number): TaskComplexityLevel {
  if (score <= 25) return 'tiny';
  if (score <= 50) return 'small';
  if (score <= 80) return 'medium';
  return 'large';
}

function getFileScopeScore(allowedFileCount: number): number {
  if (allowedFileCount <= 1) return 5;
  if (allowedFileCount === 2) return 10;
  if (allowedFileCount <= 4) return 20;
  return 35;
}

function getExpectedDurationCap(complexity: TaskComplexityLevel): number {
  if (complexity === 'tiny') return 180_000;
  if (complexity === 'small') return 420_000;
  if (complexity === 'medium') return 900_000;
  return 1_200_000;
}

function getMaxWallClockCap(complexity: TaskComplexityLevel): number {
  if (complexity === 'tiny') return 300_000;
  if (complexity === 'small') return 600_000;
  if (complexity === 'medium') return 1_200_000;
  return 1_800_000;
}

function getMaxExtensions(complexity: TaskComplexityLevel): number {
  if (complexity === 'tiny') return 1;
  if (complexity === 'small') return 2;
  if (complexity === 'medium') return 3;
  return 0;
}

function scoreBool(value: boolean, points: number): number {
  return value ? points : 0;
}

function getReasons(features: TaskRuntimeFeatureInput, score: number, complexity: TaskComplexityLevel): string[] {
  const reasons: string[] = [`score=${score}`, `complexity=${complexity}`];
  if (features.allowedFileCount > 4) reasons.push('many allowed files');
  if (features.hasCliRegistration) reasons.push('CLI registration change');
  if (features.mustReuseForbiddenFileLogic) reasons.push('must reuse logic from forbidden file boundary');
  if (features.requiresReadableAndJsonOutput) reasons.push('readable and JSON output required');
  if (features.changesRuntimeBehavior) reasons.push('runtime behavior change');
  if (features.requiresAsyncProcessTimeoutTests) reasons.push('async/process timeout tests required');
  return reasons;
}

export function calculateHeuristicRuntimeEstimate(features: TaskRuntimeFeatureInput): TaskRuntimeEstimate {
  const fileScopeScore = getFileScopeScore(features.allowedFileCount);
  const creationScore = features.newSourceFileCount * 10 + features.newTestFileCount * 8;
  const integrationScore =
    scoreBool(features.hasCliRegistration, 25) +
    scoreBool(features.changesPublicContract, 20) +
    scoreBool(features.changesRuntimeBehavior, 30) +
    scoreBool(features.changesPersistence, 30) +
    scoreBool(features.changesSecurityOrSandbox, 35);
  const testScore =
    scoreBool(features.modifiesTests, 10) +
    scoreBool(features.requiresReadableAndJsonOutput, 15) +
    scoreBool(features.requiresAsyncProcessTimeoutTests, 20);
  const reusePressureScore =
    scoreBool(features.mustReuseForbiddenFileLogic, 25) +
    scoreBool(features.hasStopIfBroadRefactorNote, 10);
  const validationScore =
    scoreBool(features.hasVitest, 10) +
    scoreBool(features.hasTypecheck, 5) +
    scoreBool(features.hasLint, 5) +
    (features.validationCommandCount > 2 ? 5 : 0);
  const simplificationScore =
    scoreBool(features.isDocsOnly, 15) +
    scoreBool(features.isContractOnly, 10) +
    scoreBool(features.isSinglePureFunction, 10) +
    scoreBool(features.noRuntimeBehaviorChange, 5);
  const score = Math.max(
    0,
    10 + fileScopeScore + creationScore + integrationScore + testScore + reusePressureScore + validationScore - simplificationScore,
  );
  const complexity = getComplexity(score);
  const rawExpectedDurationMs = 60_000 + score * 6_000;
  const expectedDurationMs = Math.min(rawExpectedDurationMs, getExpectedDurationCap(complexity));

  return deriveRuntimeBudget({
    taskId: features.taskId,
    score,
    complexity,
    expectedDurationMs,
    heuristicEstimateMs: expectedDurationMs,
    splitRecommended: shouldRecommendSplit(features, score, complexity),
    reasons: getReasons(features, score, complexity),
    weights: { heuristic: 1, llm: 0, historical: 0 },
  });
}

function shouldRecommendSplit(
  features: TaskRuntimeFeatureInput,
  score: number,
  complexity: TaskComplexityLevel,
): boolean {
  return complexity === 'large'
    || score > 80
    || features.allowedFileCount > 4
    || (features.changesRuntimeBehavior && features.modifiesTests && features.hasCliRegistration)
    || (features.mustReuseForbiddenFileLogic && features.allowedFileCount >= 3);
}

function isSameAgentProfile(sample: AgentRuntimeSample, profileKey: AgentRuntimeProfileKey): boolean {
  return sample.profileKey.agentId === profileKey.agentId
    && sample.profileKey.workspaceHash === profileKey.workspaceHash
    && sample.profileKey.adapterId === profileKey.adapterId
    && sample.profileKey.model === profileKey.model;
}

function chooseWeights(hasLlm: boolean, historicalSampleCount: number): TaskRuntimeEstimate['weights'] {
  if (historicalSampleCount >= 5) {
    return { heuristic: 0.35, llm: hasLlm ? 0.20 : 0, historical: hasLlm ? 0.45 : 0.65 };
  }
  if (historicalSampleCount >= 2) {
    return { heuristic: 0.45, llm: hasLlm ? 0.30 : 0, historical: hasLlm ? 0.25 : 0.55 };
  }
  return { heuristic: hasLlm ? 0.60 : 1, llm: hasLlm ? 0.40 : 0, historical: 0 };
}

function normalizeWeights(weights: TaskRuntimeEstimate['weights']): TaskRuntimeEstimate['weights'] {
  const total = weights.heuristic + weights.llm + weights.historical;
  if (total <= 0) return { heuristic: 1, llm: 0, historical: 0 };
  return {
    heuristic: weights.heuristic / total,
    llm: weights.llm / total,
    historical: weights.historical / total,
  };
}

export function combineRuntimeEstimates(input: CombineRuntimeEstimateInput): TaskRuntimeEstimate {
  const heuristic = calculateHeuristicRuntimeEstimate(input.features);
  const matchingHistory = (input.history || [])
    .filter(sample => isSameAgentProfile(sample, input.profileKey))
    .filter(sample => sample.taskShapeHash === input.taskShapeHash || sample.complexity === heuristic.complexity);
  const historicalEstimateMs = median(matchingHistory.map(sample => sample.actualDurationMs));
  const boundedLlmEstimateMs = input.llmEstimate
    ? clamp(input.llmEstimate.estimatedDurationMs, heuristic.expectedDurationMs * 0.5, heuristic.expectedDurationMs * 2)
    : undefined;
  const weights = normalizeWeights(chooseWeights(Boolean(boundedLlmEstimateMs), matchingHistory.length));
  const expectedDurationMs = Math.round(
    heuristic.expectedDurationMs * weights.heuristic +
    (boundedLlmEstimateMs ?? 0) * weights.llm +
    (historicalEstimateMs ?? 0) * weights.historical,
  );
  const splitRecommended = heuristic.splitRecommended || input.llmEstimate?.splitRecommended === true;
  const reasons = [
    ...heuristic.reasons,
    ...(input.llmEstimate?.reasons.map(reason => `llm: ${reason}`) || []),
    ...(historicalEstimateMs ? [`historical median=${historicalEstimateMs}ms samples=${matchingHistory.length}`] : []),
  ];

  return deriveRuntimeBudget({
    taskId: input.features.taskId,
    score: heuristic.score,
    complexity: heuristic.complexity,
    expectedDurationMs,
    heuristicEstimateMs: heuristic.expectedDurationMs,
    llmEstimateMs: boundedLlmEstimateMs,
    historicalEstimateMs,
    splitRecommended,
    reasons,
    weights,
  });
}

function deriveRuntimeBudget(input: {
  taskId: string;
  score: number;
  complexity: TaskComplexityLevel;
  expectedDurationMs: number;
  heuristicEstimateMs: number;
  llmEstimateMs?: number;
  historicalEstimateMs?: number;
  splitRecommended: boolean;
  reasons: string[];
  weights: TaskRuntimeEstimate['weights'];
}): TaskRuntimeEstimate {
  const expectedDurationMs = Math.max(30_000, Math.round(input.expectedDurationMs));
  return {
    taskId: input.taskId,
    complexity: input.complexity,
    score: input.score,
    expectedDurationMs,
    heuristicEstimateMs: input.heuristicEstimateMs,
    llmEstimateMs: input.llmEstimateMs,
    historicalEstimateMs: input.historicalEstimateMs,
    noCloseTimeoutMs: clamp(Math.round(expectedDurationMs * 0.45), 120_000, 420_000),
    extensionMs: clamp(Math.round(expectedDurationMs * 0.20), 60_000, 180_000),
    maxExtensions: getMaxExtensions(input.complexity),
    maxWallClockMs: clamp(Math.round(expectedDurationMs * 1.8), 300_000, getMaxWallClockCap(input.complexity)),
    progressIntervalMs: clamp(Math.round(expectedDurationMs / 6), 30_000, 120_000),
    splitRecommended: input.splitRecommended,
    reasons: input.reasons,
    weights: input.weights,
  };
}
