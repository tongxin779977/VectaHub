import type { EntityType, Task, TaskType } from '../types/index.js';
import {
  createTaskFromIntent,
  createCommandSynthesizer,
  type CommandSynthesizer,
} from './command-synthesizer.js';
import type { IntentConfig, CommandConfig } from './command-config.js';

const DEFAULT_TM_SIZE = 256;
const DEFAULT_TM_TTL_MS = 300_000;

interface TranslationEntry {
  task: Task;
  translatedAt: number;
  hitCount: number;
}

function buildTranslationKey(
  intent: string,
  entities: Record<EntityType, string[]>,
  originalInput: string,
): string {
  const entityPart = Object.entries(entities)
    .filter(([, v]) => v.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v.join(',')}`)
    .join(';');
  return `${intent}::${entityPart}::${originalInput.trim().toLowerCase()}`;
}

/**
 * 翻译记忆库，缓存意图到命令的翻译结果
 *
 * 避免对相同输入重复执行意图解析和命令合成。
 * 使用 LRU 淘汰策略和 TTL 过期机制管理缓存。
 */
export class TranslationMemory {
  private readonly store: Map<string, TranslationEntry> = new Map();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  /**
   * 创建翻译记忆库实例
   * @param options.maxSize - 最大缓存条目数，默认 256
   * @param options.ttlMs - 缓存条目过期时间（毫秒），默认 300000（5 分钟）
   */
  constructor(options?: { maxSize?: number; ttlMs?: number }) {
    this.maxSize = options?.maxSize ?? DEFAULT_TM_SIZE;
    this.ttlMs = options?.ttlMs ?? DEFAULT_TM_TTL_MS;
  }

  /**
   * 查询翻译记忆库
   * @param key - 缓存键
   * @returns 缓存的翻译结果，未命中或已过期时返回 null
   */
  get(key: string): Task | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }

    entry.hitCount++;
    this.touch(key, entry);
    return entry.task;
  }

  /**
   * 将翻译结果存入记忆库
   * @param key - 缓存键
   * @param task - 翻译结果
   */
  put(key: string, task: Task): void {
    if (this.store.size >= this.maxSize) {
      this.evictOldest();
    }
    this.store.set(key, { task, translatedAt: Date.now(), hitCount: 0 });
  }

  /**
   * 清除所有缓存条目
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * 清除过期的缓存条目
   * @returns 被清除的条目数量
   */
  evictExpired(): number {
    const before = this.store.size;
    for (const [key, entry] of this.store) {
      if (this.isExpired(entry)) {
        this.store.delete(key);
      }
    }
    return before - this.store.size;
  }

  /**
   * 获取当前缓存大小
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * 获取缓存命中统计
   * @returns 包含总条目数和总命中次数的对象
   */
  getStats(): { entries: number; totalHits: number } {
    let totalHits = 0;
    for (const entry of this.store.values()) {
      totalHits += entry.hitCount;
    }
    return { entries: this.store.size, totalHits };
  }

  private isExpired(entry: TranslationEntry): boolean {
    return Date.now() - entry.translatedAt > this.ttlMs;
  }

  private touch(key: string, entry: TranslationEntry): void {
    this.store.delete(key);
    this.store.set(key, entry);
  }

  private evictOldest(): void {
    const oldestKey = this.store.keys().next().value;
    if (oldestKey !== undefined) {
      this.store.delete(oldestKey);
    }
  }
}

/**
 * 带翻译记忆的意图翻译器
 *
 * 将意图和实体翻译为可执行的任务对象。首次翻译结果会被缓存到
 * TranslationMemory 中，相同输入后续直接返回缓存结果。
 */
export class Translator {
  private memory: TranslationMemory;
  private synthesizer: CommandSynthesizer;
  private intentConfig?: IntentConfig;
  private commandConfig?: CommandConfig;

  /**
   * 创建翻译器实例
   * @param options.memory - 自定义翻译记忆库实例
   * @param options.maxMemorySize - 记忆库最大条目数
   * @param options.memoryTtlMs - 记忆库条目过期时间
   * @param options.intentConfig - 意图配置
   * @param options.commandConfig - 命令配置
   */
  constructor(options?: {
    memory?: TranslationMemory;
    maxMemorySize?: number;
    memoryTtlMs?: number;
    intentConfig?: IntentConfig;
    commandConfig?: CommandConfig;
  }) {
    this.memory = options?.memory ?? new TranslationMemory({
      maxSize: options?.maxMemorySize,
      ttlMs: options?.memoryTtlMs,
    });
    this.synthesizer = createCommandSynthesizer(options?.commandConfig);
    this.intentConfig = options?.intentConfig;
    this.commandConfig = options?.commandConfig;
  }

  /**
   * 将意图和实体翻译为可执行的任务
   *
   * 优先从翻译记忆库中获取缓存结果。缓存未命中时执行完整翻译并缓存结果。
   *
   * @param intent - 意图名称
   * @param entities - 提取的实体
   * @param originalInput - 用户原始输入
   * @returns 翻译后的任务对象
   */
  translate(
    intent: string,
    entities: Record<EntityType, string[]>,
    originalInput: string,
  ): Task {
    const key = buildTranslationKey(intent, entities, originalInput);
    const cached = this.memory.get(key);
    if (cached) return cached;

    const task = createTaskFromIntent(
      intent,
      entities,
      originalInput,
      this.intentConfig,
      this.commandConfig,
    );

    this.memory.put(key, task);
    return task;
  }

  /**
   * 使用命令合成器合成命令
   * @param taskType - 任务类型
   * @param params - 参数
   * @param detectedCLI - 检测到的 CLI 工具
   * @returns 合成的命令对象
   */
  synthesize(
    taskType: TaskType,
    params: Record<string, string | string[] | undefined>,
    detectedCLI?: string,
  ): { cli: string; args: string[] } {
    return this.synthesizer.synthesize(taskType, params, detectedCLI);
  }

  /**
   * 清除翻译记忆库
   */
  clearMemory(): void {
    this.memory.clear();
  }

  /**
   * 获取翻译记忆库统计信息
   */
  getMemoryStats(): { entries: number; totalHits: number } {
    return this.memory.getStats();
  }
}
