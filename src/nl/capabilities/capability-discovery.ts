import type { Capability, RouterResult } from './types.js';
import type { ParsedGoal, ProjectContext } from '../core/goal-types.js';

const DEFAULT_DISCOVERY_TTL_MS = 300_000;

interface DiscoveredCapability {
  capability: Capability;
  discoveredAt: number;
  source: string;
}

interface DiscoveryResult {
  discovered: DiscoveredCapability[];
  totalRegistered: number;
}

/**
 * 能力发现器，支持动态注册和发现新的 Capability
 *
 * 运行时可以通过 register() 注册新的能力，也可以通过 discover() 批量发现。
 * 已注册的能力会被缓存，过期后自动清除。
 *
 * 典型用法：
 * 1. 插件系统在运行时注册新能力
 * 2. 外部配置文件定义新能力并自动发现
 * 3. 动态扩展 NL Engine 的处理能力
 */
export class CapabilityDiscovery {
  private readonly registry: Map<string, DiscoveredCapability> = new Map();
  private readonly ttlMs: number;

  /**
   * 创建能力发现器实例
   * @param options.ttlMs - 已注册能力的过期时间（毫秒），默认 300000
   */
  constructor(options?: { ttlMs?: number }) {
    this.ttlMs = options?.ttlMs ?? DEFAULT_DISCOVERY_TTL_MS;
  }

  /**
   * 注册一个新的 Capability
   *
   * 如果已存在同名能力，会被覆盖。
   *
   * @param capability - 要注册的能力对象
   * @param source - 注册来源标识（如 'plugin:xxx', 'config', 'runtime'）
   * @returns 是否成功注册（名称为空时返回 false）
   */
  register(capability: Capability, source: string = 'runtime'): boolean {
    if (!capability.id) return false;

    this.registry.set(capability.id, {
      capability,
      discoveredAt: Date.now(),
      source,
    });
    return true;
  }

  /**
   * 注销一个已注册的 Capability
   * @param name - 要注销的能力名称
   * @returns 是否成功注销
   */
  unregister(name: string): boolean {
    return this.registry.delete(name);
  }

  /**
   * 批量注册能力
   * @param capabilities - 能力列表
   * @param source - 注册来源标识
   * @returns 发现结果
   */
  discover(capabilities: Capability[], source: string = 'discovery'): DiscoveryResult {
    const discovered: DiscoveredCapability[] = [];
    for (const cap of capabilities) {
      if (this.register(cap, source)) {
        discovered.push(this.registry.get(cap.id)!);
      }
    }
    return { discovered, totalRegistered: this.registry.size };
  }

  /**
   * 获取指定名称的能力
   * @param name - 能力名称
   * @returns 能力对象，不存在或已过期时返回 null
   */
  get(name: string): Capability | null {
    const entry = this.registry.get(name);
    if (!entry) return null;

    if (this.isExpired(entry)) {
      this.registry.delete(name);
      return null;
    }

    return entry.capability;
  }

  /**
   * 获取所有已注册且未过期的能力
   * @returns 能力列表
   */
  getAll(): Capability[] {
    this.evictExpired();
    return Array.from(this.registry.values()).map(e => e.capability);
  }

  /**
   * 检查指定名称的能力是否已注册且未过期
   * @param name - 能力名称
   * @returns 是否可用
   */
  has(name: string): boolean {
    return this.get(name) !== null;
  }

  /**
   * 将动态注册的能力与静态能力列表合并
   *
   * 动态能力的优先级高于静态能力（同名时覆盖）。
   *
   * @param staticCapabilities - 静态能力列表
   * @returns 合并后的能力列表
   */
  mergeWithStatic(staticCapabilities: Capability[]): Capability[] {
    this.evictExpired();
    const merged = new Map<string, Capability>();

    for (const cap of staticCapabilities) {
      merged.set(cap.id, cap);
    }

    for (const entry of this.registry.values()) {
      merged.set(entry.capability.id, entry.capability);
    }

    return Array.from(merged.values());
  }

  /**
   * 清除所有注册的能力
   */
  clear(): void {
    this.registry.clear();
  }

  /**
   * 获取已注册能力数量
   */
  get size(): number {
    this.evictExpired();
    return this.registry.size;
  }

  /**
   * 获取注册来源统计
   * @returns 按来源分组的能力数量
   */
  getSourceStats(): Record<string, number> {
    this.evictExpired();
    const stats: Record<string, number> = {};
    for (const entry of this.registry.values()) {
      stats[entry.source] = (stats[entry.source] ?? 0) + 1;
    }
    return stats;
  }

  private isExpired(entry: DiscoveredCapability): boolean {
    return Date.now() - entry.discoveredAt > this.ttlMs;
  }

  private evictExpired(): number {
    const before = this.registry.size;
    for (const [key, entry] of this.registry) {
      if (this.isExpired(entry)) {
        this.registry.delete(key);
      }
    }
    return before - this.registry.size;
  }
}

let globalDiscovery: CapabilityDiscovery | null = null;

/**
 * 获取全局能力发现器（单例）
 * @returns 全局 CapabilityDiscovery 实例
 */
export function getCapabilityDiscovery(): CapabilityDiscovery {
  if (!globalDiscovery) {
    globalDiscovery = new CapabilityDiscovery();
  }
  return globalDiscovery;
}
