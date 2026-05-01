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
| Node.js 执行环境 | 插件需要 Node.js | 打包 N'Ahvasc |
| Namespace 权限 | 需要容器支持 | 提示用户使用 privileged 容器 |

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
