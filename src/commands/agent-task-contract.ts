import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type { AgentTaskBoundary, AgentTaskConcurrencyDecision, AgentTaskContract } from '../types/doc-task.js';

const DEFAULT_MAX_EXCERPT_CHARS = 8000;
const DEFAULT_WINDOW_BEFORE = 2000;
const DEFAULT_WINDOW_AFTER = 6000;
const MAX_FILES = 100;
const MAX_VALIDATION_COMMANDS = 10;
const DEFAULT_FORBIDDEN_FILES = [
  '.env',
  '.env.*',
  '**/*.pem',
  '**/*.key',
  '**/node_modules/**',
  '**/.git/**',
];

/**
 * Compute a stable SHA-256 hash of the task instruction.
 * Used to detect when a task's instructions have changed since the last run.
 * Includes tool name and file boundaries to ensure hash changes when the
 * execution context changes (e.g., switching from aider to claude).
 */
export function computeInstructionHash(
  taskId: string,
  label: string,
  docExcerpt: string,
  tool?: string,
  allowedFiles?: string[],
  forbiddenFiles?: string[],
): string {
  const sortedAllowed = [...(allowedFiles ?? [])].sort().join(',');
  const sortedForbidden = [...(forbiddenFiles ?? [])].sort().join(',');
  const content = `${taskId}\n${label}\n${docExcerpt}\ntool=${tool ?? ''}\nallowed=${sortedAllowed}\nforbidden=${sortedForbidden}`;
  return createHash('sha256').update(content, 'utf-8').digest('hex').slice(0, 16);
}

export function deriveDocExcerpt(input: {
  docContent: string;
  taskId: string;
  label: string;
  maxChars?: number;
}): {
  excerpt: string;
  truncated: boolean;
  strategy: 'task-heading' | 'task-id-window' | 'label-window' | 'head-fallback';
} {
  const maxChars = input.maxChars ?? DEFAULT_MAX_EXCERPT_CHARS;
  const content = input.docContent ?? '';
  const headingSlice = findHeadingSection(content, input.taskId);
  if (headingSlice) {
    return toExcerptResult(headingSlice, maxChars, 'task-heading');
  }

  const taskIdIndex = content.indexOf(input.taskId);
  if (taskIdIndex >= 0) {
    const slice = sliceByWindow(content, taskIdIndex, maxChars);
    return toExcerptResult(slice, maxChars, 'task-id-window');
  }

  const labelIndex = findLabelIndex(content, input.label);
  if (labelIndex >= 0) {
    const slice = sliceByWindow(content, labelIndex, maxChars);
    return toExcerptResult(slice, maxChars, 'label-window');
  }

  return toExcerptResult(content, maxChars, 'head-fallback');
}

export function normalizeAgentTaskFiles(input: {
  files: string[];
  projectRoot: string;
}): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const base = resolve(input.projectRoot);
  const files = Array.isArray(input.files) ? input.files : [];

  for (const rawPath of files) {
    if (typeof rawPath !== 'string') {
      continue;
    }
    const trimmed = rawPath.trim();
    if (!trimmed) {
      continue;
    }

    const normalizedInput = toPosixPath(normalize(trimmed.replace(/\\/g, '/')));
    let projectRelativePath: string;

    if (isAbsolute(trimmed)) {
      const absolute = resolve(trimmed);
      const rel = toPosixPath(relative(base, absolute));
      if (isOutOfProject(rel)) {
        continue;
      }
      projectRelativePath = rel;
    } else {
      if (isOutOfProject(normalizedInput)) {
        continue;
      }
      projectRelativePath = stripLeadingCurrentDir(normalizedInput);
    }

    if (!projectRelativePath || seen.has(projectRelativePath)) {
      continue;
    }
    seen.add(projectRelativePath);
    result.push(projectRelativePath);
    if (result.length >= MAX_FILES) {
      break;
    }
  }

  return result;
}

export function deriveAgentTaskBoundary(input: {
  docExcerpt: string;
  label: string;
  projectRoot: string;
}): AgentTaskBoundary {
  const candidateFiles = extractCandidateFiles(`${input.docExcerpt}\n${input.label}`);
  const allowedFiles = normalizeAgentTaskFiles({
    files: candidateFiles,
    projectRoot: input.projectRoot,
  });
  const forbiddenFiles = normalizeAgentTaskFiles({
    files: DEFAULT_FORBIDDEN_FILES,
    projectRoot: input.projectRoot,
  });
  const validationCommands = deriveValidationCommands({
    allowedFiles,
    taskLabel: input.label,
  });
  const boundaryConfidence: AgentTaskBoundary['boundaryConfidence'] = allowedFiles.length > 0 ? 'medium' : 'none';

  return {
    allowedFiles,
    forbiddenFiles,
    validationCommands,
    boundaryConfidence,
    parallelEligible: allowedFiles.length > 0,
    reason: allowedFiles.length > 0 ? 'deterministic-path-extraction' : 'no-path-detected',
  };
}

export function deriveValidationCommands(input: {
  allowedFiles: string[];
  taskLabel: string;
  packageScripts?: string[];
}): string[] {
  const commands: string[] = [];
  const seen = new Set<string>();
  const files = Array.isArray(input.allowedFiles) ? input.allowedFiles : [];
  const hasSrcChange = files.some(file => file.startsWith('src/'));
  const hasExtensionSrcChange = files.some(file => file.startsWith('packages/vectahub-vscode-extension/src/'));

  for (const file of files) {
    if (!file.startsWith('src/') || !file.endsWith('.test.ts')) {
      continue;
    }
    addCommand(commands, seen, `npm test -- ${file} --run`);
    if (commands.length >= MAX_VALIDATION_COMMANDS) {
      return commands;
    }
  }

  if (hasSrcChange) {
    addCommand(commands, seen, 'npm run typecheck');
  }
  if (hasExtensionSrcChange) {
    addCommand(commands, seen, 'npm run compile -w packages/vectahub-vscode-extension');
  }
  if (commands.length === 0) {
    addCommand(commands, seen, 'npm run typecheck');
  }

  return commands.slice(0, MAX_VALIDATION_COMMANDS);
}

export function decideAgentTaskConcurrency(contracts: AgentTaskContract[]): AgentTaskConcurrencyDecision {
  if (!Array.isArray(contracts) || contracts.length <= 1) {
    return {
      mode: 'serial',
      reason: 'insufficient-tasks',
      groups: contracts.map(contract => [contract.taskId]),
    };
  }

  for (const contract of contracts) {
    if (contract.executionMode === 'isolated-required') {
      return serialDecision(contracts, 'isolated-required');
    }
    if (contract.boundaryConfidence !== 'medium' && contract.boundaryConfidence !== 'high') {
      return serialDecision(contracts, 'unknown-boundary');
    }
    if (!contract.allowedFiles || contract.allowedFiles.length === 0) {
      return serialDecision(contracts, 'unknown-boundary');
    }
  }

  const fileOwner = new Map<string, string>();
  const forbiddenFiles = new Set<string>();
  for (const contract of contracts) {
    for (const forbidden of contract.forbiddenFiles ?? []) {
      forbiddenFiles.add(forbidden);
    }
  }

  for (const contract of contracts) {
    for (const file of contract.allowedFiles) {
      if (forbiddenFiles.has(file)) {
        return serialDecision(contracts, 'forbidden-overlap');
      }
      const owner = fileOwner.get(file);
      if (owner && owner !== contract.taskId) {
        return serialDecision(contracts, 'allowed-overlap');
      }
      fileOwner.set(file, contract.taskId);
    }
  }

  return {
    mode: 'parallel',
    reason: 'non-overlap-medium-high',
    groups: [contracts.map(contract => contract.taskId)],
  };
}

function findHeadingSection(content: string, taskId: string): string | undefined {
  const lines = content.split('\n');
  let offset = 0;
  let startOffset = -1;
  let targetHeadingLevel = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match && line.includes(taskId)) {
      startOffset = offset;
      targetHeadingLevel = match[1].length;
      break;
    }
    offset += line.length + 1;
  }
  if (startOffset < 0) {
    return undefined;
  }

  let endOffset = content.length;
  offset = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineStart = offset;
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (lineStart > startOffset && match && match[1].length <= targetHeadingLevel) {
      endOffset = lineStart;
      break;
    }
    offset += line.length + 1;
  }

  return content.slice(startOffset, endOffset);
}

function findLabelIndex(content: string, label: string): number {
  const direct = content.indexOf(label);
  if (direct >= 0) {
    return direct;
  }

  const keywords = label
    .split(/[\s,，。:：;；/|()\[\]{}]+/g)
    .map(token => token.trim())
    .filter(token => token.length >= 2);

  for (const token of keywords) {
    const index = content.indexOf(token);
    if (index >= 0) {
      return index;
    }
  }

  return -1;
}

function sliceByWindow(content: string, index: number, maxChars: number): string {
  const start = Math.max(0, index - DEFAULT_WINDOW_BEFORE);
  const end = Math.min(content.length, index + DEFAULT_WINDOW_AFTER);
  const windowSlice = content.slice(start, end);
  if (windowSlice.length <= maxChars) {
    return windowSlice;
  }
  return windowSlice.slice(0, maxChars);
}

function toExcerptResult(
  source: string,
  maxChars: number,
  strategy: 'task-heading' | 'task-id-window' | 'label-window' | 'head-fallback',
): { excerpt: string; truncated: boolean; strategy: 'task-heading' | 'task-id-window' | 'label-window' | 'head-fallback' } {
  if (source.length <= maxChars) {
    return { excerpt: source, truncated: false, strategy };
  }
  return { excerpt: source.slice(0, maxChars), truncated: true, strategy };
}

function toPosixPath(filePath: string): string {
  return filePath.split(sep).join('/').replace(/\\/g, '/');
}

function isOutOfProject(projectRelativePath: string): boolean {
  return (
    projectRelativePath === '..' ||
    projectRelativePath.startsWith('../') ||
    projectRelativePath.includes('/../')
  );
}

function stripLeadingCurrentDir(projectRelativePath: string): string {
  return projectRelativePath.startsWith('./')
    ? projectRelativePath.slice(2)
    : projectRelativePath;
}

function addCommand(commands: string[], seen: Set<string>, command: string): void {
  if (!seen.has(command)) {
    seen.add(command);
    commands.push(command);
  }
}

function extractCandidateFiles(text: string): string[] {
  const candidates: string[] = [];
  const codeSpanRegex = /`([^`]+)`/g;
  for (const match of text.matchAll(codeSpanRegex)) {
    const value = sanitizeCandidatePath(match[1]?.trim() || '');
    if (value && looksLikeProjectPath(value)) {
      candidates.push(value);
    }
  }

  const pathRegex = /(?:^|[\s"'(（\[【:：,，;；])((?:\.\/)?(?:src|packages|docs|scripts|test|tests)\/[A-Za-z0-9._@/+~=-]+(?:\/[A-Za-z0-9._@/+~=-]+)*)/g;
  for (const match of text.matchAll(pathRegex)) {
    const value = sanitizeCandidatePath(match[1]?.trim() || '');
    if (value && looksLikeProjectPath(value)) {
      candidates.push(value);
    }
  }

  return candidates;
}

function sanitizeCandidatePath(value: string): string {
  return value.replace(/[.,，。;；:：)）\]】]+$/g, '');
}

function looksLikeProjectPath(value: string): boolean {
  if (!value || value.includes('\n')) {
    return false;
  }
  return /^(?:\.\/)?(?:src|packages|docs|scripts|test|tests)\//.test(value);
}

function serialDecision(
  contracts: AgentTaskContract[],
  reason: string,
): AgentTaskConcurrencyDecision {
  return {
    mode: 'serial',
    reason,
    groups: contracts.map(contract => [contract.taskId]),
  };
}
