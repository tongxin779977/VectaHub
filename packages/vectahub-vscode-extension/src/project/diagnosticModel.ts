export type DiagnosticTaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'needs-confirmation';

export const VALID_DIAGNOSTIC_STATUSES: DiagnosticTaskStatus[] = [
  'pending', 'processing', 'completed', 'failed', 'cancelled', 'needs-confirmation'
];

export interface DiagnosticTask {
  id: string;
  title: string;
  description: string;
  source: 'github-actions' | 'manual' | 'system';
  sourceId?: string;
  commandToFix?: string;
  nextAction?: string;
  status: DiagnosticTaskStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface QueueSummary {
  fetchedCount?: number;
  addedCount?: number;
  duplicateCount?: number;
  pendingCount?: number;
  processedCount?: number;
  failedCount?: number;
  remainingCount?: number;
  needsConfirmationCount?: number;
}

const VALID_SOURCES: DiagnosticTask['source'][] = ['github-actions', 'manual', 'system'];

export function normalizeDiagnosticTask(raw: Record<string, unknown>): DiagnosticTask | null {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;

  const rawStatus = typeof raw.status === 'string' ? raw.status : '';
  const status: DiagnosticTaskStatus = VALID_DIAGNOSTIC_STATUSES.includes(rawStatus as DiagnosticTaskStatus)
    ? (rawStatus as DiagnosticTaskStatus)
    : 'needs-confirmation';

  const rawSource = typeof raw.source === 'string' ? raw.source : 'system';
  const source: DiagnosticTask['source'] = VALID_SOURCES.includes(rawSource as DiagnosticTask['source'])
    ? (rawSource as DiagnosticTask['source'])
    : 'system';

  const commandToFix = typeof raw.commandToFix === 'string' ? raw.commandToFix : undefined;
  const nextAction = typeof raw.nextAction === 'string' ? raw.nextAction : undefined;

  return {
    id: String(raw.id),
    title: typeof raw.title === 'string' ? raw.title : '未知任务',
    description: typeof raw.description === 'string' ? raw.description : '',
    source,
    sourceId: typeof raw.sourceId === 'string' ? raw.sourceId : undefined,
    commandToFix,
    nextAction,
    status,
    createdAt: (typeof raw.createdAt === 'string' || raw.createdAt instanceof Date) ? raw.createdAt : new Date().toISOString(),
    updatedAt: (typeof raw.updatedAt === 'string' || raw.updatedAt instanceof Date) ? raw.updatedAt
      : (typeof raw.createdAt === 'string' || raw.createdAt instanceof Date) ? raw.createdAt
      : new Date().toISOString(),
    error: typeof raw.error === 'string' ? raw.error : undefined,
    metadata: raw.metadata && typeof raw.metadata === 'object' ? (raw.metadata as Record<string, unknown>) : undefined,
  };
}

export function getExecutableAction(task: DiagnosticTask): string | undefined {
  return task.commandToFix || task.nextAction;
}

export function normalizeDiagnosticQueue(data: unknown): { tasks: DiagnosticTask[]; error?: string } {
  if (!data) return { tasks: [], error: '队列文件为空或读取失败' };
  if (!Array.isArray(data)) return { tasks: [], error: '队列数据格式错误: 预期数组' };

  const tasks: DiagnosticTask[] = [];
  for (const raw of data) {
    const normalized = normalizeDiagnosticTask(raw as Record<string, unknown>);
    if (normalized) tasks.push(normalized);
  }

  return { tasks };
}
