import type { IntentMatch, IntentName, ParseResult, TaskList, ConfidenceLevel } from '../types/index.js';
import { createIntentMatcher, type IntentMatcher } from './intent-matcher.js';
import { createTaskFromIntent } from './command-synthesizer.js';
import { INTENT_TEMPLATES, convertTemplateToPattern, getAllIntentNames } from './templates/index.js';

const INTENT_PATTERNS = Object.values(INTENT_TEMPLATES).map(convertTemplateToPattern);

export interface NLParser {
  parse(input: string, sessionId?: string): IntentMatch;
  parseToTaskList(input: string, sessionId?: string): ParseResult;
  addPattern(intent: string, keywords: string[], weight?: number): void;
}

function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.9) return 'HIGH';
  if (confidence >= 0.7) return 'MEDIUM';
  if (confidence >= 0.5) return 'LOW';
  return 'UNCERTAIN';
}

export function createNLParser(): NLParser {
  const matcher = createIntentMatcher([...INTENT_PATTERNS]);

  return {
    parse(input: string, sessionId?: string): IntentMatch {
      return matcher.match(input, sessionId);
    },

    parseToTaskList(input: string, sessionId?: string): ParseResult {
      const intentMatch = matcher.match(input, sessionId);
      const confidenceLevel = getConfidenceLevel(intentMatch.confidence);

      const allIntentNames = getAllIntentNames();
      const candidates = allIntentNames
        .filter(name => name !== 'UNKNOWN')
        .slice(0, 8)
        .map(name => ({
          intent: name as IntentName,
          description: INTENT_TEMPLATES[name]?.description || name
        }));

      if (intentMatch.intent === 'UNKNOWN') {
        return {
          status: 'NEEDS_CLARIFICATION',
          confidenceLevel,
          originalInput: input,
          candidates,
        };
      }

      // 简化：直接创建任务，不做复杂实体提取
      const groupedEntities: any = {
        FILE_PATH: [],
        CLI_TOOL: [],
        PACKAGE_NAME: [],
        FUNCTION_NAME: [],
        BRANCH_NAME: [],
        ENV: [],
        OPTIONS: [],
      };
      const task = createTaskFromIntent(intentMatch.intent, groupedEntities, input);

      const taskList: TaskList = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        originalInput: input,
        intent: intentMatch.intent,
        confidence: intentMatch.confidence,
        entities: groupedEntities,
        tasks: [task],
        warnings: [],
      };

      return {
        status: 'SUCCESS',
        taskList,
        confidenceLevel,
        originalInput: input,
      };
    },

    addPattern(intent: IntentName, keywords: string[], weight = 0.8): void {
      matcher.registerPattern({ intent, keywords, weight });
    },
  };
}

export type { IntentMatcher } from './intent-matcher.js';
