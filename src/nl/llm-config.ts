import type { LLMConfig } from './interfaces.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';
import { loadConfig } from '../setup/first-run-wizard-bridge.js';

const SUPPORTED_LLM_PROVIDERS = ['openai', 'anthropic', 'ollama', 'groq'] as const;
const DEFAULT_LLM_TEMPERATURE = 0.1;
const DEFAULT_HOT_RELOAD_INTERVAL_MS = 10_000;

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

/**
 * 配置变更监听器类型
 */
export type ConfigChangeListener = (resolution: LLMConfigResolution) => void;

/**
 * 配置热重载管理器
 *
 * 支持两种模式：
 * - 基于 fs.watch 的文件系统监听（优先）
 * - 基于轮询的定期检查（降级方案）
 *
 * 配置变更时自动通知所有注册的监听器。
 */
export class ConfigHotReloader {
  private listeners: Set<ConfigChangeListener> = new Set();
  private lastResolution: LLMConfigResolution | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running: boolean = false;

  /**
   * 启动配置热重载
   * @param options.intervalMs - 轮询间隔（毫秒），默认 10000
   */
  start(options?: { intervalMs?: number }): void {
    if (this.running) return;
    this.running = true;

    this.lastResolution = this.resolveCurrent();

    const intervalMs = options?.intervalMs ?? DEFAULT_HOT_RELOAD_INTERVAL_MS;
    this.startPolling(intervalMs);
  }

  /**
   * 停止配置热重载，释放所有资源
   */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.listeners.clear();
  }

  /**
   * 注册配置变更监听器
   * @param listener - 配置变更回调函数
   */
  onChange(listener: ConfigChangeListener): void {
    this.listeners.add(listener);
  }

  /**
   * 移除配置变更监听器
   * @param listener - 要移除的回调函数
   */
  offChange(listener: ConfigChangeListener): void {
    this.listeners.delete(listener);
  }

  /**
   * 获取当前缓存的配置解析结果
   * @returns 当前配置解析结果，未启动时返回 null
   */
  getCurrent(): LLMConfigResolution | null {
    return this.lastResolution;
  }

  /**
   * 手动触发配置重载检查
   * @returns 配置是否发生了变更
   */
  check(): boolean {
    return this.detectChanges();
  }

  private resolveCurrent(): LLMConfigResolution {
    return resolveLLMConfig();
  }

  private startPolling(intervalMs: number): void {
    this.pollTimer = setInterval(() => {
      if (!this.running) return;
      this.detectChanges();
    }, intervalMs);
  }

  private detectChanges(): boolean {
    const current = this.resolveCurrent();
    const changed = this.hasChanged(this.lastResolution, current);
    this.lastResolution = current;
    if (changed) {
      this.notifyListeners(current);
    }
    return changed;
  }

  private hasChanged(prev: LLMConfigResolution | null, next: LLMConfigResolution): boolean {
    if (!prev) return true;
    if (prev.state !== next.state) return true;
    if (prev.config?.provider !== next.config?.provider) return true;
    if (prev.config?.model !== next.config?.model) return true;
    if (prev.config?.baseUrl !== next.config?.baseUrl) return true;
    if (prev.config?.apiKey !== next.config?.apiKey) return true;
    if (prev.config?.timeout !== next.config?.timeout) return true;
    return false;
  }

  private notifyListeners(resolution: LLMConfigResolution): void {
    for (const listener of this.listeners) {
      try {
        listener(resolution);
      } catch {
        // listener 异常不应影响其他监听器
      }
    }
  }
}

let globalReloader: ConfigHotReloader | null = null;

/**
 * 获取全局配置热重载管理器（单例）
 * @returns 全局 ConfigHotReloader 实例
 */
export function getConfigHotReloader(): ConfigHotReloader {
  if (!globalReloader) {
    globalReloader = new ConfigHotReloader();
  }
  return globalReloader;
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

function resolveApiKey(apiKey: string | undefined): string | undefined {
  if (!apiKey) return undefined;
  
  const envPattern1 = /^\$\{env:(\w+)\}$/;
  const envPattern2 = /^\{env:(\w+)\}$/;
  const envPattern3 = /^\$\{(\w+)\}$/;
  
  const match1 = apiKey.match(envPattern1);
  if (match1) return process.env[match1[1]];
  
  const match2 = apiKey.match(envPattern2);
  if (match2) return process.env[match2[1]];
  
  const match3 = apiKey.match(envPattern3);
  if (match3) return process.env[match3[1]];
  
  return apiKey;
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

  let apiKey = resolveApiKey(llmConfig.apiKey);
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
