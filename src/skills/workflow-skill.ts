
import type { Skill, SkillContext, SkillResult } from './types.js';
import type { PromptRegistry } from '../nl/prompt/types.js';
import type { LLMDialogControlSkill } from './llm-dialog-control/index.js';
import { INTENT_TEMPLATES } from '../nl/templates/index.js';

export interface WorkflowSkillInput {
  intent: string;
  params: Record<string, unknown>;
  commands: Array<{ cli: string; args: string[] }>;
  userInput: string;
}

export interface WorkflowSkillOutput {
  workflowYAML: string;
}

export function createWorkflowSkill(
  promptRegistry: PromptRegistry,
  llmDialogSkill: LLMDialogControlSkill
): Skill<WorkflowSkillInput, WorkflowSkillOutput> {
  return {
    id: 'vectahub.workflow',
    name: 'Workflow Generation',
    version: '2.0.0',
    description: '生成完整的 VectaHub 工作流 YAML',
    tags: ['workflow', 'yaml', 'generation'],

    async canHandle(context: SkillContext): Promise<boolean> {
      return true;
    },

    async execute(input: WorkflowSkillInput, context: SkillContext): Promise<SkillResult<WorkflowSkillOutput>> {
      try {
        const { system, user } = await promptRegistry.build('workflow-generator-v2', {
          userInput: input.userInput,
          intent: input.intent,
          commands: JSON.stringify(input.commands)
        });

        const result = await llmDialogSkill.generateYAML(user, system);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to generate workflow YAML',
            confidence: 0
          };
        }

        const isValid = validateWorkflowYAML(result.output);
        if (!isValid) {
          const fallbackYAML = createFallbackWorkflow(input);
          return {
            success: true,
            data: { workflowYAML: fallbackYAML },
            confidence: 0.6,
            metadata: { fallback: true }
          };
        }

        return {
          success: true,
          data: { workflowYAML: result.output },
          confidence: 0.85
        };
      } catch (error) {
        const fallbackYAML = createFallbackWorkflow(input);
        return {
          success: true,
          data: { workflowYAML: fallbackYAML },
          confidence: 0.5,
          metadata: { fallback: true }
        };
      }
    },
  };
}

function validateWorkflowYAML(yaml: string): boolean {
  if (!yaml || yaml.trim().length === 0) {
    return false;
  }
  const trimmed = yaml.trim();
  return trimmed.startsWith('version:') || trimmed.startsWith('steps:');
}

function createFallbackWorkflow(input: WorkflowSkillInput): string {
  const template = INTENT_TEMPLATES[input.intent];
  if (template && template.steps.length > 0) {
    let yaml = 'version: "1.0"\n';
    yaml += `name: "${input.intent}"\n`;
    yaml += 'mode: "relaxed"\n';
    yaml += 'steps:\n';

    for (const step of template.steps) {
      yaml += `  - type: "${step.type}"\n`;
      if (step.cli) {
        yaml += `    cli: "${step.cli}"\n`;
      }
      if (step.args) {
        yaml += `    args: [${step.args.map((a: string) => `"${a}"`).join(', ')}]\n`;
      }
      if (step.condition) {
        yaml += `    condition: "${step.condition}"\n`;
      }
    }
    return yaml;
  }

  let yaml = 'version: "1.0"\n';
  yaml += `name: "Fallback Workflow"\n`;
  yaml += 'mode: "relaxed"\n';
  yaml += 'steps:\n';

  for (const cmd of input.commands) {
    yaml += `  - type: "exec"\n`;
    yaml += `    cli: "${cmd.cli}"\n`;
    yaml += `    args: [${cmd.args.map((a: string) => `"${a}"`).join(', ')}]\n`;
  }

  return yaml;
}
