import { join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { getVectaHubPath } from '../infrastructure/paths/index.js';

const MAX_RECORDS_PER_AGENT = 200;
const REVIEW_RECORDS_DIR = 'review-records';

export interface ExecutionReviewRecord {
  reviewId: string;
  taskId: string;
  instructionHash: string;
  agentId: string;
  changedFiles: string[];
  outOfScopeFiles: string[];
  llmVerdict: 'pass' | 'warn' | 'fail';
  llmReason: string;
  llmConfidence: number;
  humanFeedback: 'agree' | 'disagree' | 'override_pass' | 'override_fail';
  recordedAt: string;
}

export interface ReviewRecordStoreDeps {
  resolvePath: (...segments: string[]) => string;
  ensureDir: (path: string) => Promise<void>;
  readFile: (path: string, encoding: 'utf8') => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
}

export interface ReviewRecordStore {
  append(record: ExecutionReviewRecord): Promise<void>;
  load(agentId: string, workspaceHash: string): Promise<ExecutionReviewRecord[]>;
}

export function createReviewRecordStore(deps?: Partial<ReviewRecordStoreDeps>): ReviewRecordStore {
  const resolvePath = deps?.resolvePath ?? ((...segments: string[]) => getVectaHubPath(REVIEW_RECORDS_DIR, ...segments));
  const ensureDir = deps?.ensureDir ?? ((path: string) => mkdir(path, { recursive: true }));
  const readFileImpl = deps?.readFile ?? readFile;
  const writeFileImpl = deps?.writeFile ?? writeFile;

  function getRecordFilePath(agentId: string, workspaceHash: string): string {
    return resolvePath(workspaceHash, `${agentId}.jsonl`);
  }

  async function load(agentId: string, workspaceHash: string): Promise<ExecutionReviewRecord[]> {
    const filePath = getRecordFilePath(agentId, workspaceHash);
    try {
      const content = await readFileImpl(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      return lines
        .map(line => JSON.parse(line) as ExecutionReviewRecord)
        .slice(0, MAX_RECORDS_PER_AGENT);
    } catch {
      return [];
    }
  }

  async function append(record: ExecutionReviewRecord): Promise<void> {
    const filePath = getRecordFilePath(record.agentId, record.instructionHash);
    const dir = join(filePath, '..');
    await ensureDir(dir);

    const existing = await load(record.agentId, record.instructionHash);
    const all = [record, ...existing].slice(0, MAX_RECORDS_PER_AGENT);
    const content = all.map(r => JSON.stringify(r)).join('\n') + '\n';
    await writeFileImpl(filePath, content);
  }

  return { append, load };
}

export function createExecutionReviewRecord(input: {
  taskId: string;
  instructionHash: string;
  agentId: string;
  changedFiles: string[];
  outOfScopeFiles: string[];
  llmVerdict: 'pass' | 'warn' | 'fail';
  llmReason: string;
  llmConfidence: number;
  humanFeedback: 'agree' | 'disagree' | 'override_pass' | 'override_fail';
}): ExecutionReviewRecord {
  return {
    reviewId: randomUUID(),
    taskId: input.taskId,
    instructionHash: input.instructionHash,
    agentId: input.agentId,
    changedFiles: input.changedFiles,
    outOfScopeFiles: input.outOfScopeFiles,
    llmVerdict: input.llmVerdict,
    llmReason: input.llmReason,
    llmConfidence: input.llmConfidence,
    humanFeedback: input.humanFeedback,
    recordedAt: new Date().toISOString(),
  };
}
