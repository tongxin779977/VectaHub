import { dirname } from 'node:path';
import { parse, stringify } from 'yaml';
import type { DefaultPolicy } from '../../command-rules/types.js';
import type { IEnvironmentService, IConfigService } from '../interfaces/index.js';
import { ConfigSchema, type Config } from './schema.js';
import { VectaHubError, ErrorType } from '../errors/index.js';

/**
 * 判断一个值是否是普通对象
 */
function isPlainObject(item: unknown): item is Record<string, unknown> {
  return (
    item !== null &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    Object.prototype.toString.call(item) === '[object Object]'
  );
}

/**
 * 默认配置
 */
function createDefaultConfig(env: IEnvironmentService): Config {
  return {
    version: 1,
    first_run_completed: false,
    sandbox: {
      enabled: true,
      mode: 'STRICT',
      defaultPolicy: 'block' as DefaultPolicy,
    },
    ai: {
      environment_scan: {
        enabled: true,
        show_report: false,
        scan_interval_ms: 86400000,
      },
      fallback: {
        auto_fallback: true,
        prompt_before_switch: false,
        max_attempts: 3,
        timeout_ms: 30000,
      },
      provider_priority: [],
      built_in_ai: {
        enabled: true,
        model: 'vectahub-ai-v1',
        max_tokens: 4096,
      },
    },
    ai_providers: {},
    ai_modules: {},
    external_cli: {},
    cli_tools: {
      version: '1.0.0',
      registeredTools: ['git'],
      templates: { enabled: ['default'] },
    },
    storage: {
      dir: env.getHomePath(),
    },
    priority: ['external_cli_with_permission', 'vectahub_llm', 'rules'],
  };
}

/**
 * 配置服务实现
 */
export class ConfigService implements IConfigService {
  private env: IEnvironmentService;
  private configPath: string;
  private cachedConfig: Config | null = null;

  constructor(env: IEnvironmentService, configPath?: string) {
    this.env = env;
    this.configPath = configPath ?? env.getPath('config.yaml');
  }

  private getConfigPath(): string {
    return this.configPath;
  }

  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...target };
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];
      if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
        result[key] = this.deepMerge(targetValue, sourceValue);
      } else {
        result[key] = sourceValue;
      }
    }
    return result;
  }

  /**
   * 使用 Zod 验证配置并返回验证后的配置
   * 不允许任何非法状态流转
   */
  private validateConfigWithZod(config: unknown): Config {
    try {
      return ConfigSchema.parse(config);
    } catch (error) {
      throw new VectaHubError(
        `Configuration validation failed: ${error instanceof Error ? error.message : String(error)}`,
        ErrorType.CONFIGURATION,
        error
      );
    }
  }

  getDefaultConfig(): Config {
    return this.validateConfigWithZod(createDefaultConfig(this.env));
  }

  loadConfig(): Config {
    const path = this.getConfigPath();

    if (!this.env.exists(path)) {
      return this.getDefaultConfig();
    }

    let parsed: unknown;
    try {
      const content = this.env.readFile(path);
      parsed = parse(content);
    } catch (error) {
      throw new VectaHubError(
        `Failed to parse configuration file: ${error instanceof Error ? error.message : String(error)}`,
        ErrorType.CONFIGURATION,
        error
      );
    }

    // 合并默认配置和用户配置
    const defaultConfig = createDefaultConfig(this.env);
    const defaultConfigAsObj = defaultConfig as unknown as Record<string, unknown>;
    const parsedAsObj = isPlainObject(parsed) ? (parsed as Record<string, unknown>) : {};
    
    const merged = this.deepMerge(defaultConfigAsObj, parsedAsObj);
    
    // 强制校验合并后的配置
    return this.validateConfigWithZod(merged);
  }

  getConfig(): Config {
    if (!this.cachedConfig) {
      this.cachedConfig = this.loadConfig();
    }
    return this.cachedConfig;
  }

  reloadConfig(): Config {
    this.cachedConfig = this.loadConfig();
    return this.cachedConfig;
  }

  saveConfig(config: Config): void {
    const path = this.getConfigPath();
    const dir = dirname(path);
    if (!this.env.exists(dir)) {
      this.env.ensureDir(dir);
    }
    
    // 强制校验配置
    const validatedConfig = this.validateConfigWithZod(config);
    
    this.env.writeFile(path, stringify(validatedConfig, { indent: 2 }));
    this.cachedConfig = validatedConfig;
  }

  updateConfig(patch: Partial<Config>): Config {
    const current = this.getConfig();
    const currentAsObj = current as Record<string, unknown>;
    const patchAsObj = patch as Record<string, unknown>;
    const updated = this.deepMerge(currentAsObj, patchAsObj);
    
    // 强制校验更新后的配置
    const validatedConfig = this.validateConfigWithZod(updated);
    this.saveConfig(validatedConfig);
    return validatedConfig;
  }
}
