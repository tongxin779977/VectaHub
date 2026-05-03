
import type { Skill, SkillContext, SkillResult } from './types.js';
import type { PromptRegistry } from '../nl/prompt/types.js';
import type { LLMDialogControlSkill } from './llm-dialog-control/index.js';
import { createCommandSynthesizer } from '../nl/command-synthesizer.js';
import { createIntentMatcher } from '../nl/intent-matcher.js';
import { INTENT_TEMPLATES, convertTemplateToPattern } from '../nl/templates/index.js';

export interface CommandSkillInput {
  intent: string;
  params: Record<string, unknown>;
  userInput: string;
}

export interface CommandSkillOutput {
  commands: Array<{ cli: string; args: string[] }>;
}

export function createCommandSkill(
  promptRegistry: PromptRegistry,
  llmDialogSkill: LLMDialogControlSkill
): Skill<CommandSkillInput, CommandSkillOutput> {
  return {
    id: 'vectahub.command',
    name: 'Command Generation',
    version: '2.0.0',
    description: '根据意图生成具体的 CLI 命令',
    tags: ['command', 'cli', 'generation'],

    async canHandle(context: SkillContext): Promise<boolean> {
      return true;
    },

    async execute(input: CommandSkillInput, context: SkillContext): Promise<SkillResult<CommandSkillOutput>> {
      try {
        const { system, user } = await promptRegistry.build('command-generator-v1', {
          intent: input.intent,
          params: JSON.stringify(input.params),
          userInput: input.userInput
        });

        const result = await llmDialogSkill.generateJSON(user, system);

        if (result.success && result.output) {
          const parsed = JSON.parse(result.output) as CommandSkillOutput;
          if (parsed.commands && parsed.commands.length > 0) {
            return {
              success: true,
              data: parsed,
              confidence: 0.9
            };
          }
        }
      } catch (error) {
        // Fallback to keyword matching
      }

      // Fallback to existing command synthesizer
      const fallbackCommands = fallbackToKeywordMatching(input);
      return {
        success: true,
        data: { commands: fallbackCommands },
        confidence: 0.5,
        metadata: { fallback: true }
      };
    },
  };
}

function fallbackToKeywordMatching(input: CommandSkillInput): Array<{ cli: string; args: string[] }> {
  const patterns = Object.values(INTENT_TEMPLATES).map(convertTemplateToPattern);
  const matcher = createIntentMatcher(patterns);
  const match = matcher.match(input.userInput);

  const synthesizer = createCommandSynthesizer();

  const taskTypeMap: Record<string, any> = {
    FILE_FIND: 'QUERY_EXEC',
    GIT_WORKFLOW: 'GIT_OPERATION',
    RUN_SCRIPT: 'TEST_RUN',
    SYSTEM_INFO: 'QUERY_EXEC',
    QUERY_INFO: 'QUERY_EXEC',
    INSTALL_PACKAGE: 'PACKAGE_INSTALL',
    CREATE_FILE: 'CODE_CREATE'
  };

  const taskType = taskTypeMap[match.intent] || 'QUERY_EXEC';
  const params = input.params as any;

  return [synthesizer.synthesize(taskType, params)];
}
