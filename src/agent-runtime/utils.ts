/**
 * 创建单例工厂
 * @param createInstance 创建实例的函数
 * @param resetInstance 重置时调用的清理函数
 * @returns 包含 getInstance 和 reset 方法的对象
 */
export function createSingleton<T, D = unknown>(
  createInstance: (deps?: D) => T,
  resetInstance?: () => void
) {
  let instance: T | null = null;
  
  const getInstance = (deps?: D): T => {
    if (!instance) {
      instance = createInstance(deps);
    }
    return instance;
  };
  
  const reset = () => {
    instance = null;
    resetInstance?.();
  };
  
  return { getInstance, reset };
}

/**
 * 创建静默 logger（不输出任何内容）
 * @returns 包含 warn, error, info 方法的对象
 */
export function createSilentLogger(): Pick<Console, 'warn' | 'error' | 'info'> {
  return {
    warn: () => {},
    error: () => {},
    info: () => {}
  };
}

/**
 * 格式化错误信息
 * @param error 错误对象或值
 * @returns 错误信息字符串
 */
export function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 创建 debounce 函数，在指定延迟时间后执行目标函数
 * 如果在延迟期间再次调用，会重新计时
 * @param fn 要防抖的函数
 * @param delayMs 延迟时间（毫秒）
 * @returns 防抖后的函数，包含 cancel 方法用于取消待执行的调用
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number,
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const debounced = ((...args: unknown[]) => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = undefined;
    }, delayMs);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  return debounced;
}

/**
 * 创建 throttle 函数，限制目标函数在指定时间窗口内最多执行一次
 * 首次调用立即执行，之后在时间窗口内的调用会被忽略
 * @param fn 要节流的函数
 * @param intervalMs 节流时间窗口（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  intervalMs: number,
): T {
  let lastCallTime = 0;

  return ((...args: unknown[]) => {
    const now = Date.now();
    if (now - lastCallTime >= intervalMs) {
      lastCallTime = now;
      return fn(...args);
    }
  }) as T;
}
