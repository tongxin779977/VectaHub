import type { Skill, SkillContext, SkillResult } from './types.js';
import type { PromptRegistry } from '../nl/prompt/types.js';
import type { LLMDialogControlSkill } from './llm-dialog-control/index.js';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('workflow-skill');

export interface WorkflowSkillInput {
  intent: string;
  params: Record<string, unknown>;
  commands: Array<{ cli: string; args: string[] }>;
  userInput: string;
}

export interface WorkflowSkillOutput {
  workflowYAML: string;
}

async function extractFilePath(input: string): Promise<string | null> {
  const match = input.match(/\/Users\/[^\/\s]+\/[^\/\s]+(?:[^\s]*\/docs[^\s]*\.md)|\/[^\s]*\.md/);
  if (match) {
    return match[0];
  }
  return null;
}

async function readDocContent(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const content = await readFile(filePath, 'utf-8');
    return content.substring(0, 8000);
  } catch {
    return null;
  }
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
        const filePath = await extractFilePath(input.userInput);
        let docContent = '';

        if (filePath) {
          const content = await readDocContent(filePath);
          if (content) {
            docContent = `\n\nDocument content:\n${content}`;
          }
        }

        const extendedUserInput = input.userInput + docContent;

        const { system, user } = await promptRegistry.build('workflow-generator-v1', {
          userInput: extendedUserInput,
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
    logger.debug(`Validation failed: empty YAML`);
    return false;
  }
  
  let content = yaml.trim();
  logger.debug(`Raw YAML content (first 500 chars):\n${content.substring(0, 500)}`);
  
  if (content.startsWith('```')) {
    const match = content.match(/```(?:yaml)?\s*\n?([\s\S]*?)\n?```/);
    if (match) {
      content = match[1].trim();
      logger.debug(`Extracted content from markdown (first 500 chars):\n${content.substring(0, 500)}`);
    }
  }
  
  const trimmed = content.trim();
  const isValid = trimmed.startsWith('version:') || trimmed.startsWith('steps:') || trimmed.startsWith('name:');
  logger.debug(`Validation result: ${isValid}, first line: ${trimmed.split('\n')[0]}`);
  return isValid;
}

function createFallbackWorkflow(input: WorkflowSkillInput): string {
  let yaml = 'version: "1.0"\n';
  yaml += `name: "Generated Workflow"\n`;
  yaml += 'description: "Workflow generated from user request"\n';
  yaml += 'mode: "relaxed"\n';
  yaml += 'steps:\n';
  yaml += `  - id: step1\n`;
  yaml += `    type: "exec"\n`;
  yaml += `    cli: "echo"\n`;
  yaml += `    args: ["Generated workflow for: ${input.userInput.substring(0, 50)}..."]\n`;

  return yaml;
}