import type { ParseResult, TaskList } from '../types/index.js';
import { audit } from '../utils/audit.js';
import { EnvironmentDetector } from '../workflow/ai-env-detector.js';
import { ProviderRegistry } from '../workflow/ai-provider-registry.js';
import { delegateExecutor } from '../workflow/ai-delegate.js';
import type { AIDelegateProvider } from '../workflow/ai-delegate.js';
import { loadAIConfig } from '../utils/ai-config.js';
import { callLLM, detectAPIKey, type LLMMessage } from './llm-client.js';
import { getAvailableExternalCLI } from '../setup/cli-scanner.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ai-intent-resolver');

const AI_INTENT_PROMPT = `你是一个自然语言到 CLI 工作流的解析器。不要思考，不要推理，直接输出 JSON。
用户输入自然语言指令，你需要将其解析为结构化的任务列表。

支持的 CLI 工具: git, npm, yarn, pnpm, node, find, grep, ls, cp, mv, rm, chmod, tar, zip, docker, curl, ping

返回格式必须是严格的 JSON，不要任何解释：
{
  "intent": "意图名称(大写下划线)",
  "confidence": 0.9,
  "tasks": [
    {
      "cli": "命令",
      "args": ["参数1", "参数2"]
    }
  ]
}

用户输入: {{input}}
`;

export interface AIIntentResult {
  success: boolean;
  parseResult?: ParseResult;
  error?: string;
  source?: 'external_cli' | 'vectahub' | 'rules';
}

export async function resolveIntentWithAI(input: string, sessionId?: string): Promise<AIIntentResult> {
  try {
    // 优先级 1: VectaHub 自身 LLM API (真实 LLM 优先)
    const apiKey = detectAPIKey();
    console.log(`[resolveIntentWithAI] API Key detected:`, apiKey ? 'Yes' : 'No');
    if (apiKey) {
      const result = await resolveWithVectaHubLLM(input, apiKey, sessionId);
      console.log(`[resolveIntentWithAI] VectaHub LLM success:`, result.success);
      if (result.success) {
        return result;
      }
    }

    // 优先级 2: 外部 CLI 工具（有权限）
    const availableCLI = getAvailableExternalCLI();
    if (availableCLI.length > 0) {
      const result = await resolveWithExternalCLI(availableCLI[0], input, sessionId);
      if (result.success) {
        return result;
      }
    }

    // 降级到规则匹配（在 run.ts 中处理）
    return {
      success: false,
      error: 'AI 暂时不可用，使用规则解析',
      source: 'rules',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveWithExternalCLI(toolName: string, input: string, sessionId?: string): Promise<AIIntentResult> {
  const providerMap: Record<string, AIDelegateProvider> = {
    gemini: 'gemini',
    claude: 'claude',
    codex: 'codex',
    aider: 'aider',
  };

  const provider = providerMap[toolName];
  if (!provider) {
    return { success: false, error: `Unknown CLI tool: ${toolName}` };
  }

  const prompt = AI_INTENT_PROMPT.replace('{{input}}', input);

  const result = await delegateExecutor.delegate({
    provider,
    prompt,
    timeout: 30000,
  });

  if (!result.success || !result.output) {
    return {
      success: false,
      error: result.error || `${toolName} CLI failed`,
    };
  }

  const parsed = parseAIOutput(result.output, input);

  if (sessionId) {
    audit.cliCommand('ai-resolve', [`${toolName} CLI`, input.substring(0, 50)], sessionId);
  }

  return {
    success: true,
    parseResult: parsed,
    source: 'external_cli',
  };
}

async function resolveWithVectaHubLLM(
  input: string,
  apiKey: { 
    provider: string; 
    key: string; 
    baseUrl?: string; 
    model?: string;
    max_tokens?: number;
    temperature?: number;
    timeout_ms?: number;
  },
  sessionId?: string
): Promise<AIIntentResult> {
  const messages: LLMMessage[] = [
    { role: 'system', content: '你是一个 CLI 工作流意图解析器。不要思考，直接输出 JSON。' },
    { role: 'user', content: AI_INTENT_PROMPT.replace('{{input}}', input) },
  ];

  const result = await callLLM(messages, {
    apiKey: apiKey.key,
    baseUrl: apiKey.baseUrl,
    model: apiKey.model,
    maxTokens: apiKey.max_tokens ?? 4096,
    temperature: apiKey.temperature ?? 0.1,
    timeout: apiKey.timeout_ms ?? 60000,
  });

  if (!result.content) {
    return { success: false, error: 'Empty LLM response' };
  }

  const parsed = parseAIOutput(result.content, input);

  if (sessionId) {
    audit.cliCommand('ai-resolve', [`VectaHub(${apiKey.provider})`, input.substring(0, 50)], sessionId);
  }

  return {
    success: true,
    parseResult: parsed,
    source: 'vectahub',
  };
}

function parseAIOutput(output: string, input: string): ParseResult {
  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI output');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const taskList: TaskList = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      originalInput: input,
      intent: parsed.intent || 'UNKNOWN',
      confidence: parsed.confidence || 0.8,
      entities: {
        FILE_PATH: [],
        CLI_TOOL: [],
        PACKAGE_NAME: [],
        FUNCTION_NAME: [],
        BRANCH_NAME: [],
        ENV: [],
        OPTIONS: [],
      },
      tasks: (parsed.tasks || []).map((t: any, i: number) => ({
        id: `task_${i + 1}`,
        type: 'QUERY_EXEC',
        description: t.cli + ' ' + (t.args || []).join(' '),
        status: 'PENDING' as const,
        commands: [{ cli: t.cli, args: t.args || [] }],
        dependencies: [],
        estimatedDuration: 5000,
      })),
      warnings: [],
    };

    return {
      status: 'SUCCESS',
      taskList,
      confidenceLevel: 'HIGH',
      originalInput: input,
    };
  } catch {
    return {
      status: 'NEEDS_CLARIFICATION',
      confidenceLevel: 'UNCERTAIN',
      originalInput: input,
      candidates: [],
    };
  }
}
