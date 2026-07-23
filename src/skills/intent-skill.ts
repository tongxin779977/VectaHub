import type { Skill, SkillContext, SkillResult } from './types.js';
import { getAllIntentNames } from '../nl/templates/index.js';
import type pino from 'pino';

/**
 * Output from intent recognition skill
 * @property intent - The recognized intent name
 * @property confidence - Confidence score between 0 and 1
 * @property params - Extracted parameters from the input
 */
export interface IntentSkillOutput {
  intent: string;
  confidence: number;
  params: Record<string, unknown>;
}

/**
 * Creates an Intent Recognition skill
 * Uses LLM to analyze user input and extract intent and parameters
 * @param promptRegistry - Registry for building prompts
 * @param llmDialogSkill - LLM dialog control skill for generating responses
 * @param logger - Optional logger for debug output
 * @returns Skill instance for intent recognition
 */
export function createIntentSkill(
  promptRegistry: unknown,
  llmDialogSkill: unknown,
  logger: Pick<pino.Logger, 'debug'> = { debug: () => {} },
): Skill<string, IntentSkillOutput> {
  return {
    id: 'vectahub.intent',
    name: 'Intent Recognition',
    version: '2.0.0',
    description: '识别用户输入的意图',
    tags: ['intent', 'nlp', 'core'],

    /**
     * Checks if this skill can handle the given context
     * @param context - The skill context
     * @returns True if user input is not empty
     */
    async canHandle(context: SkillContext): Promise<boolean> {
      return context.userInput.length > 0;
    },

    /**
     * Executes intent recognition on the user input
     * @param userInput - The user input string to analyze
     * @param context - The skill context
     * @returns Promise resolving to SkillResult with IntentSkillOutput
     */
    async execute(userInput: string, context: SkillContext): Promise<SkillResult<IntentSkillOutput>> {
      const intentList = getAllIntentNames().join(', ');
      const projectContext = context.projectContext ? JSON.stringify(context.projectContext) : '';
      const userPreferences = context.userPreferences ? JSON.stringify(context.userPreferences) : '';
      const conversationHistory = context.executionHistory ? JSON.stringify(context.executionHistory) : '';

      try {
        const { system, user } = await (promptRegistry as any).build('intent-parser-v1', {
          intentList,
          userInput,
          projectContext,
          userPreferences,
          conversationHistory
        });

        const result = await (llmDialogSkill as any).generateJSON(user, system);

        logger.debug(`LLM result: success=${result.success}, output length=${result.output?.length || 0}`);
        logger.debug(`First 200 chars: ${result.output?.substring(0, 200)}`);

        if (!result.success || !result.output) {
          return {
            success: false,
            error: result.error || 'Failed to parse intent',
            confidence: 0
          };
        }

        const parsed = JSON.parse(result.output) as IntentSkillOutput;

        const validIntentNames = getAllIntentNames();
        if (!validIntentNames.includes(parsed.intent)) {
          logger.debug(`Unknown intent: ${parsed.intent}, using WORKFLOW_GENERATE`);
          parsed.intent = 'WORKFLOW_GENERATE';
          parsed.confidence = Math.max(parsed.confidence ?? 0, 0.5);
        }

        return {
          success: true,
          data: parsed,
          confidence: parsed.confidence ?? 0
        };
      } catch (error) {
        logger.debug(`Exception: ${error instanceof Error ? error.message : String(error)}`);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          confidence: 0
        };
      }
    },
  };
}
