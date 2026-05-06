import { EventEmitter } from 'node:events';

interface ListenerEntry {
  event: string;
  listener: (...args: unknown[]) => void;
  context?: unknown;
  isOnce: boolean;
}

export interface EventManager {
  on(event: string, listener: (...args: unknown[]) => void, context?: unknown): void;
  once(event: string, listener: (...args: unknown[]) => void, context?: unknown): void;
  off(event: string, listener?: (...args: unknown[]) => void): void;
  offByContext(context: unknown): void;
  emit(event: string, ...args: unknown[]): void;
  getListenerCount(event: string): number;
  cleanup(): void;
}

const globalEmitter = new EventEmitter();
const registeredListeners = new Map<string, Set<(...args: unknown[]) => void>>();
const contextListeners = new Map<unknown, ListenerEntry[]>();

function createKey(event: string, listener: (...args: unknown[]) => void): string {
  return `${event}:${listener.name || listener.toString().slice(0, 100)}`;
}

export function createEventManager(): EventManager {
  return {
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

    emit(event: string, ...args: unknown[]): void {
      globalEmitter.emit(event, ...args);
    },

    getListenerCount(event: string): number {
      return globalEmitter.listenerCount(event);
    },

    cleanup(): void {
      globalEmitter.removeAllListeners();
      registeredListeners.clear();
      contextListeners.clear();
    },
  };
}

export const globalEventManager = createEventManager();