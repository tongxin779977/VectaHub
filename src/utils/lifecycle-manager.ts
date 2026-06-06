export interface LifecycleOptions<T> {
  /**
   * Time to live in milliseconds.
   */
  ttl?: number;
  /**
   * Maximum number of items allowed.
   */
  maxCount?: number;
  /**
   * Interval for the cleanup timer in milliseconds.
   */
  cleanupInterval?: number;
  /**
   * Callback called when an item is evicted (either via TTL or capacity limit).
   */
  onEvicted?: (id: string, data: T) => void;
}

interface LifecycleItem<T> {
  data: T;
  lastActivity: number;
}

/**
 * A generic manager for items with a lifecycle, supporting TTL-based expiration
 * and capacity-based eviction.
 */
export class LifecycleManager<T> {
  private items: Map<string, LifecycleItem<T>> = new Map();
  private ttl: number;
  private maxCount: number;
  private cleanupInterval: number;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private onEvicted?: (id: string, data: T) => void;

  constructor(options: LifecycleOptions<T> = {}) {
    this.ttl = options.ttl ?? 30 * 60 * 1000; // Default 30 minutes
    this.maxCount = options.maxCount ?? 100;
    this.cleanupInterval = options.cleanupInterval ?? 5 * 60 * 1000; // Default 5 minutes
    this.onEvicted = options.onEvicted;

    this.startCleanupTimer();
  }

  private startCleanupTimer(): void {
    if (this.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, this.cleanupInterval);
      
      // Prevent the timer from keeping the Node.js event loop alive
      if (this.cleanupTimer && typeof this.cleanupTimer.unref === 'function') {
        this.cleanupTimer.unref();
      }
    }
  }

  /**
   * Manual cleanup of expired items.
   */
  public cleanup(): void {
    const now = Date.now();
    for (const [id, item] of this.items.entries()) {
      if (now - item.lastActivity > this.ttl) {
        this.evict(id);
      }
    }
  }

  private evict(id: string): void {
    const item = this.items.get(id);
    if (item) {
      this.items.delete(id);
      this.onEvicted?.(id, item.data);
    }
  }

  /**
   * Set or update an item. Automatically handles capacity eviction.
   */
  public set(id: string, data: T): void {
    if (!this.items.has(id) && this.items.size >= this.maxCount) {
      this.evictOldest();
    }

    this.items.set(id, {
      data,
      lastActivity: Date.now(),
    });
  }

  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, item] of this.items.entries()) {
      if (item.lastActivity < oldestTime) {
        oldestTime = item.lastActivity;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.evict(oldestId);
    }
  }

  /**
   * Get an item and refresh its activity timestamp.
   */
  public get(id: string): T | undefined {
    const item = this.items.get(id);
    if (item) {
      item.lastActivity = Date.now();
      return item.data;
    }
    return undefined;
  }

  /**
   * Peek at an item without refreshing its activity timestamp.
   */
  public peek(id: string): T | undefined {
    return this.items.get(id)?.data;
  }

  public has(id: string): boolean {
    return this.items.has(id);
  }

  public delete(id: string): void {
    this.items.delete(id);
  }

  public clear(): void {
    this.items.clear();
  }

  public keys(): string[] {
    return Array.from(this.items.keys());
  }

  public values(): T[] {
    return Array.from(this.items.values()).map(item => item.data);
  }

  public size(): number {
    return this.items.size;
  }

  public getActivity(id: string): number | undefined {
    return this.items.get(id)?.lastActivity;
  }

  public updateActivity(id: string): void {
    const item = this.items.get(id);
    if (item) {
      item.lastActivity = Date.now();
    }
  }

  /**
   * Shutdown the manager, clearing the timer and items.
   */
  public shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.items.clear();
  }

  /**
   * Update configuration at runtime.
   */
  public setTtl(ttl: number): void {
    this.ttl = ttl;
  }

  public getTtl(): number {
    return this.ttl;
  }
}
