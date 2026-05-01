# VSCode 插件设计文档

> 本文档定义 VectaHub VSCode 插件的架构设计与功能规格

---

## 1. 设计目标

1. **独立运行**：插件可独立完成所有沙盒操作，不依赖外部进程
2. **原生体验**：深度集成 VSCode，符合官方 UX 规范
3. **实时反馈**：沙盒状态、执行进度实时显示在编辑器中
4. **自然语言支持**：内置自然语言命令面板

---

## 2. 功能模块

| 模块 | 功能 | 优先级 |
|------|------|--------|
| **Command Palette** | 自然语言命令输入 | P0 |
| **Sandbox Status Bar** | 沙盒状态实时显示 | P0 |
| **Task Panel** | 任务列表可视化 | P0 |
| **Inline Terminal** | 内联终端输出 | P1 |
| **Output Channel** | 执行日志查看 | P1 |
| **Configuration UI** | 沙盒配置面板 | P2 |

---

## 3. 架构设计

### 3.1 插件结构

```
vectahub-vscode/
├── extension.js              # 插件入口
├── package.json              # VSCode 插件配置
├── src/
│   ├── index.js              # 主入口
│   ├── commands/             # VSCode 命令
│   │   ├── runInSandbox.js
│   │   ├── parseNaturalLanguage.js
│   │   ├── showStatus.js
│   │   ├── switchMode.js
│   │   └── cleanup.js
│   ├── views/                # WebView 面板
│   │   ├── TaskPanel.js
│   │   └── TaskItem.js
│   ├── sandbox/              # 沙盒封装
│   │   ├── manager.js
│   │   └── modes.js
│   ├── cli/                  # CLI 执行封装
│   │   └── executor.js
│   ├── nlp/                  # 自然语言解析封装
│   │   └── parser.js
│   └── status/               # 状态管理
│       └── bar.js
├── media/                    # 静态资源
│   ├── icon.png
│   └── style.css
└── README.md
```

### 3.2 核心类图

```
┌─────────────────────────────────────────────────────────┐
│                    VectaHubExtension                      │
│  - activate()                                           │
│  - deactivate()                                         │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│                   CommandRegistry                        │
│  - registerCommands()                                    │
│  - getCommand(id)                                        │
└─────────────────────────────────────────────────────────┘
          │
    ┌─────┴─────┬─────────────┬─────────────┐
    ▼           ▼             ▼             ▼
┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐
│ RunCmd │ │ ParseCmd│ │ StatusCmd│ │ SwitchCmd│
└────────┘ └────────┘ └──────────┘ └──────────┘

┌─────────────────────────────────────────────────────────┐
│                   SandboxManager                          │
│  - createSandbox()                                      │
│  - execInSandbox(cmd, mode)                             │
│  - getStatus()                                           │
│  - cleanup()                                             │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│                    CLIRouter                             │
│  - exec(command)                                        │
│  - detectCLI(command)                                    │
│  - adapters[]                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 4. 界面设计

### 4.1 状态栏 (Status Bar)

```
[🟢 Sandboxed] [RELAXED] [Tasks: 3] [npm: ✓]
```

| 元素 | 显示 | 颜色 |
|------|------|------|
| 沙盒状态 | 🟢 Sandboxed / 🔴 Unsandboxed | green / red |
| 执行模式 | STRICT / RELAXED / CONSENSUS | yellow |
| 任务数 | Tasks: N | cyan |
| CLI 检测 | npm: ✓ | green |

### 4.2 命令面板 (Command Palette)

通过 `Ctrl+Shift+P` 激活：

```
> VectaHub: Run Natural Language Command
> VectaHub: Execute in Sandbox
> VectaHub: Switch Mode
> VectaHub: View Task Status
> VectaHub: Cleanup Sandbox
> VectaHub: Open Configuration
```

### 4.3 任务面板 (Task Panel)

```
┌────────────────────────────────────────────────────────┐
│  VectaHub Tasks                              [Refresh] │
├────────────────────────────────────────────────────────┤
│  ⏳ task_001  CODE_TRANSFORM                          │
│     将 React 组件从 JSX 转换为 TypeScript            │
│     [npm install] [mv src/...]                        │
├────────────────────────────────────────────────────────┤
│  ⏸ task_002  BUILD_VERIFY                            │
│     运行构建并检查错误                                  │
│     [npm run build] - Waiting for task_001            │
├────────────────────────────────────────────────────────┤
│  ✓ task_003  PACKAGE_INSTALL                         │
│     安装 TypeScript 依赖                              │
│     npm install -D typescript @types/react            │
│     Exit Code: 0 | Duration: 5.2s                     │
└────────────────────────────────────────────────────────┘
```

### 4.4 危险命令确认对话框

```
┌────────────────────────────────────────────────────────┐
│  ⚠️ Dangerous Command Detected                         │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Command: rm -rf /                                     │
│                                                        │
│  Category: SYSTEM                                      │
│  Risk: High                                            │
│                                                        │
│  Current Mode: CONSENSUS                               │
│                                                        │
│  [Cancel]  [Run Anyway]  [Always Allow for this cmd]  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## 5. 命令 API

### 5.1 注册的命令

```javascript
const commands = [
  {
    command: 'vectahub.runNaturalLanguage',
    title: 'VectaHub: Run Natural Language Command',
    when: 'editorTextFocus',
    handler: parseNaturalLanguage
  },
  {
    command: 'vectahub.execInSandbox',
    title: 'VectaHub: Execute in Sandbox',
    handler: execInSandbox
  },
  {
    command: 'vectahub.switchMode',
    title: 'VectaHub: Switch Sandbox Mode',
    handler: switchMode
  },
  {
    command: 'vectahub.showStatus',
    title: 'VectaHub: Show Status',
    handler: showStatus
  },
  {
    command: 'vectahub.cleanup',
    title: 'VectaHub: Cleanup Sandbox',
    handler: cleanup
  },
  {
    command: 'vectahub.openConfig',
    title: 'VectaHub: Open Configuration',
    handler: openConfig
  }
];
```

### 5.2 命令处理器

```javascript
async function parseNaturalLanguage(text) {
  const parser = new NLParser();
  const result = await parser.parse(text);

  if (result.status === 'NEEDS_CLARIFICATION') {
    const selected = await vscode.window.showQuickPick(
      result.candidates,
      { placeHolder: '请选择您的意图' }
    );
    // 处理clarification
  }

  if (result.status === 'READY') {
    await taskPanel.show(result.tasks);
    await executeTasks(result.tasks);
  }
}

async function execInSandbox(command, options) {
  const sandbox = sandboxManager.getSandbox();
  const result = await sandbox.exec(command, options);

  if (result.denied) {
    vscode.window.showWarningMessage(
      `Command denied: ${result.reason}`,
      'View Details'
    );
    return;
  }

  outputChannel.append(result.stdout);
  return result;
}
```

---

## 6. 配置管理

### 6.1 VSCode 配置项

```json
{
  "vectahub.sandbox.mode": {
    "type": "string",
    "enum": ["strict", "relaxed", "consensus"],
    "default": "consensus",
    "description": "沙盒执行模式"
  },
  "vectahub.sandbox.enabled": {
    "type": "boolean",
    "default": true,
    "description": "启用沙盒隔离"
  },
  "vectahub.sandbox.workspace": {
    "type": "string",
    "default": "${workspaceFolder}/.vectahub/sandbox",
    "description": "沙盒工作目录"
  },
  "vectahub.cli.timeout": {
    "type": "number",
    "default": 60000,
    "description": "命令超时 (毫秒)"
  },
  "vectahub.cli.maxConcurrent": {
    "type": "number",
    "default": 3,
    "description": "最大并发任务数"
  },
  "vectahub.dangerousWhitelist": {
    "type": "array",
    "default": [],
    "description": "危险命令白名单"
  }
}
```

### 6.2 配置 UI

使用 VSCode Settings API：

```javascript
// package.json
{
  "contributes": {
    "configuration": {
      "title": "VectaHub",
      "properties": {
        "vectahub.sandbox.mode": {
          "type": "string",
          "enum": ["strict", "relaxed", "consensus"],
          "default": "consensus"
        }
      }
    }
  }
}
```

---

## 7. 事件系统

### 7.1 事件类型

```javascript
const EVENTS = {
  SANDBOX_CREATED: 'sandbox:created',
  SANDBOX_DESTROYED: 'sandbox:destroyed',
  TASK_STARTED: 'task:started',
  TASK_COMPLETED: 'task:completed',
  TASK_FAILED: 'task:failed',
  MODE_CHANGED: 'mode:changed',
  DANGEROUS_COMMAND: 'dangerous:command',
  EXECUTION_COMPLETE: 'execution:complete',
};
```

### 7.2 事件监听

```javascript
sandboxManager.on(EVENTS.TASK_COMPLETED, (task) => {
  statusBar.updateTaskCount(taskManager.getPendingCount());
  taskPanel.updateItem(task.id, { status: 'completed' });
});

sandboxManager.on(EVENTS.DANGEROUS_COMMAND, (info) => {
  vscode.window.showWarningMessage(
    `Dangerous command blocked: ${info.command}`
  );
});
```

---

## 8. 依赖项

### 8.1 package.json

```json
{
  "name": "vectahub-vscode",
  "displayName": "VectaHub",
  "description": "AI-native development framework with sandboxed CLI execution",
  "version": "0.1.0",
  "engines": {
    "vscode": "^1.75.0"
  },
  "categories": [
    "Developer",
    "Other"
  ],
  "activationEvents": [
    "onCommand:vectahub.*",
    "onView:vectahub.taskPanel"
  ],
  "main": "./extension.js",
  "contributes": {
    "commands": [...],
    "views": [...],
    "configuration": [...]
  },
  "dependencies": {}
}
```

---

## 9. 安装与发布

### 9.1 开发模式安装

```bash
cd vectahub-vscode
npm install
code .
# 按 F5 启动调试
```

### 9.2 打包发布

```bash
npm install -g vsce
vsce package
# 生成 vectahub-vscode-0.1.0.vsix
```

---

## 10. 已知限制

| 限制 | 说明 | 解决方案 |
|------|------|----------|
| 沙盒需要 Linux/macOS | Windows 不支持 unshare | WSL2 兼容 |
| Node.js 执行环境 | 插件需要 Node.js | 打包 Node.js |
| Namespace 权限 | 需要容器支持 | 提示用户使用 privileged 容器 |

---

## 11. 功能清单

### 11.1 核心功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **NL 输入框** | 在编辑器中输入自然语言命令 | 🔲 待实现 | P0 |
| **工作流执行** | 在 VSCode 中执行工作流 | 🔲 待实现 | P0 |
| **实时输出** | 在终端面板显示执行输出 | 🔲 待实现 | P0 |
| **状态显示** | 状态栏显示执行状态 | 🔲 待实现 | P0 |
| **文件操作** | 显示工作流创建/修改的文件 | 🔲 待实现 | P1 |

### 11.2 编辑器集成

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **代码高亮** | 工作流 YAML 语法高亮 | 🔲 待实现 | P1 |
| **自动补全** | 工作流步骤自动补全 | 🔲 待实现 | P1 |
| **语法检查** | 工作流语法实时校验 | 🔲 待实现 | P1 |
| **模板提示** | 意图模板智能提示 | 🔲 待实现 | P2 |

### 11.3 可视化功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **工作流图** | 可视化工作流步骤关系 | 🔲 待实现 | P2 |
| **执行历史** | 查看历史执行记录 | 🔲 待实现 | P2 |
| **进度条** | 执行进度可视化 | 🔲 待实现 | P1 |
| **错误标记** | 在代码中标记错误位置 | 🔲 待实现 | P2 |

### 11.4 高级功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **快捷命令** | Command Palette 快捷入口 | 🔲 待实现 | P1 |
| **键盘快捷键** | 自定义快捷键执行 | 🔲 待实现 | P2 |
| **通知系统** | 执行完成通知 | 🔲 待实现 | P1 |
| **上下文菜单** | 右键菜单快捷操作 | 🔲 待实现 | P2 |

---

## 12. 业务架构

### 12.1 插件交互流程

```
用户操作 → 输入命令 → NL Parser → 工作流生成 → 沙盒执行 → 输出显示 → 文件变更
```

### 12.2 业务组件

| 组件 | 职责 | 输入 | 输出 |
|------|------|------|------|
| **InputPanel** | 自然语言输入面板 | 用户输入 | 命令字符串 |
| **CommandExecutor** | 命令执行控制器 | 命令字符串 | 执行结果 |
| **OutputTerminal** | 输出终端 | 执行结果 | 终端显示 |
| **StatusBar** | 状态栏组件 | 执行状态 | 状态显示 |
| **FileWatcher** | 文件变更监听 | 文件系统事件 | 变更通知 |
| **WorkflowEditor** | 工作流编辑器 | YAML 文件 | 可视化编辑 |

### 12.3 业务规则

1. **沙盒强制**：所有命令必须在沙盒中执行
2. **确认机制**：危险命令需要用户确认
3. **文件保护**：禁止修改工作区外文件
4. **输出限制**：终端输出限制最大行数
5. **超时限制**：默认执行超时 120 秒

---

## 13. 技术架构

### 13.1 技术选型

| 分类 | 技术 | 版本 | 说明 |
|------|------|------|------|
| **框架** | VSCode Extension API | 1.85+ | 插件开发框架 |
| **语言** | TypeScript | 5.x | 类型安全 |
| **UI** | Webview API | - | 自定义视图 |
| **终端** | Terminal API | - | 终端集成 |
| **文件系统** | Workspace API | - | 文件操作 |

### 13.2 模块结构

```
vectahub-vscode/
├── src/
│   ├── extension.ts              # 插件入口
│   ├── commands/                 # 命令实现
│   │   ├── run.ts                # 运行命令
│   │   ├── pause.ts              # 暂停执行
│   │   └── history.ts            # 查看历史
│   ├── panels/                   # 面板组件
│   │   ├── input-panel.ts        # 输入面板
│   │   └── workflow-editor.ts    # 工作流编辑器
│   ├── providers/                # 提供者
│   │   ├── completion.ts         # 自动补全
│   │   └── diagnostics.ts        # 语法检查
│   └── utils/                    # 工具函数
│       ├── executor.ts           # 执行器
│       └── notifier.ts           # 通知系统
├── package.json                  # 插件配置
└── tsconfig.json                 # TypeScript 配置
```

### 13.3 数据流

```
用户输入 → input-panel.ts → commands/run.ts → NL Parser → Workflow Engine → OutputTerminal → 显示结果
```

### 13.4 关键接口

| 接口 | 方法 | 描述 |
|------|------|------|
| **ExtensionContext** | `subscribe(disposable)` | 注册生命周期 |
| **Terminal** | `sendText(text)` | 发送终端文本 |
| **StatusBarItem** | `show()/hide()` | 显示/隐藏状态栏 |
| **WebviewPanel** | `postMessage(msg)` | Webview 消息通信 |
| **WorkspaceEdit** | `replace(uri, range, text)` | 文件编辑操作 |

---

```yaml
version: 1.0.0
lastUpdated: 2026-05-01
relatedTo:
  - 01_system_architecture.md
  - 02_sandbox_design.md
  - 03_cli_framework_design.md
  - 04_nl_parser_skill_design.md
```
