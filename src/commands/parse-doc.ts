import { Command } from 'commander';
import { format } from 'node:util';
import type { DocTask } from '../types/index.js';
import { type InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';
import { planFromDocTasks } from '../orchestration-plan/index.js';
import type { AgentDescriptor } from '../types/agent.js';
import type { AgentTransport } from '../agent-runtime/transport/types.js';
import { createTransport, type AcpConfig } from '../agent-runtime/transport/factory.js';
import { getAgentDescriptorById } from './agent-cli-adapter.js';

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

interface ParseDocCommandOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
  json(payload: unknown, options?: { space?: number }): void;
}

function createParseDocCommandOutput(): ParseDocCommandOutput {
  const formatMessage = (message?: unknown, optionalParams: unknown[] = []): string => {
    if (message === undefined && optionalParams.length === 0) {
      return '';
    }
    return format(message, ...optionalParams);
  };

  return {
    log(message?: unknown, ...optionalParams: unknown[]): void {
      process.stdout.write(`${formatMessage(message, optionalParams)}\n`);
    },
    json(payload: unknown, options?: { space?: number }): void {
      process.stdout.write(`${JSON.stringify(payload, null, options?.space ?? 2)}\n`);
    },
  };
}

export type ParseDocSource = 'roadmap-table' | 'acp' | 'llm' | 'regex-fallback';

export interface ParseDocResult {
  tasks: DocTask[];
  source: ParseDocSource;
  degraded: boolean;
  warnings: string[];
}

/**
 * parse-doc 任务的可选依赖。
 * 提供 transport + descriptor 时启用 ACP 路径(第二层);
 * 缺省时跳过 ACP,直接降级到 regex fallback(第三层)。
 */
export interface ParseDocDeps {
  transport?: AgentTransport;
  descriptor?: AgentDescriptor;
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

/**
 * 构造 parse-doc ACP agent 的 task prompt。
 *
 * 要求 agent 读取文档并返回结构化 JSON 数组,每个任务包含
 * id / label / docExcerpt / allowedFiles / forbiddenFiles。
 * agent 可使用 read / search 工具探索代码库以补充上下文。
 * @param docContent 文档全文
 * @returns 组装好的 task prompt
 */
export function buildParseDocPrompt(docContent: string): string {
  return [
    'Analyze the following document and extract structured tasks as a JSON array.',
    'Each task object must have:',
    '  - id: string (unique identifier, e.g. "T1" or "IMP-005")',
    '  - label: string (human-readable label, concise action description)',
    '  - docExcerpt: string (relevant excerpt from the document)',
    '  - allowedFiles: string[] (files the task may modify, empty if unknown)',
    '  - forbiddenFiles: string[] (files the task must not touch, empty if unknown)',
    '',
    'Do not use any tools. Respond with ONLY the JSON array, no markdown fences, no extra prose.',
    '',
    'Document:',
    docContent,
  ].join('\n');
}

/**
 * 通过 ACP transport 调用 agent 解析文档,提取结构化任务列表(第二层)。
 *
 * 构造 TransportRequest → transport.execute() → 解析 agent 返回的 JSON 数组。
 * 复用 parseTasksFromLLMOutput() 处理 code fence / 多候选 / id+label 校验。
 *
 * @param docContent 文档全文
 * @param transport ACP transport 实例
 * @param descriptor 目标 agent 描述符
 * @returns 解析结果(source='acp')
 */
export async function parseDocViaAcp(
  docContent: string,
  transport: AgentTransport,
  descriptor: AgentDescriptor,
): Promise<ParseDocResult> {
  const workspaceRoot = process.cwd();
  const traceId = `parse-doc-${Date.now()}`;
  const result = await transport.execute({
    descriptor,
    workspaceRoot,
    taskPrompt: buildParseDocPrompt(docContent),
    mode: 'run',
    traceContext: { traceId, source: 'cli' },
    parentSpanId: '',
    securityContext: { cwd: workspaceRoot, sessionId: traceId },
    timeoutMs: 120_000,
  });

  if (!result.success) {
    throw new Error(`ACP parse-doc failed: ${result.error?.message ?? 'unknown error'}`);
  }

  // agent 返回 JSON 数组(可能包裹在 markdown fence 中),复用已有解析器
  const tasks = parseTasksFromLLMOutput(result.output);
  return {
    tasks,
    source: 'acp',
    degraded: false,
    warnings: [],
  };
}

export async function parseDocTaskResult(
  context: InfrastructureContext,
  filePath: string,
  deps?: ParseDocDeps,
): Promise<ParseDocResult> {
  const logger = context.logger.getLogger('parse-doc');

  const absolutePath = context.environment.resolvePath(filePath);
  if (!context.environment.exists(absolutePath)) {
    throw new VectaHubError(`文件不存在: ${absolutePath}`, ErrorType.FILESYSTEM);
  }

  const docContent = context.environment.readFile(absolutePath);
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

  // 第二层:ACP agent 解析(transport 可用时)
  if (deps?.transport && deps?.descriptor) {
    try {
      const acpResult = await parseDocViaAcp(docContent, deps.transport, deps.descriptor);
      if (acpResult.tasks.length > 0) {
        logger.info(`ACP agent 解析到 ${acpResult.tasks.length} 个任务`);
        return acpResult;
      }
      logger.warn('ACP agent 解析未提取到任务，降级为正则解析');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`ACP agent 解析失败，降级为正则解析: ${message}`);
    }
  }

  // 第三层:regex fallback(transport 不可用或 ACP 失败时)
  const warning = 'LLM 解析已移除，已降级为正则解析';
  logger.warn(warning);
  const fallbackTasks = fallbackParseByRegex(docContent);
  if (fallbackTasks.length === 0) {
    throw new VectaHubError('正则解析未提取到任务，待 ACP 模式接入', ErrorType.CONFIGURATION);
  }
  logger.info(`正则 fallback 解析到 ${fallbackTasks.length} 个任务`);
  return {
    tasks: fallbackTasks,
    source: 'regex-fallback',
    degraded: true,
    warnings: [warning],
  };
}

export async function parseDocTasks(
  context: InfrastructureContext,
  filePath: string,
  deps?: ParseDocDeps,
): Promise<DocTask[]> {
  const result = await parseDocTaskResult(context, filePath, deps);
  return result.tasks;
}

export function parseTasksFromLLMOutput(output: string): DocTask[] {
  const cleaned = output.trim();

  // 去除 markdown code fence
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonSource = codeBlockMatch ? codeBlockMatch[1].trim() : cleaned;

  // 优先尝试直接解析整个字符串(ACP agent 通常返回纯 JSON)
  try {
    const parsed = JSON.parse(jsonSource);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return validateTasks(parsed as DocTask[]);
    }
  } catch {
    // 不是纯 JSON,继续尝试提取
  }

  // 降级:用括号匹配提取 JSON 数组(处理嵌套对象中的 ])
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < jsonSource.length; i++) {
    const ch = jsonSource[i];
    if (ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0 && start >= 0) {
        candidates.push(jsonSource.slice(start, i + 1));
        start = -1;
      }
    }
  }

  if (candidates.length === 0) {
    const preview = cleaned.substring(0, 200).replace(/\n/g, '\\n');
    throw new Error(`LLM 输出中未找到有效的 JSON 数组 (输出前 200 字符: ${preview})`);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return validateTasks(parsed as DocTask[]);
      }
    } catch {
      // 继续尝试下一个候选
    }
  }

  throw new Error('JSON 解析失败: 所有候选均无法解析');
}

/** 校验任务列表,确保每个任务有 id 和 label。 */
function validateTasks(tasks: DocTask[]): DocTask[] {
  for (const task of tasks) {
    if (!task.id || !task.label) {
      throw new Error('任务格式无效：每个任务必须包含 id 和 label');
    }
  }
  return tasks;
}

export function createParseDocCmd(context: InfrastructureContext): Command {
  const logger = context.logger.getLogger('parse-doc');
  const output = createParseDocCommandOutput();
  return new Command('parse-doc')
    .description('解析开发文档，提取结构化任务列表')
    .argument('<path>', '文档文件路径')
    .option('--json', '以 JSON 格式输出')
    .option('--plan', '生成 OrchestrationPlan 作为执行计划')
    .option('--tool <name>', '指定 ACP agent(如 opencode),启用 ACP 解析路径')
    .action(async (filePath: string, options: { json?: boolean; plan?: boolean; tool?: string }) => {
      if (options.json || options.plan) {
        context.logger.setMuted(true);
      }
      try {
        logger.info(`正在解析文档: ${filePath}`);

        // 可选构造 ACP transport:--tool 提供时按 run-task 同款方式构建
        let deps: ParseDocDeps | undefined;
        if (options.tool) {
          const descriptor = getAgentDescriptorById(options.tool) ?? {
            id: options.tool,
            displayName: options.tool,
            entryCommand: options.tool,
            promptTransport: 'arg' as const,
            nonInteractiveFlags: [],
            approvalPolicySupport: 'none' as const,
            structuredOutputSupport: false,
            preflightSpec: { versionArgs: [] },
            dryRunRenderMode: 'prompt-only' as const,
          };
          const acpConfig: AcpConfig = {
            agentId: options.tool,
            command: descriptor.entryCommand,
            args: descriptor.subcommand ? [descriptor.subcommand, 'acp'] : ['acp'],
            defaultTimeoutMs: 120_000,
            permissionMode: 'ask',
          };
          deps = { transport: createTransport(acpConfig), descriptor };
        }

        const result = await parseDocTaskResult(context, filePath, deps);
        const { tasks } = result;

        if (options.plan) {
          const planResult = await planFromDocTasks(tasks, {
            docPath: filePath,
            cwd: context.environment.getCwd(),
            source: 'document',
          });

          output.json({
            ok: true,
            tasks,
            source: result.source,
            degraded: result.degraded,
            warnings: result.warnings,
            plan: planResult.plan,
            planKind: planResult.kind,
            message: planResult.message,
          });
          return;
        } else if (options.json) {
          output.json({
            ok: true,
            tasks,
            source: result.source,
            degraded: result.degraded,
            warnings: result.warnings,
          });
          return;
        } else {
          output.log(`\n📋 解析到 ${tasks.length} 个任务:\n`);
          if (result.degraded) {
            for (const warning of result.warnings) {
              output.log(`  [warning] ${warning}`);
            }
            output.log('');
          }
          output.log('─'.repeat(60));
          for (const task of tasks) {
            output.log(`  ${task.id.padEnd(10)} ${task.label}`);
          }
          output.log('─'.repeat(60));
          output.log('');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json || options.plan) {
          output.json({ ok: false, error: message });
        } else {
          logger.error(`解析失败: ${message}`);
        }
        throw new VectaHubError(`解析失败: ${message}`, ErrorType.RUNTIME, error);
      }
    });
}
