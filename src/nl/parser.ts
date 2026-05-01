import type { IntentMatch, IntentName, EntityType, ParseResult, TaskList, ConfidenceLevel } from '../types/index.js';
import { createIntentMatcher, type IntentMatcher } from './intent-matcher.js';
import { createEntityExtractor } from './entity-extractor.js';
import { createCommandSynthesizer, createTaskFromIntent } from './command-synthesizer.js';
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

function groupEntitiesByType(entities: { type: EntityType; value: string }[]): Record<EntityType, string[]> {
  const grouped: Record<EntityType, string[]> = {
    FILE_PATH: [],
    CLI_TOOL: [],
    PACKAGE_NAME: [],
    FUNCTION_NAME: [],
    BRANCH_NAME: [],
    ENV: [],
    OPTIONS: [],
  };

  for (const entity of entities) {
    if (!grouped[entity.type].includes(entity.value)) {
      grouped[entity.type].push(entity.value);
    }
  }

  return grouped;
}

export function createNLParser(): NLParser {
  const matcher = createIntentMatcher([...INTENT_PATTERNS]);
  const extractor = createEntityExtractor();
  const synthesizer = createCommandSynthesizer();

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

      // 放宽置信度要求，只要匹配到意图就尝试解析
      if (intentMatch.intent === 'UNKNOWN') {
        return {
          status: 'NEEDS_CLARIFICATION',
          confidenceLevel,
          originalInput: input,
          candidates,
        };
      }

      const entities = extractor.extract(input);
      const groupedEntities = groupEntitiesByType(entities);
      const task = createTaskFromIntent(intentMatch.intent, groupedEntities, input);

      if (groupedEntities.CLI_TOOL.length > 0 && task.commands.length === 0) {
        const detectedCLI = groupedEntities.CLI_TOOL[0];
        const params: Record<string, string | string[] | undefined> = {};

        for (const [type, values] of Object.entries(groupedEntities)) {
          if (values.length > 0 && type !== 'CLI_TOOL') {
            params[type.toLowerCase()] = values.length === 1 ? values[0] : values;
          }
        }

        task.commands = [synthesizer.synthesize(task.type, params, detectedCLI)];
      }

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