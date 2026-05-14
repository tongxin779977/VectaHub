import * as path from 'path';
import { buildDocIndex, findHeadingSection, type DocIndex } from './docTaskDocIndex.js';
import type { AgentTaskContractSummary, AgentTaskRunContractSummary, DocTaskConcurrencyDecision, DocTaskContractInput } from './docTaskContractTypes.js';
export type { AgentTaskContractSummary, AgentTaskRunContractSummary, DocTaskConcurrencyDecision, DocTaskContractInput } from './docTaskContractTypes.js';

const MAX_EXCERPT_CHARS = 8000;
const WINDOW_BEFORE = 2000;
const WINDOW_AFTER = 6000;
const MAX_FILES = 100;
const MAX_VALIDATION_COMMANDS = 10;
const DEFAULT_FORBIDDEN_FILES = ['.env', '.env.*', '**/*.pem', '**/*.key', '**/node_modules/**', '**/.git/**'];

export function buildAgentTaskContractSummaries(input: {
  tasks: DocTaskContractInput[];
  docContent?: string;
  projectRoot: string;
}): Map<string, AgentTaskContractSummary> {
  const result = new Map<string, AgentTaskContractSummary>();
  const docIndex = input.docContent ? buildDocIndex(input.docContent) : undefined;
  for (const task of input.tasks) {
    const excerpt = docIndex
      ? deriveDocExcerpt(docIndex, task.id, task.label)
      : { excerpt: '', truncated: false, strategy: 'none' as const };
    const allowedFiles = normalizeFiles(extractCandidateFiles(`${excerpt.excerpt}\n${task.label}`), input.projectRoot);
    const forbiddenFiles = normalizeFiles(DEFAULT_FORBIDDEN_FILES, input.projectRoot);
    const validationCommands = deriveValidationCommands(allowedFiles);
    const boundaryConfidence = allowedFiles.length > 0 ? 'medium' : 'none';
    result.set(task.id, {
      boundaryConfidence,
      allowedFiles,
      forbiddenFiles,
      validationCommands,
      executionMode: allowedFiles.length > 0 ? 'parallel-eligible' : 'serial',
      docExcerptTruncated: excerpt.truncated,
      excerptStrategy: excerpt.strategy,
    });
  }
  return result;
}

export function deriveDocExcerptForTask(input: {
  docContent?: string;
  taskId: string;
  label: string;
}): {
  excerpt: string;
  truncated: boolean;
  strategy: AgentTaskContractSummary['excerptStrategy'];
} {
  if (!input.docContent) {
    return { excerpt: '', truncated: false, strategy: 'none' };
  }
  const docIndex = buildDocIndex(input.docContent);
  return deriveDocExcerpt(docIndex, input.taskId, input.label);
}

export function decideDocTaskBatchConcurrency(input: {
  contracts: Map<string, AgentTaskContractSummary>;
  requestedMaxConcurrent: number;
}): DocTaskConcurrencyDecision {
  const contracts = [...input.contracts.values()];
  const requested = Math.max(1, Math.trunc(input.requestedMaxConcurrent || 1));
  if (contracts.some(contract => contract.boundaryConfidence !== 'medium' && contract.boundaryConfidence !== 'high')) {
    return { mode: 'serial', reason: 'unknown-boundary', effectiveMaxConcurrent: 1 };
  }
  if (contracts.some(contract => contract.allowedFiles.length === 0)) {
    return { mode: 'serial', reason: 'unknown-boundary', effectiveMaxConcurrent: 1 };
  }
  if (contracts.length <= 1 || requested <= 1) {
    return { mode: 'serial', reason: 'insufficient-parallelism', effectiveMaxConcurrent: 1 };
  }

  const ownerByFile = new Map<string, number>();
  for (let index = 0; index < contracts.length; index += 1) {
    for (const file of contracts[index].allowedFiles) {
      const owner = ownerByFile.get(file);
      if (owner !== undefined && owner !== index) {
        return { mode: 'serial', reason: 'allowed-overlap', effectiveMaxConcurrent: 1 };
      }
      ownerByFile.set(file, index);
    }
  }

  return { mode: 'parallel', reason: 'non-overlap-medium-high', effectiveMaxConcurrent: requested };
}

export function toRunContractSummary(summary: AgentTaskContractSummary | undefined): AgentTaskRunContractSummary | undefined {
  if (!summary) return undefined;
  return {
    boundaryConfidence: summary.boundaryConfidence,
    allowedFileCount: summary.allowedFiles.length,
    forbiddenFileCount: summary.forbiddenFiles.length,
    validationCommandCount: summary.validationCommands.length,
    executionMode: summary.executionMode,
  };
}

function deriveDocExcerpt(docIndex: DocIndex, taskId: string, label: string): {
  excerpt: string;
  truncated: boolean;
  strategy: AgentTaskContractSummary['excerptStrategy'];
} {
  const heading = findHeadingSection(docIndex, taskId);
  if (heading) return toExcerptResult(heading, 'task-heading');
  const docContent = docIndex.content;
  const taskIndex = docContent.indexOf(taskId);
  if (taskIndex >= 0) return toExcerptResult(sliceByWindow(docContent, taskIndex), 'task-id-window');
  const labelIndex = findLabelIndex(docContent, label);
  if (labelIndex >= 0) return toExcerptResult(sliceByWindow(docContent, labelIndex), 'label-window');
  return toExcerptResult(docContent, 'head-fallback');
}

function sliceByWindow(content: string, index: number): string {
  return content.slice(Math.max(0, index - WINDOW_BEFORE), Math.min(content.length, index + WINDOW_AFTER));
}

function findLabelIndex(content: string, label: string): number {
  const direct = content.indexOf(label);
  if (direct >= 0) return direct;
  for (const token of label.split(/[\s,，。:：;；/|()[\]{}]+/g).filter(part => part.trim().length >= 2)) {
    const index = content.indexOf(token.trim());
    if (index >= 0) return index;
  }
  return -1;
}

function toExcerptResult(source: string, strategy: AgentTaskContractSummary['excerptStrategy']) {
  return source.length <= MAX_EXCERPT_CHARS
    ? { excerpt: source, truncated: false, strategy }
    : { excerpt: source.slice(0, MAX_EXCERPT_CHARS), truncated: true, strategy };
}

function extractCandidateFiles(text: string): string[] {
  const candidates: string[] = [];
  for (const match of text.matchAll(/`([^`]+)`/g)) {
    const value = sanitizeCandidatePath(match[1]?.trim() || '');
    if (looksLikeProjectPath(value)) candidates.push(value);
  }
  const pathRegex = /(?:^|[\s"'(（[【:：,，;；])((?:\.\/)?(?:src|packages|docs|scripts|test|tests)\/[A-Za-z0-9._@/+~=-]+(?:\/[A-Za-z0-9._@/+~=-]+)*)/g;
  for (const match of text.matchAll(pathRegex)) {
    const value = sanitizeCandidatePath(match[1]?.trim() || '');
    if (looksLikeProjectPath(value)) candidates.push(value);
  }
  return candidates;
}

function normalizeFiles(files: string[], projectRoot: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const base = path.resolve(projectRoot);
  for (const raw of files) {
    const value = raw.trim();
    if (!value) continue;
    const normalized = toPosixPath(path.normalize(value.replace(/\\/g, '/')));
    const rel = path.isAbsolute(value) ? toPosixPath(path.relative(base, path.resolve(value))) : stripCurrentDir(normalized);
    if (!rel || rel === '..' || rel.startsWith('../') || rel.includes('/../') || seen.has(rel)) continue;
    seen.add(rel);
    result.push(rel);
    if (result.length >= MAX_FILES) break;
  }
  return result;
}

function deriveValidationCommands(files: string[]): string[] {
  const commands = files.filter(file => file.startsWith('src/') && file.endsWith('.test.ts')).map(file => `npm test -- ${file} --run`);
  if (files.some(file => file.startsWith('src/'))) commands.push('npm run typecheck');
  if (files.some(file => file.startsWith('packages/vectahub-vscode-extension/src/'))) {
    commands.push('npm run compile -w packages/vectahub-vscode-extension');
  }
  return [...new Set(commands.length ? commands : ['npm run typecheck'])].slice(0, MAX_VALIDATION_COMMANDS);
}

function sanitizeCandidatePath(value: string): string {
  return value.replace(/[.,，。;；:：)）\]】]+$/g, '');
}

function looksLikeProjectPath(value: string): boolean {
  return /^(?:\.\/)?(?:src|packages|docs|scripts|test|tests)\//.test(value) && !value.includes('\n');
}

function stripCurrentDir(value: string): string {
  return value.startsWith('./') ? value.slice(2) : value;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/').replace(/\\/g, '/');
}
