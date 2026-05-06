import type { Skill, SkillContext, SkillResult } from './types.js';
import type { PromptRegistry } from '../nl/prompt/types.js';
import type { LLMDialogControlSkill } from './llm-dialog-control/index.js';
import { getAllIntentNames } from '../nl/templates/index.js';

export interface IntentSkillOutput {
  intent: string;
  confidence: number;
  params: Record<string, unknown>;
}

export function createIntentSkill(
  promptRegistry: PromptRegistry,
  llmDialogSkill: LLMDialogControlSkill
): Skill<string, IntentSkillOutput> {
  return {
    id: 'vectahub.intent',
    name: 'Intent Recognition',
    version: '2.0.0',
    description: '识别用户输入的意图',
    tags: ['intent', 'nlp', 'core'],

    async canHandle(context: SkillContext): Promise<boolean> {
      return context.userInput.length > 0;
    },

    async execute(userInput: string, context: SkillContext): Promise<SkillResult<IntentSkillOutput>> {
      const intentList = getAllIntentNames().join(', ');
      const projectContext = context.projectContext ? JSON.stringify(context.projectContext) : '';
      const userPreferences = context.userPreferences ? JSON.stringify(context.userPreferences) : '';
      const conversationHistory = context.executionHistory ? JSON.stringify(context.executionHistory) : '';

      try {
        const { system, user } = await promptRegistry.build('intent-parser-v1', {
          intentList,
          userInput,
          projectContext,
          userPreferences,
          conversationHistory
        });

        const result = await llmDialogSkill.generateJSON(user, system);

        console.debug(`[INTENT SKILL] LLM result: success=${result.success}, output length=${result.output?.length || 0}`);
        console.debug(`[INTENT SKILL] First 200 chars: ${result.output?.substring(0, 200)}`);

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
          console.debug(`[INTENT SKILL] Unknown intent: ${parsed.intent}, using WORKFLOW_GENERATE`);
          parsed.intent = 'WORKFLOW_GENERATE';
          parsed.confidence = Math.max(parsed.confidence ?? 0, 0.5);
        }

        return {
          success: true,
          data: parsed,
          confidence: parsed.confidence !== undefined ? parsed.confidence : undefined
        };
      } catch (error) {
        console.debug(`[INTENT SKILL] Exception: ${error instanceof Error ? error.message : String(error)}`);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          confidence: 0
        };
      }
    },
  };
}