import type { NLContext, NLResult, NLProcessor } from './types.js';
import { createNLParser } from '../parser.js';

export function createKeywordAdapter(): NLProcessor {
  return {
    async parse(context: NLContext): Promise<NLResult> {
      const parser = createNLParser();
      const parseResult = parser.parseToTaskList(context.input);

      if (parseResult.status === 'SUCCESS' && parseResult.taskList) {
        return {
          success: true,
          intent: parseResult.taskList.intent,
          confidence: parseResult.taskList.confidence,
          taskList: parseResult.taskList,
          metadata: {
            path: 'keyword-fallback',
            usedSkills: [],
          },
        };
      }

      return {
        success: false,
        confidence: 0,
        metadata: {
          path: 'keyword-fallback',
          usedSkills: [],
          fallbackReason: 'No matching intent found',
        },
      };
    },
  };
}
