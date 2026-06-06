import { createCliPlugin } from './factory.js';
import type { CliPlugin } from './types.js';

export function createGeminiCliPlugin(): CliPlugin {
  return createCliPlugin({
    id: 'vectahub.cli.gemini',
    name: 'Gemini CLI',
    cliCommand: 'gemini',
    delegateTo: 'gemini',
    capabilities: {
      supportedActions: ['chat', 'code-review', 'generate'],
      outputFormats: ['text', 'json'],
      requiresAuth: false,
    },
  });
}
