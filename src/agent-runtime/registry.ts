import type { AgentDescriptor, AgentAdapter, AgentRegistry } from '../types/agent.js';
import { createSingleton, createSilentLogger } from './utils.js';

/**
 * Agent Registry 依赖项
 */
export interface AgentRegistryDeps {
  /** Logger 用于输出警告信息 */
  logger?: Pick<Console, 'warn'>;
}

/**
 * Agent Registry 实现类
 * 负责管理 Agent 描述符和适配器
 */
class AgentRegistryImpl implements AgentRegistry {
  private descriptors: Map<string, AgentDescriptor> = new Map();
  private adapters: Map<string, AgentAdapter> = new Map();

  constructor(private readonly deps: AgentRegistryDeps) {}

  /**
   * 注册一个新的 Agent
   * @param descriptor Agent 描述符
   * @param adapter Agent 适配器
   */
  register(descriptor: AgentDescriptor, adapter: AgentAdapter): void {
    const id = descriptor.id.toLowerCase();
    if (this.descriptors.has(id)) {
      this.deps.logger?.warn(`Agent with ID "${descriptor.id}" is already registered. Overwriting.`);
    }
    this.descriptors.set(id, descriptor);
    this.adapters.set(id, adapter);
  }

  /**
   * 取消注册 Agent
   * @param id Agent ID
   * @returns 是否成功取消注册
   */
  unregister(id: string): boolean {
    const normalizedId = id.toLowerCase();
    const existed = this.descriptors.has(normalizedId);
    this.descriptors.delete(normalizedId);
    this.adapters.delete(normalizedId);
    return existed;
  }

  /**
   * 获取 Agent 描述符
   * @param id Agent ID
   * @returns Agent 描述符或 null
   */
  getAgentDescriptor(id: string): AgentDescriptor | null {
    return this.descriptors.get(id.toLowerCase()) ?? null;
  }

  /**
   * 获取 Agent 适配器
   * @param id Agent ID
   * @returns Agent 适配器或 null
   */
  getAgentAdapter(id: string): AgentAdapter | null {
    return this.adapters.get(id.toLowerCase()) ?? null;
  }

  /**
   * 获取所有已注册的 Agent 描述符
   * @returns Agent 描述符数组
   */
  getAllDescriptors(): AgentDescriptor[] {
    return Array.from(this.descriptors.values());
  }

  /**
   * 检查 Agent 是否已知
   * @param id Agent ID
   * @returns 是否已知
   */
  isKnownAgent(id: string): boolean {
    return this.descriptors.has(id.toLowerCase());
  }

  /**
   * 检查 Agent 是否存在（isKnownAgent 的别名）
   * @param id Agent ID
   * @returns 是否存在
   */
  has(id: string): boolean {
    return this.descriptors.has(id.toLowerCase());
  }

  /**
   * 清空所有已注册的 Agent
   */
  clear(): void {
    this.descriptors.clear();
    this.adapters.clear();
  }
}

/**
 * 获取 Agent Registry 单例实例
 * @param deps 依赖项
 * @returns Agent Registry 实例
 */
const { getInstance: getAgentRegistry, reset: resetAgentRegistry } = createSingleton<
  AgentRegistry,
  AgentRegistryDeps
>((deps) => new AgentRegistryImpl({ logger: createSilentLogger(), ...deps }));

export { getAgentRegistry, resetAgentRegistry };
