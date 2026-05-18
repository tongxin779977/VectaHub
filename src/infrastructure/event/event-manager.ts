import { EventEmitter } from 'node:events';

/**
 * 监听器条目
 */
interface ListenerEntry {
  event: string;
  listener: (...args: unknown[]) => void;
  context?: unknown;
  isOnce: boolean;
}

/**
 * 事件管理器接口
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
 * 全局事件发射器
 */
const globalEmitter = new EventEmitter();
const registeredListeners = new Map<string, Set<(...args: unknown[]) => void>>();
const contextListeners = new Map<unknown, ListenerEntry[]>();

/**
 * 创建监听器唯一标识
 */
function createKey(event: string, listener: (...args: unknown[]) => void): string {
  return `${event}:${listener.name || listener.toString().slice(0, 100)}`;
}

/**
 * 创建事件管理器
 */
export function createEventManager(): EventManager {
  return {
    /**
     * 注册持久监听器
     */
    on(event: string, listener: (...args: unknown[]) => void, context?: unknown): void {
      const key = createKey(event, listener);

      if (!registeredListeners.has(key)) {
        registeredListeners.set(key, new Set());
      }
      
      const listeners = registeredListeners.get(key)!;
      if (listeners.has(listener)) {
        return;
      }

      listeners.add(listener);
      globalEmitter.on(event, listener);

      if (context) {
        if (!contextListeners.has(context)) {
          contextListeners.set(context, []);
        }
        contextListeners.get(context)!.push({ event, listener, context, isOnce: false });
      }
    },

    /**
     * 注册一次性监听器
     */
    once(event: string, listener: (...args: unknown[]) => void, context?: unknown): void {
      const key = createKey(event, listener);

      if (!registeredListeners.has(key)) {
        registeredListeners.set(key, new Set());
      }
      
      const listeners = registeredListeners.get(key)!;
      if (listeners.has(listener)) {
        return;
      }

      const onceWrapper = (...args: unknown[]) => {
        const wrapperKey = createKey(event, onceWrapper);
        registeredListeners.get(wrapperKey)?.delete(onceWrapper);
        globalEmitter.off(event, onceWrapper);
        
        const ctxEntries = contextListeners.get(context!);
        if (ctxEntries) {
          const idx = ctxEntries.findIndex(e => e.listener === onceWrapper);
          if (idx >= 0) ctxEntries.splice(idx, 1);
        }
        
        listener(...args);
      };

      listeners.add(listener);
      globalEmitter.once(event, onceWrapper);

      if (context) {
        if (!contextListeners.has(context)) {
          contextListeners.set(context, []);
        }
        contextListeners.get(context)!.push({ event, listener: onceWrapper, context, isOnce: true });
      }
    },

    /**
     * 取消注册监听器
     */
    off(event: string, listener?: (...args: unknown[]) => void): void {
      if (listener) {
        const key = createKey(event, listener);
        registeredListeners.get(key)?.delete(listener);
        globalEmitter.off(event, listener);

        for (const [, entries] of contextListeners) {
          const idx = entries.findIndex(e => e.event === event && e.listener === listener);
          if (idx >= 0) entries.splice(idx, 1);
        }
      } else {
        globalEmitter.removeAllListeners(event);
        
        const keysToRemove: string[] = [];
        for (const key of registeredListeners.keys()) {
          if (key.startsWith(`${event}:`)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => registeredListeners.delete(key));

        for (const [ctx, entries] of contextListeners) {
          const filtered = entries.filter(e => e.event !== event);
          if (filtered.length === 0) {
            contextListeners.delete(ctx);
          } else {
            contextListeners.set(ctx, filtered);
          }
        }
      }
    },

    /**
     * 根据上下文取消注册所有监听器
     */
    offByContext(context: unknown): void {
      const entries = contextListeners.get(context);
      if (entries) {
        for (const { event, listener } of entries) {
          const key = createKey(event, listener);
          registeredListeners.get(key)?.delete(listener);
          globalEmitter.off(event, listener);
        }
        contextListeners.delete(context);
      }
    },

    /**
     * 触发事件
     */
    emit(event: string, ...args: unknown[]): void {
      globalEmitter.emit(event, ...args);
    },

    /**
     * 获取事件监听器数量
     */
    getListenerCount(event: string): number {
      return globalEmitter.listenerCount(event);
    },

    /**
     * 清理所有监听器
     */
    cleanup(): void {
      globalEmitter.removeAllListeners();
      registeredListeners.clear();
      contextListeners.clear();
    },
  };
}

/**
 * 全局事件管理器实例
 */
export const globalEventManager = createEventManager();
