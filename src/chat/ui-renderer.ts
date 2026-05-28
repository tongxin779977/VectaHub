/**
 * UI 渲染器。
 * 将 `ChatOutput` 和文本消息输出到日志系统，
 * 根据 `ChatConfig.logLevel` 控制输出粒度。
 * @module chat/ui-renderer
 */
import type { ChatOutput } from './types.js';
import type { ChatConfig } from './config.js';
import type pino from 'pino';

/**
 * UI 渲染器接口。
 * 所有 REPL 输出均通过此接口统一输出，便于替换渲染策略。
 */
export interface UIRenderer {
  /** 渲染结构化的 ChatOutput */
  render(output: ChatOutput): void;
  /** 渲染错误消息（不受 quiet 模式影响） */
  renderError(message: string): void;
  /** 渲染信息消息 */
  renderInfo(message: string): void;
  /** 渲染成功消息（带 ✅ 前缀） */
  renderSuccess(message: string): void;
  /** 渲染警告消息 */
  renderWarning(message: string): void;
  /** 渲染调试消息（仅 debug/verbose 级别） */
  renderDebug(message: string): void;
}

/**
 * 创建基于 pino logger 的 UI 渲染器实例。
 *
 * @param config - 聊天配置，决定输出级别
 * @param logger - pino 日志实例
 * @returns `UIRenderer` 实现
 */
export function createUIRenderer(config: ChatConfig, logger: pino.Logger): UIRenderer {
  const { logLevel } = config;

  return {
    render(output: ChatOutput): void {
      if (logLevel === 'quiet' && output.type !== 'error') {
        return;
      }

      switch (output.type) {
        case 'text':
          logger.info(output.content);
          break;
        case 'command-result':
          if (output.content) {
            logger.info(output.content);
          }
          if (output.metadata?.stderr) {
            logger.error(output.metadata.stderr as string);
          }
          break;
        case 'workflow':
          if (logLevel !== 'quiet') {
            logger.info(output.content);
          }
          break;
        case 'error':
          logger.error(output.content);
          break;
        default:
          if (output.content) {
            logger.info(output.content);
          }
          break;
      }
    },

    renderError(message: string): void {
      logger.error(message);
    },

    renderInfo(message: string): void {
      if (logLevel !== 'quiet') {
        logger.info(message);
      }
    },

    renderSuccess(message: string): void {
      if (logLevel !== 'quiet') {
        logger.info(`✅ ${message}`);
      }
    },

    renderWarning(message: string): void {
      if (logLevel !== 'quiet') {
        logger.warn(message);
      }
    },

    renderDebug(message: string): void {
      if (logLevel === 'debug' || logLevel === 'verbose') {
        logger.debug(message);
      }
    }
  };
}
