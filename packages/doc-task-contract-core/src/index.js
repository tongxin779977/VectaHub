import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { isAbsolute, normalize, relative, resolve, posix, win32 } from 'node:path';

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

export function computeInstructionHash(input) {
  const sortedAllowed = JSON.stringify([...(input.allowedFiles ?? [])].sort());
  const sortedForbidden = JSON.stringify([...(input.forbiddenFiles ?? [])].sort());
  const content = `${input.taskId}\n${input.label}\n${input.docExcerpt}\ntool=${input.tool ?? ''}\nallowed=${sortedAllowed}\nforbidden=${sortedForbidden}\nconfig=${input.globalConfigDigest ?? ''}`;
  return createHash('sha256').update(content, 'utf-8').digest('hex').slice(0, 16);
}

export function buildGlobalConfigDigest(input) {
  const provider = (input.provider || '').trim() || 'unknown';
  const model = (input.model || '').trim() || 'unknown';
  const temperature = Number.isFinite(input.temperature) ? String(input.temperature) : 'default';
  return `provider=${provider};model=${model};temperature=${temperature}`;
}

export async function deriveDocExcerptFromText(text, input) {
  return scanDocExcerptAsync(stringToAsyncLines(String(text ?? '')), input);
}

export function deriveDocExcerptFromTextSync(text, input) {
  return scanDocExcerptSync(stringToLines(String(text ?? '')), input);
}

export async function deriveDocExcerptFromLines(source, input) {
  if (source && typeof source[Symbol.asyncIterator] === 'function') {
    return scanDocExcerptAsync(source, input);
  }
  return scanDocExcerptSync(source, input);
}

export function deriveDocExcerptFromLinesSync(source, input) {
  return scanDocExcerptSync(source, input);
}

async function scanDocExcerptAsync(source, input) {
  const maxChars = input.maxChars ?? DEFAULT_MAX_EXCERPT_CHARS;
  const captureLimit = maxChars + 1;
  let head = '';
  let headingLevel = -1;
  let headingExcerpt = '';
  let inHeadingSection = false;
  let hasHeadingSection = false;

  let beforeWindow = '';
  let taskWindow = '';
  let labelWindow = '';
  let taskWindowRemaining = -1;
  let labelWindowRemaining = -1;

  const normalizedLabelTokens = String(input.label || '')
    .split(/[\s,，。:：;；/|()\[\]{}]+/g)
    .map(token => token.trim())
    .filter(token => token.length >= 2);

  for await (const rawLine of source) {
    const raw = String(rawLine).replace(/\r$/, '');
    const line = `${raw}\n`;
    head = appendBounded(head, line, captureLimit);

    const headingMatch = raw.match(/^(#{1,6})\s+(\S.*)$/);
    if (!hasHeadingSection && headingMatch && raw.includes(input.taskId)) {
      inHeadingSection = true;
      hasHeadingSection = true;
      headingLevel = headingMatch[1].length;
    } else if (inHeadingSection && headingMatch && headingMatch[1].length <= headingLevel) {
      inHeadingSection = false;
    }
    if (inHeadingSection) {
      headingExcerpt = appendBounded(headingExcerpt, line, captureLimit);
    }

    if (taskWindowRemaining < 0 && raw.includes(input.taskId)) {
      taskWindow = beforeWindow + line;
      taskWindowRemaining = DEFAULT_WINDOW_AFTER;
    } else if (taskWindowRemaining >= 0 && taskWindow.length < captureLimit) {
      taskWindow = appendBounded(taskWindow, line, captureLimit);
      taskWindowRemaining -= line.length;
    }

    const labelHit = raw.includes(input.label) || normalizedLabelTokens.some(token => raw.includes(token));
    if (labelWindowRemaining < 0 && labelHit) {
      labelWindow = beforeWindow + line;
      labelWindowRemaining = DEFAULT_WINDOW_AFTER;
    } else if (labelWindowRemaining >= 0 && labelWindow.length < captureLimit) {
      labelWindow = appendBounded(labelWindow, line, captureLimit);
      labelWindowRemaining -= line.length;
    }

    beforeWindow += line;
    if (beforeWindow.length > DEFAULT_WINDOW_BEFORE) {
      beforeWindow = beforeWindow.slice(beforeWindow.length - DEFAULT_WINDOW_BEFORE);
    }

    const taskDone = hasHeadingSection || taskWindowRemaining <= 0;
    const labelDone = labelWindowRemaining <= 0;
    if (taskDone && labelDone && head.length >= captureLimit) {
      break;
    }
  }

  if (headingExcerpt) return toExcerptResult(headingExcerpt, maxChars, 'task-heading');
  if (taskWindow) return toExcerptResult(taskWindow, maxChars, 'task-id-window');
  if (labelWindow) return toExcerptResult(labelWindow, maxChars, 'label-window');
  return toExcerptResult(head, maxChars, 'head-fallback');
}

function scanDocExcerptSync(source, input) {
  const maxChars = input.maxChars ?? DEFAULT_MAX_EXCERPT_CHARS;
  const captureLimit = maxChars + 1;
  let head = '';
  let headingLevel = -1;
  let headingExcerpt = '';
  let inHeadingSection = false;
  let hasHeadingSection = false;

  let beforeWindow = '';
  let taskWindow = '';
  let labelWindow = '';
  let taskWindowRemaining = -1;
  let labelWindowRemaining = -1;

  const normalizedLabelTokens = String(input.label || '')
    .split(/[\s,，。:：;；/|()\[\]{}]+/g)
    .map(token => token.trim())
    .filter(token => token.length >= 2);

  for (const rawLine of source) {
    const raw = String(rawLine).replace(/\r$/, '');
    const line = `${raw}\n`;
    head = appendBounded(head, line, captureLimit);

    const headingMatch = raw.match(/^(#{1,6})\s+(\S.*)$/);
    if (!hasHeadingSection && headingMatch && raw.includes(input.taskId)) {
      inHeadingSection = true;
      hasHeadingSection = true;
      headingLevel = headingMatch[1].length;
    } else if (inHeadingSection && headingMatch && headingMatch[1].length <= headingLevel) {
      inHeadingSection = false;
    }
    if (inHeadingSection) {
      headingExcerpt = appendBounded(headingExcerpt, line, captureLimit);
    }

    if (taskWindowRemaining < 0 && raw.includes(input.taskId)) {
      taskWindow = beforeWindow + line;
      taskWindowRemaining = DEFAULT_WINDOW_AFTER;
    } else if (taskWindowRemaining >= 0 && taskWindow.length < captureLimit) {
      taskWindow = appendBounded(taskWindow, line, captureLimit);
      taskWindowRemaining -= line.length;
    }

    const labelHit = raw.includes(input.label) || normalizedLabelTokens.some(token => raw.includes(token));
    if (labelWindowRemaining < 0 && labelHit) {
      labelWindow = beforeWindow + line;
      labelWindowRemaining = DEFAULT_WINDOW_AFTER;
    } else if (labelWindowRemaining >= 0 && labelWindow.length < captureLimit) {
      labelWindow = appendBounded(labelWindow, line, captureLimit);
      labelWindowRemaining -= line.length;
    }

    beforeWindow += line;
    if (beforeWindow.length > DEFAULT_WINDOW_BEFORE) {
      beforeWindow = beforeWindow.slice(beforeWindow.length - DEFAULT_WINDOW_BEFORE);
    }

    const taskDone = hasHeadingSection || taskWindowRemaining <= 0;
    const labelDone = labelWindowRemaining <= 0;
    if (taskDone && labelDone && head.length >= captureLimit) {
      break;
    }
  }

  if (headingExcerpt) return toExcerptResult(headingExcerpt, maxChars, 'task-heading');
  if (taskWindow) return toExcerptResult(taskWindow, maxChars, 'task-id-window');
  if (labelWindow) return toExcerptResult(labelWindow, maxChars, 'label-window');
  return toExcerptResult(head, maxChars, 'head-fallback');
}

export function normalizeAgentTaskFiles(input) {
  const seen = new Set();
  const result = [];
  const base = resolve(input.projectRoot);
  const basePathStyle = detectPathStyle(input.projectRoot);
  const winBase = win32.normalize(input.projectRoot);
  const posixBase = toPosixPath(base);
  const files = Array.isArray(input.files) ? input.files : [];

  for (const rawPath of files) {
    if (typeof rawPath !== 'string') continue;
    const trimmed = rawPath.trim();
    if (!trimmed) continue;

    const normalizedInput = toPosixPath(normalize(trimmed.replace(/\\/g, '/')));
    let projectRelativePath;

    if (isLikelyAbsolutePath(trimmed)) {
      const inputPathStyle = detectPathStyle(trimmed);
      if (basePathStyle !== inputPathStyle) continue;

      const rel = inputPathStyle === 'windows'
        ? toPosixPath(win32.relative(winBase, win32.normalize(trimmed)))
        : toPosixPath(posix.relative(posixBase, toPosixPath(resolve(trimmed))));
      if (isOutOfProject(rel)) continue;
      projectRelativePath = rel;
    } else {
      if (isOutOfProject(normalizedInput)) continue;
      projectRelativePath = stripLeadingCurrentDir(normalizedInput);
    }

    if (!projectRelativePath || seen.has(projectRelativePath)) continue;
    seen.add(projectRelativePath);
    result.push(projectRelativePath);
    if (result.length >= MAX_FILES) break;
  }

  return result;
}

export function deriveAgentTaskBoundary(input) {
  const explicitSections = extractExplicitFileSections(input.docExcerpt);
  const candidateFiles = explicitSections.allowedFiles.length > 0
    ? explicitSections.allowedFiles
    : extractCandidateFiles(`${input.docExcerpt}\n${input.label}`);
  const allowedFiles = normalizeAgentTaskFiles({
    files: candidateFiles,
    projectRoot: input.projectRoot,
  });
  const forbiddenFiles = normalizeAgentTaskFiles({
    files: [...DEFAULT_FORBIDDEN_FILES, ...explicitSections.forbiddenFiles],
    projectRoot: input.projectRoot,
  });
  const forbiddenSet = new Set(forbiddenFiles);
  const safeAllowedFiles = allowedFiles.filter(file => !forbiddenSet.has(file));
  const relatedFiles = expandRelatedFiles(safeAllowedFiles, input.projectRoot);
  const validationCommands = deriveValidationCommands({
    allowedFiles: safeAllowedFiles,
    taskLabel: input.label,
    packageScripts: input.packageScripts,
  });
  const boundaryConfidence = safeAllowedFiles.length > 0
    ? explicitSections.allowedFiles.length > 0 ? 'high' : 'medium'
    : 'none';

  return {
    allowedFiles: safeAllowedFiles,
    relatedFiles,
    forbiddenFiles,
    validationCommands,
    boundaryConfidence,
    parallelEligible: safeAllowedFiles.length > 0,
    reason: safeAllowedFiles.length > 0
      ? explicitSections.allowedFiles.length > 0 ? 'explicit-file-sections' : 'deterministic-path-extraction'
      : 'no-path-detected',
  };
}

export function deriveValidationCommands(input) {
  const commands = [];
  const seen = new Set();
  const files = Array.isArray(input.allowedFiles) ? input.allowedFiles : [];
  const packageScripts = Array.isArray(input.packageScripts) ? input.packageScripts : [];
  const hasSrcChange = files.some(file => file.startsWith('src/'));
  const hasExtensionSrcChange = files.some(file => file.startsWith('packages/vectahub-vscode-extension/src/'));
  const typecheckCommand = selectTypecheckCommand(packageScripts);

  for (const file of files) {
    if (!file.startsWith('src/') || !file.endsWith('.test.ts')) continue;
    addCommand(commands, seen, `npm test -- ${file} --run`);
    if (commands.length >= MAX_VALIDATION_COMMANDS) return commands;
  }

  if (hasSrcChange) {
    addCommand(commands, seen, typecheckCommand);
  }
  if (hasExtensionSrcChange) {
    addCommand(commands, seen, 'npm run compile -w packages/vectahub-vscode-extension');
  }
  if (commands.length === 0) {
    addCommand(commands, seen, typecheckCommand);
  }

  return commands.slice(0, MAX_VALIDATION_COMMANDS);
}

function selectTypecheckCommand(packageScripts) {
  if (packageScripts.includes('typecheck')) return 'npm run typecheck';
  if (packageScripts.includes('type-check')) return 'npm run type-check';
  if (packageScripts.includes('check-types')) return 'npm run check-types';
  if (packageScripts.includes('check:type')) return 'npm run check:type';
  return 'npm run typecheck';
}

export function decideAgentTaskConcurrency(contracts) {
  if (!Array.isArray(contracts) || contracts.length <= 1) {
    return {
      mode: 'serial',
      reason: 'insufficient-tasks',
      groups: Array.isArray(contracts) ? contracts.map(contract => [contract.taskId]) : [],
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

  const fileOwner = new Map();
  const forbiddenFiles = new Set();
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

export function extractCandidateFiles(text) {
  const candidates = [];
  for (const match of String(text ?? '').matchAll(/`([^`]+)`/g)) {
    const value = sanitizeCandidatePath((match[1] ?? '').trim());
    if (value && looksLikeProjectPath(value)) candidates.push(value);
  }

  const pathRegex = /(?:^|[\s"'(（\[【:：,，;；])((?:\.\/)?(?:src|packages|docs|scripts|test|tests)\/[A-Za-z0-9._@/+~=-]+(?:\/[A-Za-z0-9._@/+~=-]+)*)/g;
  for (const match of String(text ?? '').matchAll(pathRegex)) {
    const value = sanitizeCandidatePath((match[1] ?? '').trim());
    if (value && looksLikeProjectPath(value)) candidates.push(value);
  }

  return candidates;
}

function extractExplicitFileSections(text) {
  const allowedFiles = [];
  const forbiddenFiles = [];
  let currentSection = null;

  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    const section = detectFileSection(line);
    if (section) {
      currentSection = section;
      continue;
    }
    if (isSectionBoundary(line)) {
      currentSection = null;
      continue;
    }
    if (!currentSection) continue;

    // 显式文件分区是安全边界来源，只读取列表项，避免把说明文字误当成文件路径。
    const item = line.match(/^[-*]\s+(\S.*)$/);
    if (!item) continue;

    const candidates = extractCandidateFiles(item[1]);
    if (currentSection === 'allowed') {
      allowedFiles.push(...candidates);
    } else {
      forbiddenFiles.push(...candidates);
    }
  }

  return { allowedFiles, forbiddenFiles };
}

function detectFileSection(line) {
  const normalized = line
    .replace(/^#+\s*/, '')
    .replace(/[*_`]/g, '')
    .trim()
    .toLowerCase();

  if (/^allowedfiles[ \t]*:?$/.test(normalized) || /^allowed files[ \t]*:?$/.test(normalized)) {
    return 'allowed';
  }
  if (/^forbiddenfiles[ \t]*:?$/.test(normalized) || /^forbidden files[ \t]*:?$/.test(normalized)) {
    return 'forbidden';
  }
  return null;
}

function isSectionBoundary(line) {
  if (!line) return false;
  if (/^#{1,6}\s+/.test(line)) return true;
  if (/^[A-Za-z][A-Za-z0-9 _-]{1,80}:\s*$/.test(line)) return true;
  return false;
}

function addCommand(commands, seen, command) {
  if (!seen.has(command)) {
    seen.add(command);
    commands.push(command);
  }
}

function appendBounded(base, addition, limit) {
  if (base.length >= limit) return base;
  return (base + addition).slice(0, limit);
}

function stringToLines(text) {
  return (function* () {
    let start = 0;
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === '\n') {
        yield text.slice(start, index).replace(/\r$/, '');
        start = index + 1;
      }
    }
    if (start < text.length) {
      yield text.slice(start).replace(/\r$/, '');
    }
  })();
}

async function* stringToAsyncLines(text) {
  yield* stringToLines(text);
}

function toExcerptResult(source, maxChars, strategy) {
  if (source.length <= maxChars) {
    return { excerpt: source, truncated: false, strategy };
  }
  return { excerpt: source.slice(0, maxChars), truncated: true, strategy };
}

function toPosixPath(filePath) {
  return filePath.split('/').join('/').replace(/\\/g, '/');
}

function isOutOfProject(projectRelativePath) {
  if (!projectRelativePath) return true;
  const normalized = toPosixPath(projectRelativePath);
  return (
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    isLikelyAbsolutePath(normalized) ||
    /^[A-Za-z]:\//.test(normalized)
  );
}

function stripLeadingCurrentDir(projectRelativePath) {
  return projectRelativePath.startsWith('./')
    ? projectRelativePath.slice(2)
    : projectRelativePath;
}

function sanitizeCandidatePath(value) {
  return value.replace(/[.,，。;；:：)）\]】]{1,100}$/g, '');
}

function looksLikeProjectPath(value) {
  if (!value || value.includes('\n')) {
    return false;
  }
  return /^(?:\.\/)?(?:src|packages|docs|scripts|test|tests)\//.test(value);
}

function isLikelyAbsolutePath(filePath) {
  if (!filePath) return false;
  return (
    isAbsolute(filePath) ||
    /^[A-Za-z]:[\\/]/.test(filePath) ||
    /^[/\\]{2}[^/\\]+[/\\][^/\\]+/.test(filePath)
  );
}

function detectPathStyle(filePath) {
  return /^[A-Za-z]:[\\/]/.test(filePath) || /^[/\\]{2}[^/\\]+[/\\][^/\\]+/.test(filePath)
    ? 'windows'
    : 'posix';
}

function serialDecision(contracts, reason) {
  return {
    mode: 'serial',
    reason,
    groups: contracts.map(contract => [contract.taskId]),
  };
}

export function expandRelatedFiles(allowedFiles, projectRoot) {
  if (!Array.isArray(allowedFiles)) return [];
  const result = new Set();
  for (const file of allowedFiles) {
    if (typeof file !== 'string') continue;
    if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
      const testFile = file.replace(/\.ts$/, '.test.ts');
      const resolvedPath = resolve(projectRoot, testFile);
      if (existsSync(resolvedPath)) result.add(testFile);
    } else if (file.endsWith('.test.ts')) {
      const srcFile = file.replace(/\.test\.ts$/, '.ts');
      const resolvedPath = resolve(projectRoot, srcFile);
      if (existsSync(resolvedPath)) result.add(srcFile);
    }
  }
  return [...result];
}
