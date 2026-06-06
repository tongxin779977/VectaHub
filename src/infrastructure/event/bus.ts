import { EventEmitter } from 'node:events';
import type { IEventBus, EventListener } from '../interfaces/index.js';

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
 * 事件总线实现
 */
export class EventBus implements IEventBus {
  private emitter: EventEmitter;
  private registeredListeners: Map<string, Set<(...args: unknown[]) => void>>;
  private contextListeners: Map<unknown, ListenerEntry[]>;

  constructor() {
    this.emitter = new EventEmitter();
    this.registeredListeners = new Map();
    this.contextListeners = new Map();
  }

  private createKey(event: string, listener: (...args: unknown[]) => void): string {
    return `${event}:${listener.name || listener.toString().slice(0, 100)}`;
  }

  on(event: string, listener: EventListener, context?: unknown): void {
    const key = this.createKey(event, listener);

    if (!this.registeredListeners.has(key)) {
      this.registeredListeners.set(key, new Set());
    }
    
    const listeners = this.registeredListeners.get(key)!;
    if (listeners.has(listener)) {
      return;
    }

    listeners.add(listener);
    this.emitter.on(event, listener);

    if (context) {
      if (!this.contextListeners.has(context)) {
        this.contextListeners.set(context, []);
      }
      this.contextListeners.get(context)!.push({ event, listener, context, isOnce: false });
    }
  }

  once(event: string, listener: EventListener, context?: unknown): void {
    const key = this.createKey(event, listener);

    if (!this.registeredListeners.has(key)) {
      this.registeredListeners.set(key, new Set());
    }
    
    const listeners = this.registeredListeners.get(key)!;
    if (listeners.has(listener)) {
      return;
    }

    const onceWrapper = (...args: unknown[]) => {
      const wrapperKey = this.createKey(event, onceWrapper);
      this.registeredListeners.get(wrapperKey)?.delete(onceWrapper);
      this.emitter.off(event, onceWrapper);
      
      const ctxEntries = this.contextListeners.get(context!);
      if (ctxEntries) {
        const idx = ctxEntries.findIndex(e => e.listener === onceWrapper);
        if (idx >= 0) ctxEntries.splice(idx, 1);
      }
      
      listener(...args);
    };

    listeners.add(listener);
    this.emitter.once(event, onceWrapper);

    if (context) {
      if (!this.contextListeners.has(context)) {
        this.contextListeners.set(context, []);
      }
      this.contextListeners.get(context)!.push({ event, listener: onceWrapper, context, isOnce: true });
    }
  }

  off(event: string, listener?: EventListener): void {
    if (listener) {
      const key = this.createKey(event, listener);
      this.registeredListeners.get(key)?.delete(listener);
      this.emitter.off(event, listener);

      for (const [, entries] of this.contextListeners) {
        const idx = entries.findIndex(e => e.event === event && e.listener === listener);
        if (idx >= 0) entries.splice(idx, 1);
      }
    } else {
      this.emitter.removeAllListeners(event);
      
      const keysToRemove: string[] = [];
      for (const key of this.registeredListeners.keys()) {
        if (key.startsWith(`${event}:`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => this.registeredListeners.delete(key));

      for (const [ctx, entries] of this.contextListeners) {
        const filtered = entries.filter(e => e.event !== event);
        if (filtered.length === 0) {
          this.contextListeners.delete(ctx);
        } else {
          this.contextListeners.set(ctx, filtered);
        }
      }
    }
  }

  offByContext(context: unknown): void {
    const entries = this.contextListeners.get(context);
    if (entries) {
      for (const { event, listener } of entries) {
        const key = this.createKey(event, listener);
        this.registeredListeners.get(key)?.delete(listener);
        this.emitter.off(event, listener);
      }
      this.contextListeners.delete(context);
    }
  }

  emit(event: string, ...args: unknown[]): void {
    this.emitter.emit(event, ...args);
  }

  getListenerCount(event: string): number {
    return this.emitter.listenerCount(event);
  }

  cleanup(): void {
    this.emitter.removeAllListeners();
    this.registeredListeners.clear();
    this.contextListeners.clear();
  }
}
