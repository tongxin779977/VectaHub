import type { ILlmInferencer, LlmInferenceResult, CliDetectionResult } from '../types/provider.js';
import type { AgentDescriptor } from '../types/agent.js';
import { LLMClient, resolveLLMConfig } from '../nl/llm.js';
import { createNoopAuditHelper } from '../infrastructure/audit/index.js';
import { createSingleton, createSilentLogger, formatErrorMessage } from './utils.js';

/**
 * LLM 推理器配置选项
 */
export interface LlmInferencerOptions {
  /** LLM 调用超时时间（毫秒），默认 60000 */
  timeoutMs?: number;
  /** 最大重试次数，默认 2 */
  maxRetries?: number;
  /** 重试间隔基数（毫秒），每次重试间隔按指数退避，默认 1000 */
  retryBaseDelayMs?: number;
}

/**
 * LLM 推理器依赖项
 */
export interface LlmInferencerDeps {
  /** 自定义 LLM 客户端 */
  llmClient?: LLMClient;
  /** 自定义 logger */
  logger?: Pick<Console, 'warn' | 'error' | 'info'>;
  /** 推理器配置选项 */
  options?: LlmInferencerOptions;
}

const noopAuditHelper = createNoopAuditHelper();

/**
 * 用于生成 Agent 配置的 LLM 提示词模板
 */
const PROVIDER_INFERENCE_PROMPT = `You are an expert at analyzing CLI tools and generating configuration for them.

Given a CLI tool's name, version, and help output, generate a complete AgentDescriptor configuration.

## Input Information
- CLI Command: {{cliCommand}}
- Version: {{version}}
- Help Output:
\`\`\`
{{helpOutput}}
\`\`\`

## Required Output Format (JSON)
Generate a JSON object with the following structure:

\`\`\`json
{
  "descriptor": {
    "id": "<command-name-in-lowercase>",
    "displayName": "<Human Readable Name>",
    "entryCommand": "<the-cli-command>",
    "subcommand": "<subcommand-if-any>",
    "promptTransport": "<arg|stdin|file|positional>",
    "promptArgName": "<argument-name-for-prompt>",
    "workingDirectoryArg": "<argument-for-working-directory>",
    "nonInteractiveFlags": ["<flags-to-run-non-interactively>"],
    "approvalPolicySupport": "<none|top-level|subcommand|unknown>",
    "structuredOutputSupport": false,
    "preflightSpec": {
      "versionArgs": ["--version"],
      "invocableArgs": ["--help"],
      "readyArgs": ["--help"]
    },
    "dryRunRenderMode": "<prompt-only|argv>",
    "runtimePolicy": {
      "configSemantics": "inherit-user-default"
    },
    "description": "<Brief description in Chinese>",
    "usageHabits": "<Usage habits and recommendations in Chinese>"
  },
  "adapterLogic": "<Description of how to construct the command line>",
  "usageNotes": "<Additional usage notes>"
}
\`\`\`

## Guidelines
1. Analyze the help output carefully to determine:
   - How prompts/input are passed (argument, stdin, file, or positional)
   - The argument name for prompts (e.g., --message, -p, --prompt)
   - Non-interactive flags (e.g., -y, --yes, --batch, --no-interactive)
   - Working directory arguments (e.g., --cwd, --dir, --workspace)
   - Subcommands if the tool has a multi-command structure

2. For \`promptTransport\`:
   - "arg": if the tool accepts prompt as a command argument
   - "stdin": if the tool reads from standard input
   - "file": if the tool reads from a file
   - "positional": if the prompt is a positional argument

3. For \`dryRunRenderMode\`:
   - "prompt-only": if the command is simple (just command + prompt)
   - "argv": if the command has complex arguments

4. Generate descriptive Chinese text for \`description\` and \`usageHabits\`

5. If you cannot determine a field from the help output, use reasonable defaults

Respond ONLY with the JSON object, no additional text.`;

/**
 * LLM 推理器实现类
 * 使用 LLM 分析 CLI 工具并生成 Agent 配置
 */
export class LlmInferencer implements ILlmInferencer {
  private llmClient: LLMClient | null = null;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(private readonly deps: LlmInferencerDeps = {}) {
    if (deps.llmClient) {
      this.llmClient = deps.llmClient;
    }
    this.timeoutMs = deps.options?.timeoutMs ?? 60000;
    this.maxRetries = deps.options?.maxRetries ?? 2;
    this.retryBaseDelayMs = deps.options?.retryBaseDelayMs ?? 1000;
  }

  /**
   * 推理 CLI 工具的 Agent 配置
   * @param cliCommand CLI 命令
   * @param detectionResult CLI 检测结果
   * @returns 推理结果
   * @throws {Error} 当 LLM 未配置或推理失败时抛出
   */
  async infer(cliCommand: string, detectionResult: CliDetectionResult): Promise<LlmInferenceResult> {
    if (!this.llmClient) {
      this.llmClient = this.createLLMClient();
    }

    if (!this.llmClient) {
      throw new Error('LLM is not configured. Please configure LLM first.');
    }

    const prompt = this.buildPrompt(cliCommand, detectionResult);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delayMs = this.retryBaseDelayMs * Math.pow(2, attempt - 1);
          this.deps.logger?.info(`Retrying LLM inference for CLI: ${cliCommand} (attempt ${attempt + 1}/${this.maxRetries + 1}, delay ${delayMs}ms)`);
          await this.delay(delayMs);
        }

        this.deps.logger?.info(`Inferring configuration for CLI: ${cliCommand}`);

        const response = await this.callWithTimeout(
          this.llmClient.completeRaw('provider-inference', prompt),
        );

        const result = this.parseResponse(response);

        this.deps.logger?.info(`Successfully inferred configuration for CLI: ${cliCommand}`);

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = formatErrorMessage(error);
        this.deps.logger?.warn(`LLM inference attempt ${attempt + 1} failed for CLI ${cliCommand}: ${errorMessage}`);
      }
    }

    const errorMessage = formatErrorMessage(lastError);
    this.deps.logger?.error(`Failed to infer configuration for CLI ${cliCommand} after ${this.maxRetries + 1} attempts:`, lastError);
    throw new Error(`LLM inference failed after ${this.maxRetries + 1} attempts: ${errorMessage}`);
  }

  /**
   * 构建 LLM 提示词
   * @param cliCommand CLI 命令
   * @param detectionResult CLI 检测结果
   * @returns 构建好的提示词
   */
  private buildPrompt(cliCommand: string, detectionResult: CliDetectionResult): string {
    return PROVIDER_INFERENCE_PROMPT
      .replace('{{cliCommand}}', cliCommand)
      .replace('{{version}}', detectionResult.version || 'unknown')
      .replace('{{helpOutput}}', detectionResult.helpOutput || 'No help output available');
  }

  /**
   * 解析 LLM 响应
   * @param response LLM 响应文本
   * @returns 解析后的推理结果
   */
  private parseResponse(response: string): LlmInferenceResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as LlmInferenceResult;

      this.validateDescriptor(parsed.descriptor);

      return parsed;
    } catch (error) {
      const errorMessage = formatErrorMessage(error);
      throw new Error(`Failed to parse LLM response: ${errorMessage}`);
    }
  }

  /**
   * 验证 Agent 描述符是否包含所有必要字段且字段值合法
   * @param descriptor Agent 描述符
   * @throws {Error} 当缺少必要字段或字段值无效时抛出
   */
  private validateDescriptor(descriptor: AgentDescriptor): void {
    const requiredFields = ['id', 'displayName', 'entryCommand', 'promptTransport', 'nonInteractiveFlags', 'preflightSpec'];

    for (const field of requiredFields) {
      if (!(field in descriptor)) {
        throw new Error(`Missing required field in descriptor: ${field}`);
      }
    }

    const validPromptTransports = ['arg', 'stdin', 'file', 'positional'];
    if (!validPromptTransports.includes(descriptor.promptTransport)) {
      throw new Error(`Invalid promptTransport: ${descriptor.promptTransport}`);
    }

    if (!descriptor.preflightSpec.versionArgs || !Array.isArray(descriptor.preflightSpec.versionArgs)) {
      throw new Error('Invalid preflightSpec.versionArgs');
    }
  }

  /**
   * 为 Promise 添加超时控制
   * @param promise 要添加超时的 Promise
   * @returns 带超时的 Promise
   * @throws {Error} 超时时抛出超时错误
   */
  private async callWithTimeout<T>(promise: Promise<T>): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`LLM call timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * 延迟指定时间
   * @param ms 延迟时间（毫秒）
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 创建 LLM 客户端
   * @returns LLM 客户端或 null
   */
  private createLLMClient(): LLMClient | null {
    try {
      const configResolution = resolveLLMConfig();
      if (configResolution.state !== 'configured' || !configResolution.config) {
        return null;
      }

      return new LLMClient(configResolution.config, { auditHelper: noopAuditHelper });
    } catch (error) {
      this.deps.logger?.error('Failed to create LLM client:', error);
      return null;
    }
  }
}

/**
 * 获取 LLM Inferencer 单例实例
 * @param deps 依赖项
 * @returns LLM Inferencer 实例
 */
const { getInstance: getLlmInferencer, reset: resetLlmInferencer } = createSingleton<
  ILlmInferencer,
  LlmInferencerDeps
>((deps) => new LlmInferencer({ logger: createSilentLogger(), ...deps }));

export { getLlmInferencer, resetLlmInferencer };
