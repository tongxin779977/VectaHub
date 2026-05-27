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
