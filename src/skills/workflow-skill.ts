import type { Skill, SkillContext, SkillResult } from './types.js';
import type { PromptRegistry } from '../nl/prompt/types.js';
import type { LLMDialogControlSkill } from './llm-dialog-control/index.js';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type pino from 'pino';

/**
 * Input for workflow generation skill
 * @property intent - The recognized intent
 * @property params - Parameters extracted from user input
 * @property commands - Array of CLI commands to include
 * @property userInput - The original user input
 */
export interface WorkflowSkillInput {
  intent: string;
  params: Record<string, unknown>;
  commands: Array<{ cli: string; args: string[] }>;
  userInput: string;
}

/**
 * Output from workflow generation skill
 * @property workflowYAML - The generated workflow YAML string
 */
export interface WorkflowSkillOutput {
  workflowYAML: string;
}

/**
 * Extracts a file path from user input
 * @param input - The user input string
 * @returns Promise resolving to the file path or null if not found
 */
async function extractFilePath(input: string): Promise<string | null> {
  const match = input.match(/\/Users\/[^/\s]+\/[^/\s]+(?:[^\s]*\/docs[^\s]*\.md)|\/[^\s]*\.md/);
  if (match) {
    return match[0];
  }
  return null;
}

/**
 * Reads documentation content from a file
 * @param filePath - The path to the documentation file
 * @returns Promise resolving to the file content or null if not found
 */
async function readDocContent(filePath: string, logger: Pick<pino.Logger, 'debug'>): Promise<string | null> {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const content = await readFile(filePath, 'utf-8');
    return content.substring(0, 8000);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug({ error: message }, 'Read doc content skipped');
    return null;
  }
}

/**
 * Creates a Workflow Generation skill
 * Uses LLM to generate VectaHub workflow YAML from user input
 * @param promptRegistry - Registry for building prompts
 * @param llmDialogSkill - LLM dialog control skill for generating responses
 * @param logger - Optional logger for debug output
 * @returns Skill instance for workflow generation
 */
export function createWorkflowSkill(
  promptRegistry: PromptRegistry,
  llmDialogSkill: LLMDialogControlSkill,
  logger: Pick<pino.Logger, 'debug'> = { debug: () => {} },
): Skill<WorkflowSkillInput, WorkflowSkillOutput> {
  return {
    id: 'vectahub.workflow',
    name: 'Workflow Generation',
    version: '2.0.0',
    description: '生成完整的 VectaHub 工作流 YAML',
    tags: ['workflow', 'yaml', 'generation'],

    /**
     * Checks if this skill can handle the given context
     * @param _context - The skill context
     * @returns Always returns true
     */
    async canHandle(_context: SkillContext): Promise<boolean> {
      return true;
    },

    /**
     * Executes workflow generation
     * @param input - The workflow skill input
     * @param _context - The skill context
     * @returns Promise resolving to SkillResult with WorkflowSkillOutput
     */
    async execute(input: WorkflowSkillInput, _context: SkillContext): Promise<SkillResult<WorkflowSkillOutput>> {
      try {
        const filePath = await extractFilePath(input.userInput);
        let docContent = '';

        if (filePath) {
          const content = await readDocContent(filePath, logger);
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

        const isValid = validateWorkflowYAML(result.output, logger);

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
        const message = error instanceof Error ? error.message : String(error);
        logger.debug({ error: message }, 'LLM YAML generation failed, using fallback');
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

/**
 * Validates workflow YAML content
 * @param yaml - The YAML string to validate
 * @param logger - Logger for debug output
 * @returns True if YAML is valid
 */
function validateWorkflowYAML(yaml: string, logger: Pick<pino.Logger, 'debug'>): boolean {
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

/**
 * Creates a fallback workflow YAML
 * @param input - The workflow skill input
 * @returns Fallback YAML string
 */
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
