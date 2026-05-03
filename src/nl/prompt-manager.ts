import type {
  Prompt,
  PromptRepository,
} from '../types/index.js';
import { SessionManager } from './session-manager.js';

// 内置 Prompt 定义
const BUILTIN_PROMPTS: Prompt[] = [
  {
    id: 'intent-parser-v1',
    name: 'Intent Parser',
    version: '1.0.0',
    description: '解析用户输入，识别意图并提取参数',
    category: 'parsing',
    tags: ['intent', 'parsing', 'core'],
    system: `你是一个工作流解析专家。用户输入一段自然语言，你需要：
1. 识别用户意图（从以下列表中选择最匹配的）
2. 提取关键参数
3. 生成标准化的工作流步骤

支持的意图类型：
{intentList}

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
    userTemplate: '{userInput}',
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
    system: `你是一个专业的工作流 YAML 生成专家，专门为 VectaHub 平台生成工作流。

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
    userTemplate: '{userInput}',
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
    system: `你是一个专业的 Git 助手，帮助用户生成正确的 Git 命令和工作流。

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
    userTemplate: '{userInput}',
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
    system: `你是一个专业的 NPM 助手，帮助用户执行 npm 相关任务。

## 常见 NPM 任务：
- 安装依赖：npm install、npm ci
- 运行脚本：npm run <script>
- 构建项目：npm run build
- 测试项目：npm test
- 发布包：npm publish
- 更新包：npm update

## 输出格式要求：
请直接输出 VectaHub 可执行的 YAML 工作流格式，与 workflow-yaml-v1 格式一致。`,
    userTemplate: '{userInput}',
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
    system: `你是一个专业的代码审查助手，能够帮助用户审查代码并提供建议。

## 代码审查重点：
- 代码风格和规范
- 潜在的 bug 和问题
- 性能优化建议
- 安全隐患
- 可维护性改进
- 最佳实践

请用友好且专业的语气提供审查意见。`,
    userTemplate: '{userInput}',
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
];

export class PromptManager implements PromptRepository {
  private prompts: Map<string, Prompt>;
  public sessionManager: SessionManager;

  constructor() {
    this.prompts = new Map();
    this.sessionManager = new SessionManager();
    // 加载内置 Prompts
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

  // 构建完整的系统 prompt，包含示例等
  buildSystemPrompt(
    promptId: string,
    context?: Record<string, string>,
    sessionId?: string
  ): string {
    const prompt = this.get(promptId);
    let fullPrompt: string;
    
    if (prompt) {
      fullPrompt = prompt.system;
    } else {
      // 兼容旧版 API：如果 promptId 不是已知的 ID，就直接当作 system prompt 使用
      fullPrompt = promptId;
    }

    // 替换模板变量
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        fullPrompt = fullPrompt.replace(`{${key}}`, value);
      }
    }

    // 添加会话上下文（如果提供 sessionId）
    if (sessionId) {
      fullPrompt = this.sessionManager.buildContextAwarePrompt(fullPrompt, sessionId);
    }

    // 添加示例
    if (prompt && prompt.examples.length > 0) {
      fullPrompt += `\n\n## 示例：\n`;
      for (let i = 0; i < prompt.examples.length; i++) {
        const ex = prompt.examples[i];
        fullPrompt += `\n### 示例 ${i + 1}\n`;
        fullPrompt += `输入: ${ex.input}\n`;
        fullPrompt += `输出: ${ex.output}\n`;
        if (ex.explanation) {
          fullPrompt += `说明: ${ex.explanation}\n`;
        }
      }
    }

    // 添加约束
    if (prompt && prompt.constraints.length > 0) {
      fullPrompt += `\n\n## 约束：\n`;
      for (const constraint of prompt.constraints) {
        fullPrompt += `- [${constraint.type}] ${constraint.rule}\n`;
      }
    }

    // 更新使用计数
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
