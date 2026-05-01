export type AnalysisStatus = 'INIT' | 'ANALYZING' | 'COMPLETED' | 'FAILED';
export type RootCauseCategory =
  | 'CONFIGURATION'
  | 'DEPENDENCY'
  | 'PERMISSION'
  | 'NETWORK'
  | 'LOGIC'
  | 'ENVIRONMENT'
  | 'UNKNOWN';

export interface WhyQuestion {
  id: number;
  question: string;
  answer: string;
  evidence?: string[];
}

export interface RootCause {
  category: RootCauseCategory;
  description: string;
  confidence: number;
  suggestedFixes: string[];
}

export interface FiveWhysAnalysis {
  id: string;
  taskId: string;
  originalError: string;
  whyChain: WhyQuestion[];
  rootCauses: RootCause[];
  status: AnalysisStatus;
  createdAt: Date;
  completedAt?: Date;
}

export interface RetryContext {
  taskId: string;
  attemptCount: number;
  maxAttempts: number;
  lastError?: string;
  lastAnalysis?: FiveWhysAnalysis;
  previousAttempts: AttemptRecord[];
  backoffDelay: number;
  startedAt: Date;
}

export interface AttemptRecord {
  attempt: number;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
  duration: number;
  timestamp: Date;
  appliedFix?: string;
}

export interface RetryConfig {
  maxAttempts: number;
  initialBackoff: number;
  backoffMultiplier: number;
  maxBackoff: number;
  triggerAnalysisAfter: number;
  enableAutoFix: boolean;
}

export interface RefinementResult {
  success: boolean;
  totalAttempts: number;
  finalError?: string;
  analysis?: FiveWhysAnalysis;
  appliedFixes: string[];
  duration: number;
}

export interface RefinementCallbacks {
  onAttempt?: (attempt: number, context: RetryContext) => void;
  onAnalysisStart?: (context: RetryContext) => void;
  onAnalysisComplete?: (analysis: FiveWhysAnalysis) => void;
  onFixApplied?: (fix: string, attempt: number) => void;
  onSuccess?: (result: RefinementResult) => void;
  onFailure?: (result: RefinementResult) => void;
}
