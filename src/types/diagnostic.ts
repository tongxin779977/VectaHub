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

/**
 * 校验对象是否符合 DiagnosticTask 结构
 */
export function validateDiagnosticTask(task: unknown): task is DiagnosticTask {
  if (!task || typeof task !== 'object') return false;
  const candidate = task as Record<string, unknown>;
  
  const requiredFields = ['id', 'title', 'source', 'status'];
  for (const field of requiredFields) {
    if (!candidate[field]) return false;
  }

  const validStatuses = ['pending', 'processing', 'completed', 'failed'];
  if (typeof candidate.status !== 'string' || !validStatuses.includes(candidate.status)) return false;

  const validSources = ['github-actions', 'manual', 'system'];
  if (typeof candidate.source !== 'string' || !validSources.includes(candidate.source)) return false;

  return true;
}

/**
 * 校验队列数据是否为有效的任务列表
 */
export function validateDiagnosticQueue(data: unknown): DiagnosticTask[] {
  if (!Array.isArray(data)) return [];
  return data.filter(validateDiagnosticTask);
}
