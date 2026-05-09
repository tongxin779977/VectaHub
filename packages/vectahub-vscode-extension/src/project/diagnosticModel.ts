export type DiagnosticTaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'needs-confirmation';

export interface DiagnosticTask {
  id: string;
  title: string;
  description: string;
  source: 'github-actions' | 'manual' | 'system';
  sourceId?: string;
  commandToFix: string;
  status: DiagnosticTaskStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
  error?: string;
  metadata?: Record<string, unknown>;
}
