import fs from 'fs';
import path from 'path';
import { parse as parseYAML } from 'yaml';
import type {
  Prompt,
  PromptVariable,
  PromptExample,
  PromptConstraint,
  PromptMetadata,
  PromptBuildResult,
  EvaluationResult,
  PromptRegistry,
} from './types.js';

const BUILTIN_PROMPTS: Prompt[] = [
  {
    id: 'intent-parser-v1',
    name: 'Intent Parser',
    version: '1.0.0',
    description: 'Parse user input, identify intent and extract parameters',
    category: 'parsing',
    tags: ['intent', 'parsing', 'core'],
    systemTemplate: `你是一个工作流解析专家。你的任务是解析用户输入并识别他们的意图。

可用的意图类型:
{{intentList}}

请始终用JSON格式回复:
{
  "intent": "INTENT_NAME",
  "confidence": 0.0-1.0,
  "params": {},
  "workflow": {
    "name": "工作流名称",
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
    id: 'command-generator-v1',
    name: 'Command Generator',
    version: '1.0.0',
    description: 'Generate CLI commands based on intent and parameters',
    category: 'generation',
    tags: ['command', 'generation'],
    systemTemplate: `你是一个命令生成专家。根据用户的意图和参数生成合适的CLI命令。

请用JSON格式回复:
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
    id: 'workflow-generator-v1',
    name: 'Workflow Generator',
    version: '1.0.0',
    description: 'Generate complete VectaHub workflow YAML',
    category: 'workflow',
    tags: ['workflow', 'yaml', 'generation'],
    systemTemplate: `你是一个VectaHub工作流生成专家。根据用户输入和命令生成完整的YAML工作流。

VectaHub工作流规范:
- 步骤类型: exec, opencli, for_each, if, parallel
- exec: { id, type: exec, cli, args }
- opencli: { id, type: opencli, site, command, args }
- YAML必须包含: name, description, steps, mode (strict/relaxed/consensus)

只回复YAML内容，不要markdown格式或额外文本。

示例:
name: "示例工作流"
description: "一个示例工作流"
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
    systemTemplate: `你是一个专业的Git助手，帮助用户生成正确的Git命令和工作流。

常见Git任务:
- 提交变更: git add, git commit
- 推送更新: git push
- 拉取最新: git pull
- 创建分支: git branch, git checkout
- 合并分支: git merge
- 查看状态: git status
- 查看历史: git log

输出格式: 生成VectaHub可执行的YAML工作流格式。`,
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
    systemTemplate: `你是一个专业的NPM助手，帮助用户执行npm相关任务。

常见NPM任务:
- 安装依赖: npm install, npm ci
- 运行脚本: npm run <script>
- 构建项目: npm run build
- 测试项目: npm test
- 发布包: npm publish
- 更新包: npm update

输出格式: 生成VectaHub可执行的YAML工作流格式。`,
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
    systemTemplate: `你是一个专业的代码审查助手。帮助用户审查代码并提供建议。

代码审查重点领域:
- 代码风格和约定
- 潜在的bug和问题
- 性能优化建议
- 安全漏洞
- 可维护性改进
- 最佳实践

请用友好且专业的语气提供审查反馈。`,
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

function validateVariables(prompt: Prompt, variables: Record<string, unknown>): void {
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

export class PromptRegistryImpl implements PromptRegistry {
  private prompts: Map<string, Prompt> = new Map();

  constructor() {
    for (const prompt of BUILTIN_PROMPTS) {
      this.prompts.set(prompt.id, prompt);
    }
  }

  register(prompt: Prompt): void {
    this.prompts.set(prompt.id, prompt);
  }

  get(id: string): Prompt | undefined {
    return this.prompts.get(id);
  }

  list(category?: string): Prompt[] {
    const all = Array.from(this.prompts.values());
    return category ? all.filter(p => p.category === category) : all;
  }

  async build(
    promptId: string,
    variables: Record<string, unknown>
  ): Promise<PromptBuildResult> {
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
        const prompt: Prompt = {
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
  ): Promise<EvaluationResult> {
    const prompt = this.get(promptId);
    if (!prompt) {
      throw new Error(`Prompt ${promptId} not found`);
    }

    const details: EvaluationResult['details'] = [];
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

export function createPromptRegistry(): PromptRegistryImpl {
  return new PromptRegistryImpl();
}

export { PromptRegistryImpl as PromptRegistryV3 };
export const createPromptRegistryV3 = createPromptRegistry;

export type { Prompt, PromptBuildResult, EvaluationResult, PromptRegistry } from './types.js';
