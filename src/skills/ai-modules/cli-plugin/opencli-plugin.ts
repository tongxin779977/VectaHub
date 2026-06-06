import { createCliPlugin } from './factory.js';
import type { CliPlugin } from './types.js';

export function createOpenCliPlugin(): CliPlugin {
  return createCliPlugin({
    id: 'vectahub.cli.opencli',
    name: 'OpenCLI',
    cliCommand: 'opencli',
    delegateTo: 'opencli',
    capabilities: {
      supportedActions: ['scrape', 'search', 'summarize'],
      outputFormats: ['text', 'json'],
      requiresAuth: false,
    },
  });
}
