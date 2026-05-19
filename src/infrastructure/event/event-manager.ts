import { getDefaultContext } from '../context.js';

/**
 * 事件管理器接口（保持向后兼容）
 */
export interface EventManager {
  on(event: string, listener: (...args: unknown[]) => void, context?: unknown): void;
  once(event: string, listener: (...args: unknown[]) => void, context?: unknown): void;
  off(event: string, listener?: (...args: unknown[]) => void): void;
  offByContext(context: unknown): void;
  emit(event: string, ...args: unknown[]): void;
  getListenerCount(event: string): number;
  cleanup(): void;
}

// 导出 EventBus
export { EventBus } from './bus.js';

/**
 * 创建事件管理器（向后兼容）
 * @deprecated 建议使用 new EventBus() 或 InfrastructureContext.eventBus
 */
export function createEventManager(): EventManager {
  // 返回一个包装器，使用默认 context 的 eventBus
  const bus = getDefaultContext().eventBus;
  return {
    on: (event, listener, context) => bus.on(event, listener, context),
    once: (event, listener, context) => bus.once(event, listener, context),
    off: (event, listener) => bus.off(event, listener),
    offByContext: (context) => bus.offByContext(context),
    emit: (event, ...args) => bus.emit(event, ...args),
    getListenerCount: (event) => bus.getListenerCount(event),
    cleanup: () => bus.cleanup(),
  };
}

/**
 * 全局事件管理器实例（向后兼容）
 * @deprecated 建议使用 InfrastructureContext.eventBus
 */
export const globalEventManager = createEventManager();
