
import type { Skill, SkillContext, SkillResult, CompositeSkill } from './types.js';
import type { IntentSkillOutput } from './intent-skill.js';
import type { WorkflowSkillInput, WorkflowSkillOutput } from './workflow-skill.js';

/**
 * Input for the pipeline skill
 * @property intent - The recognized intent
 * @property params - Parameters extracted from user input
 * @property commands - Array of CLI commands to include
 */
export interface PipelineSkillInput {
  intent: string;
  params: Record<string, unknown>;
  commands: Array<{ cli: string; args: string[] }>;
}

/**
 * Creates an End-to-End Pipeline skill
 * Combines intent recognition and workflow generation into a sequential pipeline
 * @param intentSkill - The intent recognition skill
 * @param workflowSkill - The workflow generation skill
 * @returns CompositeSkill instance for end-to-end pipeline execution
 */
export function createPipelineSkill(
  intentSkill: Skill<string, IntentSkillOutput>,
  workflowSkill: Skill<WorkflowSkillInput, WorkflowSkillOutput>
): CompositeSkill {
  return {
    id: 'vectahub.pipeline',
    name: 'End-to-End Pipeline',
    version: '2.0.0',
    description: '完整的从用户输入到工作流生成的流水线',
    tags: ['pipeline', 'core'],
    skills: [intentSkill, workflowSkill],
    strategy: 'sequential',

    /**
     * Checks if this skill can handle the given context
     * @param _context - The skill context
     * @returns Always returns true
     */
    async canHandle(_context: SkillContext): Promise<boolean> {
      return true;
    },

    /**
     * Executes the end-to-end pipeline
     * First recognizes intent, then generates workflow
     * @param userInput - The user input string
     * @param context - The skill context
     * @returns Promise resolving to SkillResult with workflow YAML
     */
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
