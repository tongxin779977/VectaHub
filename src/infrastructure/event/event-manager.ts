import { getDefaultContext } from '../context.js';
import type { IEventBus, EventListener } from '../interfaces/index.js';

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

/**
 * 事件管理器显式依赖契约
 */
export interface EventManagerDeps {
  eventBus: IEventBus;
}

/**
 * 基于显式依赖创建事件管理器
 */
export function createEventManagerWithDeps(deps: EventManagerDeps): EventManager {
  const eventBus = deps.eventBus;

  return {
    on(event, listener, context) {
      eventBus.on(event, listener as EventListener, context);
    },
    once(event, listener, context) {
      eventBus.once(event, listener as EventListener, context);
    },
    off(event, listener) {
      eventBus.off(event, listener as EventListener | undefined);
    },
    offByContext(context) {
      eventBus.offByContext(context);
    },
    emit(event, ...args) {
      eventBus.emit(event, ...args);
    },
    getListenerCount(event) {
      return eventBus.getListenerCount(event);
    },
    cleanup() {
      eventBus.cleanup();
    },
  };
}

// 导出 EventBus
export { EventBus } from './bus.js';

/**
 * 兼容桥接入口：默认 context 仅用于历史无参 API。
 * event-manager.ts 作为 event 模块的桥接文件，
 * 在 check:default-context-usage 白名单中。
 * @deprecated 建议使用 createEventManagerWithDeps(deps) 或 InfrastructureContext.eventBus
 */
export function createEventManager(): EventManager {
  const eventBus = getDefaultContext().eventBus;
  return createEventManagerWithDeps({ eventBus });
}

/**
 * 兼容桥接入口：默认 context 仅用于历史全局单例。
 * @deprecated 建议使用 createEventManagerWithDeps(deps) 或 InfrastructureContext.eventBus
 */
export const globalEventManager = createEventManager();
