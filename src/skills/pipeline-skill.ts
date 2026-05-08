
import type { Skill, SkillContext, SkillResult, CompositeSkill } from './types.js';
import type { IntentSkillOutput } from './intent-skill.js';
import type { WorkflowSkillOutput } from './workflow-skill.js';

interface PipelineCommandResult {
  commands: string[];
}

export interface PipelineSkillInput {
  intent: string;
  params: Record<string, unknown>;
  commands: Array<{ cli: string; args: string[] }>;
}

export function createPipelineSkill(
  intentSkill: Skill<string, IntentSkillOutput>,
  workflowSkill: Skill<any, WorkflowSkillOutput>
): CompositeSkill {
  return {
    id: 'vectahub.pipeline',
    name: 'End-to-End Pipeline',
    version: '2.0.0',
    description: '完整的从用户输入到工作流生成的流水线',
    tags: ['pipeline', 'core'],
    skills: [intentSkill, workflowSkill],
    strategy: 'sequential',

    async canHandle(context: SkillContext): Promise<boolean> {
      return true;
    },

    async execute(userInput: string, context: SkillContext): Promise<SkillResult<{ workflowYAML: string }>> {
      const intentResult = await intentSkill.execute(userInput, context);
      if (!intentResult.success || !intentResult.data) {
        return {
          success: false,
          error: intentResult.error || 'Intent recognition failed',
          confidence: 0
        };
      }

      const workflowResult = await workflowSkill.execute({
        intent: intentResult.data.intent,
        params: intentResult.data.params,
        commands: [],
        userInput: userInput
      }, context);

      if (workflowResult.success && workflowResult.data) {
        return {
          ...workflowResult,
          confidence: Math.min(intentResult.confidence ?? 0, workflowResult.confidence ?? 0),
          data: {
            ...workflowResult.data
          }
        };
      }

      return workflowResult;
    },
  };
}
