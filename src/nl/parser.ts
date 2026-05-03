import type { IntentMatch, IntentName, ParseResult, TaskList, ConfidenceLevel, UserPreferences, ProjectContext } from '../types/index.js';
import { createIntentMatcher, type IntentMatcher } from './intent-matcher.js';
import { createTaskFromIntent } from './command-synthesizer.js';
import { INTENT_TEMPLATES, convertTemplateToPattern, getAllIntentNames } from './templates/index.js';
import type { Skill, SkillContext, SkillResult, CompositeSkill } from '../skills/types.js';

const INTENT_PATTERNS = Object.values(INTENT_TEMPLATES).map(convertTemplateToPattern);

export interface NLParser {
  parse(input: string, sessionId?: string): IntentMatch;
  parseToTaskList(input: string, sessionId?: string): ParseResult;
  addPattern(intent: string, keywords: string[], weight?: number): void;
}

export interface EnhancedNLParser {
  parse(input: string, sessionId?: string): Promise<ParseResult>;
}

function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.9) return 'HIGH';
  if (confidence >= 0.7) return 'MEDIUM';
  if (confidence >= 0.5) return 'LOW';
  return 'UNCERTAIN';
}

export function createTaskListFromWorkflow(workflowYAML: string, userInput: string): TaskList {
  const allIntentNames = getAllIntentNames();
  let detectedIntent: IntentName = 'QUERY_INFO';
  for (const intentName of allIntentNames) {
    if (workflowYAML.includes(intentName)) {
      detectedIntent = intentName as IntentName;
      break;
    }
  }

  const groupedEntities: any = {
    FILE_PATH: [],
    CLI_TOOL: [],
    PACKAGE_NAME: [],
    FUNCTION_NAME: [],
    BRANCH_NAME: [],
    ENV: [],
    OPTIONS: [],
  };

  const task = createTaskFromIntent(detectedIntent, groupedEntities, userInput);

  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    originalInput: userInput,
    intent: detectedIntent,
    confidence: 0.8,
    entities: groupedEntities,
    tasks: [task],
    warnings: [],
  };
}

export function createEnhancedNLParser(
  pipelineSkill: CompositeSkill,
  fallbackParser: NLParser
): EnhancedNLParser {
  return {
    async parse(input: string, sessionId?: string): Promise<ParseResult> {
      const context: SkillContext = {
        userInput: input,
        sessionId: sessionId,
      };

      try {
        const result = await pipelineSkill.execute(input, context);
        if (result.success && result.data && result.confidence >= 0.7) {
          const taskList = createTaskListFromWorkflow((result.data as { workflowYAML?: string })?.workflowYAML ?? '', input);
          return {
            status: 'SUCCESS',
            taskList,
            confidenceLevel: getConfidenceLevel(result.confidence),
            originalInput: input,
          };
        }
      } catch {
      }

      return fallbackParser.parseToTaskList(input, sessionId);
    },
  };
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
