import { Command } from 'commander';
import { createLLMConfig, LLMClient } from '../nl/llm.js';
import { DOC_TASK_PARSER_ID } from '../nl/prompt-manager.js';
import type { DocTask } from '../types/index.js';
import { getDefaultContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

const logger = getDefaultContext().logger.getLogger('parse-doc');

const DEFAULT_MAX_DOC_LENGTH = 50000;
const DEFAULT_MAX_RETRIES = 2;
const CHUNK_BOUNDARY_SEARCH_RATIO = 0.2;

const CONTINUATION_SUFFIX = '\n（接下一段）';
const CONTINUATION_PREFIX = '（接上一段）\n';
const HEADING_PATTERN = /^#{1,6}\s+(.+)$/;
const PRIORITY_SECTION_PATTERN = /当前开发优先级/;
const TASK_ID_PATTERN = /([A-Za-z]{1,8}-\d+(?:[-.]\d+)*|[A-Za-z]?\d+(?:[-.]\d+)*)/;
const VERB_PREFIX_PATTERN = /^(增强|完善|优化|补齐|打通|支持|增加|新增|提供|实现|改造|收敛|修复)(.*)$/;
const GAP_TRIGGER_PATTERNS: Array<{ pattern: RegExp; verb?: string }> = [
  { pattern: /需补强/, verb: '补强' },
  { pattern: /需补齐/, verb: '补齐' },
  { pattern: /需增强/, verb: '增强' },
  { pattern: /需完善/, verb: '完善' },
  { pattern: /待补齐/, verb: '补齐' },
  { pattern: /待完善/, verb: '完善' },
  { pattern: /待验证/, verb: '验证' },
  { pattern: /需要/ },
  { pattern: /需/ },
];
const STATUS_TABLE_HEADER_PATTERN = /状态/;
const MARKDOWN_TABLE_DIVIDER_PATTERN = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

export type ParseDocSource = 'roadmap-table' | 'llm' | 'regex-fallback';

export interface ParseDocResult {
  tasks: DocTask[];
  source: ParseDocSource;
  degraded: boolean;
  warnings: string[];
}

export function findChunkBoundary(content: string, target: number, maxDocLength: number = target): number {
  if (target <= 0 || target >= content.length) {
    return target;
  }

  const searchRange = Math.floor(maxDocLength * CHUNK_BOUNDARY_SEARCH_RATIO);
  const start = Math.max(0, target - searchRange);

  let searchPos = target;
  while (searchPos > start) {
    if (content[searchPos] === '\n' && content[searchPos + 1] === '\n') {
      return searchPos + 2;
    }
    searchPos--;
  }

  searchPos = target;
  while (searchPos > start) {
    if (content[searchPos] === '\n') {
      return searchPos + 1;
    }
    searchPos--;
  }

  return target;
}

export function splitDocIntoChunks(content: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > maxLength) {
    const boundary = findChunkBoundary(remaining, maxLength, maxLength);
    const chunk = remaining.substring(0, boundary);
    chunks.push(chunk);
    remaining = remaining.substring(boundary);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

export function mergeAndDeduplicateDocTasks(allTasks: DocTask[][]): DocTask[] {
  const seen = new Set<string>();
  const merged: DocTask[] = [];

  for (const tasks of allTasks) {
    for (const task of tasks) {
      if (!seen.has(task.id)) {
        seen.add(task.id);
        merged.push(task);
      }
    }
  }

  return merged;
}

function splitMarkdownTableRow(line: string): string[] {
  let raw = line.trim();
  if (!raw.startsWith('|') || raw.indexOf('|') === raw.lastIndexOf('|')) {
    return [];
  }
  if (raw.startsWith('|')) raw = raw.slice(1);
  if (raw.endsWith('|')) raw = raw.slice(0, -1);
  return raw.split('|').map(cell => cell.trim());
}

function normalizeStatus(value: string): 'existing' | 'partial' | 'pending' | 'paused' | 'unknown' {
  const text = value.replace(/\s+/g, '');
  if (text.includes('已有')) return 'existing';
  if (text.includes('部分')) return 'partial';
  if (text.includes('待补')) return 'pending';
  if (text.includes('暂停')) return 'paused';
  return 'unknown';
}

function cleanupTaskLabel(label: string): string {
  return label
    .replace(/[`*_]/g, '')
    .replace(/\[[^\]]+\]\([^)]+\)/g, '$1')
    .replace(/[。；;，,\s]+$/g, '')
    .replace(/^[：:\-—\s]+/, '')
    .trim();
}

function extractPendingWorkFromStatusRow(detail: string): string | undefined {
  const source = cleanupTaskLabel(detail);
  if (!source) return undefined;

  for (const trigger of GAP_TRIGGER_PATTERNS) {
    const matched = source.match(trigger.pattern);
    if (!matched || matched.index === undefined) continue;

    const tailRaw = source.slice(matched.index + matched[0].length);
    const tail = cleanupTaskLabel(
      tailRaw
        .replace(/^[，。,;；:：\s-]+/, '')
        .replace(/^(已有|已支持|已按|可确认|有接口|有项目接口|前端有|后端有)[^，。,;；]*[，。,;；]?\s*/g, '')
    );
    if (!tail) return undefined;
    if (trigger.verb && !VERB_PREFIX_PATTERN.test(tail)) {
      return cleanupTaskLabel(`${trigger.verb}${tail}`);
    }
    return tail;
  }

  const normalized = source
    .replace(/^(已有|已支持|已按|可确认|有接口|有项目接口|前端有|后端有)[^，。,;；]*[，。,;；]?\s*/g, '')
    .trim();
  if (!normalized || !/(增强|完善|优化|补齐|补强|打通|支持|增加|新增|提供|实现|改造|收敛|修复|缺|不足|未)/.test(normalized)) {
    return undefined;
  }
  return cleanupTaskLabel(normalized);
}

function buildTaskLabelFromRoadmapRow(featureLabel: string, status: 'partial' | 'pending', detail: string): string {
  const baseFeature = cleanupTaskLabel(featureLabel).replace(/\s*\/\s*/g, '/');
  const pendingWork = extractPendingWorkFromStatusRow(detail);
  if (status === 'pending') {
    return pendingWork ? cleanupTaskLabel(pendingWork) : cleanupTaskLabel(`实现${baseFeature}`);
  }

  if (!pendingWork) {
    return cleanupTaskLabel(`完善${baseFeature}`);
  }

  const verbMatch = pendingWork.match(VERB_PREFIX_PATTERN);
  if (!verbMatch) {
    return cleanupTaskLabel(`完善${baseFeature}${pendingWork}`);
  }
  const verb = verbMatch[1];
  const rest = cleanupTaskLabel(verbMatch[2]);
  return cleanupTaskLabel(`${verb}${baseFeature}${rest}`);
}

function parseCurrentPriorityTasks(content: string): DocTask[] {
  const lines = content.split('\n');
  const tasks: DocTask[] = [];
  let collecting = false;

  for (const line of lines) {
    const headingMatch = line.match(HEADING_PATTERN);
    if (headingMatch) {
      const headingText = headingMatch[1];
      if (PRIORITY_SECTION_PATTERN.test(headingText)) {
        collecting = true;
        continue;
      }
      if (collecting) {
        break;
      }
      continue;
    }
    if (!collecting) continue;

    const trimmed = line.trim();
    const numberedMatch = trimmed.match(/^(\d+(?:\.\d+)*|[A-Za-z]-?\d+(?:[-.]\d+)*)[.、:)]\s+(.+)$/);
    if (!numberedMatch) continue;
    tasks.push({
      id: numberedMatch[1],
      label: cleanupTaskLabel(numberedMatch[2]),
    });
  }

  return tasks;
}

export function parseRoadmapTableTasks(content: string): { detected: boolean; tasks: DocTask[] } {
  const lines = content.split('\n');
  const tasks: DocTask[] = [];
  let detected = false;

  for (let i = 0; i < lines.length - 1; i++) {
    const headerCells = splitMarkdownTableRow(lines[i]);
    if (headerCells.length === 0 || !headerCells.some(cell => STATUS_TABLE_HEADER_PATTERN.test(cell))) {
      continue;
    }
    const divider = lines[i + 1]?.trim() ?? '';
    if (!MARKDOWN_TABLE_DIVIDER_PATTERN.test(divider)) {
      continue;
    }

    detected = true;
    const statusIdx = headerCells.findIndex(cell => /状态/.test(cell));
    const featureIdx = headerCells.findIndex(cell => /(功能|需求|任务|能力|事项)/.test(cell) && !/(ID|编号|序号)/i.test(cell));
    const idIdx = headerCells.findIndex(cell => /(ID|编号|序号)/i.test(cell));
    const detailIdx = headerCells.findIndex(cell => /(说明|备注|缺口|现状|描述)/.test(cell));

    let row = i + 2;
    while (row < lines.length) {
      const rowCells = splitMarkdownTableRow(lines[row]);
      if (rowCells.length === 0) break;
      if (rowCells.every(cell => cell === '' || /^:?-{2,}:?$/.test(cell.replace(/\s+/g, '')))) {
        row += 1;
        continue;
      }

      const statusText = rowCells[statusIdx] ?? '';
      const status = normalizeStatus(statusText);
      if (status === 'existing' || status === 'paused' || status === 'unknown') {
        row += 1;
        continue;
      }

      const feature = cleanupTaskLabel((featureIdx >= 0 ? rowCells[featureIdx] : rowCells[0]) ?? '');
      const detail = cleanupTaskLabel((detailIdx >= 0 ? rowCells[detailIdx] : '') ?? '');
      const idCandidate = (idIdx >= 0 ? rowCells[idIdx] : rowCells.find(cell => TASK_ID_PATTERN.test(cell))) ?? '';
      const idMatch = idCandidate.match(TASK_ID_PATTERN);
      if (!idMatch || !feature) {
        row += 1;
        continue;
      }

      tasks.push({
        id: idMatch[1],
        label: buildTaskLabelFromRoadmapRow(feature, status, detail),
      });
      row += 1;
    }
  }

  const priorityTasks = parseCurrentPriorityTasks(content);
  const merged = mergeAndDeduplicateDocTasks([tasks, priorityTasks]);
  return { detected, tasks: merged };
}

export function fallbackParseByRegex(content: string): DocTask[] {
  const roadmap = parseRoadmapTableTasks(content);
  if (roadmap.detected) {
    return roadmap.tasks;
  }

  const tasks: DocTask[] = [];
  const lines = content.split('\n');

  const headingPattern = /^#{1,6}\s+.*?([A-Za-z]?\d+(?:[-.]\d+)*)\s*[:：-]?\s*(.+)$/;
  const listPattern = /^[-*]\s+.*?([A-Za-z]?\d+(?:[-.]\d+)*)[.、:)]\s*(.+)$/;
  const numberedPattern = /^([A-Za-z]?\d+(?:[-.]\d+)*)[.、:)]\s+(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let match: RegExpMatchArray | null;

    match = trimmed.match(headingPattern);
    if (match) {
      tasks.push({ id: match[1], label: match[2].trim() });
      continue;
    }

    match = trimmed.match(listPattern);
    if (match) {
      tasks.push({ id: match[1], label: match[2].trim() });
      continue;
    }

    match = trimmed.match(numberedPattern);
    if (match) {
      tasks.push({ id: match[1], label: match[2].trim() });
      continue;
    }
  }

  return tasks;
}

export async function parseDocTaskResult(filePath: string): Promise<ParseDocResult> {
  const ctx = getDefaultContext();
  const maxDocLength = ctx.environment.getEnvNumber('PARSE_DOC_MAX_LENGTH', DEFAULT_MAX_DOC_LENGTH) ?? DEFAULT_MAX_DOC_LENGTH;
  const maxRetries = ctx.environment.getEnvNumber('PARSE_DOC_MAX_RETRIES', DEFAULT_MAX_RETRIES) ?? DEFAULT_MAX_RETRIES;

  const absolutePath = ctx.environment.resolvePath(filePath);
  if (!ctx.environment.exists(absolutePath)) {
    throw new VectaHubError(`文件不存在: ${absolutePath}`, ErrorType.FILESYSTEM);
  }

  const docContent = ctx.environment.readFile(absolutePath);
  if (docContent.length === 0) {
    throw new VectaHubError('文档内容为空', ErrorType.RUNTIME);
  }
  const roadmap = parseRoadmapTableTasks(docContent);
  if (roadmap.detected) {
    logger.info(`检测到路线图状态表格，按状态语义提取 ${roadmap.tasks.length} 个待开发任务`);
    return {
      tasks: roadmap.tasks,
      source: 'roadmap-table',
      degraded: false,
      warnings: [],
    };
  }

  const llmConfig = createLLMConfig();
  if (!llmConfig) {
    const warning = 'LLM 未配置，已降级为正则解析';
    logger.warn(warning);
    const fallbackTasks = fallbackParseByRegex(docContent);
    if (fallbackTasks.length === 0) {
      throw new VectaHubError('LLM 未配置且正则解析未提取到任务，请先运行 vectahub setup 配置 AI 提供商', ErrorType.CONFIGURATION);
    }
    logger.info(`正则 fallback 解析到 ${fallbackTasks.length} 个任务`);
    return {
      tasks: fallbackTasks,
      source: 'regex-fallback',
      degraded: true,
      warnings: [warning],
    };
  }

  const client = new LLMClient(llmConfig);

  if (docContent.length <= maxDocLength) {
    return {
      tasks: await callLLMWithRetry(client, docContent, maxRetries),
      source: 'llm',
      degraded: false,
      warnings: [],
    };
  }

  logger.info(`文档长度 ${docContent.length} 超出限制 ${maxDocLength}，启用分段解析`);
  const chunks = splitDocIntoChunks(docContent, maxDocLength);
  logger.info(`文档分为 ${chunks.length} 段`);

  const allTasks: DocTask[][] = [];

  for (let i = 0; i < chunks.length; i++) {
    let content = chunks[i];
    if (i > 0) {
      content = CONTINUATION_PREFIX + content;
    }
    if (i < chunks.length - 1) {
      content = content + CONTINUATION_SUFFIX;
    }

    logger.info(`正在解析第 ${i + 1}/${chunks.length} 段 (${content.length} 字符)...`);

    try {
      const tasks = await callLLMWithRetry(client, content, maxRetries);
      allTasks.push(tasks);
      logger.info(`第 ${i + 1}/${chunks.length} 段解析成功，得到 ${tasks.length} 个任务`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`第 ${i + 1}/${chunks.length} 段解析失败: ${message}，继续处理其余段`);
    }
  }

  if (allTasks.length === 0) {
    const warning = '所有分段 LLM 解析均失败，已降级为正则解析';
    logger.warn(warning);
    const fallbackTasks = fallbackParseByRegex(docContent);
    if (fallbackTasks.length === 0) {
      throw new VectaHubError(
        `所有分段解析均失败且正则 fallback 未提取到任务。\n` +
        `  文档路径: ${absolutePath}\n` +
        `  文档大小: ${docContent.length} 字节\n` +
        `  分段数: ${chunks.length}\n` +
        `  LLM 提供商: ${llmConfig.provider}/${llmConfig.model}`,
        ErrorType.RUNTIME
      );
    }
    logger.info(`正则 fallback 解析到 ${fallbackTasks.length} 个任务`);
    return {
      tasks: fallbackTasks,
      source: 'regex-fallback',
      degraded: true,
      warnings: [warning],
    };
  }

  const merged = mergeAndDeduplicateDocTasks(allTasks);
  logger.info(`分段解析完成：${allTasks.length} 段共解析 ${merged.length} 个任务（已去重）`);

  const warnings = allTasks.length < chunks.length
    ? [`部分分段 LLM 解析失败，已基于 ${allTasks.length}/${chunks.length} 个成功分段汇总任务`]
    : [];

  return {
    tasks: merged,
    source: 'llm',
    degraded: warnings.length > 0,
    warnings,
  };
}

export async function parseDocTasks(filePath: string): Promise<DocTask[]> {
  const result = await parseDocTaskResult(filePath);
  return result.tasks;
}

async function callLLMWithRetry(client: LLMClient, docContent: string, maxRetries: number): Promise<DocTask[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        logger.info(`第 ${attempt + 1} 次尝试 (共 ${maxRetries + 1} 次)...`);
      }
      const rawOutput = await client.completeRaw(DOC_TASK_PARSER_ID, '请只提取尚需开发或补齐的任务缺口', {
        docContent,
      });
      return parseTasksFromLLMOutput(rawOutput);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        logger.warn(`第 ${attempt + 1} 次 LLM 解析失败: ${lastError.message}，将重试`);
      }
    }
  }

  throw lastError;
}

export function parseTasksFromLLMOutput(output: string): DocTask[] {
  const cleaned = output.trim();

  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonSource = codeBlockMatch ? codeBlockMatch[1].trim() : cleaned;

  const candidates: string[] = [];
  const arrayRegex = /\[[\s\S]*?\]/g;
  let match: RegExpExecArray | null;
  while ((match = arrayRegex.exec(jsonSource)) !== null) {
    candidates.push(match[0]);
  }

  if (candidates.length === 0) {
    const preview = cleaned.substring(0, 200).replace(/\n/g, '\\n');
    throw new Error(`LLM 输出中未找到有效的 JSON 数组 (输出前 200 字符: ${preview})`);
  }

  let tasks: DocTask[] | null = null;
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.length > 0) {
        tasks = parsed as DocTask[];
        break;
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  if (!tasks) {
    throw new Error(`JSON 解析失败: ${lastError?.message || '未找到有效数组'}`);
  }

  for (const task of tasks) {
    if (!task.id || !task.label) {
      throw new Error('任务格式无效：每个任务必须包含 id 和 label');
    }
  }

  return tasks;
}

export const parseDocCmd = new Command('parse-doc')
  .description('解析开发文档，提取结构化任务列表')
  .argument('<path>', '文档文件路径')
  .option('--json', '以 JSON 格式输出')
  .action(async (filePath: string, options: { json?: boolean }) => {
    const ctx = getDefaultContext();
    if (options.json) {
      ctx.logger.setMuted(true);
    }
    try {
      logger.info(`正在解析文档: ${filePath}`);

      const result = await parseDocTaskResult(filePath);
      const { tasks } = result;

      if (options.json) {
        console.log(JSON.stringify({
          ok: true,
          tasks,
          source: result.source,
          degraded: result.degraded,
          warnings: result.warnings,
        }, null, 2));
        return;
      } else {
        console.log(`\n📋 解析到 ${tasks.length} 个任务:\n`);
        if (result.degraded) {
          for (const warning of result.warnings) {
            console.log(`  [warning] ${warning}`);
          }
          console.log('');
        }
        console.log('─'.repeat(60));
        for (const task of tasks) {
          console.log(`  ${task.id.padEnd(10)} ${task.label}`);
        }
        console.log('─'.repeat(60));
        console.log('');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.json) {
        console.log(JSON.stringify({ ok: false, error: message }, null, 2));
      } else {
        logger.error(`解析失败: ${message}`);
      }
      throw new VectaHubError(`解析失败: ${message}`, ErrorType.RUNTIME, error);
    }
  });
