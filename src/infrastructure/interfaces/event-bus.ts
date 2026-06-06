/**
 * 事件监听器类型
 */
export type EventListener = (...args: unknown[]) => void;

/**
 * 事件总线接口
 */
export interface IEventBus {
  /**
   * 注册持久监听器
   * @param event 事件名
   * @param listener 监听器函数
   * @param context 上下文（用于批量注销）
   */
  on(event: string, listener: EventListener, context?: unknown): void;

  /**
   * 注册一次性监听器
   * @param event 事件名
   * @param listener 监听器函数
   * @param context 上下文
   */
  once(event: string, listener: EventListener, context?: unknown): void;

  /**
   * 注销监听器
   * @param event 事件名
   * @param listener 监听器函数（可选，不传则注销该事件所有监听器）
   */
  off(event: string, listener?: EventListener): void;

  /**
   * 根据上下文注销所有监听器
   * @param context 上下文
   */
  offByContext(context: unknown): void;

  /**
   * 触发事件
   * @param event 事件名
   * @param args 事件参数
   */
  emit(event: string, ...args: unknown[]): void;

  /**
   * 获取事件监听器数量
   * @param event 事件名
   */
  getListenerCount(event: string): number;

  /**
   * 清理所有监听器
   */
  cleanup(): void;
}
