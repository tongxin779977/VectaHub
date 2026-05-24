import { getDefaultContext } from '../context.js';
import { createEventManagerWithDeps, type EventManager, type EventManagerDeps } from './event-manager.js';

function resolveEventBusBridge(): EventManagerDeps['eventBus'] {
  return getDefaultContext().eventBus;
}

function createEventManagerBridgeDeps(): EventManagerDeps {
  return {
    eventBus: {
      on(event, listener, context) {
        resolveEventBusBridge().on(event, listener, context);
      },
      once(event, listener, context) {
        resolveEventBusBridge().once(event, listener, context);
      },
      off(event, listener) {
        resolveEventBusBridge().off(event, listener);
      },
      offByContext(context) {
        resolveEventBusBridge().offByContext(context);
      },
      emit(event, ...args) {
        resolveEventBusBridge().emit(event, ...args);
      },
      getListenerCount(event) {
        return resolveEventBusBridge().getListenerCount(event);
      },
      cleanup() {
        resolveEventBusBridge().cleanup();
      },
    },
  };
}

/**
 * 兼容桥接层：默认 context 仅用于历史无参 API。
 * @deprecated 建议使用 createEventManagerWithDeps(deps) 或 InfrastructureContext.eventBus
 */
export function createEventManager(): EventManager {
  return createEventManagerWithDeps(createEventManagerBridgeDeps());
}

/**
 * 兼容桥接层：默认 context 仅用于历史全局 API。
 * @deprecated 建议使用 createEventManagerWithDeps(deps) 或 InfrastructureContext.eventBus
 */
export const globalEventManager = createEventManager();
