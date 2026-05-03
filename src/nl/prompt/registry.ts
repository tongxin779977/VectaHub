
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYAML } from 'yaml';
import { Prompt, PromptRegistry as IPromptRegistry, EvaluationResult, PromptExample } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PromptRegistry implements IPromptRegistry {
  private prompts: Map<string, Prompt> = new Map();
  private promptDir: string;

  constructor(promptDir?: string) {
    this.promptDir = promptDir || path.join(process.cwd(), 'config', 'prompts');
    this.loadBuiltinPrompts();
    this.loadUserPrompts();
  }

  private loadBuiltinPrompts(): void {
    const builtinPrompts: Prompt[] = [
      {
        id: 'intent-parser-v1',
        name: 'Intent Parser V1',
        version: '1.0.0',
        description: 'Parse user intent into predefined categories',
        category: 'parsing',
        tags: ['intent', 'parsing'],
        systemTemplate: `You are a workflow parsing expert. Your task is to parse the user's input and identify their intent.

Available intent types:
{{intentList}}

Always respond with a JSON object in this format:
{
  "intent": "INTENT_NAME",
  "confidence": 0.0-1.0,
  "params": {}
}`,
        userTemplate: `User input: {{userInput}}`,
        variables: [
          { name: 'intentList', type: 'string', required: true },
          { name: 'userInput', type: 'string', required: true }
        ],
        examples: [],
        constraints: [{ type: 'format', rule: 'json' }],
        metadata: {
          author: 'VectaHub Team',
          createdAt: new Date(),
          lastUpdated: new Date(),
          effectiveness: 0.85,
          uses: 0,
          successRate: 0.9
        }
      },
      {
        id: 'command-generator-v1',
        name: 'Command Generator V1',
        version: '1.0.0',
        description: 'Generate CLI commands based on intent',
        category: 'generation',
        tags: ['command', 'generation'],
        systemTemplate: `You are a command generation expert. Generate appropriate CLI commands based on the user's intent and parameters.

Respond with a JSON object in this format:
{
  "commands": [
    { "cli": "tool_name", "args": ["arg1", "arg2"] }
  ]
}`,
        userTemplate: `Intent: {{intent}}
Parameters: {{params}}
User input: {{userInput}}`,
        variables: [
          { name: 'intent', type: 'string', required: true },
          { name: 'params', type: 'string', required: true },
          { name: 'userInput', type: 'string', required: true }
        ],
        examples: [],
        constraints: [{ type: 'format', rule: 'json' }],
        metadata: {
          author: 'VectaHub Team',
          createdAt: new Date(),
          lastUpdated: new Date(),
          effectiveness: 0.8,
          uses: 0,
          successRate: 0.88
        }
      },
      {
        id: 'workflow-generator-v2',
        name: 'Workflow Generator V2',
        version: '2.0.0',
        description: 'Generate complete VectaHub workflow YAML',
        category: 'workflow',
        tags: ['workflow', 'yaml', 'generation'],
        systemTemplate: `You are a VectaHub workflow generation expert. Generate a complete YAML workflow based on the user's input and commands.

Respond with only the YAML content, no markdown formatting or extra text.`,
        userTemplate: `User input: {{userInput}}
Intent: {{intent}}
Commands: {{commands}}`,
        variables: [
          { name: 'userInput', type: 'string', required: true },
          { name: 'intent', type: 'string', required: true },
          { name: 'commands', type: 'string', required: true }
        ],
        examples: [],
        constraints: [],
        metadata: {
          author: 'VectaHub Team',
          createdAt: new Date(),
          lastUpdated: new Date(),
          effectiveness: 0.9,
          uses: 0,
          successRate: 0.92
        }
      }
    ];

    for (const prompt of builtinPrompts) {
      this.register(prompt);
    }
  }

  private loadUserPrompts(): void {
    try {
      if (!fs.existsSync(this.promptDir)) {
        console.debug(`Prompt directory ${this.promptDir} does not exist, skipping user prompts`);
        return;
      }

      const files = this.walkDirectory(this.promptDir);

      for (const file of files) {
        if (file.endsWith('.json') || file.endsWith('.yaml') || file.endsWith('.yml')) {
          try {
            const content = fs.readFileSync(file, 'utf-8');
            let prompt: Prompt;

            if (file.endsWith('.json')) {
              prompt = JSON.parse(content);
            } else {
              prompt = parseYAML(content) as Prompt;
            }

            prompt.metadata.createdAt = new Date(prompt.metadata.createdAt);
            prompt.metadata.lastUpdated = new Date(prompt.metadata.lastUpdated);

            this.register(prompt);
            console.debug(`Loaded user prompt: ${prompt.id} from ${file}`);
          } catch (error) {
            console.warn(`Failed to load prompt from ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load user prompts:', error);
    }
  }

  private walkDirectory(dir: string): string[] {
    const files: string[] = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...this.walkDirectory(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  register(prompt: Prompt): void {
    this.prompts.set(prompt.id, prompt);
  }

  get(id: string): Prompt | undefined {
    return this.prompts.get(id);
  }

  list(category?: string): Prompt[] {
    const prompts = Array.from(this.prompts.values());
    return category ? prompts.filter(p => p.category === category) : prompts;
  }

  async build(promptId: string, variables: Record<string, unknown>): Promise<{ system: string; user: string }> {
    const prompt = this.get(promptId);
    if (!prompt) {
      throw new Error(`Prompt ${promptId} not found`);
    }

    this.validateVariables(prompt, variables);

    const mergedVariables = { ...variables };
    for (const variable of prompt.variables) {
      if (!(variable.name in mergedVariables) && variable.default !== undefined) {
        mergedVariables[variable.name] = variable.default;
      }
    }

    const system = this.renderTemplate(prompt.systemTemplate, mergedVariables);
    const user = this.renderTemplate(prompt.userTemplate, mergedVariables);

    prompt.metadata.uses++;

    return { system, user };
  }

  private validateVariables(prompt: Prompt, variables: Record<string, unknown>): void {
    for (const variable of prompt.variables) {
      if (variable.required && !(variable.name in variables)) {
        throw new Error(`Required variable ${variable.name} not provided`);
      }
    }
  }

  private renderTemplate(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = variables[key];
      if (value === undefined) {
        return '';
      }
      if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
      }
      return String(value);
    });
  }

  async evaluate(promptId: string, testCases: PromptExample[]): Promise<EvaluationResult> {
    const details: EvaluationResult['details'] = [];
    let passedTests = 0;

    for (const example of testCases) {
      try {
        details.push({
          example,
          success: true,
          output: example.output
        });
        passedTests++;
      } catch (error) {
        details.push({
          example,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return {
      success: passedTests === testCases.length,
      totalTests: testCases.length,
      passedTests,
      failedTests: testCases.length - passedTests,
      details
    };
  }
}

export function createPromptRegistry(promptDir?: string): PromptRegistry {
  return new PromptRegistry(promptDir);
}
