/**
 * Chat 模块内部工具函数集合
 * @module chat/utils
 */

/**
 * 从未知错误值中提取可读的错误消息字符串。
 * 统一处理 `Error` 实例和非 `Error` 类型的异常值。
 *
 * @param err - 捕获到的未知错误值
 * @returns 错误消息文本
 *
 * @example
 * ```ts
 * formatError(new Error('timeout')); // 'timeout'
 * formatError('raw string');         // 'raw string'
 * formatError(null);                 // 'null'
 * ```
 */
export function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
