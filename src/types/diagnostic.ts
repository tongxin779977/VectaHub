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
export function validateDiagnosticTask(task: any): task is DiagnosticTask {
  if (!task || typeof task !== 'object') return false;
  
  const requiredFields = ['id', 'title', 'source', 'status'];
  for (const field of requiredFields) {
    if (!task[field]) return false;
  }

  const validStatuses = ['pending', 'processing', 'completed', 'failed'];
  if (!validStatuses.includes(task.status)) return false;

  const validSources = ['github-actions', 'manual', 'system'];
  if (!validSources.includes(task.source)) return false;

  return true;
}

/**
 * 校验队列数据是否为有效的任务列表
 */
export function validateDiagnosticQueue(data: any): DiagnosticTask[] {
  if (!Array.isArray(data)) return [];
  return data.filter(validateDiagnosticTask);
}

