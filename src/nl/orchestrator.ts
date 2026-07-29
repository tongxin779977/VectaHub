import type { NLResult } from './core/types.js';
import type { TaskList, IntentName, StepType } from '../types/index.js';
import type { ExecutionPlan, RouterResult } from './capabilities/types.js';
import type { ProjectContext } from './core/goal-types.js';
import type { AuditHelper } from '../infrastructure/audit/index.js';
import type { AgentTransport, TransportResult } from '../agent-runtime/transport/types.js';
import type { AcpConfig } from '../agent-runtime/transport/factory.js';
import type { AgentDescriptor } from '../types/agent.js';
import { createIntentSplitter } from './core/intent-splitter.js';
import { parseGoal } from './core/goal-parser.js';
import { createCapabilityRouter } from './capabilities/router.js';
import { executionPlanToSteps } from './capabilities/plan-adapter.js';
import { toTaskContractEnvelope } from './task-contract-adapter.js';
import type { TaskContractEnvelope } from '../types/task-contract.js';
import type pino from 'pino';

type NLLogger = Pick<pino.Logger, 'error'>;

/**
 * NL 处理器依赖集合。
 *
 * - `transport` / `agentDescriptor` / `acpConfig`: ACP fallback 所需,确定性路由未匹配时启用
 * - `auditHelper` / `logger`: 审计与日志(向后兼容,可选)
 *
 * 当确定性能力路由返回 fallback 时,若提供了 `transport` + `agentDescriptor`,
 * 将调用 `transport.execute()` 交给 ACP agent 处理;否则抛出错误(保持旧行为)。
 */
export interface NLProcessorDeps {
  /** ACP fallback 传输层;未提供时 fallback 路径抛错 */
  transport?: AgentTransport;
  /** 默认 ACP agent 描述符;fallback 必需 */
  agentDescriptor?: AgentDescriptor;
  /** ACP 超时/权限配置 */
  acpConfig?: AcpConfig;
  /** 审计助手(向后兼容) */
  auditHelper?: AuditHelper;
  /** 日志记录器(向后兼容) */
  logger?: NLLogger;
}

/**
 * 初始化路由（保留接口兼容性，当前为空实现）
 * @param _intentEntries - 意图条目列表
 */
export function initializeRouter(_intentEntries: Array<{ intent: string; category: string; patterns: RegExp[]; examples: string[]; priority: number }>): void {}

/**
 * 将 ACP TransportResult 映射为 NLResult。
 *
 * - success=true → NLResult(success, reply=output, metadata.path='acp-fallback', acpToolCalls/acpChangedFiles)
 * - success=false → NLResult(success=false, error=error.message, metadata.path='acp-fallback')
 *
 * @param result - ACP 传输层返回的结构化结果
 * @param input - 用户原始输入(用于填充 NLResult.input 等元数据)
 * @returns 映射后的 NLResult
 */
function transportResultToNLResult(
  result: TransportResult,
  _input: string,
): NLResult {
  if (result.success) {
    return {
      success: true,
      intent: 'UNKNOWN' as IntentName,
      confidence: 1,
      reply: result.output,
      metadata: {
        path: 'acp-fallback',
        acpToolCalls: result.toolCalls,
        acpChangedFiles: result.changedFiles,
      },
    };
  }

  return {
    success: false,
    intent: 'UNKNOWN' as IntentName,
    confidence: 0,
    reply: result.error?.message ?? 'ACP agent failed to process input',
    metadata: {
      path: 'acp-fallback',
    },
  };
}

/**
 * 处理用户自然语言输入，返回 NL 解析结果
 *
 * 处理流程：
 * 1. 意图拆分：检测是否为多意图输入
 * 2. Capability 路由：优先匹配已注册的 Capability
 * 3. ACP fallback：确定性路由未匹配时，交给 ACP agent 处理(需提供 transport)
 *
 * @param input - 用户原始输入
 * @param deps - NL 处理器依赖(transport/agentDescriptor/acpConfig/auditHelper/logger)
 * @returns NL 解析结果
 * @throws 多意图包含不可执行子句,或 fallback 时未提供 transport 时抛出错误
 */
export async function processInput(
  input: string,
  deps?: NLProcessorDeps,
): Promise<NLResult> {
  const splitter = createIntentSplitter();
  const splitResult = await splitter.split(input);

  const clauses = splitResult.clauses?.map(clause => clause.text.trim()).filter(Boolean) ?? [];
  if (splitResult.isMultiIntent && clauses.length > 1) {
    return handleMultiIntent(clauses, deps);
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

  // ACP fallback: 确定性路由未匹配时,交给 ACP agent 处理
  return executeAcpFallback(normalizedInput, deps, context);
}

export async function processInputWithTaskContract(
  input: string,
  deps?: NLProcessorDeps,
): Promise<TaskContractEnvelope<NLResult>> {
  const legacy = await processInput(input, deps);
  return toTaskContractEnvelope(input, legacy);
}

/**
 * 执行 ACP fallback:确定性路由未匹配时,将输入交给 ACP agent 处理。
 *
 * 需要提供 `deps.transport` + `deps.agentDescriptor`,否则抛错(保持向后兼容)。
 * 构造 TransportRequest → transport.execute() → transportResultToNLResult() 映射。
 *
 * @param input - 用户原始输入(或拆分后的子句)
 * @param deps - NL 处理器依赖
 * @param context - 项目上下文(提供 cwd)
 * @returns 映射后的 NLResult
 */
async function executeAcpFallback(
  input: string,
  deps: NLProcessorDeps | undefined,
  context: ProjectContext,
): Promise<NLResult> {
  if (!deps?.transport) {
    throw new Error('Capability routing returned fallback; ACP transport not provided. Pass NLProcessorDeps.transport to enable ACP fallback.');
  }
  if (!deps.agentDescriptor) {
    throw new Error('ACP fallback requires agentDescriptor; none provided in NLProcessorDeps.');
  }

  const workspaceRoot = context.cwd ?? process.cwd();
  const traceId = `nl-fallback-${Date.now()}`;
  const acpResult = await deps.transport.execute({
    descriptor: deps.agentDescriptor,
    workspaceRoot,
    taskPrompt: input,
    mode: 'run',
    traceContext: { traceId, source: 'cli' },
    parentSpanId: '',
    securityContext: {
      cwd: workspaceRoot,
      sessionId: traceId,
    },
    timeoutMs: deps.acpConfig?.defaultTimeoutMs ?? 600_000,
  });

  return transportResultToNLResult(acpResult, input);
}

async function handleMultiIntent(
  clauses: string[],
  deps?: NLProcessorDeps,
): Promise<NLResult> {
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

    // ACP fallback: 确定性路由未匹配时,交给 ACP agent 处理
    return executeAcpFallback(clause, deps, context);
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
      path: 'rule-based',
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
  intentRecognitionMethod: 'capability' | 'none';
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
  deps?: NLProcessorDeps,
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

  // ACP fallback: 确定性路由未匹配时,交给 ACP agent 处理
  if (deps?.transport) {
    const nlResult = await executeAcpFallback(input, deps, context);
    return {
      steps: [],
      reply: nlResult.reply,
      plan: routeResult.plan ?? undefined,
      intentRecognitionMethod: 'none',
      matchedCapability: routeResult.matchedCapability,
      score: routeResult.score,
    };
  }
  throw new Error('Capability routing returned fallback; ACP transport not provided. Pass NLProcessorDeps.transport to enable ACP fallback.');
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
 * @param deps - NL 处理器依赖(transport/agentDescriptor/acpConfig),用于 ACP fallback
 * @returns 编排结果
 * @throws 多意图包含不可执行子句或无步骤产出时抛出错误
 */
export async function orchestrateIntent(
  input: string,
  options?: { cwd?: string; auditHelper?: AuditHelper; logger?: NLLogger },
  deps?: NLProcessorDeps,
): Promise<OrchestrateResult> {
  const splitter = createIntentSplitter();
  const splitResult = await splitter.split(input);
  const clauses = splitResult.clauses?.map(clause => clause.text.trim()).filter(Boolean) ?? [];

  if (splitResult.isMultiIntent && clauses.length > 1) {
    const clauseResults = await Promise.all(
      clauses.map(clause => orchestrateSingleIntent(clause, options, deps))
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

    return {
      steps,
      reply: combinedReply || undefined,
      intentRecognitionMethod: allCapability ? 'capability' : 'none',
      score: Math.min(...clauseResults.map(result => result.score ?? 0)),
    };
  }

  const singleInput = clauses[0] ?? input.trim();
  return orchestrateSingleIntent(singleInput, options, deps);
}
