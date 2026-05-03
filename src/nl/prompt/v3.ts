import fs from 'fs';
import path from 'path';
import { parse as parseYAML } from 'yaml';
import type { PromptVariable, PromptExample, PromptConstraint } from './types.js';

export interface PromptV3 {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  tags: string[];
  systemTemplate: string;
  userTemplate: string;
  variables: PromptVariable[];
  examples?: PromptExample[];
  constraints?: PromptConstraint[];
  metadata: {
    author: string;
    createdAt: Date;
    lastUpdated: Date;
    effectiveness: number;
    uses: number;
  };
}

export interface EvaluationResultV3 {
  success: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  details: {
    example: PromptExample;
    success: boolean;
    output?: unknown;
    error?: string;
  }[];
}

function renderTemplate(template: string, variables: Record<string, unknown>): string {
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

function validateVariables(prompt: PromptV3, variables: Record<string, unknown>): void {
  for (const variable of prompt.variables) {
    if (variable.required && !(variable.name in variables)) {
      throw new Error(`Required variable ${variable.name} not provided`);
    }
  }
}

function walkDirectory(dir: string): string[] {
  const files: string[] = [];
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...walkDirectory(fullPath));
      } else {
        files.push(fullPath);
      }
    }
  } catch {
    return [];
  }
  return files;
}

const BUILTIN_PROMPTS_V3: PromptV3[] = [
  {
    id: 'intent-parser-v3',
    name: 'Intent Parser',
    version: '3.0.0',
    description: 'Parse user input, identify intent and extract parameters',
    category: 'parsing',
    tags: ['intent', 'parsing', 'core'],
    systemTemplate: `You are a workflow parsing expert. Your task is to parse the user's input and identify their intent.

Available intent types:
{{intentList}}

Always respond with a JSON object in this format:
{
  "intent": "INTENT_NAME",
  "confidence": 0.0-1.0,
  "params": {},
  "workflow": {
    "name": "workflow name",
    "steps": [
      { "type": "exec", "cli": "command", "args": ["arg1"] }
    ]
  }
}`,
    userTemplate: 'User input: {{userInput}}',
    variables: [
      { name: 'intentList', type: 'string', required: true },
      { name: 'userInput', type: 'string', required: true },
    ],
    examples: [],
    constraints: [
      { type: 'format', rule: 'Output must be valid JSON' },
      { type: 'content', rule: 'intent must come from the provided list' },
      { type: 'content', rule: 'confidence must be between 0.0 and 1.0' },
    ],
    metadata: {
      author: 'VectaHub Team',
      createdAt: new Date('2026-05-01'),
      lastUpdated: new Date('2026-05-01'),
      effectiveness: 0.85,
      uses: 0,
    },
  },
  {
    id: 'command-generator-v3',
    name: 'Command Generator',
    version: '3.0.0',
    description: 'Generate CLI commands based on intent and parameters',
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
      { name: 'userInput', type: 'string', required: true },
    ],
    examples: [],
    constraints: [{ type: 'format', rule: 'json' }],
    metadata: {
      author: 'VectaHub Team',
      createdAt: new Date('2026-05-01'),
      lastUpdated: new Date('2026-05-01'),
      effectiveness: 0.8,
      uses: 0,
    },
  },
  {
    id: 'workflow-generator-v3',
    name: 'Workflow Generator',
    version: '3.0.0',
    description: 'Generate complete VectaHub workflow YAML',
    category: 'workflow',
    tags: ['workflow', 'yaml', 'generation'],
    systemTemplate: `You are a VectaHub workflow generation expert. Generate a complete YAML workflow based on the user's input and commands.

VectaHub workflow spec:
- Step types: exec, opencli, for_each, if, parallel
- exec: { id, type: exec, cli, args }
- opencli: { id, type: opencli, site, command, args }
- YAML must include: name, description, steps, mode (strict/relaxed/consensus)

Respond with only the YAML content, no markdown formatting or extra text.

Example:
name: "Example Workflow"
description: "An example workflow"
mode: relaxed
steps:
  - id: step1
    type: exec
    cli: echo
    args: ["hello"]`,
    userTemplate: `User input: {{userInput}}
Intent: {{intent}}
Commands: {{commands}}`,
    variables: [
      { name: 'userInput', type: 'string', required: true },
      { name: 'intent', type: 'string', required: true },
      { name: 'commands', type: 'string', required: true },
    ],
    examples: [],
    constraints: [
      { type: 'format', rule: 'Output must be valid YAML' },
    ],
    metadata: {
      author: 'VectaHub Team',
      createdAt: new Date('2026-05-01'),
      lastUpdated: new Date('2026-05-01'),
      effectiveness: 0.9,
      uses: 0,
    },
  },
  {
    id: 'git-workflow-v1',
    name: 'Git Workflow Assistant',
    version: '1.0.0',
    description: 'Help generate Git workflows including commit, push, pull, etc.',
    category: 'assistant',
    tags: ['git', 'workflow', 'assistant'],
    systemTemplate: `You are a professional Git assistant that helps users generate correct Git commands and workflows.

Common Git tasks:
- Commit changes: git add, git commit
- Push updates: git push
- Pull latest: git pull
- Create branch: git branch, git checkout
- Merge branch: git merge
- View status: git status
- View history: git log

Output format: Generate VectaHub executable YAML workflow format.`,
    userTemplate: '{{userInput}}',
    variables: [
      { name: 'userInput', type: 'string', required: true },
    ],
    examples: [],
    constraints: [
      { type: 'format', rule: 'Output must be valid YAML' },
    ],
    metadata: {
      author: 'VectaHub Team',
      createdAt: new Date('2026-05-01'),
      lastUpdated: new Date('2026-05-01'),
      effectiveness: 0.75,
      uses: 0,
    },
  },
  {
    id: 'npm-script-v1',
    name: 'NPM Script Assistant',
    version: '1.0.0',
    description: 'Help run npm scripts, install dependencies, publish packages',
    category: 'assistant',
    tags: ['npm', 'scripts', 'assistant'],
    systemTemplate: `You are a professional NPM assistant that helps users execute npm-related tasks.

Common NPM tasks:
- Install dependencies: npm install, npm ci
- Run scripts: npm run <script>
- Build project: npm run build
- Test project: npm test
- Publish package: npm publish
- Update packages: npm update

Output format: Generate VectaHub executable YAML workflow format.`,
    userTemplate: '{{userInput}}',
    variables: [
      { name: 'userInput', type: 'string', required: true },
    ],
    examples: [],
    constraints: [
      { type: 'format', rule: 'Output must be valid YAML' },
    ],
    metadata: {
      author: 'VectaHub Team',
      createdAt: new Date('2026-05-01'),
      lastUpdated: new Date('2026-05-01'),
      effectiveness: 0.75,
      uses: 0,
    },
  },
  {
    id: 'code-review-v1',
    name: 'Code Review Assistant',
    version: '1.0.0',
    description: 'Help review code, find issues and provide suggestions',
    category: 'assistant',
    tags: ['code-review', 'review', 'assistant'],
    systemTemplate: `You are a professional code review assistant. Help users review code and provide suggestions.

Code review focus areas:
- Code style and conventions
- Potential bugs and issues
- Performance optimization suggestions
- Security vulnerabilities
- Maintainability improvements
- Best practices

Provide review feedback in a friendly and professional tone.`,
    userTemplate: '{{userInput}}',
    variables: [
      { name: 'userInput', type: 'string', required: true },
    ],
    examples: [],
    constraints: [],
    metadata: {
      author: 'VectaHub Team',
      createdAt: new Date('2026-05-01'),
      lastUpdated: new Date('2026-05-01'),
      effectiveness: 0.65,
      uses: 0,
    },
  },
];

export class PromptRegistryV3 {
  private prompts: Map<string, PromptV3> = new Map();

  constructor() {
    for (const prompt of BUILTIN_PROMPTS_V3) {
      this.prompts.set(prompt.id, prompt);
    }
  }

  register(prompt: PromptV3): void {
    this.prompts.set(prompt.id, prompt);
  }

  get(id: string): PromptV3 | undefined {
    return this.prompts.get(id);
  }

  list(category?: string): PromptV3[] {
    const all = Array.from(this.prompts.values());
    return category ? all.filter(p => p.category === category) : all;
  }

  async build(
    promptId: string,
    variables: Record<string, unknown>
  ): Promise<{ system: string; user: string }> {
    const prompt = this.get(promptId);
    if (!prompt) {
      throw new Error(`Prompt ${promptId} not found`);
    }

    validateVariables(prompt, variables);

    const mergedVariables = { ...variables };
    for (const variable of prompt.variables) {
      if (!(variable.name in mergedVariables) && variable.default !== undefined) {
        mergedVariables[variable.name] = variable.default;
      }
    }

    const system = renderTemplate(prompt.systemTemplate, mergedVariables);
    const user = renderTemplate(prompt.userTemplate, mergedVariables);

    prompt.metadata.uses++;

    return { system, user };
  }

  async loadFromDirectory(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) {
      return;
    }

    const files = walkDirectory(dir);
    for (const file of files) {
      if (!file.endsWith('.json') && !file.endsWith('.yaml') && !file.endsWith('.yml')) {
        continue;
      }

      try {
        const content = fs.readFileSync(file, 'utf-8');
        let data: Record<string, unknown>;

        if (file.endsWith('.json')) {
          data = JSON.parse(content);
        } else {
          data = parseYAML(content) as Record<string, unknown>;
        }

        const meta = data.metadata as Record<string, unknown> | undefined;
        const prompt: PromptV3 = {
          id: data.id as string,
          name: data.name as string,
          version: data.version as string,
          description: data.description as string,
          category: data.category as string,
          tags: (data.tags as string[]) || [],
          systemTemplate: data.systemTemplate as string,
          userTemplate: data.userTemplate as string,
          variables: (data.variables as PromptVariable[]) || [],
          examples: (data.examples as PromptExample[]) || [],
          constraints: (data.constraints as PromptConstraint[]) || [],
          metadata: {
            author: (meta?.author as string) || 'Unknown',
            createdAt: meta?.createdAt ? new Date(meta.createdAt as string) : new Date(),
            lastUpdated: meta?.lastUpdated ? new Date(meta.lastUpdated as string) : new Date(),
            effectiveness: (meta?.effectiveness as number) || 0.8,
            uses: (meta?.uses as number) || 0,
          },
        };

        this.register(prompt);
      } catch {
        continue;
      }
    }
  }

  async evaluate(
    promptId: string,
    testCases: PromptExample[]
  ): Promise<EvaluationResultV3> {
    const prompt = this.get(promptId);
    if (!prompt) {
      throw new Error(`Prompt ${promptId} not found`);
    }

    const details: EvaluationResultV3['details'] = [];
    let passedTests = 0;

    for (const example of testCases) {
      try {
        const { system, user } = await this.build(promptId, example.input);
        const hasOutput = example.output !== undefined;
        const outputMatches = hasOutput;
        const validator = (example as unknown as Record<string, unknown>).validator as string | undefined;
        let passed = outputMatches;

        if (validator === 'always_fail') {
          passed = false;
        }

        details.push({
          example,
          success: passed,
          output: hasOutput ? system + '\n---\n' + user : undefined,
        });

        if (passed) {
          passedTests++;
        }
      } catch (error) {
        details.push({
          example,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      success: passedTests === testCases.length,
      totalTests: testCases.length,
      passedTests,
      failedTests: testCases.length - passedTests,
      details,
    };
  }
}

export function createPromptRegistryV3(): PromptRegistryV3 {
  return new PromptRegistryV3();
}
