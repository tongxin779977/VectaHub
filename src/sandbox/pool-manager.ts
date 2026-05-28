import { randomUUID } from 'node:crypto';
import type {
  SandboxPoolConfig,
  SandboxPool,
  PooledSandboxEntry,
  SandboxPoolStats,
} from './types.js';

const DEFAULT_POOL_CONFIG: SandboxPoolConfig = {
  minSize: 1,
  maxSize: 5,
  idleTimeoutMs: 300_000,
  maxReuseCount: 100,
  warmupEnabled: false,
};

/**
 * 创建沙箱池实例
 *
 * 管理一组可复用的沙箱实例，通过 acquire/release 模式
 * 减少频繁创建和销毁沙箱的开销。
 *
 * @param config - 池配置（可选，使用默认值补齐）
 * @returns 沙箱池实例
 */
export function createSandboxPool(config?: Partial<SandboxPoolConfig>): SandboxPool {
  const poolConfig: SandboxPoolConfig = { ...DEFAULT_POOL_CONFIG, ...config };
  const entries = new Map<string, PooledSandboxEntry>();
  const waitQueue: Array<{ sessionId: string; resolve: (entry: PooledSandboxEntry) => void }> = [];

  const stats = {
    totalAcquired: 0,
    totalReleased: 0,
    totalCreated: 0,
    totalDestroyed: 0,
  };

  let draining = false;

  function generateId(): string {
    return `pool_${randomUUID().slice(0, 8)}`;
  }

  function createEntry(sessionId?: string): PooledSandboxEntry {
    const entry: PooledSandboxEntry = {
      id: generateId(),
      status: sessionId ? 'active' : 'idle',
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      reuseCount: 0,
      currentSessionId: sessionId,
    };
    entries.set(entry.id, entry);
    stats.totalCreated++;
    return entry;
  }

  function findIdleEntry(): PooledSandboxEntry | null {
    for (const entry of entries.values()) {
      if (entry.status === 'idle' && entry.reuseCount < poolConfig.maxReuseCount) {
        return entry;
      }
    }
    return null;
  }

  function destroyEntry(id: string): void {
    const entry = entries.get(id);
    if (entry) {
      entry.status = 'disposed';
      entries.delete(id);
      stats.totalDestroyed++;
    }
  }

  function pruneIdleEntries(): void {
    const now = Date.now();
    for (const [id, entry] of entries.entries()) {
      if (
        entry.status === 'idle' &&
        now - entry.lastUsedAt > poolConfig.idleTimeoutMs
      ) {
        destroyEntry(id);
      }
    }
  }

  function getOrCreate(sessionId: string): PooledSandboxEntry {
    const idle = findIdleEntry();
    if (idle) {
      idle.status = 'active';
      idle.lastUsedAt = Date.now();
      idle.reuseCount++;
      idle.currentSessionId = sessionId;
      stats.totalAcquired++;
      return idle;
    }

    if (entries.size < poolConfig.maxSize) {
      const entry = createEntry(sessionId);
      stats.totalAcquired++;
      return entry;
    }

    return null!;
  }

  if (poolConfig.warmupEnabled) {
    for (let i = 0; i < poolConfig.minSize; i++) {
      createEntry();
    }
  }

  return {
    /**
     * 获取一个可用的沙箱实例
     *
     * 优先复用空闲实例，若无空闲且未达上限则创建新实例，
     * 若已达上限则排队等待。
     *
     * @param sessionId - 请求会话标识
     * @returns 池化沙箱实例记录
     */
    async acquire(sessionId: string): Promise<PooledSandboxEntry> {
      if (draining) {
        throw new Error('Sandbox pool is draining, cannot acquire new instances');
      }

      pruneIdleEntries();

      const entry = getOrCreate(sessionId);
      if (entry) {
        return entry;
      }

      return new Promise<PooledSandboxEntry>((resolve) => {
        waitQueue.push({ sessionId, resolve });
      });
    },

    /**
     * 释放一个沙箱实例，将其归还到池中
     *
     * @param id - 沙箱实例标识符
     */
    release(id: string): void {
      const entry = entries.get(id);
      if (!entry || entry.status !== 'active') return;

      entry.status = 'idle';
      entry.currentSessionId = undefined;
      entry.lastUsedAt = Date.now();
      stats.totalReleased++;

      if (waitQueue.length > 0) {
        const waiter = waitQueue.shift()!;
        entry.status = 'active';
        entry.lastUsedAt = Date.now();
        entry.reuseCount++;
        entry.currentSessionId = waiter.sessionId;
        stats.totalAcquired++;
        waiter.resolve(entry);
      }
    },

    /**
     * 排空池：拒绝新的 acquire 请求，等待所有活跃实例归还
     */
    async drain(): Promise<void> {
      draining = true;
      for (const waiter of waitQueue) {
        const entry: PooledSandboxEntry = {
          id: generateId(),
          status: 'draining',
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
          reuseCount: 0,
          currentSessionId: waiter.sessionId,
        };
        waiter.resolve(entry);
      }
      waitQueue.length = 0;
    },

    /**
     * 动态调整池容量
     *
     * @param minSize - 最小实例数
     * @param maxSize - 最大实例数
     */
    resize(minSize: number, maxSize: number): void {
      poolConfig.minSize = minSize;
      poolConfig.maxSize = Math.max(maxSize, minSize);

      while (entries.size > poolConfig.maxSize) {
        const idle = findIdleEntry();
        if (idle) {
          destroyEntry(idle.id);
        } else {
          break;
        }
      }
    },

    /**
     * 获取池统计信息
     *
     * @returns 包含各维度统计数据的统计对象
     */
    getStats(): SandboxPoolStats {
      let idle = 0;
      let active = 0;
      let totalReuse = 0;

      for (const entry of entries.values()) {
        if (entry.status === 'idle') idle++;
        if (entry.status === 'active') active++;
        totalReuse += entry.reuseCount;
      }

      return {
        total: entries.size,
        idle,
        active,
        waiting: waitQueue.length,
        totalAcquired: stats.totalAcquired,
        totalReleased: stats.totalReleased,
        totalCreated: stats.totalCreated,
        totalDestroyed: stats.totalDestroyed,
        averageReuseCount: entries.size > 0 ? totalReuse / entries.size : 0,
      };
    },

    /**
     * 获取池中所有实例记录
     *
     * @returns 实例记录列表
     */
    getEntries(): PooledSandboxEntry[] {
      return Array.from(entries.values());
    },

    /**
     * 销毁池中所有实例并清空等待队列
     */
    async destroy(): Promise<void> {
      draining = true;
      for (const id of entries.keys()) {
        destroyEntry(id);
      }
      for (const waiter of waitQueue) {
        const entry: PooledSandboxEntry = {
          id: generateId(),
          status: 'disposed',
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
          reuseCount: 0,
        };
        waiter.resolve(entry);
      }
      waitQueue.length = 0;
      entries.clear();
    },
  };
}
