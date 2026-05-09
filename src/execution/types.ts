export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT' | 'PAUSED' | 'ABORTED';

export interface ExecutionRecord {
  executionId: string;
  workflowId: string;
  workflowName: string;
  status: ExecutionStatus;
  startedAt: string;        // ISO 8601
  finishedAt?: string;
  duration?: number;         // ms
  steps: StepExecution[];
  error?: string;
  outputRef?: string;        // 指向输出文件
  triggeredBy?: string;      // 'user' | 'api' | 'system'
  metadata?: Record<string, unknown>;
}

export interface StepExecution {
  stepId: string;
  stepName: string;
  command: string;
  status: ExecutionStatus;
  startedAt?: string;
  finishedAt?: string;
  duration?: number;
  exitCode?: number;
  output?: string;
  error?: string;
}

export interface ExecutionFilter {
  workflowId?: string;
  status?: ExecutionStatus;
  from?: string;  // ISO date
  to?: string;
  grep?: string;
  limit?: number;
  offset?: number;
}

// 文档 Section 5.1 定义的扩展类型
export type ExecutionSource = 'nl' | 'file' | 'rerun' | 'resume' | 'api' | 'direct';

export interface ExecutionMetadata {
  source: ExecutionSource;
  nlInput?: string;
  sourceFile?: string;
  parentExecutionId?: string;
  resumeFromStep?: number;
  cwd: string;
  tags?: string[];
}

export interface OutputReference {
  stepId: string;
  stdoutPath?: string;
  stderrPath?: string;
  summary?: string;
  lineCount?: number;
  byteSize?: number;
}

export interface ExecutionSearchResult {
  records: ExecutionRecord[];
  total: number;
  hasMore: boolean;
}

export interface ArchiveInfo {
  archiveId: string;
  archivedCount: number;
  createdAt: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export interface ArchiveResult {
  archiveId: string;
  archivedCount: number;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}
