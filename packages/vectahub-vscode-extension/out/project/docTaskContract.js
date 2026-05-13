"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAgentTaskContractSummaries = buildAgentTaskContractSummaries;
exports.decideDocTaskBatchConcurrency = decideDocTaskBatchConcurrency;
exports.toRunContractSummary = toRunContractSummary;
const path = __importStar(require("path"));
const docTaskDocIndex_js_1 = require("./docTaskDocIndex.js");
const MAX_EXCERPT_CHARS = 8000;
const WINDOW_BEFORE = 2000;
const WINDOW_AFTER = 6000;
const MAX_FILES = 100;
const MAX_VALIDATION_COMMANDS = 10;
const DEFAULT_FORBIDDEN_FILES = ['.env', '.env.*', '**/*.pem', '**/*.key', '**/node_modules/**', '**/.git/**'];
function buildAgentTaskContractSummaries(input) {
    const result = new Map();
    const docIndex = input.docContent ? (0, docTaskDocIndex_js_1.buildDocIndex)(input.docContent) : undefined;
    for (const task of input.tasks) {
        const excerpt = docIndex
            ? deriveDocExcerpt(docIndex, task.id, task.label)
            : { excerpt: '', truncated: false, strategy: 'none' };
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
function decideDocTaskBatchConcurrency(input) {
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
    const ownerByFile = new Map();
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
function toRunContractSummary(summary) {
    if (!summary)
        return undefined;
    return {
        boundaryConfidence: summary.boundaryConfidence,
        allowedFileCount: summary.allowedFiles.length,
        forbiddenFileCount: summary.forbiddenFiles.length,
        validationCommandCount: summary.validationCommands.length,
        executionMode: summary.executionMode,
    };
}
function deriveDocExcerpt(docIndex, taskId, label) {
    const heading = (0, docTaskDocIndex_js_1.findHeadingSection)(docIndex, taskId);
    if (heading)
        return toExcerptResult(heading, 'task-heading');
    const docContent = docIndex.content;
    const taskIndex = docContent.indexOf(taskId);
    if (taskIndex >= 0)
        return toExcerptResult(sliceByWindow(docContent, taskIndex), 'task-id-window');
    const labelIndex = findLabelIndex(docContent, label);
    if (labelIndex >= 0)
        return toExcerptResult(sliceByWindow(docContent, labelIndex), 'label-window');
    return toExcerptResult(docContent, 'head-fallback');
}
function sliceByWindow(content, index) {
    return content.slice(Math.max(0, index - WINDOW_BEFORE), Math.min(content.length, index + WINDOW_AFTER));
}
function findLabelIndex(content, label) {
    const direct = content.indexOf(label);
    if (direct >= 0)
        return direct;
    for (const token of label.split(/[\s,，。:：;；/|()[\]{}]+/g).filter(part => part.trim().length >= 2)) {
        const index = content.indexOf(token.trim());
        if (index >= 0)
            return index;
    }
    return -1;
}
function toExcerptResult(source, strategy) {
    return source.length <= MAX_EXCERPT_CHARS
        ? { excerpt: source, truncated: false, strategy }
        : { excerpt: source.slice(0, MAX_EXCERPT_CHARS), truncated: true, strategy };
}
function extractCandidateFiles(text) {
    const candidates = [];
    for (const match of text.matchAll(/`([^`]+)`/g)) {
        const value = sanitizeCandidatePath(match[1]?.trim() || '');
        if (looksLikeProjectPath(value))
            candidates.push(value);
    }
    const pathRegex = /(?:^|[\s"'(（[【:：,，;；])((?:\.\/)?(?:src|packages|docs|scripts|test|tests)\/[A-Za-z0-9._@/+~=-]+(?:\/[A-Za-z0-9._@/+~=-]+)*)/g;
    for (const match of text.matchAll(pathRegex)) {
        const value = sanitizeCandidatePath(match[1]?.trim() || '');
        if (looksLikeProjectPath(value))
            candidates.push(value);
    }
    return candidates;
}
function normalizeFiles(files, projectRoot) {
    const seen = new Set();
    const result = [];
    const base = path.resolve(projectRoot);
    for (const raw of files) {
        const value = raw.trim();
        if (!value)
            continue;
        const normalized = toPosixPath(path.normalize(value.replace(/\\/g, '/')));
        const rel = path.isAbsolute(value) ? toPosixPath(path.relative(base, path.resolve(value))) : stripCurrentDir(normalized);
        if (!rel || rel === '..' || rel.startsWith('../') || rel.includes('/../') || seen.has(rel))
            continue;
        seen.add(rel);
        result.push(rel);
        if (result.length >= MAX_FILES)
            break;
    }
    return result;
}
function deriveValidationCommands(files) {
    const commands = files.filter(file => file.startsWith('src/') && file.endsWith('.test.ts')).map(file => `npm test -- ${file} --run`);
    if (files.some(file => file.startsWith('src/')))
        commands.push('npm run typecheck');
    if (files.some(file => file.startsWith('packages/vectahub-vscode-extension/src/'))) {
        commands.push('npm run compile -w packages/vectahub-vscode-extension');
    }
    return [...new Set(commands.length ? commands : ['npm run typecheck'])].slice(0, MAX_VALIDATION_COMMANDS);
}
function sanitizeCandidatePath(value) {
    return value.replace(/[.,，。;；:：)）\]】]+$/g, '');
}
function looksLikeProjectPath(value) {
    return /^(?:\.\/)?(?:src|packages|docs|scripts|test|tests)\//.test(value) && !value.includes('\n');
}
function stripCurrentDir(value) {
    return value.startsWith('./') ? value.slice(2) : value;
}
function toPosixPath(value) {
    return value.split(path.sep).join('/').replace(/\\/g, '/');
}
//# sourceMappingURL=docTaskContract.js.map