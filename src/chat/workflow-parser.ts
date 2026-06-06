/**
 * 工作流 YAML 解析与步骤映射。
 * 负责将 LLM 生成的 YAML 文本转换为引擎可执行的 `Step[]`。
 * 内置解析缓存，对相同 YAML 输入直接返回缓存的步骤数组。
 * @module chat/workflow-parser
 */
import type { Step } from '../types/index.js';
import { parseYAML } from './yaml-parser.js';
import { SimpleCache } from './utils.js';

/** 工作流解析缓存 TTL（毫秒），60 秒 */
const WORKFLOW_CACHE_TTL_MS = 60_000;

/** 工作流解析缓存最大容量 */
const WORKFLOW_CACHE_MAX_SIZE = 50;

/** 模块级工作流解析缓存 */
const workflowCache = new SimpleCache<Step[]>(WORKFLOW_CACHE_TTL_MS, WORKFLOW_CACHE_MAX_SIZE);

/**
 * YAML 解析后的原始工作流步骤结构（未经过引擎验证）。
 */
export interface ParsedWorkflowStep {
  id?: string;
  type?: string;
  cli?: string;
  command?: string;
  args?: unknown[];
  body?: ParsedWorkflowStep[];
  condition?: unknown;
  items?: unknown;
  outputVar?: unknown;
}

/**
 * 规范化 `outputVar` 字段，将非字符串或空字符串统一为 `undefined`。
 */
function normalizeOutputVar(outputVar: unknown): string | undefined {
  if (typeof outputVar !== 'string') {
    return undefined;
  }

  const trimmedOutputVar = outputVar.trim();
  return trimmedOutputVar.length > 0 ? trimmedOutputVar : undefined;
}

/**
 * 将未知值数组转换为字符串数组。
 */
function toStringArgs(args: unknown): string[] {
  if (!Array.isArray(args)) {
    return [];
  }

  return args.map(arg => String(arg));
}

/**
 * 将单个原始步骤映射为引擎所需的 `Step` 类型。
 * 递归处理 `for_each`、`if`、`parallel` 等嵌套步骤。
 *
 * @param step - 原始解析步骤
 * @param fallbackId - 当步骤缺少 `id` 时使用的回退标识
 * @returns 引擎标准 `Step` 对象
 * @throws 当步骤类型不合法或缺少必填字段时抛出 `Error`
 */
export function mapWorkflowStep(step: ParsedWorkflowStep, fallbackId: string): Step {
  const id = step.id?.trim() || fallbackId;
  const outputVar = normalizeOutputVar(step.outputVar);
  const type = step.type ?? 'exec';

  switch (type) {
    case 'exec': {
      const cli = typeof step.cli === 'string'
        ? step.cli
        : typeof step.command === 'string'
          ? step.command
          : undefined;

      if (!cli?.trim()) {
        throw new Error(`Workflow exec step "${id}" is missing cli`);
      }

      return {
        id,
        type: 'exec',
        cli,
        args: toStringArgs(step.args),
        outputVar,
      };
    }
    case 'for_each': {
      if (typeof step.items !== 'string' || step.items.trim().length === 0) {
        throw new Error(`Workflow for_each step "${id}" is missing items`);
      }
      if (!Array.isArray(step.body) || step.body.length === 0) {
        throw new Error(`Workflow for_each step "${id}" is missing body`);
      }

      return {
        id,
        type: 'for_each',
        items: step.items,
        body: step.body.map((bodyStep, index) => mapWorkflowStep(bodyStep, `${id}_body_${index + 1}`)),
        outputVar,
      };
    }
    case 'if': {
      if (typeof step.condition !== 'string' || step.condition.trim().length === 0) {
        throw new Error(`Workflow if step "${id}" is missing condition`);
      }
      if (!Array.isArray(step.body) || step.body.length === 0) {
        throw new Error(`Workflow if step "${id}" is missing body`);
      }

      return {
        id,
        type: 'if',
        condition: step.condition,
        body: step.body.map((bodyStep, index) => mapWorkflowStep(bodyStep, `${id}_body_${index + 1}`)),
        outputVar,
      };
    }
    case 'parallel': {
      if (!Array.isArray(step.body) || step.body.length === 0) {
        throw new Error(`Workflow parallel step "${id}" is missing body`);
      }

      return {
        id,
        type: 'parallel',
        body: step.body.map((bodyStep, index) => mapWorkflowStep(bodyStep, `${id}_body_${index + 1}`)),
        outputVar,
      };
    }
    default:
      throw new Error(`Unsupported workflow step type: ${type}`);
  }
}

/**
 * 解析工作流 YAML 文本，返回引擎可执行的步骤数组。
 * 内置缓存机制：相同 YAML 输入在 TTL 内直接返回缓存的步骤数组。
 *
 * @param workflowYAML - 工作流 YAML 字符串
 * @returns 解析并映射后的 `Step[]`
 * @throws 当 YAML 缺少 `steps` 数组或步骤无效时抛出 `Error`
 */
export function parseWorkflowSteps(workflowYAML: string): Step[] {
  const cached = workflowCache.get(workflowYAML);
  if (cached !== undefined) {
    return cached;
  }

  const parsedYaml = parseYAML<{ steps?: ParsedWorkflowStep[] } | null>(workflowYAML);
  if (!parsedYaml || !Array.isArray(parsedYaml.steps)) {
    throw new Error('Workflow YAML must contain a steps array');
  }

  const steps = parsedYaml.steps.map((step, index) => mapWorkflowStep(step, `step_${index + 1}`));
  workflowCache.set(workflowYAML, steps);
  return steps;
}

/**
 * 清空工作流解析缓存。
 * 在测试或配置变更时调用。
 */
export function clearWorkflowCache(): void {
  workflowCache.clear();
}
