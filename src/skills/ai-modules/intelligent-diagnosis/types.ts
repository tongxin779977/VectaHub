import type { FixSuggestion } from '../types.js';

export interface DiagnosisInput {
  error: string;
  stderr?: string;
  stepId?: string;
  stepConfig?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface DiagnosisOutput {
  rootCause: string;
  category: string;
  fixSuggestions: FixSuggestion[];
  confidence: number;
  needsHumanReview: boolean;
}
