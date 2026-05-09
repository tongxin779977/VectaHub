import type { NLContext, NLResult, NLProcessor } from './types.js';
import type { IntentMatch, IntentPattern } from '../types.js';
import type { IntentName } from '../../types/nl.js';
import { createCoordinator } from './coordinator.js';
import { createTaskFromIntent } from '../command-synthesizer.js';

export function createKeywordFallback(patterns: IntentPattern[]): NLProcessor {
  const coordinator = createCoordinator(patterns);

  return {
    async parse(context: NLContext): Promise<NLResult> {
      const input = typeof context.input === 'string' ? context.input : '';
      const result = coordinator.match(input);

      if (!result.intents || result.intents.length === 0 || result.intents[0].intent === 'UNKNOWN') {
        return {
          success: false,
          intent: 'UNKNOWN',
          confidence: 0,
          metadata: { path: 'keyword-fallback' },
        };
      }

      const groupedEntities: Record<string, string[]> = {
        FILE_PATH: [],
        CLI_TOOL: [],
        PACKAGE_NAME: [],
        FUNCTION_NAME: [],
        BRANCH_NAME: [],
        ENV: [],
        OPTIONS: [],
      };

      const tasks = result.intents
        .filter(match => match.intent !== 'UNKNOWN')
        .map(match => createTaskFromIntent(match.intent as never, groupedEntities, input));

      if (tasks.length === 0) {
        return {
          success: false,
          intent: 'UNKNOWN',
          confidence: 0,
          metadata: { path: 'keyword-fallback' },
        };
      }

      return {
        success: true,
        intent: result.intents[0].intent as NLResult['intent'],
        confidence: result.intents[0].confidence,
        taskList: {
          version: '1.0',
          generatedAt: new Date().toISOString(),
          originalInput: input,
          intent: result.intents[0].intent as IntentName,
          confidence: result.intents[0].confidence,
          entities: groupedEntities,
          tasks,
          warnings: [],
        },
        metadata: {
          path: 'keyword-fallback',
        },
      };
    },
  };
}
