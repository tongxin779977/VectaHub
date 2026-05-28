import type { AgentDescriptor, AgentAdapter, AgentRegistry } from '../types/agent.js';
import { createSingleton, createSilentLogger } from './utils.js';

/**
 * Registry 事件类型
 */
export type RegistryEventType = 'register' | 'unregister' | 'clear';

/**
 * Registry 事件数据
 */
export interface RegistryEvent {
  /** 事件类型 */
  type: RegistryEventType;
  /** Agent ID（clear 事件时为 undefined） */
  agentId?: string;
  /** Agent 描述符（unregister 和 clear 事件时为 undefined） */
  descriptor?: AgentDescriptor;
  /** 事件发生时间戳 */
  timestamp: number;
}

/**
 * Registry 事件监听器
 */
export type RegistryEventListener = (event: RegistryEvent) => void;

/**
 * Agent Registry 依赖项
 */
export interface AgentRegistryDeps {
  /** Logger 用于输出警告信息 */
  logger?: Pick<Console, 'warn'>;
}

/**
 * Agent Registry 实现类
 * 负责管理 Agent 描述符和适配器，支持事件通知机制
 */
class AgentRegistryImpl implements AgentRegistry {
  private descriptors: Map<string, AgentDescriptor> = new Map();
  private adapters: Map<string, AgentAdapter> = new Map();
  private readonly listeners: Map<RegistryEventType, Set<RegistryEventListener>> = new Map();

  constructor(private readonly deps: AgentRegistryDeps) {}

  /**
   * 注册一个新的 Agent，并触发 register 事件
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

    this.emit({ type: 'register', agentId: id, descriptor, timestamp: Date.now() });
  }

  /**
   * 取消注册 Agent，并触发 unregister 事件
   * @param id Agent ID
   * @returns 是否成功取消注册
   */
  unregister(id: string): boolean {
    const normalizedId = id.toLowerCase();
    const existed = this.descriptors.has(normalizedId);
    this.descriptors.delete(normalizedId);
    this.adapters.delete(normalizedId);

    if (existed) {
      this.emit({ type: 'unregister', agentId: normalizedId, timestamp: Date.now() });
    }

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
   * 清空所有已注册的 Agent，并触发 clear 事件
   */
  clear(): void {
    this.descriptors.clear();
    this.adapters.clear();

    this.emit({ type: 'clear', timestamp: Date.now() });
  }

  /**
   * 添加事件监听器
   * @param eventType 要监听的事件类型
   * @param listener 事件监听回调函数
   * @returns 取消监听的函数
   */
  on(eventType: RegistryEventType, listener: RegistryEventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * 触发事件通知
   * @param event 事件数据
   */
  private emit(event: RegistryEvent): void {
    const listeners = this.listeners.get(event.type);
    if (!listeners) return;

    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        this.deps.logger?.warn(`Registry event listener error for '${event.type}': ${err}`);
      }
    }
  }
}

/**
 * 获取 Agent Registry 单例实例
 * @param deps 依赖项
 * @returns Agent Registry 实例
 */
const { getInstance: getAgentRegistry, reset: resetAgentRegistry } = createSingleton<
  AgentRegistry & { on(eventType: RegistryEventType, listener: RegistryEventListener): () => void },
  AgentRegistryDeps
>((deps) => new AgentRegistryImpl({ logger: createSilentLogger(), ...deps }));

export { getAgentRegistry, resetAgentRegistry };
