# AI Agent CLI 适配器框架设计文档

> 本文档定义 VectaHub AI Agent CLI 适配器路由框架的设计与实现细节

---

## 1. 设计目标

1. **动态可扩展**：支持动态注册新的 AI CLI 适配器，无需修改核心代码
2. **统一接口**：所有 AI CLI 适配器遵循标准化协议
3. **自动检测**：根据命令特征自动识别 AI CLI 类型
4. **沙盒感知**：所有命令执行自动注入沙盒环境
5. **标准输入输出**：统一的输入输出格式，便于 Agent 间通信

---

## 2. 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AI CLI Router                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  用户输入: "cc run帮我创建一个React组件"                              │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────┐                                                    │
│  │  Registry   │ ───▶ 动态适配器注册表                              │
│  └─────────────┘                                                    │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────┐                                                    │
│  │  Detector   │ ───▶ 自动检测 CLI 类型                             │
│  └─────────────┘                                                    │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────┐                                                    │
│  │  Adapter    │ ───▶ 调用对应 AI CLI 适配器                        │
│  └─────────────┘                                                    │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────┐                                                    │
│  │  Executor   │ ───▶ 在沙盒中执行命令                               │
│  └─────────────┘                                                    │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────┐                                                    │
│  │  Formatter  │ ───▶ 统一输出格式 (TaskList/Response)              │
│  └─────────────┘                                                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 支持的 AI Agent CLI 类型

### 3.1 已知 AI CLI 清单

| CLI 名称 | 开发商 | 命令模式 | 适配状态 |
|----------|--------|----------|----------|
| **cc** | - | `cc <prompt>` | ✅ 支持 |
| **gemini** | Google | `gemini <prompt>` | ✅ 支持 |
| **claude** | Anthropic | `claude <prompt>` | ✅ 支持 |
| **openai** | OpenAI | `openai <prompt>` | ✅ 支持 |
| **cursor** | Cursor | `cursor <prompt>` | 🔲 待适配 |
| **copilot** | GitHub | `copilot <prompt>` | 🔲 待适配 |
| **replit** | Replit | `replit <prompt>` | 🔲 待适配 |
| **bolt** | - | `bolt <prompt>` | 🔲 待适配 |
| **lovable** | - | `lovable <prompt>` | 🔲 待适配 |
| **windsurf** | - | `windsurf <prompt>` | 🔲 待适配 |
| **paradigm** | - | `paradigm <prompt>` | 🔲 待适配 |

### 3.2 通用 AI CLI 模式

对于未知 CLI，使用 Generic AI Adapter：

```javascript
const GENERIC_AI_PATTERNS = [
  /^(cc|gemini|claude|openai|cursor|copilot)\s+/i,
  /^(ai|agent|buddy|assistant)\s+/i,
];
```

---

## 4. 适配器注册表 (Registry)

### 4.1 Registry 数据结构

```javascript
class AICLIRegistry {
  constructor() {
    this.adapters = new Map();
    this.detectors = [];
  }

  register(name, adapter) {
    this.adapters.set(name, adapter);
  }

  registerDetector(pattern, cliName) {
    this.detectors.push({ pattern, cliName });
  }

  detect(command) {
    for (const { pattern, cliName } of this.detectors) {
      if (pattern.test(command)) {
        return cliName;
      }
    }
    return 'generic-ai';
  }

  getAdapter(name) {
    return this.adapters.get(name) || this.adapters.get('generic-ai');
  }

  list() {
    return Array.from(this.adapters.keys());
  }
}
```

### 4.2 动态注册示例

```javascript
// 运行时动态注册新 CLI
registry.register('new-ai-cli', new GenericAIClAdapter(registry, {
  name: 'new-ai-cli',
  patterns: [/^new-ai-cli\s+/i],
  defaultFlags: ['--no-interactive'],
  endpoint: 'http://localhost:8080'  // 如果需要 API
}));
```

---

## 5. Base AI Adapter

### 5.1 适配器接口定义

```javascript
class BaseAIAdapter {
  constructor(router) {
    this.router = router;
    this.name = 'base-ai';
    this.patterns = [];
    this.defaultFlags = [];
  }

  // 适配器名称
  get type() {
    return this.name;
  }

  // 检测模式 (正则数组)
  get detectionPatterns() {
    return this.patterns;
  }

  // 默认 flags
  get defaultArgs() {
    return this.defaultFlags;
  }

  // 验证命令是否有效
  validate(command) {
    return { valid: true };
  }

  // 预处理命令
  preprocess(command, context) {
    return {
      command: this.name,
      args: this.defaultArgs.concat(command),
      env: context.env || {}
    };
  }

  // 执行前钩子
  async beforeExec(command, context) {}

  // 执行后钩子
  async afterExec(result, context) {
    return result;
  }

  // 执行命令 (调用 Router)
  async exec(command, context) {
    return this.router.exec(command, context);
  }

  // 解析输出 (AI CLI 特有)
  parseOutput(rawOutput) {
    return {
      text: rawOutput,
      parsed: null
    };
  }
}
```

---

## 6. 标准 AI CLI 适配器

### 6.1 Gemini Adapter

```javascript
class GeminiAdapter extends BaseAIAdapter {
  constructor(router) {
    super(router);
    this.name = 'gemini';
    this.patterns = [/^gemini\s+/i, /^g\s+/i];
    this.defaultFlags = ['--no-cache'];
  }

  preprocess(command, context) {
    // gemini 特有的参数处理
    let args = command.replace(/^gemini\s*/i, '').split(/\s+/);

    // 自动添加 -y (yolo 模式) 防止交互阻塞
    if (!args.includes('-y') && !args.includes('--yolo')) {
      args.push('-y');
    }

    return {
      command: 'gemini',
      args: args,
      env: {
        ...context.env,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY
      }
    };
  }

  parseOutput(rawOutput) {
    // 解析 Gemini CLI 输出格式
    return {
      text: rawOutput,
      parsed: {
        // 根据实际输出格式调整
        success: !rawOutput.includes('ERROR'),
        response: rawOutput
      }
    };
  }
}
```

### 6.2 Claude Adapter

```javascript
class ClaudeAdapter extends BaseAIAdapter {
  constructor(router) {
    super(router);
    this.name = 'claude';
    this.patterns = [/^claude\s+/i, /^claude\s+-/i];
    this.defaultFlags = ['--no-input', '--print'];
  }

  preprocess(command, context) {
    let args = command.replace(/^claude\s*/i, '').split(/\s+/);

    // claude 特有参数
    if (!args.includes('--print')) {
      args.push('--print');
    }

    return {
      command: 'claude',
      args: args,
      env: context.env || {}
    };
  }
}
```

### 6.3 Generic AI Adapter (兜底)

```javascript
class GenericAIClAdapter extends BaseAIAdapter {
  constructor(router, config = {}) {
    super(router);
    this.name = config.name || 'generic-ai';
    this.patterns = config.patterns || [/^.+\s+.+/];
    this.defaultFlags = config.defaultFlags || [];
  }

  preprocess(command, context) {
    // 提取第一个词作为 CLI 名称，其余作为参数
    const parts = command.trim().split(/\s+/);
    const cliName = parts[0];
    const args = parts.slice(1);

    return {
      command: cliName,
      args: this.defaultFlags.concat(args),
      env: context.env || {}
    };
  }

  parseOutput(rawOutput) {
    return {
      text: rawOutput,
      parsed: null,
      raw: true  // 标记为原始输出
    };
  }
}
```

---

## 7. 输入输出格式

### 7.1 输入格式 (AI CLI Command)

```yaml
input:
  cli: "cc"                              # CLI 名称
  prompt: "帮我创建一个React组件"          # 核心指令
  flags: ["--verbose", "--no-confirm"]   # 可选 flags
  context:
    projectRoot: "/path/to/project"
    sandboxEnabled: true
    sandboxMode: "consensus"
```

### 7.2 输出格式 (AI CLI Response)

```json
{
  "success": true,
  "cliType": "gemini",
  "command": "gemini -y '创建一个React组件'",
  "exitCode": 0,
  "stdout": "已创建文件: src/components/Test.jsx\n组件内容:\nimport React from 'react';\n...",
  "stderr": "",
  "duration": 3241,
  "executedAt": "2026-05-01T10:00:00Z",
  "sandboxed": true,
  "parsed": {
    "filesCreated": ["src/components/Test.jsx"],
    "actions": ["CREATE_FILE"],
    "confidence": 0.95
  }
}
```

### 7.3 错误格式

```json
{
  "success": false,
  "cliType": "gemini",
  "command": "gemini 'invalid prompt'",
  "exitCode": 1,
  "error": {
    "code": "CLI_NOT_FOUND",
    "message": "gemini command not found",
    "suggestion": "Please install gemini CLI: npm install -g @google/gemini-cli"
  }
}
```

---

## 8. AI CLI Router 主类

```javascript
class AICLIRouter {
  constructor(config = {}) {
    this.config = config;
    this.registry = new AICLIRegistry();
    this.sandbox = config.sandbox;  // 沙盒管理器引用

    this.registerDefaultAdapters();
  }

  registerDefaultAdapters() {
    this.registry.register('gemini', new GeminiAdapter(this));
    this.registry.register('claude', new ClaudeAdapter(this));
    this.registry.register('cc', new CCAdapter(this));
    this.registry.register('openai', new OpenAIAdapter(this));
    this.registry.register('generic-ai', new GenericAIClAdapter(this));

    // 注册检测器
    this.registry.registerDetector(/^gemini\s+/i, 'gemini');
    this.registry.registerDetector(/^claude\s+/i, 'claude');
    this.registry.registerDetector(/^cc\s+/i, 'cc');
    this.registry.registerDetector(/^openai\s+/i, 'openai');
  }

  // 动态注册新 CLI
  registerCLI(name, adapterClass, patterns) {
    const adapter = new adapterClass(this);
    this.registry.register(name, adapter);
    for (const pattern of patterns) {
      this.registry.registerDetector(pattern, name);
    }
  }

  // 执行 AI CLI 命令
  async exec(input, context = {}) {
    // 1. 标准化输入
    const { cli, prompt, flags = [] } = this.normalizeInput(input);

    // 2. 检测 CLI 类型
    const cliType = this.registry.detect(`${cli} ${prompt}`);

    // 3. 获取适配器
    const adapter = this.registry.getAdapter(cliType);

    // 4. 预处理
    const { command, args, env } = adapter.preprocess(
      `${cli} ${prompt} ${flags.join(' ')}`,
      context
    );

    // 5. 沙盒执行
    const result = await this.execInSandbox(command, args, env, context);

    // 6. 后处理
    const parsed = adapter.parseOutput(result.stdout || result.stderr);

    return {
      success: result.exitCode === 0,
      cliType,
      command: `${command} ${args.join(' ')}`,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      duration: result.duration,
      executedAt: new Date().toISOString(),
      sandboxed: result.sandboxed,
      parsed
    };
  }

  normalizeInput(input) {
    if (typeof input === 'string') {
      const parts = input.split(/\s+/);
      return {
        cli: parts[0],
        prompt: parts.slice(1).join(' '),
        flags: []
      };
    }
    return input;
  }

  async execInSandbox(command, args, env, context) {
    // 委托给沙盒管理器执行
    return this.sandbox.exec(command, args, {
      ...context,
      env
    });
  }

  listSupportedCLI() {
    return this.registry.list();
  }
}
```

---

## 9. 扩展指南

### 9.1 添加新 AI CLI

```javascript
// 1. 创建适配器类
class NewAIClAdapter extends BaseAIAdapter {
  constructor(router) {
    super(router);
    this.name = 'new-ai';
    this.patterns = [/^new-ai\s+/i, /^na\s+/i];
    this.defaultFlags = ['--non-interactive'];
  }
}

// 2. 注册到 Router
router.registerCLI('new-ai', NewAIClAdapter, [/^new-ai\s+/i]);
```

### 9.2 检测所有已注册 CLI

```javascript
// 列出所有支持的 AI CLI
console.log(router.listSupportedCLI());
// ['gemini', 'claude', 'cc', 'openai', 'generic-ai']
```

---

## 10. 与沙盒的集成

```javascript
// 创建沙盒感知 Router
const sandboxManager = new SandboxManager({ mode: 'consensus' });
const router = new AICLIRouter({
  sandbox: sandboxManager
});

// 执行命令 - 自动在沙盒中运行
const result = await router.exec({
  cli: 'gemini',
  prompt: '创建一个 React 组件',
  flags: ['--verbose']
});
```

---

```yaml
version: 2.0.0
lastUpdated: 2026-05-01
relatedTo:
  - 01_system_architecture.md
  - 02_sandbox_design.md
  - 04_nl_parser_skill_design.md
```
