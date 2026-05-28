import type { NLResult } from './core/types.js';
import type { TaskList, IntentName, StepType } from '../types/index.js';
import type { ExecutionPlan, RouterResult } from './capabilities/types.js';
import type { ProjectContext } from './core/goal-types.js';
import type { AuditHelper } from '../infrastructure/audit/index.js';
import { createNLProcessor } from './core/pipeline.js';
import { createIntentSplitter } from './core/intent-splitter.js';
import { createLLMConfig, type LLMConfig } from './llm.js';
import { parseGoal } from './core/goal-parser.js';
import { createCapabilityRouter } from './capabilities/router.js';
import { executionPlanToSteps } from './capabilities/plan-adapter.js';
import type pino from 'pino';

type NLLogger = Pick<pino.Logger, 'error'>;

/**
 * 初始化路由（保留接口兼容性，当前为空实现）
 * @param _intentEntries - 意图条目列表
 */
export function initializeRouter(_intentEntries: Array<{ intent: string; category: string; patterns: RegExp[]; examples: string[]; priority: number }>): void {}

/**
 * 处理用户自然语言输入，返回 NL 解析结果
 *
 * 处理流程：
 * 1. 意图拆分：检测是否为多意图输入
 * 2. Capability 路由：优先匹配已注册的 Capability
 * 3. LLM 降级：Capability 未匹配时使用 LLM 解析
 *
 * @param input - 用户原始输入
 * @param llmConfig - 可选的 LLM 配置（LLM 降级时必需）
 * @param auditHelper - 可选的审计助手（LLM 降级时必需）
 * @param logger - 可选的日志记录器
 * @returns NL 解析结果
 * @throws 多意图包含不可执行子句时抛出错误
 */
export async function processInput(
  input: string,
  llmConfig?: LLMConfig,
  auditHelper?: AuditHelper,
  logger?: NLLogger,
): Promise<NLResult> {
  const splitter = createIntentSplitter();
  const splitResult = await splitter.split(input);

  const clauses = splitResult.clauses?.map(clause => clause.text.trim()).filter(Boolean) ?? [];
  if (splitResult.isMultiIntent && clauses.length > 1) {
    return handleMultiIntent(clauses, llmConfig, auditHelper, logger);
  }

  const normalizedInput = input.trim();
  const context = buildProjectContext(normalizedInput);
  const routeResult = routeCapability(normalizedInput, context);
  if (routeResult.route === 'auto' && routeResult.plan) {
    return capabilityPlanToNLResult(normalizedInput, routeResult.plan, routeResult);
  }
  if (routeResult.route === 'preview' && routeResult.plan) {
    return capabilityNoTaskNLResult(normalizedInput, routeResult, 'capability preview is not executable');
  }
  if (routeResult.route === 'clarify') {
    return capabilityNoTaskNLResult(normalizedInput, routeResult, 'clarification required before execution');
  }

  const processor = createNLProcessor({
    llmConfig: requireLLMConfigForFallback(llmConfig),
    auditHelper: requireAuditHelperForFallback(auditHelper),
    logger: requireLoggerForFallback(logger),
  });
  return processor.parse({ input: normalizedInput });
}

function requireLLMConfigForFallback(llmConfig?: LLMConfig): LLMConfig {
  if (!llmConfig) {
    throw new Error('LLM config required for fallback processing. Configure llmConfig when capability routing returns fallback.');
  }
  return llmConfig;
}

function requireAuditHelperForFallback(auditHelper?: AuditHelper): AuditHelper {
  if (!auditHelper) {
    throw new Error('Audit helper required for fallback processing. Provide auditHelper when capability routing returns fallback.');
  }
  return auditHelper;
}

function requireLoggerForFallback(logger?: NLLogger): NLLogger {
  if (!logger) {
    throw new Error('Logger required for fallback processing. Provide logger when capability routing returns fallback.');
  }
  return logger;
}

async function handleMultiIntent(
  clauses: string[],
  llmConfig?: LLMConfig,
  auditHelper?: AuditHelper,
  logger?: NLLogger,
): Promise<NLResult> {
  let fallbackProcessor: ReturnType<typeof createNLProcessor> | null = null;
  const getFallbackProcessor = (): ReturnType<typeof createNLProcessor> => {
    if (!fallbackProcessor) {
      fallbackProcessor = createNLProcessor({
        llmConfig: requireLLMConfigForFallback(llmConfig),
        auditHelper: requireAuditHelperForFallback(auditHelper),
        logger: requireLoggerForFallback(logger),
      });
    }
    return fallbackProcessor;
  };

  const clauseResults = await Promise.all(clauses.map(async clause => {
    const context = buildProjectContext(clause);
    const routeResult = routeCapability(clause, context);
    if (routeResult.route === 'auto' && routeResult.plan) {
      return capabilityPlanToNLResult(clause, routeResult.plan, routeResult);
    }
    if (routeResult.route === 'preview') {
      return capabilityNoTaskNLResult(clause, routeResult, 'capability preview is not executable');
    }
    if (routeResult.route === 'clarify') {
      return capabilityNoTaskNLResult(clause, routeResult, 'clarification required before execution');
    }

    return getFallbackProcessor().parse({ input: clause });
  }));

  const hasNonExecutableClause = clauseResults.some(result => mapTaskListToSteps(result.taskList).length === 0 && !result.reply);
  if (hasNonExecutableClause) {
    throw new Error('Multi-intent contains non-executable clause; clarification or preview required');
  }

  const taskResults = clauseResults.flatMap((result, clauseIndex) => {
    const tasks = result.taskList?.tasks ?? [];
    return tasks.map((task, taskIndex) => ({
      ...task,
      id: `clause-${clauseIndex + 1}-task-${taskIndex + 1}-${task.id}`,
    }));
  });

  if (taskResults.length === 0) {
    throw new Error('Multi-intent parsing did not produce executable tasks');
  }

  const minConfidence = Math.min(...clauseResults.map(result => result.confidence));
  const baseTaskList = clauseResults.find(result => result.taskList)?.taskList;
  if (!baseTaskList) {
    throw new Error('Multi-intent parsing did not produce task list metadata');
  }

  const taskList: TaskList = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    originalInput: clauses.join('; '),
    intent: 'UNKNOWN' as IntentName,
    confidence: minConfidence,
    entities: baseTaskList.entities,
    tasks: taskResults,
    warnings: [],
  };

  return {
    success: true,
    confidence: minConfidence,
    taskList,
    metadata: {
      path: 'llm-tool-calling',
    },
  };
}

/**
 * 编排步骤定义
 */
export interface OrchestrateStep {
  id: string;
  description: string;
  status: string;
  cli: string;
  args: string[];
  type: StepType;
  outputVar?: string;
}

/**
 * 编排结果
 */
export interface OrchestrateResult {
  steps: OrchestrateStep[];
  plan?: ExecutionPlan;
  reply?: string;
  intentRecognitionMethod: 'capability' | 'llm' | 'none';
  matchedCapability?: string;
  score?: number;
  recognizedIntent?: string;
}

function toOrchestrateType(type: string | undefined): StepType {
  if (type === 'for_each' || type === 'if' || type === 'parallel' || type === 'opencli' || type === 'delegate') {
    return type;
  }
  return 'exec';
}

function mapTaskListToSteps(taskList: TaskList | undefined): OrchestrateStep[] {
  if (!taskList) {
    return [];
  }

  const steps: OrchestrateStep[] = [];
  for (const task of taskList.tasks) {
    const commands = task.commands ?? [];
    for (let i = 0; i < commands.length; i += 1) {
      const command = commands[i];
      const cli = command.cli?.trim() ?? '';
      if (!cli) {
        continue;
      }

      const hasMultipleCommands = commands.length > 1;
      steps.push({
        id: hasMultipleCommands ? `${task.id}-cmd-${i + 1}` : task.id,
        description: hasMultipleCommands
          ? `${task.description} (${i + 1}/${commands.length})`
          : task.description,
        status: task.status,
        cli,
        args: command.args ?? [],
        type: 'exec',
        outputVar: command.outputVar,
      });
    }
  }

  return steps;
}

function mapPlanToSteps(plan: ExecutionPlan): OrchestrateStep[] {
  const planStepMap = new Map(plan.steps.map(step => [step.id, step]));
  return executionPlanToSteps(plan).map((step, index) => {
    const sourceStep = planStepMap.get(step.id);
    return {
      id: step.id,
      description: sourceStep?.label ?? `Step ${index + 1}`,
      status: 'PENDING',
      cli: step.cli ?? '',
      args: step.args ?? [],
      type: toOrchestrateType(step.type),
      outputVar: sourceStep?.outputVar,
    };
  });
}

function buildProjectContext(input: string, options?: { cwd?: string }): ProjectContext {
  return {
    cwd: options?.cwd,
    rawInput: input,
  };
}

function routeCapability(input: string, context?: ProjectContext): RouterResult {
  const capabilityRouter = createCapabilityRouter();
  const goal = parseGoal(input);
  return capabilityRouter.route(goal, context);
}

function capabilityPlanToNLResult(
  input: string,
  plan: ExecutionPlan,
  routeResult: RouterResult,
): NLResult {
  return {
    success: true,
    intent: 'UNKNOWN' as IntentName,
    confidence: routeResult.score ?? plan.goal.confidence,
    taskList: {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      originalInput: input,
      intent: 'UNKNOWN' as IntentName,
      confidence: routeResult.score ?? plan.goal.confidence,
      entities: {
        FILE_PATH: [],
        CLI_TOOL: [],
        PACKAGE_NAME: [],
        FUNCTION_NAME: [],
        BRANCH_NAME: [],
        ENV: [],
        OPTIONS: [],
        HOST: [],
        PORT: [],
        OWNER: [],
        MODE: [],
        FILE1: [],
        FILE2: [],
      },
      tasks: [{
        id: plan.id,
        type: 'CODE_TRANSFORM',
        description: plan.label,
        status: 'PENDING',
        commands: executionPlanToSteps(plan)
          .map(step => ({
            cli: step.cli ?? '',
            args: step.args ?? [],
            outputVar: step.outputVar,
          }))
          .filter(command => command.cli.trim().length > 0),
        dependencies: [],
      }],
      warnings: [],
    },
    metadata: {
      path: 'category-router',
      usedSkills: [],
      fallbackReason: routeResult.reason,
    },
  };
}

function capabilityNoTaskNLResult(
  input: string,
  routeResult: RouterResult,
  warning: string,
): NLResult {
  return {
    success: true,
    intent: 'UNKNOWN' as IntentName,
    confidence: routeResult.score ?? 0,
    taskList: {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      originalInput: input,
      intent: 'UNKNOWN' as IntentName,
      confidence: routeResult.score ?? 0,
      entities: {
        FILE_PATH: [],
        CLI_TOOL: [],
        PACKAGE_NAME: [],
        FUNCTION_NAME: [],
        BRANCH_NAME: [],
        ENV: [],
        OPTIONS: [],
        HOST: [],
        PORT: [],
        OWNER: [],
        MODE: [],
        FILE1: [],
        FILE2: [],
      },
      tasks: [],
      warnings: [warning],
    },
    metadata: {
      path: 'category-router',
      usedSkills: [],
      fallbackReason: routeResult.reason,
    },
  };
}

async function orchestrateSingleIntent(
  input: string,
  options?: { cwd?: string; auditHelper?: AuditHelper; logger?: NLLogger },
): Promise<OrchestrateResult> {
  const context = buildProjectContext(input, options);
  const routeResult = routeCapability(input, context);

  switch (routeResult.route) {
    case 'auto': {
      if (!routeResult.plan) {
        throw new Error('Capability auto route missing execution plan');
      }
      const steps = mapPlanToSteps(routeResult.plan);
      if (steps.length === 0) {
        throw new Error('Capability routing produced no executable steps');
      }
      return {
        steps,
        plan: routeResult.plan,
        intentRecognitionMethod: 'capability',
        matchedCapability: routeResult.matchedCapability ?? routeResult.plan.capabilityId,
        score: routeResult.score ?? routeResult.plan.goal.confidence,
      };
    }
    case 'preview': {
      if (!routeResult.plan) {
        throw new Error('Capability preview route missing execution plan');
      }
      return {
        steps: [],
        plan: routeResult.plan,
        intentRecognitionMethod: 'capability',
        matchedCapability: routeResult.matchedCapability ?? routeResult.plan.capabilityId,
        score: routeResult.score ?? routeResult.plan.goal.confidence,
      };
    }
    case 'clarify':
      return {
        steps: [],
        plan: routeResult.plan ?? undefined,
        intentRecognitionMethod: 'none',
        matchedCapability: routeResult.matchedCapability,
        score: routeResult.score,
      };
    case 'fallback':
      break;
    default: {
      const neverRoute: never = routeResult.route;
      throw new Error(`Unsupported capability route: ${neverRoute}`);
    }
  }

  const llmConfig = createLLMConfig();
  if (!llmConfig) {
    throw new Error('LLM not configured. Run `vectahub setup` or set VECTAHUB_LLM_* environment variables.');
  }

  const llmResult = await processInput(input, llmConfig, options?.auditHelper, options?.logger);
  const steps = mapTaskListToSteps(llmResult.taskList);
  
  if (steps.length === 0 && !llmResult.reply) {
    throw new Error('NL parsing produced no executable steps');
  }

  return {
    steps,
    reply: llmResult.reply,
    intentRecognitionMethod: 'llm',
    recognizedIntent: llmResult.intent as string | undefined,
    score: llmResult.confidence,
  };
}

/**
 * 编排用户意图，返回可执行的步骤列表
 *
 * 支持多意图输入：自动拆分后分别编排，合并结果。
 * 优先使用 Capability 路由，未匹配时降级到 LLM 解析。
 *
 * @param input - 用户原始输入
 * @param options.cwd - 可选的工作目录
 * @param options.auditHelper - 可选的审计助手
 * @param options.logger - 可选的日志记录器
 * @returns 编排结果
 * @throws 多意图包含不可执行子句或无步骤产出时抛出错误
 */
export async function orchestrateIntent(
  input: string,
  options?: { cwd?: string; auditHelper?: AuditHelper; logger?: NLLogger },
): Promise<OrchestrateResult> {
  const splitter = createIntentSplitter();
  const splitResult = await splitter.split(input);
  const clauses = splitResult.clauses?.map(clause => clause.text.trim()).filter(Boolean) ?? [];

  if (splitResult.isMultiIntent && clauses.length > 1) {
    const clauseResults = await Promise.all(
      clauses.map(clause => orchestrateSingleIntent(clause, options))
    );

    const hasNonExecutableClause = clauseResults.some(result => result.steps.length === 0 && !result.reply);
    if (hasNonExecutableClause) {
      throw new Error('Multi-intent contains non-executable clause; clarification or preview required');
    }

    const steps = clauseResults.flatMap(result => result.steps);
    const combinedReply = clauseResults.map(r => r.reply).filter(Boolean).join('\n\n');
    
    if (steps.length === 0 && !combinedReply) {
      throw new Error('Multi-intent parsing produced no executable steps');
    }
    const allCapability = clauseResults.every(result => result.intentRecognitionMethod === 'capability');
    const hasLLM = clauseResults.some(result => result.intentRecognitionMethod === 'llm');

    return {
      steps,
      reply: combinedReply || undefined,
      intentRecognitionMethod: allCapability ? 'none' : (hasLLM ? 'llm' : 'none'),
      score: Math.min(...clauseResults.map(result => result.score ?? 0)),
    };
  }

  const singleInput = clauses[0] ?? input.trim();
  return orchestrateSingleIntent(singleInput, options);
}
