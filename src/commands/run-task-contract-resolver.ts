/**
 * run 命令的 TaskContract 解析器。
 * 将 orchestrateIntent 结果转换为 TaskContractEnvelope，
 * 作为 run 的 TaskContract-first 分流入口。
 * 可通过 mock 替换以测试不同合同场景。
 * @module commands/run-task-contract-resolver
 */
import type { OrchestrateResult } from '../nl/orchestrator.js';
import type { NLResult } from '../nl/core/types.js';
import type { IntentName } from '../types/index.js';
import type { TaskContractEnvelope } from '../types/task-contract.js';
import { toTaskContractEnvelope } from '../nl/task-contract-adapter.js';

const EMPTY_ENTITIES = {
  FILE_PATH: [], CLI_TOOL: [], PACKAGE_NAME: [], FUNCTION_NAME: [],
  BRANCH_NAME: [], ENV: [], OPTIONS: [], HOST: [], PORT: [],
  OWNER: [], MODE: [], FILE1: [], FILE2: [],
};

function orchestrateResultToNLResult(result: OrchestrateResult, rawInput: string): NLResult {
  const intent = (result.recognizedIntent ?? 'UNKNOWN') as IntentName;
  const hasTasks = result.steps.length > 0;
  return {
    success: true,
    intent,
    confidence: result.score ?? 0,
    reply: result.reply,
    taskList: hasTasks ? {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      originalInput: rawInput,
      intent,
      confidence: result.score ?? 0,
      entities: EMPTY_ENTITIES,
      tasks: [{
        id: 'task_orchestrate',
        type: 'CODE_TRANSFORM',
        description: 'orchestrated task',
        status: 'PENDING',
        commands: result.steps.map(s => ({ cli: s.cli, args: s.args, outputVar: s.outputVar })),
        dependencies: [],
      }],
      warnings: [],
    } : undefined,
    metadata: {
      path: result.intentRecognitionMethod === 'capability' ? 'category-router' : 'llm-tool-calling',
    },
  };
}

/**
 * 将 orchestrateIntent 结果转换为 TaskContractEnvelope。
 * 这是 run 命令的 TaskContract 生成入口，可通过 mock 替换。
 *
 * @param result - orchestrateIntent 返回的结果
 * @param rawInput - 原始用户输入
 * @returns TaskContractEnvelope
 */
export function resolveRunTaskContract(
  result: OrchestrateResult,
  rawInput: string,
): TaskContractEnvelope<NLResult> {
  const nlResult = orchestrateResultToNLResult(result, rawInput);
  return toTaskContractEnvelope(rawInput, nlResult);
}
