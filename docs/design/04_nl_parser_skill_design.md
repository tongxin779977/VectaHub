# 自然语言解析 Skill 设计文档

> 本文档定义 VectaHub 自然语言解析技能的设计与实现细节

---

## 0. 实现状态

| 组件 | 状态 | 说明 |
|------|------|------|
| **规则匹配** | ✅ 已实现 | 关键词匹配 + 置信度 |
| **LLM 增强** | ✅ 已实现 | OpenAI/Anthropic/Ollama/Groq 支持 |
| **意图模板** | ✅ 30/30 | 完整的意图模板系统，包含所有参数定义 |
| **实体提取** | ✅ 已实现 | 支持 FILE_PATH/CLI_TOOL 等 |
| **命令合成** | ✅ 已实现 | TaskList 生成 |
| **参数提取** | ✅ 已实现 | param-extractor.ts |
| **上下文理解** | ✅ 已实现 | 多轮对话支持 context-manager.ts |
| **同义词识别** | ✅ 已实现 | 模糊匹配支持 synonym-matcher.ts |
| **命令验证** | ✅ 已实现 | command-validator.ts |
| **多语言支持** | ✅ 已实现 | 中英文 i18n.ts |
| **进度显示** | ✅ 已实现 | 流式进度提示 progress.ts |
| **自定义意图** | ✅ 已实现 | custom-intent.ts |

---

## 0.1 LLM 集成计划

### 0.1.1 设计目标

**问题**：当前纯规则匹配无法处理复杂、模糊的用户意图。

**解决方案**：采用 Hybrid 架构 - 规则匹配 + LLM 增强

```
┌─────────────────────────────────────────────────────────────┐
│                    Hybrid NL Parser                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  用户输入 ──▶ 规则匹配 ──┬── 置信度高 ──▶ 直接执行           │
│           │              │                                    │
│           │              └── 置信度低 ──▶ LLM 增强           │
│           │                            │                    │
│           └── 规则未命中 ──────────────▶ LLM 解析           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 0.1.2 LLM 供应商支持

| 供应商 | 状态 | API 格式 | 优先级 |
|--------|------|----------|--------|
| **OpenAI** | ✅ 已实现 | OpenAI Chat API | P0 |
| **Anthropic** | ✅ 已实现 | Claude API | P0 |
| **Ollama** | ✅ 已实现 | OpenAI-compatible | P1 |
| **Groq** | ✅ 已实现 | OpenAI-compatible | P1 |

### 0.1.3 LLM 提示词模板

```typescript
const NL_COMPLETION_PROMPT = `你是一个工作流解析专家。用户输入一段自然语言，你需要：
1. 识别用户意图（从列表中选择最匹配的）
2. 提取关键参数
3. 生成标准化的工作流步骤

支持的意图类型：
- IMAGE_COMPRESS: 图片压缩
- FILE_FIND: 文件查找
- BACKUP: 备份/复制
- CI_PIPELINE: CI/CD 流程
- BATCH_RENAME: 批量重命名
- GIT_WORKFLOW: Git 操作
- DOCKER_MANAGE: Docker 容器管理
- SHELL_EXEC: 通用 Shell 执行
- CREATE_FILE: 创建文件
- MODIFY_FILE: 修改文件
- DELETE_FILE: 删除文件
- RUN_SCRIPT: 运行脚本
- INSTALL_PACKAGE: 安装依赖
- QUERY_INFO: 查询信息
- DEBUG: 调试
- REFACTOR: 重构
- GENERATE_TEST: 生成测试

用户输入: {userInput}

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
}`;

const NL_COMPLETION_FALLBACK = `你是一个 CLI 命令助手。用户想用自然语言描述一个操作，请将其转换为标准的 shell 命令。

规则：
- 如果是文件操作，使用 ls, cp, mv, rm 等
- 如果是 Git 操作，使用 git 命令
- 如果是 npm/yarn 操作，使用对应的包管理器命令
- 如果是 Docker 操作，使用 docker 命令

用户输入: {userInput}

直接输出最合适的 shell 命令，不需要解释。`;
```

### 0.1.4 配置项

```yaml
# ~/.vectahub/config.yaml
nl:
  parser:
    # 混合模式：rule-first（规则优先），llm-fallback（LLM 兜底）
    mode: "rule-first"  # 或 "llm-first"
    ruleConfidenceThreshold: 0.7
    llmProvider: "openai"  # openai | anthropic | ollama | groq

  llm:
    openai:
      model: "gpt-4o-mini"
      apiKey: "${OPENAI_API_KEY}"  # 环境变量引用
      baseUrl: "https://api.openai.com/v1"  # 可自定义
    anthropic:
      model: "claude-3-haiku"
      apiKey: "${ANTHROPIC_API_KEY}"
    ollama:
      baseUrl: "http://localhost:11434/v1"
      model: "llama3.2"
```

### 0.1.5 实现路径

```typescript
// Phase 1: 规则匹配（已实现）
// Phase 2: LLM 基础集成
async function parseWithLLM(input: string): Promise<IntentMatch> {
  const ruleMatch = ruleMatcher.match(input);
  if (ruleMatch.confidence >= 0.7) {
    return ruleMatch;
  }
  // 调用 LLM
  const llmResponse = await callLLM(NL_COMPLETION_PROMPT, { userInput: input });
  return parseLLMResponse(llmResponse);
}

// Phase 3: 流式响应 + 进度显示
// Phase 4: 多轮对话澄清
```

---

## 1. 设计目标
2. **结构化输出**：将自然语言转换为标准化的任务列表
3. **多 CLI 支持**：识别并生成多种 CLI 工具的命令
4. **可校验性**：输出的任务列表可人工审核和修正
5. **可扩展性**：支持新意图类型和 CLI 工具的添加

---

## 2. 核心概念

### 2.1 输入输出模型

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Natural   │ ──▶ │     NL      │ ──▶ │    Task     │
│   Language  │      │   Parser   │      │    List     │
│   Input     │      │   Skill    │      │   (JSON)    │
└─────────────┘      └─────────────┘      └─────────────┘
```

### 2.2 支持的意图类型

| 意图 | 描述 | 示例 | CLI 工具 |
|------|------|------|----------|
| `IMAGE_COMPRESS` | 压缩图片 | "压缩当前目录图片" | convert, sharp, cwebp |
| `FILE_FIND` | 查找文件 | "找出所有大于 100M 的文件" | find, fd, locate |
| `BACKUP` | 备份文件/目录 | "备份 Documents 到外接硬盘" | rsync, cp, tar |
| `CI_PIPELINE` | CI 流程 | "跑测试，通过就部署" | npm, yarn, docker |
| `BATCH_RENAME` | 批量重命名 | "把所有 .jpeg 改成 .jpg" | rename, mmv, git mv |
| `GIT_WORKFLOW` | Git 操作 | "提交并推送" | git |
| `DOCKER_MANAGE` | Docker 操作 | "停止所有容器" | docker |
| `SHELL_EXEC` | 通用 Shell | "运行这个命令" | bash, zsh |
| `CREATE_FILE` | 创建文件 | "创建一个 React 组件" | touch, cat, mkdir |
| `MODIFY_FILE` | 修改文件 | "把这个函数改成 async" | sed, mv |
| `DELETE_FILE` | 删除文件 | "删掉这个测试文件" | rm |
| `RUN_SCRIPT` | 运行脚本 | "运行 build 看看有没有报错" | npm, yarn, node |
| `INSTALL_PACKAGE` | 安装依赖 | "安装 lodash" | npm, yarn, pnpm, pip |
| `DEPLOY` | 部署 | "部署到生产环境" | npm, docker, kubectl |
| `QUERY_INFO` | 查询信息 | "查看当前项目结构" | ls, tree, find |
| `DEBUG` | 调试 | "帮我看看为什么报错" | node, python |
| `REFACTOR` | 重构 | "把这个组件重构一下" | sed, eslint |
| `GENERATE_TEST` | 生成测试 | "给这个函数写个测试" | jest, vitest, pytest |
| `PROCESS_KILL` | 终止进程 | "杀掉所有 node 进程" | kill, pkill |
| `SYSTEM_INFO` | 系统信息 | "查看磁盘使用情况" | df, du, free |
| `NETWORK_CHECK` | 网络检查 | "测试网络连通性" | ping, curl, wget |
| `PROCESS_LIST` | 进程列表 | "查看所有运行中的进程" | ps, top |
| `ENV_SETUP` | 环境配置 | "设置开发环境" | export, source |
| `FILE_PERMISSION` | 权限管理 | "修改文件权限" | chmod, chown |
| `ARCHIVE` | 归档压缩 | "把这个文件夹压缩" | tar, zip, gzip |
| `EXTRACT` | 解压文件 | "解压这个 tar.gz" | tar, unzip |
| `SEARCH_REPLACE` | 搜索替换 | "把所有 foo 改成 bar" | sed, ripgrep |
| `GIT_BRANCH` | 分支操作 | "创建并切换到新分支" | git checkout, git branch |
| `GIT_STASH` | Git 暂存 | "暂存当前更改" | git stash |
| `DOCKER_BUILD` | 构建镜像 | "构建 Docker 镜像" | docker build |
| `DOCKER_RUN` | 运行容器 | "启动一个新容器" | docker run |
| `LOG_VIEW` | 查看日志 | "查看最近 100 行日志" | tail, cat, less |
| `CRON_JOB` | 定时任务 | "设置每天早上 9 点备份" | crontab |

---

## 2.3 意图模板详细定义

### 2.3.1 IMAGE_COMPRESS

```yaml
name: IMAGE_COMPRESS
description: 压缩图片文件
keywords:
  - 压缩
  - 缩小
  - resize
  - compress
  - 图片
  - image
weight: 0.9
cli:
  - convert
  - sharp
  - cwebp
  - magick
params:
  pattern:
    type: string
    required: false
    default: "*.{jpg,jpeg,png}"
    description: 文件匹配模式
  quality:
    type: number
    required: false
    default: 50
    description: 压缩质量 (1-100)
  recursive:
    type: boolean
    required: false
    default: false
    description: 是否递归子目录
steps:
  - type: exec
    cli: find
    args: [".", "-type", "f", "-name", "${pattern}"]
    outputVar: imageFiles
  - type: for_each
    items: imageFiles
    body:
      - type: exec
        cli: convert
        args: ["${item}", "-resize", "${quality}%", "${item}"]
```

### 2.3.2 FILE_FIND

```yaml
name: FILE_FIND
description: 查找文件
keywords:
  - 找出
  - 查找
  - find
  - search
  - 文件
weight: 0.85
cli:
  - find
  - fd
  - locate
params:
  path:
    type: string
    required: false
    default: "."
    description: 搜索路径
  name:
    type: string
    required: false
    description: 文件名模式
  size:
    type: string
    required: false
    description: 文件大小 (e.g. "+100M")
  type:
    type: string
    required: false
    default: "f"
    description: 文件类型 (f=文件, d=目录)
steps:
  - type: exec
    cli: find
    args:
      - "${path}"
      - "-type"
      - "${type}"
      - "-name"
      - "${name:-*}"
      - "-size"
      - "${size:-}"
```

### 2.3.3 GIT_WORKFLOW

```yaml
name: GIT_WORKFLOW
description: Git 操作流程
keywords:
  - 提交
  - commit
  - 推送
  - push
  - 拉取
  - pull
  - git
weight: 0.95
cli:
  - git
params:
  action:
    type: string
    required: true
    description: 操作类型 (add|commit|push|pull|status)
  message:
    type: string
    required: false
    description: 提交信息
  branch:
    type: string
    required: false
    description: 分支名
  force:
    type: boolean
    required: false
    default: false
    description: 是否强制执行
steps:
  - type: exec
    cli: git
    args: ["add", "-A"]
    condition: "${action} in ['add', 'commit', 'push']"
  - type: exec
    cli: git
    args: ["commit", "-m", "${message}"]
    condition: "${action} in ['commit']"
  - type: exec
    cli: git
    args: ["push", "${force ? '--force' : ''}", "origin", "${branch:-main}"]
    condition: "${action} in ['push']"
  - type: exec
    cli: git
    args: ["pull", "origin", "${branch:-main}"]
    condition: "${action} == 'pull'"
  - type: exec
    cli: git
    args: ["status"]
    condition: "${action} == 'status'"
```

---

## 3. 解析流程

### 3.1 处理管道

```
自然语言输入
     │
     ▼
┌─────────────┐
│  Preprocess │ ───▶ 清理、标准化、分词
└─────────────┘
     │
     ▼
┌─────────────────┐
│ Intent Detection │ ───▶ 识别用户意图
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Entity Extraction│ ───▶ 提取实体 (文件路径、CLI 工具等)
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Task Generation │ ───▶ 生成任务列表
└─────────────────┘
     │
     ▼
┌─────────────────┐
│CLI Command Synth│ ───▶ 合成 CLI 命令
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ Format & Output │ ───▶ 标准化 JSON 输出
└─────────────────┘
```

### 3.2 意图检测规则

```javascript
const INTENT_PATTERNS = {
  CREATE_FILE: [
    /(?:create|新建|添加|创建一个) .{0,20} (?:file|文件|component|组件|class|class|module|模块)/i,
    /(?:create|新建) .{0,10} (?:jsx|ts|js|py|go|rs)/i,
  ],
  MODIFY_FILE: [
    /(?:修改|改动|改变|更新|upgrade) .{0,20} (?:file|文件|code|代码|component|组件)/i,
    /(?:把|将) .+ (?:改成|改为|改成|修改为)/i,
  ],
  DELETE_FILE: [
    /(?:删除|删掉|移除|去掉) .{0,20} (?:file|文件|component|组件)/i,
  ],
  RUN_SCRIPT: [
    /(?:运行|执行|跑一下|跑) .{0,10} (?:build|test|start|dev|lint)/i,
    /(?:看看|检查一下) .*(?:报错|有没有错|能不能跑)/i,
  ],
  INSTALL_PACKAGE: [
    /(?:安装|添加|引入) .{0,10} (?:package|依赖|库|library)/i,
    /(?:install|npm|yarn|pnpm) .+/i,
  ],
  DEPLOY: [
    /(?:部署|发布|deploy) .+/i,
    /(?:上线|投产)/i,
  ],
  QUERY_INFO: [
    /(?:查看|看看|显示|列出) .*(?:结构|目录|文件|内容)/i,
    /(?:what|how|why|如何|怎么|为什么)/i,
  ],
  DEBUG: [
    /(?:调试|排查|看看为什么) .*/i,
    /(?:fix|repair|修复) .*/i,
  ],
  REFACTOR: [
    /(?:重构|refactor|优化) .*/i,
  ],
  GENERATE_TEST: [
    /(?:生成|编写|写) .*(?:test|测试)/i,
    /(?:给|为) .+ (?:写|生成) (?:test|测试)/i,
  ],
};

function detectIntent(input) {
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        return { intent, confidence: 0.8 };
      }
    }
  }
  return { intent: 'UNKNOWN', confidence: 0 };
}
```

---

## 4. 实体提取

### 4.1 实体类型

| 实体类型 | 描述 | 示例 |
|----------|------|------|
| `FILE_PATH` | 文件路径 | `src/components/Button.jsx` |
| `CLI_TOOL` | CLI 工具 | `npm`, `git`, `docker` |
| `PACKAGE_NAME` | 包名 | `lodash`, `react` |
| `FUNCTION_NAME` | 函数名 | `handleClick`, `parseData` |
| `BRANCH_NAME` | 分支名 | `main`, `feature/login` |
| `ENV` | 环境 | `prod`, `staging`, `dev` |
| `OPTIONS` | 命令选项 | `--force`, `-f`, `--save` |

### 4.2 实体提取模式

```javascript
const ENTITY_PATTERNS = {
  FILE_PATH: [
    /(\/[\w\-\.\/]+\.(js|jsx|ts|tsx|py|go|rs|json|md|yml|yaml))/,
    /([\w\-\.\/]+\.(js|jsx|ts|tsx|py|go|rs|json|md|yml|yaml))/,
  ],
  CLI_TOOL: [
    /\b(npm|yarn|pnpm|git|docker|python|pip|cargo|go|make|cmake)\b/,
  ],
  PACKAGE_NAME: [
    /(?:\binstall\b|\badd\b|\brequire\b)\s+([@\w\-\/]+)/,
    /([\w\-\/]+)@\d+\.\d+\.\d+/,
  ],
  FUNCTION_NAME: [
    /function\s+(\w+)/,
    /const\s+(\w+)\s*=/,
    /(\w+)\s*\(/,
  ],
  BRANCH_NAME: [
    /(?:branch|checkout)\s+([\w\-\/]+)/,
    /(?:from|into)\s+([\w\-\/]+)/,
  ],
  ENV: [
    /\b(prod|production|staging|dev|development|test)\b/,
  ],
  OPTIONS: [
    /--[\w\-]+/g,
    /-[\w]/g,
  ],
};

function extractEntities(input) {
  const entities = {};

  for (const [type, patterns] of Object.entries(ENTITY_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = input.match(pattern);
      if (matches) {
        entities[type] = entities[type] || [];
        entities[type].push(...matches.slice(1));
      }
    }
  }

  return entities;
}
```

---

## 5. 任务列表格式

### 5.1 TaskList 结构

```json
{
  "version": "1.0",
  "generatedAt": "2026-05-01T10:00:00Z",
  "originalInput": "帮我把这个 React 组件改成 TypeScript，然后运行 build 看看有没有报错",
  "intent": "MODIFY_FILE",
  "confidence": 0.85,
  "entities": {
    "FILE_PATH": ["src/components/VoucherInput.jsx"],
    "CLI_TOOL": ["npm"],
    "OPTIONS": ["--save-dev"]
  },
  "tasks": [
    {
      "id": "task_001",
      "type": "CODE_TRANSFORM",
      "description": "将 React 组件从 JSX 转换为 TypeScript",
      "status": "PENDING",
      "commands": [
        {
          "cli": "mv",
          "args": ["src/components/VoucherInput.jsx", "src/components/VoucherInput.tsx"]
        },
        {
          "cli": "npm",
          "args": ["install", "-D", "typescript", "@types/react"]
        }
      ],
      "dependencies": [],
      "estimatedDuration": 30000
    },
    {
      "id": "task_002",
      "type": "BUILD_VERIFY",
      "description": "运行构建并检查错误",
      "status": "PENDING",
      "commands": [
        {
          "cli": "npm",
          "args": ["run", "build"]
        }
      ],
      "dependencies": ["task_001"],
      "estimatedDuration": 60000
    }
  ],
  "warnings": [],
  "metadata": {
    "parser": "nl-parser-v1",
    "confidence": 0.85
  }
}
```

### 5.2 Task 类型定义

| Task 类型 | 描述 | 生成的命令类型 |
|-----------|------|----------------|
| `CODE_TRANSFORM` | 代码转换 | `mv`, `cp`, `sed`, `cat` |
| `CODE_CREATE` | 创建文件 | `cat`, `touch`, `mkdir` |
| `CODE_DELETE` | 删除文件 | `rm` |
| `BUILD_VERIFY` | 构建验证 | `npm build`, `cargo build` |
| `TEST_RUN` | 运行测试 | `npm test`, `cargo test` |
| `PACKAGE_INSTALL` | 安装依赖 | `npm install`, `pip install` |
| `GIT_OPERATION` | Git 操作 | `git commit`, `git push` |
| `DOCKER_OPERATION` | Docker 操作 | `docker build`, `docker run` |
| `QUERY_EXEC` | 查询执行 | `ls`, `cat`, `grep` |
| `DEBUG_EXEC` | 调试执行 | `node --inspect` |

---

## 6. CLI 命令合成

### 6.1 命令模板

```javascript
const COMMAND_TEMPLATES = {
  CREATE_FILE: {
    file: (path, content) => `cat << 'EOF' > ${path}\n${content}\nEOF`,
    directory: (path) => `mkdir -p ${path}`,
  },
  MODIFY_FILE: {
    rename: (oldPath, newPath) => `mv ${oldPath} ${newPath}`,
    replace: (pattern, replacement, file) => `sed -i 's/${pattern}/${replacement}/g' ${file}`,
    append: (content, file) => `echo '${content}' >> ${file}`,
  },
  RUN_SCRIPT: {
    npm: (script) => `npm run ${script}`,
    yarn: (script) => `yarn ${script}`,
    node: (file) => `node ${file}`,
    python: (file) => `python ${file}`,
    cargo: (command) => `cargo ${command}`,
  },
  INSTALL_PACKAGE: {
    npm: (package, flags = '') => `npm install ${flags} ${package}`,
    yarn: (package) => `yarn add ${package}`,
    pnpm: (package) => `pnpm add ${package}`,
    pip: (package) => `pip install ${package}`,
  },
  GIT_OPERATION: {
    commit: (message) => `git commit -m "${message}"`,
    push: (branch = 'main') => `git push origin ${branch}`,
    pull: () => `git pull`,
    clone: (url, path) => `git clone ${url} ${path}`,
  },
};
```

### 6.2 合成算法

```javascript
function synthesizeCommand(task, context) {
  const { type, params } = task;

  switch (type) {
    case 'CODE_TRANSFORM':
      if (params.operation === 'rename') {
        return COMMAND_TEMPLATES.MODIFY_FILE.rename(params.from, params.to);
      }
      break;

    case 'PACKAGE_INSTALL':
      const cliTool = context.detectedCLI || 'npm';
      return COMMAND_TEMPLATES.INSTALL_PACKAGE[cliTool](
        params.package,
        params.flags || ''
      );

    case 'RUN_SCRIPT':
      const scriptRunner = COMMAND_TEMPLATES.RUN_SCRIPT[context.detectedCLI];
      return scriptRunner ? scriptRunner(params.script) : params.script;

    // ... 更多类型处理
  }

  return null;
}
```

---

## 7. 置信度与不确定性

### 7.1 置信度等级

| 置信度 | 等级 | 行为 |
|--------|------|------|
| `>= 0.9` | HIGH | 自动执行 |
| `0.7 - 0.9` | MEDIUM | 执行但提醒用户 |
| `0.5 - 0.7` | LOW | 显示预览，请求确认 |
| `< 0.5` | UNCERTAIN | 不执行，显示候选 |

### 7.2 不确定性处理

```javascript
function handleUncertainty(parsed, originalInput) {
  if (parsed.confidence < 0.5) {
    return {
      status: 'NEEDS_CLARIFICATION',
      message: `我不太确定您的意思，您是想：`,
      candidates: [
        { intent: 'CREATE_FILE', description: '创建一个新文件' },
        { intent: 'MODIFY_FILE', description: '修改现有文件' },
        { intent: 'RUN_SCRIPT', description: '运行一个脚本' },
      ],
      originalInput
    };
  }

  return { status: 'READY', parsed };
}
```

---

## 8. Skill 调用格式

### 8.1 Skill Input

```yaml
# 自然语言解析 Skill 输入
input:
  text: "帮我把这个 React 组件改成 TypeScript，然后运行 build"
  language: "zh-CN"
  context:
    projectRoot: "/path/to/project"
    detectedCLI: ["npm", "node"]
    fileStructure: ["src/App.jsx", "src/components/"]
```

### 8.2 Skill Output

```yaml
# 自然语言解析 Skill 输出
output:
  status: "SUCCESS"
  data:
    version: "1.0"
    generatedAt: "2026-05-01T10:00:00Z"
    originalInput: "帮我把这个 React 组件改成 TypeScript，然后运行 build"
    intent: "MODIFY_FILE"
    confidence: 0.85
    tasks: [...]
  errors: []
  warnings:
    - "检测到文件移动操作，建议备份"
```

---

## 9. 扩展指南

### 9.1 添加新意图

```javascript
// 1. 在 INTENT_PATTERNS 中添加新模式
INTENT_PATTERNS.NEW_INTENT = [
  /(?:new|新的) .{0,20} thing/i,
];

// 2. 在 TASK_TYPES 中添加新任务类型
TASK_TYPES.NEW_INTENT = {
  description: '...',
  requiredEntities: ['FILE_PATH'],
  commands: [...],
};
```

### 9.2 添加新 CLI 适配器

```javascript
// 在 COMMAND_TEMPLATES 中添加新模板
COMMAND_TEMPLATES.NEW_CLI = {
  install: (pkg) => `newcli install ${pkg}`,
  run: (script) => `newcli run ${script}`,
};
```

---

## 10. 功能清单

### 10.1 NL Parser 核心功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **规则匹配** | 基于关键词和正则匹配意图 | ✅ 已实现 | P0 |
| **意图识别** | 识别用户意图类型 | ✅ 已实现 | P0 |
| **参数提取** | 从输入中提取参数 | ✅ 已实现 | P0 |
| **实体提取** | 提取文件路径、命令等实体 | ✅ 已实现 | P0 |
| **置信度计算** | 计算匹配置信度 | ✅ 已实现 | P0 |
| **命令合成** | 生成标准化的工作流步骤 | ✅ 已实现 | P0 |

### 10.2 LLM 集成功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **OpenAI 集成** | 支持 GPT-4o-mini 等模型 | ✅ 已实现 | P0 |
| **Anthropic 集成** | 支持 Claude 模型 | ✅ 已实现 | P0 |
| **Ollama 集成** | 支持本地模型 | ✅ 已实现 | P1 |
| **Groq 集成** | 支持 Groq API | ✅ 已实现 | P1 |
| **混合模式** | 规则优先 + LLM 兜底 | ✅ 已实现 | P0 |
| **LLM 配置** | 支持环境变量配置 | ✅ 已实现 | P1 |

### 10.3 意图模板功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **内置意图** | 30 个完整意图模板 | ✅ 已实现 | P0 |
| **意图扩展** | 扩展到 30+ 意图 | ✅ 已实现 | P0 |
| **参数定义** | 为每个意图定义完整参数 | ✅ 已实现 | P1 |
| **自定义意图** | 用户自定义意图支持 | ✅ 已实现 | P2 |
| **模板市场** | 支持社区模板下载 | 🔲 待实现 | P3 |

### 10.4 高级解析功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **上下文理解** | 多轮对话支持 | ✅ 已实现 | P1 |
| **同义词识别** | 模糊匹配支持 | ✅ 已实现 | P2 |
| **参数补全** | 默认参数自动补全 | ✅ 已实现 | P1 |
| **命令验证** | 验证生成命令的可行性 | ✅ 已实现 | P2 |
| **进度显示** | 流式解析进度提示 | ✅ 已实现 | P2 |
| **多语言支持** | 中英文解析支持 | ✅ 已实现 | P2 |

---

## 11. 业务架构

### 11.1 NL Parser 业务流程

```
用户输入 → 输入规范化 → 规则匹配 → 置信度检查 → LLM增强(可选) → 参数提取 → 工作流生成 → 输出结果
```

### 11.2 业务组件

| 组件 | 职责 | 输入 | 输出 |
|------|------|------|------|
| **Input Normalizer** | 规范化用户输入 | 原始输入字符串 | 规范化字符串 |
| **Rule Matcher** | 基于规则匹配意图 | 规范化输入 | 意图匹配结果 |
| **Context Manager** | 多轮对话上下文管理 | 历史对话 | 增强输入 |
| **Synonym Matcher** | 同义词识别与模糊匹配 | 用户输入 | 标准化词 |
| **LLM Enhancer** | 使用 LLM 增强解析 | 意图匹配结果 | 增强解析结果 |
| **Param Extractor** | 提取参数 | 输入字符串 + 模板 | 参数对象 |
| **Entity Extractor** | 提取实体 | 输入字符串 | 实体列表 |
| **Command Validator** | 验证命令可行性 | CLI 命令 | 验证结果 |
| **Language Detector** | 检测输入语言 | 用户输入 | 语言类型 |
| **Progress Tracker** | 流式进度显示 | 解析阶段 | 进度信息 |
| **Custom Intent Registry** | 管理自定义意图 | 意图定义 | 意图注册 |
| **Workflow Generator** | 生成工作流步骤 | 意图 + 参数 | 工作流对象 |

### 11.3 业务规则

1. **规则优先**：规则匹配置信度 >= 0.7 时直接返回结果
2. **LLM 兜底**：规则未命中或置信度 < 0.7 时使用 LLM
3. **参数验证**：必须参数缺失时返回错误或请求用户补充
4. **意图限制**：仅支持预定义的意图类型
5. **安全过滤**：过滤危险命令和恶意输入

---

## 12. 技术架构

### 12.1 技术选型

| 分类 | 技术 | 版本 | 说明 |
|------|------|------|------|
| **规则引擎** | 正则表达式 | - | 意图匹配基础 |
| **OpenAI SDK** | openai | 4.x | OpenAI API 客户端 |
| **Anthropic SDK** | @anthropic-ai/sdk | 0.x | Claude API 客户端 |
| **YAML 解析** | yaml | 2.x | 配置解析 |
| **TypeScript** | 5.x | - | 类型安全 |

### 12.2 模块结构

```
src/nl/
├── parser.ts                    # NL Parser 核心
├── intent-matcher.ts            # 意图匹配器
├── llm.ts                       # LLM 集成
├── entity-extractor.ts          # 实体提取
├── param-extractor.ts           # 参数提取
├── command-synthesizer.ts       # 命令合成器
├── command-validator.ts         # 命令验证器
├── context-manager.ts          # 上下文管理器（多轮对话）
├── synonym-matcher.ts          # 同义词匹配器
├── i18n.ts                     # 多语言支持
├── progress.ts                 # 进度显示
├── custom-intent.ts            # 自定义意图
└── templates/                   # 意图模板
    └── index.ts                 # 30 个完整意图模板
```

### 12.3 数据流

```
用户输入 → parser.ts → intent-matcher.ts → (llm.ts 可选) → param-extractor.ts → workflow-generator.ts → 工作流对象
```

### 12.4 关键接口

| 接口 | 方法 | 描述 |
|------|------|------|
| **NLParser** | `parse(input)` | 解析用户输入 |
| **IntentMatcher** | `findBestMatch(input)` | 查找最佳意图匹配 |
| **LLMClient** | `chat(prompt)` | 调用 LLM API |
| **ParamExtractor** | `extract(input, template)` | 提取参数 |
| **EntityExtractor** | `extract(input)` | 提取实体 |
| **WorkflowGenerator** | `generate(intent, params)` | 生成工作流 |

---

```yaml
version: 1.0.0
lastUpdated: 2026-05-01
relatedTo:
  - 01_system_architecture.md
  - 03_cli_framework_design.md
  - 05_vscode_plugin_design.md
```
