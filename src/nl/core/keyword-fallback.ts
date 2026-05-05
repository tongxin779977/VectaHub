import type { NLContext, NLResult, NLProcessor } from './types.js';
import type { IntentMatch, IntentPattern } from '../types.js';
import type { IntentName } from '../../types/nl.js';
import { createMatchingPipeline } from './matching-pipeline.js';
import { createTaskFromIntent } from '../command-synthesizer.js';

export function createKeywordFallback(patterns: IntentPattern[]): NLProcessor {
  const pipeline = createMatchingPipeline();

  return {
    async parse(context: NLContext): Promise<NLResult> {
      const input = typeof context.input === 'string' ? context.input : '';
      const match = pipeline.match(input, patterns);

      if (!match || match.intent === 'UNKNOWN') {
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

      const task = createTaskFromIntent(match.intent as never, groupedEntities, input);

      return {
        success: true,
        intent: match.intent as NLResult['intent'],
        confidence: match.confidence,
        taskList: {
          version: '1.0',
          generatedAt: new Date().toISOString(),
          originalInput: input,
          intent: match.intent as IntentName,
          confidence: match.confidence,
          entities: groupedEntities,
          tasks: [task],
          warnings: [],
        },
        metadata: {
          path: 'keyword-fallback',
        },
      };
    },
  };
}
