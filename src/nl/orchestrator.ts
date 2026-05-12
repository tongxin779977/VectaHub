import type { NLResult } from './core/types.js';
import type { TaskList, IntentName, StepType } from '../types/index.js';
import type { ExecutionPlan } from './capabilities/types.js';
import { createNLProcessor } from './core/pipeline.js';
import { createIntentSplitter } from './core/intent-splitter.js';
import { createLLMConfig, type LLMConfig } from './llm.js';

export function initializeRouter(_intentEntries: Array<{ intent: string; category: string; patterns: RegExp[]; examples: string[]; priority: number }>): void {}

export async function processInput(
  input: string,
  llmConfig?: LLMConfig,
): Promise<NLResult> {
  const splitter = createIntentSplitter();
  const splitResult = await splitter.split(input);

  if (splitResult.isMultiIntent && splitResult.intents.length > 1) {
    return handleMultiIntent(splitResult.intents);
  }

  if (!llmConfig) {
    throw new Error('LLM config required for semantic intent recognition. Configure llmConfig to enable LLM-based processing.');
  }

  const processor = createNLProcessor({ llmConfig });
  return processor.parse({ input });
}

async function handleMultiIntent(
  intents: Array<{ intent: string; confidence: number; params?: Record<string, unknown> }>,
): Promise<NLResult> {
  const taskList: TaskList = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    originalInput: intents.map(i => i.intent).join('; '),
    intent: 'UNKNOWN' as IntentName,
    confidence: Math.min(...intents.map(i => i.confidence)),
    entities: {} as Record<string, string[]>,
    tasks: intents.map(intent => ({
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'QUERY_EXEC' as const,
      description: intent.intent,
      status: 'PENDING' as const,
      commands: [],
      dependencies: [],
    })),
    warnings: [],
  };

  return {
    success: true,
    confidence: 0.8,
    taskList,
    metadata: {
      path: 'category-router',
    },
  };
}

export interface OrchestrateStep {
  id: string;
  description: string;
  status: string;
  cli: string;
  args: string[];
  type: StepType;
}

export interface OrchestrateResult {
  steps: OrchestrateStep[];
  plan?: ExecutionPlan;
  intentRecognitionMethod: 'capability' | 'llm' | 'none';
  matchedCapability?: string;
  score?: number;
  recognizedIntent?: string;
}

export async function orchestrateIntent(
  input: string,
  _options?: { cwd?: string },
): Promise<OrchestrateResult> {
  const llmConfig = createLLMConfig();
  if (!llmConfig) {
    throw new Error('LLM not configured. Run `vectahub setup` or set VECTAHUB_LLM_* environment variables.');
  }

  const result = await processInput(input, llmConfig);

  return {
    steps: result.taskList?.tasks.map(t => ({
      id: t.id,
      description: t.description,
      status: t.status,
      cli: t.commands?.[0]?.cli ?? '',
      args: t.commands?.[0]?.args ?? [],
      type: 'exec' as StepType,
    })) ?? [],
    intentRecognitionMethod: result.metadata.path === 'category-router' ? 'capability' : 'llm',
    recognizedIntent: result.intent as string | undefined,
    score: result.confidence,
  };
}
