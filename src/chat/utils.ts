/**
 * Chat 模块内部工具函数集合。
 * @module chat/utils
 */

/**
 * 从未知错误值中提取可读的错误消息字符串。
 * 统一处理 `Error` 实例和非 `Error` 类型的异常值。
 *
 * @param err - 捕获到的未知错误值
 * @returns 错误消息文本
 *
 * @example
 * ```ts
 * formatError(new Error('timeout')); // 'timeout'
 * formatError('raw string');         // 'raw string'
 * formatError(null);                 // 'null'
 * ```
 */
export function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 带 TTL 和容量上限的简单缓存。
 * 使用 `Map` 的插入顺序实现 FIFO 淘汰策略。
 *
 * @typeParam T - 缓存值类型
 *
 * @example
 * ```ts
 * const cache = new SimpleCache<string>(10_000, 100);
 * cache.set('key', 'value');
 * cache.get('key'); // 'value'
 * ```
 */
export class SimpleCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  /**
   * 创建缓存实例。
   *
   * @param ttlMs - 缓存条目过期时间（毫秒）
   * @param maxSize - 缓存最大条目数，超出时淘汰最早的条目
   */
  constructor(ttlMs: number, maxSize: number) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  /**
   * 获取缓存值。若条目已过期则自动删除并返回 `undefined`。
   *
   * @param key - 缓存键
   * @returns 缓存值，不存在或已过期时返回 `undefined`
   */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * 写入缓存。超出容量时淘汰最早的条目。
   *
   * @param key - 缓存键
   * @param value - 缓存值
   */
  set(key: string, value: T): void {
    if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /**
   * 检查缓存中是否存在未过期的条目。
   *
   * @param key - 缓存键
   * @returns 存在且未过期返回 `true`
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * 清空所有缓存条目。
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * 当前缓存条目数。
   */
  get size(): number {
    return this.store.size;
  }
}
