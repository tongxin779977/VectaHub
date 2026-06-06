
export interface SemanticTestScenario {
  id: string;
  group: string;
  intent: string;
  expressions: string[];
  expectedBehavior: {
    kind: 'reply' | 'clarify' | 'blocked' | 'plan' | 'workflow_draft';
    safety: 'safe' | 'needs_confirm' | 'blocked';
    intentRecognition: 'exact' | 'partial' | 'unknown';
  };
  weight: number;
}

export interface SemanticTestResult {
  scenarioId: string;
  expression: string;
  passed: boolean;
  score: {
    intentCorrectness: number; // 0-100
    planQuality: number; // 0-100
    safetyCorrectness: number; // 0-100
    outputContract: number; // 0-100
    userUsefulness: number; // 0-100
    recoveryAwareness?: number; // 0-100 (optional)
    total: number; // 0-100
  };
  details: {
    actualBehavior?: string;
    blockingIssues?: string[];
    dimensions?: {
      intentCorrectness?: string;
      planQuality?: string;
      safetyCorrectness?: string;
      outputContract?: string;
      userUsefulness?: string;
      recoveryAwareness?: string;
    };
  };
  durationMs: number;
}

export interface SemanticTestReport {
  generatedAt: string;
  scenarios: SemanticTestScenario[];
  results: SemanticTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    expectedFail: number;
    skipped: number;
    averageScore: number;
    passRate: number;
    dimensions?: {
      intentCorrectness: number;
      planQuality: number;
      safetyCorrectness: number;
      outputContract: number;
      userUsefulness: number;
      recoveryAwareness: number;
    };
  };
}
