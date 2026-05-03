export type AlertLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface AlertEvent {
  level: AlertLevel;
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export type AlertHandler = (event: AlertEvent) => void;

export interface AlertSystem {
  addListener(level: AlertLevel, handler: AlertHandler): void;
  removeListener(level: AlertLevel, handler: AlertHandler): void;
  emit(level: AlertLevel, message: string, metadata?: Record<string, any>): void;
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

  function emit(level: AlertLevel, message: string, metadata?: Record<string, any>): void {
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
