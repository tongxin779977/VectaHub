/**
 * Chat REPL 配置模块。
 * 定义配置类型、默认值生成和配置格式化工具。
 * @module chat/config
 */

/**
 * 日志输出级别。
 * - `quiet`: 仅输出错误
 * - `normal`: 输出 info 及以上
 * - `debug`: 输出 debug 及以上
 * - `verbose`: 输出所有日志
 */
export type ChatLogLevel = 'quiet' | 'normal' | 'debug' | 'verbose';

/**
 * 工作流执行模式。
 * - `auto`: 自动生成后立即执行
 * - `confirm`: 生成后需用户确认
 * - `manual`: 仅生成，不自动执行
 */
export type ChatExecuteMode = 'auto' | 'confirm' | 'manual';

/**
 * 聊天配置接口。
 */
export interface ChatConfig {
  /** REPL 提示符 */
  prompt: string;
  /** 默认会话标识符 */
  defaultSessionId: string;
  /** 日志输出级别 */
  logLevel: ChatLogLevel;
  /** 工作流执行模式 */
  executeMode: ChatExecuteMode;
  /** 是否启用 LLM 能力 */
  enableLLM: boolean;
}

/**
 * 创建默认聊天配置。
 * 使用工厂函数避免共享可变默认对象。
 *
 * @returns 默认配置实例
 */
export function createDefaultChatConfig(): ChatConfig {
  return {
    prompt: 'vectahub> ',
    defaultSessionId: 'default',
    logLevel: 'normal',
    executeMode: 'confirm',
    enableLLM: true,
  };
}

/**
 * 将聊天配置格式化为可读字符串。
 * 用于 REPL 启动时的状态展示。
 *
 * @param config - 聊天配置实例
 * @returns 格式化的配置描述
 */
export function formatChatConfig(config: ChatConfig): string {
  return [
    `[mode=${config.executeMode}]`,
    `[log=${config.logLevel}]`,
    `[llm=${config.enableLLM ? 'on' : 'off'}]`,
  ].join(' ');
}
