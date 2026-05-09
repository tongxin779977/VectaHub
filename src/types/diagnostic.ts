export type DiagnosticTaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface DiagnosticTask {
  id: string;
  title: string;
  description: string;
  source: 'github-actions' | 'manual' | 'system';
  sourceId?: string; // e.g., run_id
  commandToFix: string;
  status: DiagnosticTaskStatus;
  createdAt: Date;
  updatedAt: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}
