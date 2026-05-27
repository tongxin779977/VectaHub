import { createCliPlugin } from './factory.js';
import type { CliPlugin } from './types.js';

export function createFeishuCliPlugin(): CliPlugin {
  return createCliPlugin({
    id: 'vectahub.cli.feishu',
    name: 'Feishu CLI',
    cliCommand: 'feishu',
    delegateTo: 'feishu',
    capabilities: {
      supportedActions: ['send-message', 'list-channels', 'upload-file'],
      outputFormats: ['text', 'json'],
      requiresAuth: true,
    },
  });
}
