import type { ParsedGoal, ProjectContext } from './core/goal-types.js';
import type { RouterResult } from './capabilities/types.js';
import { createCapabilityRouter } from './capabilities/router.js';
import { parseGoal } from './core/goal-parser.js';

const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_MAX_CACHE_SIZE = 128;

interface CacheEntry {
  result: RouterResult;
  goal: ParsedGoal;
  cachedAt: number;
}

function normalizeInput(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

function createCacheKey(input: string, context?: ProjectContext): string {
  const normalized = normalizeInput(input);
  const cwd = context?.cwd ?? '';
  return `${normalized}::${cwd}`;
}

/**
 * 工作流检测器，负责将用户输入路由到匹配的 Capability
 *
 * 内置 LRU + TTL 缓存，相同输入在 TTL 窗口内不会重复执行检测逻辑。
 * 缓存键基于归一化后的输入文本和 cwd，确保相似输入命中同一缓存。
 */
export class WorkflowDetector {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTtlMs: number;
  private readonly maxCacheSize: number;

  /**
   * 创建工作流检测器实例
   * @param options.cacheTtlMs - 缓存条目过期时间（毫秒），默认 60000
   * @param options.maxCacheSize - 缓存最大条目数，默认 128
   */
  constructor(options?: { cacheTtlMs?: number; maxCacheSize?: number }) {
    this.cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.maxCacheSize = options?.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE;
  }

  /**
   * 检测用户输入应路由到哪个 Capability
   *
   * 优先返回缓存结果。缓存未命中或已过期时执行完整检测。
   *
   * @param input - 用户原始输入
   * @param context - 可选的项目上下文
   * @returns 路由结果
   */
  detect(input: string, context?: ProjectContext): RouterResult {
    const key = createCacheKey(input, context);
    const cached = this.cache.get(key);

    if (cached && !this.isExpired(cached)) {
      this.touchEntry(key, cached);
      return cached.result;
    }

    const goal = parseGoal(input);
    const router = createCapabilityRouter();
    const result = router.route(goal, context);

    this.putEntry(key, { result, goal, cachedAt: Date.now() });

    return result;
  }

  /**
   * 检测输入并返回解析后的目标
   *
   * @param input - 用户原始输入
   * @param context - 可选的项目上下文
   * @returns 包含路由结果和解析目标的对象
   */
  detectWithGoal(input: string, context?: ProjectContext): { result: RouterResult; goal: ParsedGoal } {
    const key = createCacheKey(input, context);
    const cached = this.cache.get(key);

    if (cached && !this.isExpired(cached)) {
      this.touchEntry(key, cached);
      return { result: cached.result, goal: cached.goal };
    }

    const goal = parseGoal(input);
    const router = createCapabilityRouter();
    const result = router.route(goal, context);

    this.putEntry(key, { result, goal, cachedAt: Date.now() });

    return { result, goal };
  }

  /**
   * 清除所有缓存条目
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 清除过期的缓存条目
   * @returns 被清除的条目数量
   */
  evictExpired(): number {
    const before = this.cache.size;
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
      }
    }
    return before - this.cache.size;
  }

  /**
   * 获取当前缓存大小
   */
  get cacheSize(): number {
    return this.cache.size;
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.cachedAt > this.cacheTtlMs;
  }

  private touchEntry(key: string, entry: CacheEntry): void {
    this.cache.delete(key);
    this.cache.set(key, entry);
  }

  private putEntry(key: string, entry: CacheEntry): void {
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, entry);
  }
}
