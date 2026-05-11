import { Command } from 'commander';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createConsoleLogger } from '../utils/logger.js';
import { createLLMConfig, LLMClient } from '../nl/llm.js';
import { DOC_TASK_PARSER_ID } from '../nl/prompt-manager.js';
import type { DocTask } from '../types/index.js';

const logger = createConsoleLogger('parse-doc');

const DEFAULT_MAX_DOC_LENGTH = 50000;
const MAX_DOC_LENGTH = parseInt(process.env.PARSE_DOC_MAX_LENGTH || '', 10) || DEFAULT_MAX_DOC_LENGTH;
const CHUNK_BOUNDARY_SEARCH_RATIO = 0.2;

const CONTINUATION_SUFFIX = '\n（接下一段）';
const CONTINUATION_PREFIX = '（接上一段）\n';

export function findChunkBoundary(content: string, target: number): number {
  if (target <= 0 || target >= content.length) {
    return target;
  }

  const searchRange = Math.floor(MAX_DOC_LENGTH * CHUNK_BOUNDARY_SEARCH_RATIO);
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
    const boundary = findChunkBoundary(remaining, maxLength);
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

export function fallbackParseByRegex(content: string): DocTask[] {
  const tasks: DocTask[] = [];
  const lines = content.split('\n');

  const headingPattern = /^#{1,6}\s+(\d+(?:\.\d+)*)\s+(.+)$/;
  const listPattern = /^[-*]\s+(\d+(?:\.\d+)*)[.、:)]\s*(.+)$/;
  const numberedPattern = /^(\d+(?:\.\d+)*)[.、:)]\s+(.+)$/;

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

export async function parseDocTasks(filePath: string): Promise<DocTask[]> {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`文件不存在: ${absolutePath}`);
  }

  const docContent = readFileSync(absolutePath, 'utf-8');
  if (docContent.length === 0) {
    throw new Error('文档内容为空');
  }

  const llmConfig = createLLMConfig();
  if (!llmConfig) {
    logger.warn('LLM 未配置，使用正则 fallback 解析');
    const fallbackTasks = fallbackParseByRegex(docContent);
    if (fallbackTasks.length === 0) {
      throw new Error('LLM 未配置且正则解析未提取到任务，请先运行 vectahub setup 配置 AI 提供商');
    }
    logger.info(`正则 fallback 解析到 ${fallbackTasks.length} 个任务`);
    return fallbackTasks;
  }

  const client = new LLMClient(llmConfig);

  if (docContent.length <= MAX_DOC_LENGTH) {
    const rawOutput = await client.completeRaw(DOC_TASK_PARSER_ID, '请从文档中提取所有开发任务', {
      docContent,
    });

    return parseTasksFromLLMOutput(rawOutput);
  }

  logger.info(`文档长度 ${docContent.length} 超出限制 ${MAX_DOC_LENGTH}，启用分段解析`);
  const chunks = splitDocIntoChunks(docContent, MAX_DOC_LENGTH);
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
      const rawOutput = await client.completeRaw(DOC_TASK_PARSER_ID, '请从文档中提取所有开发任务', {
        docContent: content,
      });

      const tasks = parseTasksFromLLMOutput(rawOutput);
      allTasks.push(tasks);
      logger.info(`第 ${i + 1}/${chunks.length} 段解析成功，得到 ${tasks.length} 个任务`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`第 ${i + 1}/${chunks.length} 段解析失败: ${message}，继续处理其余段`);
    }
  }

  if (allTasks.length === 0) {
    logger.warn('所有分段 LLM 解析均失败，尝试正则 fallback');
    const fallbackTasks = fallbackParseByRegex(docContent);
    if (fallbackTasks.length === 0) {
      throw new Error('所有分段解析均失败且正则 fallback 未提取到任务');
    }
    logger.info(`正则 fallback 解析到 ${fallbackTasks.length} 个任务`);
    return fallbackTasks;
  }

  const merged = mergeAndDeduplicateDocTasks(allTasks);
  logger.info(`分段解析完成：${allTasks.length} 段共解析 ${merged.length} 个任务（已去重）`);

  return merged;
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
    throw new Error('LLM 输出中未找到有效的 JSON 数组');
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
    try {
      logger.info(`正在解析文档: ${filePath}`);

      const tasks = await parseDocTasks(filePath);

      if (options.json) {
        console.log(JSON.stringify({ ok: true, tasks }, null, 2));
      } else {
        console.log(`\n📋 解析到 ${tasks.length} 个任务:\n`);
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
      process.exit(1);
    }
  });
