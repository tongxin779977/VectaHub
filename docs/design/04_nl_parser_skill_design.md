# 自然语言解析 Skill 设计文档

> 本文档定义 VectaHub 自然语言解析技能的设计与实现细节

---

## 1. 设计目标

1. **自然语言输入**：用户可以用日常语言描述需求
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

| 意图 | 描述 | 示例 |
|------|------|------|
| `CREATE_FILE` | 创建文件 | "创建一个 React 组件" |
| `MODIFY_FILE` | 修改文件 | "把这个函数改成 async" |
| `DELETE_FILE` | 删除文件 | "删掉这个测试文件" |
| `RUN_SCRIPT` | 运行脚本 | "运行 build 看看有没有报错" |
| `INSTALL_PACKAGE` | 安装依赖 | "安装 lodash" |
| `DEPLOY` | 部署 | "部署到生产环境" |
| `QUERY_INFO` | 查询信息 | "查看当前项目结构" |
| `DEBUG` | 调试 | "帮我看看为什么报错" |
| `REFACTOR` | 重构 | "把这个组件重构一下" |
| `GENERATE_TEST` | 生成测试 | "给这个函数写个测试" |

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

```yaml
version: 1.0.0
lastUpdated: 2026-05-01
relatedTo:
  - 01_system_architecture.md
  - 03_cli_framework_design.md
  - 05_vscode_plugin_design.md
```
