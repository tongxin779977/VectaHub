import type { LLMConfig } from './interfaces.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';
import { loadConfig } from '../setup/first-run-wizard-bridge.js';

const SUPPORTED_LLM_PROVIDERS = ['openai', 'anthropic', 'ollama', 'groq'] as const;
const DEFAULT_LLM_TEMPERATURE = 0.1;

interface ResolvedLLMConfigSource {
  provider: LLMConfig['provider'];
  apiKey?: string;
  baseUrl?: string;
  model: string;
  timeout?: number;
}

/**
 * LLM 配置状态
 */
export type LLMConfigState = 'unconfigured' | 'configured' | 'invalid';

/**
 * LLM 配置解析结果
 */
export interface LLMConfigResolution {
  state: LLMConfigState;
  config: LLMConfig | null;
  error?: VectaHubError;
}

function normalizeLLMProvider(provider: string | undefined): LLMConfig['provider'] | null {
  const normalized = provider?.toLowerCase();
  if (!normalized) return null;
  return (SUPPORTED_LLM_PROVIDERS as readonly string[]).includes(normalized)
    ? normalized as LLMConfig['provider']
    : null;
}

/**
 * 获取配置的 LLM 温度参数
 * @returns 温度值
 */
export function getConfiguredLLMTemperature(): number {
  const raw = process.env.VECTAHUB_LLM_TEMPERATURE;
  const parsed = raw !== undefined ? Number.parseFloat(raw) : DEFAULT_LLM_TEMPERATURE;
  return Number.isFinite(parsed) ? parsed : DEFAULT_LLM_TEMPERATURE;
}

function resolveConfigFileLLMSource(): ResolvedLLMConfigSource | null {
  const config = loadConfig();
  const llmConfig = config.ai_providers?.vectahub_llm;

  if (!llmConfig?.enabled) return null;
  const provider = normalizeLLMProvider(llmConfig.provider);
  if (!provider) {
    throw new VectaHubError(
      `Unsupported LLM provider in config: ${llmConfig.provider || '(empty)'}`,
      ErrorType.CONFIGURATION,
    );
  }

  let apiKey = llmConfig.apiKey;
  let baseUrl = llmConfig.baseUrl;

  if (!apiKey) {
    if (provider === 'openai') {
      apiKey = process.env.OPENAI_API_KEY;
    } else if (provider === 'anthropic') {
      apiKey = process.env.ANTHROPIC_API_KEY;
    } else if (provider === 'groq') {
      apiKey = process.env.GROQ_API_KEY;
    } else if (provider === 'ollama') {
      apiKey = process.env.OLLAMA_API_KEY;
    }
  }

  if (!baseUrl) {
    if (provider === 'groq') {
      baseUrl = 'https://api.groq.com/openai/v1';
    } else if (provider === 'ollama') {
      baseUrl = 'http://localhost:11434/v1';
    } else if (provider === 'openai') {
      baseUrl = 'https://api.openai.com/v1';
    }
  } else if (provider === 'openai' && !baseUrl.endsWith('/v1')) {
    baseUrl = baseUrl.replace(/\/?$/, '/v1');
  }

  return {
    provider,
    apiKey,
    baseUrl,
    model: llmConfig.model || getDefaultModel(provider),
    timeout: llmConfig.timeout_ms,
  };
}

function resolveEnvLLMSource(): ResolvedLLMConfigSource | null {
  const explicitProvider = process.env.VECTAHUB_LLM_PROVIDER;
  const normalizedExplicitProvider = normalizeLLMProvider(explicitProvider);
  if (explicitProvider && !normalizedExplicitProvider) {
    throw new VectaHubError(
      `Unsupported LLM provider: ${explicitProvider}`,
      ErrorType.CONFIGURATION,
    );
  }

  const hasEnvSignal = Boolean(
    explicitProvider ||
      process.env.VECTAHUB_LLM_MODEL ||
      process.env.VECTAHUB_LLM_BASE_URL ||
      process.env.OPENAI_API_KEY,
  );
  if (!hasEnvSignal) return null;

  const provider = normalizedExplicitProvider || 'openai';
  const model = process.env.VECTAHUB_LLM_MODEL || getDefaultModel(provider);
  let baseUrl = process.env.VECTAHUB_LLM_BASE_URL;
  let apiKey: string | undefined;

  if (provider === 'openai') {
    apiKey = process.env.OPENAI_API_KEY;
    if (!baseUrl) baseUrl = 'https://api.openai.com/v1';
  } else if (provider === 'anthropic') {
    apiKey = process.env.ANTHROPIC_API_KEY;
  } else if (provider === 'groq') {
    apiKey = process.env.GROQ_API_KEY;
    if (!baseUrl) baseUrl = 'https://api.groq.com/openai/v1';
  } else if (provider === 'ollama') {
    apiKey = process.env.OLLAMA_API_KEY;
    if (!baseUrl) baseUrl = 'http://localhost:11434/v1';
  }

  return {
    provider,
    model,
    baseUrl,
    apiKey,
  };
}

function resolveLLMConfigSource(): ResolvedLLMConfigSource | null {
  return resolveConfigFileLLMSource() || resolveEnvLLMSource();
}

/**
 * 解析 LLM 配置
 * @returns 配置解析结果，包含状态和配置对象
 */
export function resolveLLMConfig(): LLMConfigResolution {
  const resolved = resolveLLMConfigSource();
  if (!resolved) {
    return {
      state: 'unconfigured',
      config: null,
    };
  }

  if (
    (resolved.provider === 'openai' || resolved.provider === 'groq' || resolved.provider === 'anthropic') &&
    !resolved.apiKey
  ) {
    return {
      state: 'invalid',
      config: null,
      error: new VectaHubError(
        `Missing API key for LLM provider: ${resolved.provider}`,
        ErrorType.CONFIGURATION,
      ),
    };
  }

  return {
    state: 'configured',
    config: resolved,
  };
}

/**
 * 创建 LLM 配置摘要源对象
 * @returns 摘要对象或 null（如果配置不可用）
 */
export function createLLMConfigDigestSource(): {
  provider: LLMConfig['provider'];
  model: string;
  temperature: number;
} | null {
  const source = resolveLLMConfigSource();
  if (!source) return null;
  return {
    provider: source.provider,
    model: source.model,
    temperature: getConfiguredLLMTemperature(),
  };
}

/**
 * 创建 LLM 配置对象
 * @returns 配置对象或 null
 * @throws 配置无效时抛出错误
 */
export function createLLMConfig(): LLMConfig | null {
  const resolution = resolveLLMConfig();
  if (resolution.state === 'invalid') {
    throw resolution.error;
  }
  return resolution.config;
}

/**
 * 检查 LLM 是否可用
 * @returns 配置是否有效且可用
 */
export function isLLMAvailable(): boolean {
  return createLLMConfig() !== null;
}

/**
 * 获取指定提供商的默认模型
 * @param provider - LLM 提供商名称
 * @returns 默认模型名称
 */
export function getDefaultModel(provider: string): string {
  switch (provider.toLowerCase()) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'groq':
      return 'llama3-8b-8192';
    case 'ollama':
      return 'llama3';
    default:
      return 'gpt-4o-mini';
  }
}
