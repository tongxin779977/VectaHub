/**
 * 告警系统
 * AlertLevel 和 AlertEvent 从 infrastructure/trace-audit/types.ts 统一导出
 */

// 从统一类型定义导入并重新导出 AlertLevel
import type { AlertLevel } from '../infrastructure/trace-audit/types.js';
export type { AlertLevel };

// 重新定义 AlertEvent（因为包含 timestamp: Date）
export interface AlertEvent {
  level: AlertLevel;
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export type AlertHandler = (event: AlertEvent) => void;

export interface AlertSystem {
  addListener(level: AlertLevel, handler: AlertHandler): void;
  removeListener(level: AlertLevel, handler: AlertHandler): void;
  emit(level: AlertLevel, message: string, metadata?: Record<string, unknown>): void;
  getHistory(level?: AlertLevel, limit?: number): AlertEvent[];
}

export function createAlertSystem(maxHistory: number = 1000): AlertSystem {
  const listeners = new Map<AlertLevel, Set<AlertHandler>>();
  const history: AlertEvent[] = [];

  function addListener(level: AlertLevel, handler: AlertHandler): void {
    if (!listeners.has(level)) {
      listeners.set(level, new Set());
    }
    listeners.get(level)!.add(handler);
  }

  function removeListener(level: AlertLevel, handler: AlertHandler): void {
    const levelListeners = listeners.get(level);
    if (levelListeners) {
      levelListeners.delete(handler);
    }
  }

  function emit(level: AlertLevel, message: string, metadata?: Record<string, unknown>): void {
    const event: AlertEvent = {
      level,
      message,
      timestamp: new Date(),
      metadata,
    };

    // 添加到历史记录
    history.push(event);
    if (history.length > maxHistory) {
      history.shift();
    }

    // 通知所有匹配的监听器
    const levelListeners = listeners.get(level);
    if (levelListeners) {
      levelListeners.forEach(handler => handler(event));
    }
  }

  function getHistory(level?: AlertLevel, limit: number = 100): AlertEvent[] {
    let filtered = [...history];
    
    if (level) {
      filtered = filtered.filter(event => event.level === level);
    }
    
    return filtered.slice(-limit);
  }

  return {
    addListener,
    removeListener,
    emit,
    getHistory,
  };
}
