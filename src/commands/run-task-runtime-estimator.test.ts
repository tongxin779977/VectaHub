import { describe, expect, it } from 'vitest';

import {
  calculateHeuristicRuntimeEstimate,
  combineRuntimeEstimates,
  type AgentRuntimeProfileKey,
  type AgentRuntimeSample,
  type TaskRuntimeFeatureInput,
} from './run-task-runtime-estimator.js';

function createFeatures(overrides: Partial<TaskRuntimeFeatureInput> = {}): TaskRuntimeFeatureInput {
  return {
    taskId: 'RTK-006',
    allowedFileCount: 1,
    newSourceFileCount: 0,
    newTestFileCount: 0,
    validationCommandCount: 1,
    hasVitest: false,
    hasTypecheck: true,
    hasLint: false,
    modifiesTests: false,
    requiresReadableAndJsonOutput: false,
    requiresAsyncProcessTimeoutTests: false,
    hasCliRegistration: false,
    changesPublicContract: false,
    changesRuntimeBehavior: false,
    changesPersistence: false,
    changesSecurityOrSandbox: false,
    mustReuseForbiddenFileLogic: false,
    hasStopIfBroadRefactorNote: false,
    isDocsOnly: false,
    isContractOnly: true,
    isSinglePureFunction: false,
    noRuntimeBehaviorChange: true,
    ...overrides,
  };
}

const codexProfile: AgentRuntimeProfileKey = {
  agentId: 'codex',
  adapterId: 'adapter=codex',
  model: 'gpt-5.4',
  workspaceHash: 'workspace-a',
};

function createSample(
  overrides: Partial<AgentRuntimeSample> = {},
): AgentRuntimeSample {
  return {
    profileKey: codexProfile,
    taskShapeHash: 'shape-a',
    complexity: 'small',
    score: 40,
    actualDurationMs: 300_000,
    success: true,
    completionSignal: 'close',
    recordedAt: '2026-05-26T00:00:00.000Z',
    ...overrides,
  };
}

describe('calculateHeuristicRuntimeEstimate', () => {
  it('classifies a narrow contract-only task as tiny', () => {
    const estimate = calculateHeuristicRuntimeEstimate(createFeatures());

    expect(estimate.complexity).toBe('tiny');
    expect(estimate.splitRecommended).toBe(false);
    expect(estimate.expectedDurationMs).toBeLessThanOrEqual(180_000);
    expect(estimate.progressIntervalMs).toBeGreaterThanOrEqual(30_000);
  });

  it('recommends splitting a broad CLI registration task', () => {
    const estimate = calculateHeuristicRuntimeEstimate(createFeatures({
      allowedFileCount: 4,
      newSourceFileCount: 1,
      newTestFileCount: 1,
      validationCommandCount: 3,
      hasVitest: true,
      hasLint: true,
      modifiesTests: true,
      requiresReadableAndJsonOutput: true,
      hasCliRegistration: true,
      mustReuseForbiddenFileLogic: true,
      isContractOnly: false,
      noRuntimeBehaviorChange: false,
    }));

    expect(estimate.complexity).toBe('large');
    expect(estimate.splitRecommended).toBe(true);
    expect(estimate.reasons).toContain('CLI registration change');
    expect(estimate.reasons).toContain('must reuse logic from forbidden file boundary');
  });
});

describe('combineRuntimeEstimates', () => {
  it('bounds LLM estimates before combining them with the heuristic estimate', () => {
    const heuristic = calculateHeuristicRuntimeEstimate(createFeatures());
    const estimate = combineRuntimeEstimates({
      profileKey: codexProfile,
      taskShapeHash: 'shape-a',
      features: createFeatures(),
      llmEstimate: {
        estimatedDurationMs: heuristic.expectedDurationMs * 10,
        confidence: 'high',
        splitRecommended: false,
        reasons: ['LLM thinks this may take longer.'],
      },
      history: [],
    });

    expect(estimate.llmEstimateMs).toBe(heuristic.expectedDurationMs * 2);
    expect(estimate.weights).toEqual({ heuristic: 0.6, llm: 0.4, historical: 0 });
    expect(estimate.expectedDurationMs).toBeLessThan(heuristic.expectedDurationMs * 2);
  });

  it('uses only same-agent and same-workspace history for calibration', () => {
    const history: AgentRuntimeSample[] = [
      createSample({ actualDurationMs: 300_000 }),
      createSample({ actualDurationMs: 360_000 }),
      createSample({
        profileKey: {
          ...codexProfile,
          agentId: 'opencode',
        },
        actualDurationMs: 900_000,
      }),
      createSample({
        profileKey: {
          ...codexProfile,
          workspaceHash: 'workspace-b',
        },
        actualDurationMs: 840_000,
      }),
    ];

    const estimate = combineRuntimeEstimates({
      profileKey: codexProfile,
      taskShapeHash: 'shape-a',
      features: createFeatures({
        allowedFileCount: 2,
        isContractOnly: false,
        noRuntimeBehaviorChange: false,
      }),
      history,
    });

    expect(estimate.historicalEstimateMs).toBe(330_000);
    expect(estimate.weights.historical).toBeGreaterThan(0);
    expect(estimate.reasons).toContain('historical median=330000ms samples=2');
  });

  it('derives progress and timeout budgets from the combined estimate', () => {
    const estimate = combineRuntimeEstimates({
      profileKey: codexProfile,
      taskShapeHash: 'shape-a',
      features: createFeatures({
        allowedFileCount: 3,
        newSourceFileCount: 1,
        newTestFileCount: 1,
        hasVitest: true,
        hasLint: true,
        modifiesTests: true,
        requiresReadableAndJsonOutput: true,
        isContractOnly: false,
        noRuntimeBehaviorChange: false,
      }),
      llmEstimate: {
        estimatedDurationMs: 600_000,
        confidence: 'medium',
        splitRecommended: false,
        reasons: ['Multiple files and tests.'],
      },
      history: [
        createSample({ actualDurationMs: 540_000 }),
        createSample({ actualDurationMs: 600_000 }),
      ],
    });

    expect(estimate.progressIntervalMs).toBeGreaterThanOrEqual(30_000);
    expect(estimate.progressIntervalMs).toBeLessThanOrEqual(120_000);
    expect(estimate.noCloseTimeoutMs).toBeGreaterThanOrEqual(120_000);
    expect(estimate.extensionMs).toBeGreaterThanOrEqual(60_000);
    expect(estimate.maxWallClockMs).toBeGreaterThanOrEqual(300_000);
  });
});
