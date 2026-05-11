import type {
  Prompt,
  PromptRepository,
} from './prompt/types.js';
import { SessionManager } from './session-manager.js';

const BUILTIN_PROMPTS: Prompt[] = [
  {
    id: 'intent-parser-v1',
    name: 'Intent Parser',
    version: '1.0.0',
    description: '解析用户输入，识别意图并提取参数',
    category: 'parsing',
    tags: ['intent', 'parsing', 'core'],
    systemTemplate: `你是一个工作流解析专家。用户输入一段自然语言，你需要：
1. 识别用户意图（从以下列表中选择最匹配的）
2. 提取关键参数
3. 生成标准化的工作流步骤

支持的意图类型：
{{intentList}}

参考关键词模板：
{{intentKeywords}}

请以 JSON 格式输出：
{
  "intent": "意图名称",
  "confidence": 0.0-1.0,
  "params": { "参数名": "参数值" },
  "workflow": {
    "name": "工作流名称",
    "steps": [
      { "type": "exec", "cli": "命令", "args": ["参数"] }
    ]
  }
}`,
    userTemplate: '{{userInput}}',
    variables: [
      { name: 'intentList', type: 'string', required: true },
      { name: 'intentKeywords', type: 'string', required: true },
      { name: 'userInput', type: 'string', required: true },
    ],
    examples: [],
    constraints: [
      { type: 'format', rule: '输出必须是合法的 JSON' },
      { type: 'content', rule: 'intent 必须来自提供的列表' },
      { type: 'content', rule: 'confidence 必须在 0.0 到 1.0 之间' },
    ],
    metadata: {
      author: 'VectaHub Team',
      createdAt: new Date('2026-05-03'),
      lastUpdated: new Date('2026-05-03'),
      effectiveness: 0.85,
      uses: 0,
    },
  },
  {
    id: 'workflow-yaml-v1',
    name: 'Workflow YAML Generator',
    version: '1.0.0',
    description: '生成 VectaHub 工作流 YAML',
    category: 'workflow',
    tags: ['yaml', 'workflow', 'generation'],
    systemTemplate: `你是一个专业的工作流 YAML 生成专家，专门为 VectaHub 平台生成工作流。

## VectaHub 工作流规范：
- 步骤类型：
  - exec：执行本地命令
  - opencli：调用 OpenCLI 工具
  - for_each：循环
  - if：条件判断
  - parallel：并行执行

- opencli 步骤格式：
  id: <step-id>
  type: opencli
  site: <site-name>
  command: <command>
  args: [arg1, arg2, ...]

- exec 步骤格式：
  id: <step-id>
  type: exec
  cli: <command-line>
  args: [arg1, arg2, ...]

- YAML 必须包含：
  name: <workflow-name>
  description: <description>
  steps: [step1, step2, ...]
  mode: <strict|relaxed|consensus>

## 重要规则：
1. 请直接输出 YAML 内容，不要添加任何额外的说明文字或 Markdown 代码块标记！
2. 确保 YAML 格式完全正确，并且可以直接被 VectaHub 执行！
3. 使用 relaxed 作为默认的 mode！
4. 确保步骤逻辑合理、实用！

## 示例 YAML：

name: "查看 HackerNews 热榜并保存"
description: "查看 HackerNews 热榜，提取链接，保存到文件"
mode: relaxed
steps:
  - id: step1
    type: opencli
    site: hackernews
    command: top
    args: ["--limit", "10"]
  - id: step2
    type: exec
    cli: node
    args: ["-e", "console.log(JSON.parse(process.stdin.read()).map(i => i.url).join('\\\\n'))"]
  - id: step3
    type: exec
    cli: tee
    args: ["hn-top-urls.txt"]

---

现在请根据用户需求生成对应的 YAML 工作流！`,
    userTemplate: '{{userInput}}',
    variables: [
      { name: 'userInput', type: 'string', required: true },
    ],
    examples: [],
    constraints: [
      { type: 'format', rule: '输出必须是合法的 YAML' },
      { type: 'content', rule: '必须包含 name、description、steps、mode 字段' },
      { type: 'content', rule: 'mode 必须是 strict、relaxed 或 consensus' },
    ],
    metadata: {
      author: 'VectaHub Team',
      createdAt: new Date('2026-05-03'),
      lastUpdated: new Date('2026-05-03'),
      effectiveness: 0.8,
      uses: 0,
    },
  },
  {
    id: 'git-workflow-v1',
    name: 'Git 工作流助手',
    version: '1.0.0',
    description: '帮助生成 Git 相关的工作流，包括提交、推送、拉取等',
    category: 'assistant',
    tags: ['git', 'workflow', 'assistant'],
    systemTemplate: `你是一个专业的 Git 助手，帮助用户生成正确的 Git 命令和工作流。

## 常见 Git 任务：
- 提交更改：git add、git commit
- 推送更新：git push
- 拉取最新：git pull
- 创建分支：git branch
- 合并分支：git merge
- 查看状态：git status
- 查看历史：git log

## 输出格式要求：
请直接输出 VectaHub 可执行的 YAML 工作流格式，与 workflow-yaml-v1 格式一致。`,
    userTemplate: '{{userInput}}',
    variables: [
      { name: 'userInput', type: 'string', required: true },
    ],
    examples: [],
    constraints: [
      { type: 'format', rule: '输出必须是合法的 YAML' },
    ],
    metadata: {
      author: 'VectaHub Team',
      createdAt: new Date('2026-05-03'),
      lastUpdated: new Date('2026-05-03'),
      effectiveness: 0.75,
      uses: 0,
    },
  },
  {
    id: 'npm-script-v1',
    name: 'NPM 脚本助手',
    version: '1.0.0',
    description: '帮助运行 npm scripts，安装依赖，发布包等',
    category: 'assistant',
    tags: ['npm', 'scripts', 'assistant'],
    systemTemplate: `你是一个专业的 NPM 助手，帮助用户执行 npm 相关任务。

## 常见 NPM 任务：
- 安装依赖：npm install、npm ci
- 运行脚本：npm run <script>
- 构建项目：npm run build
- 测试项目：npm test
- 发布包：npm publish
- 更新包：npm update

## 输出格式要求：
请直接输出 VectaHub 可执行的 YAML 工作流格式，与 workflow-yaml-v1 格式一致。`,
    userTemplate: '{{userInput}}',
    variables: [
      { name: 'userInput', type: 'string', required: true },
    ],
    examples: [],
    constraints: [
      { type: 'format', rule: '输出必须是合法的 YAML' },
    ],
    metadata: {
      author: 'VectaHub Team',
      createdAt: new Date('2026-05-03'),
      lastUpdated: new Date('2026-05-03'),
      effectiveness: 0.75,
      uses: 0,
    },
  },
  {
    id: 'code-review-v1',
    name: '代码审查助手',
    version: '1.0.0',
    description: '帮助审查代码，发现问题并提供建议',
    category: 'assistant',
    tags: ['code-review', 'review', 'assistant'],
    systemTemplate: `你是一个专业的代码审查助手，能够帮助用户审查代码并提供建议。

## 代码审查重点：
- 代码风格和规范
- 潜在的 bug 和问题
- 性能优化建议
- 安全隐患
- 可维护性改进
- 最佳实践

请用友好且专业的语气提供审查意见。`,
    userTemplate: '{{userInput}}',
    variables: [
      { name: 'userInput', type: 'string', required: true },
    ],
    examples: [],
    constraints: [],
    metadata: {
      author: 'VectaHub Team',
      createdAt: new Date('2026-05-03'),
      lastUpdated: new Date('2026-05-03'),
      effectiveness: 0.65,
      uses: 0,
    },
  },
  {
    id: 'doc-task-parser-v1',
    name: 'Document Task Parser',
    version: '1.0.0',
    description: '从开发文档中提取结构化任务列表',
    category: 'parsing',
    tags: ['doc-task', 'parsing', 'agent-cli'],
    systemTemplate: `从以下开发文档中提取所有开发任务，输出 JSON 数组。

输出格式：[{"id": "文档中的原始编号", "label": "任务简述"}]

规则：
- id 使用文档中的原始编号（如 1.1、P0-1、A-1 等），不要自行编造编号
- label 从文档内容浓缩一句话概括任务
- 不要遗漏任何任务，包括子任务
- 只输出 JSON 数组，不要输出任何其他文字、解释或 markdown 标记

文档内容：
{{docContent}}`,
    userTemplate: '{{docContent}}',
    variables: [
      { name: 'docContent', type: 'string', required: true },
    ],
    examples: [
      {
        input: { docContent: '## 1. 用户认证\n### 1.1 实现登录\n### 1.2 实现注册\n## 2. 数据库\n### 2.1 创建用户表' },
        output: [{ id: '1.1', label: '实现登录功能' }, { id: '1.2', label: '实现注册功能' }, { id: '2.1', label: '创建用户表' }],
      },
      {
        input: { docContent: '### P0-1：结账与反结账功能\n### P0-2：凭证号断号管理\n### P1-1：辅助核算标签' },
        output: [{ id: 'P0-1', label: '结账与反结账功能' }, { id: 'P0-2', label: '凭证号断号管理与复用' }, { id: 'P1-1', label: '辅助核算标签' }],
      },
    ],
    constraints: [
      { type: 'format', rule: '输出必须是合法的 JSON 数组' },
      { type: 'content', rule: '每个元素必须包含 id 和 label 字段' },
    ],
    metadata: {
      author: 'VectaHub Team',
      createdAt: new Date('2026-05-10'),
      lastUpdated: new Date('2026-05-10'),
      effectiveness: 0.8,
      uses: 0,
    },
  },
  {
    id: 'agent-cmd-generator-v1',
    name: 'Agent CLI Command Generator',
    version: '1.0.0',
    description: '根据 Agent CLI 工具的 help 输出和任务描述生成具体执行命令',
    category: 'generation',
    tags: ['agent-cmd', 'generation', 'agent-cli'],
    systemTemplate: `你是命令生成器。根据 Agent CLI 工具的 --help 输出和任务描述，生成可直接执行的命令。

要求：
- 输出 JSON 格式：{"command": "完整命令", "args": ["参数数组"], "explanation": "说明"}
- 命令必须基于工具的实际用法
- 不要添加 help 中不存在的参数
- 如果工具需要交互式输入，使用非交互式参数
- 只输出 JSON，不要添加额外说明

工具名称：{{toolName}}
工具 --help 输出：
{{helpOutput}}

任务编号：{{taskId}}
任务描述：{{taskLabel}}
参考文档：{{docPath}}

请按照项目要求进行开发。任务完成后运行项目测试验证。`,
    userTemplate: '任务 {{taskId}}: {{taskLabel}}，请基于工具用法生成执行命令。',
    variables: [
      { name: 'toolName', type: 'string', required: true },
      { name: 'helpOutput', type: 'string', required: true },
      { name: 'taskId', type: 'string', required: true },
      { name: 'taskLabel', type: 'string', required: true },
      { name: 'docPath', type: 'string', required: true },
    ],
    examples: [],
    constraints: [
      { type: 'format', rule: '输出必须是合法的 JSON' },
      { type: 'content', rule: '必须包含 command 和 args 字段' },
    ],
    metadata: {
      author: 'VectaHub Team',
      createdAt: new Date('2026-05-10'),
      lastUpdated: new Date('2026-05-10'),
      effectiveness: 0.8,
      uses: 0,
    },
  },
  {
    id: 'tool-capability-parser-v1',
    name: 'Tool Capability Parser',
    version: '1.0.0',
    description: '从 CLI 工具的 --help 输出中推断其能力标签',
    category: 'parsing',
    tags: ['capability', 'parsing', 'agent-cli'],
    systemTemplate: `你是工具能力分析器。根据 CLI 工具的 --help 输出，推断该工具具备的能力。

要求：
- 从以下能力标签中选择匹配的：codegen, refactor, debug, test, review, search, chat, edit, file-ops, git, shell, browser, api, database
- 也可以添加 help 中明确体现但不在上述列表中的能力
- 输出 JSON 数组格式：["capability1", "capability2"]
- 只输出 JSON 数组，不要添加额外说明

工具名称：{{toolName}}
工具 --help 输出：
{{helpOutput}}`,
    userTemplate: '推断工具 {{toolName}} 的能力',
    variables: [
      { name: 'toolName', type: 'string', required: true },
      { name: 'helpOutput', type: 'string', required: true },
    ],
    examples: [],
    constraints: [
      { type: 'format', rule: '输出必须是合法的 JSON 数组' },
      { type: 'content', rule: '每个元素必须是字符串' },
    ],
    metadata: {
      author: 'VectaHub Team',
      createdAt: new Date('2026-05-11'),
      lastUpdated: new Date('2026-05-11'),
      effectiveness: 0.75,
      uses: 0,
    },
  },
];

export class PromptManager implements PromptRepository {
  private prompts: Map<string, Prompt>;
  public sessionManager: SessionManager;

  constructor() {
    this.prompts = new Map();
    this.sessionManager = new SessionManager();
    for (const prompt of BUILTIN_PROMPTS) {
      this.prompts.set(prompt.id, prompt);
    }
  }

  get(id: string): Prompt | undefined {
    return this.prompts.get(id);
  }

  list(category?: Prompt['category']): Prompt[] {
    const all = Array.from(this.prompts.values());
    if (!category) {
      return all;
    }
    return all.filter(p => p.category === category);
  }

  add(prompt: Prompt): void {
    this.prompts.set(prompt.id, prompt);
  }

  update(prompt: Prompt): void {
    const existing = this.prompts.get(prompt.id);
    if (existing) {
      this.prompts.set(prompt.id, {
        ...existing,
        ...prompt,
        metadata: {
          ...existing.metadata,
          ...prompt.metadata,
          lastUpdated: new Date(),
        },
      });
    }
  }

  selectPrompt(context: {
    action?: string;
    domains?: string[];
    category?: string;
    tags?: string[];
  }): Prompt | undefined {
    const candidates = Array.from(this.prompts.values());
    if (candidates.length === 0) return undefined;

    let best: Prompt | undefined;
    let bestScore = -1;

    for (const prompt of candidates) {
      let score = 0;

      if (context.category && prompt.category === context.category) {
        score += 3;
      }

      if (context.action) {
        const actionLower = context.action.toLowerCase();
        if (prompt.tags.some(t => t.toLowerCase() === actionLower)) {
          score += 2;
        }
      }

      if (context.domains && context.domains.length > 0) {
        for (const domain of context.domains) {
          if (prompt.tags.some(t => t.toLowerCase() === domain.toLowerCase())) {
            score += 2;
          }
        }
      }

      if (context.tags && context.tags.length > 0) {
        for (const tag of context.tags) {
          if (prompt.tags.some(t => t.toLowerCase() === tag.toLowerCase())) {
            score += 1;
          }
        }
      }

      score += (prompt.metadata.effectiveness ?? 0.5) * 2;

      if (score > bestScore) {
        bestScore = score;
        best = prompt;
      }
    }

    return best;
  }

  recordOutcome(promptId: string, success: boolean): void {
    const prompt = this.prompts.get(promptId);
    if (!prompt) return;

    const currentRate = prompt.metadata.successRate ?? prompt.metadata.effectiveness ?? 0.5;
    const alpha = 0.3;
    const newRate = alpha * (success ? 1 : 0) + (1 - alpha) * currentRate;

    this.update({
      ...prompt,
      metadata: {
        ...prompt.metadata,
        successRate: newRate,
        effectiveness: newRate * 0.7 + (prompt.metadata.effectiveness ?? 0.5) * 0.3,
      },
    });
  }

  buildSystemPrompt(
    promptId: string,
    context?: Record<string, string>,
    sessionId?: string
  ): string {
    const prompt = this.get(promptId);
    let fullPrompt: string;
    
    if (prompt) {
      fullPrompt = prompt.systemTemplate;
    } else {
      fullPrompt = promptId;
    }

    if (context) {
      for (const [key, value] of Object.entries(context)) {
        fullPrompt = fullPrompt.replace(`{{${key}}}`, value);
      }
    }

    if (sessionId) {
      fullPrompt = this.sessionManager.buildContextAwarePrompt(fullPrompt, sessionId);
    }

    if (prompt && prompt.examples && prompt.examples.length > 0) {
      fullPrompt += `\n\n## 示例：\n`;
      for (let i = 0; i < prompt.examples.length; i++) {
        const ex = prompt.examples[i];
        fullPrompt += `\n### 示例 ${i + 1}\n`;
        fullPrompt += `输入: ${JSON.stringify(ex.input)}\n`;
        fullPrompt += `输出: ${JSON.stringify(ex.output)}\n`;
        if (ex.explanation) {
          fullPrompt += `说明: ${ex.explanation}\n`;
        }
      }
    }

    if (prompt && prompt.constraints && prompt.constraints.length > 0) {
      fullPrompt += `\n\n## 约束：\n`;
      for (const constraint of prompt.constraints) {
        fullPrompt += `- [${constraint.type}] ${typeof constraint.rule === 'string' ? constraint.rule : JSON.stringify(constraint.rule)}\n`;
      }
    }

    if (prompt) {
      prompt.metadata.uses++;
      this.update(prompt);
    }

    return fullPrompt;
  }
}

export function createPromptManager(): PromptManager {
  return new PromptManager();
}

// 导出便捷访问函数
export const DEFAULT_INTENT_PARSER_ID = 'intent-parser-v1';
export const DEFAULT_WORKFLOW_YAML_ID = 'workflow-yaml-v1';
export const DOC_TASK_PARSER_ID = 'doc-task-parser-v1';
export const AGENT_CMD_GENERATOR_ID = 'agent-cmd-generator-v1';
export const TOOL_CAPABILITY_PARSER_ID = 'tool-capability-parser-v1';
