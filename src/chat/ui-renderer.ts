import { getLogger } from '../utils/logger.js';
import type { ChatOutput } from './types.js';
import type { ChatConfig } from './config.js';

const logger = getLogger('chat-ui');

export interface UIRenderer {
  render(output: ChatOutput): void;
  renderError(message: string): void;
  renderInfo(message: string): void;
  renderSuccess(message: string): void;
  renderWarning(message: string): void;
  renderDebug(message: string): void;
}

export function createUIRenderer(config: ChatConfig): UIRenderer {
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
