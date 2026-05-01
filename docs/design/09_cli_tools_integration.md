# CLI 工具集成设计文档

> 本文档定义 VectaHub CLI 工具集成系统的架构设计与实现规范

---

## 1. 设计目标

1. **模块化集成**：支持多种 CLI 工具的标准化集成
2. **安全管理**：自动检测危险命令，提供多级别管控
3. **自动化友好**：提供清晰的命令定义，支持自动化执行
4. **易于扩展**：支持动态添加新的 CLI 工具

---

## 2. 架构设计

### 2.1 核心组件

```
cli-tools/
├── types.ts              # 类型定义
├── registry.ts           # 工具注册表
├── index.ts              # 导出文件
└── tools/
    ├── git.ts            # Git 工具定义 ✅ 已实现
    └── npm.ts            # NPM 工具定义 ✅ 已实现
```

### 2.2 类型系统

#### CliTool 接口

```typescript
interface CliTool {
  name: string;                    // 工具名称
  description: string;             // 工具描述
  version: string;                 // 支持的版本范围
  commands: Record<string, CliCommand>;  // 命令集合
  dangerousCommands?: string[];    // 危险命令列表
}
```

#### CliCommand 接口

```typescript
interface CliCommand {
  name: string;                    // 命令名称
  description: string;             // 命令描述
  usage: string;                   // 使用说明
  examples: string[];              // 使用示例
  options?: CliOption[];           // 命令选项
  dangerous?: boolean;             // 是否危险
  dangerLevel?: 'critical' | 'high' | 'medium' | 'low';  // 危险级别
  requiresConfirmation?: boolean;  // 是否需要确认
}
```

#### CliOption 接口

```typescript
interface CliOption {
  name: string;                    // 选项名称
  alias?: string;                  // 选项别名
  description: string;             // 选项描述
  required?: boolean;              // 是否必需
  defaultValue?: string | boolean; // 默认值
  type?: 'string' | 'boolean' | 'number';  // 值类型
}
```

### 2.3 工具注册表

```typescript
interface CliToolRegistry {
  register(tool: CliTool): void;                              // 注册工具
  getTool(name: string): CliTool | undefined;                 // 获取工具
  getAllTools(): CliTool[];                                   // 获取所有工具
  isCommandDangerous(toolName: string, command: string): boolean;  // 检测危险命令
  getCommandInfo(toolName: string, commandName: string): CliCommand | undefined;  // 获取命令信息
}
```

---

## 3. Git CLI 工具集成

### 3.1 工具定义

Git 工具定义位于 `src/cli-tools/tools/git.ts`，包含以下特性：

#### 危险命令标记

```typescript
dangerousCommands: [
  'push --force',      // 强制推送
  'reset --hard',      // 硬重置
  'clean -fd',         // 强制清理
  'rebase -i --exec',  // 交互式变基
  'filter-branch',     // 历史过滤
]
```

#### 命令分类

```typescript
const gitCommands = {
  // 日常命令 (安全)
  status: { dangerous: false },
  log: { dangerous: false },
  diff: { dangerous: false },
  show: { dangerous: false },

  // 修改命令 (需确认)
  commit: { dangerous: false, requiresConfirmation: false },
  add: { dangerous: false },
  branch: { dangerous: false },

  // 危险命令 (高危)
  push: {
    dangerous: true,
    dangerLevel: 'medium',
    requiresConfirmation: true,
    options: [
      { name: 'force', alias: 'f', description: '强制推送' }
    ]
  },
  pushForce: {
    name: 'push --force',
    dangerous: true,
    dangerLevel: 'critical',
    requiresConfirmation: true,
  },
  reset: {
    dangerous: true,
    dangerLevel: 'high',
    requiresConfirmation: true,
    options: [
      { name: 'hard', description: '硬重置' }
    ]
  },
  resetHard: {
    name: 'reset --hard',
    dangerous: true,
    dangerLevel: 'critical',
    requiresConfirmation: true,
  },
  clean: {
    dangerous: true,
    dangerLevel: 'high',
    requiresConfirmation: true,
    options: [
      { name: 'force', alias: 'f', description: '强制清理' },
      { name: 'directories', alias: 'd', description: '包含目录' }
    ]
  },
  rebase: {
    dangerous: true,
    dangerLevel: 'medium',
    requiresConfirmation: true,
    options: [
      { name: 'interactive', alias: 'i', description: '交互式变基' }
    ]
  },
  filterBranch: {
    name: 'filter-branch',
    dangerous: true,
    dangerLevel: 'critical',
    requiresConfirmation: true,
  },
};
```

---

## 4. NPM CLI 工具集成

### 4.1 工具定义

```typescript
interface NpmTool extends CliTool {
  name: 'npm';
  description: 'Node.js 包管理器';
  version: '>=6.0.0';
  commands: {
    install: NpmCommand;
    run: NpmCommand;
    test: NpmCommand;
    publish: NpmCommand;
  };
}

interface NpmCommand extends CliCommand {
  dangerLevel?: 'low' | 'medium' | 'high';
}
```

### 4.2 危险命令

```typescript
const npmDangerousCommands = [
  'publish',           // 发布包
  'access',            // 修改访问权限
  'adduser',           // 添加用户
  'logout',            // 登出
];
```

---

## 5. Docker CLI 工具集成

### 5.1 工具定义

```typescript
interface DockerTool extends CliTool {
  name: 'docker';
  description: '容器运行时';
  version: '>=20.0.0';
  dangerousCommands: string[];
}
```

### 5.2 危险命令

```typescript
const dockerDangerousCommands = [
  'rm -f',                   // 强制删除容器
  'rmi -f',                  // 强制删除镜像
  'system prune --all',      // 清理所有资源
  'stop $(docker ps -aq)',   // 停止所有容器
  'kill $(docker ps -aq)',   // 杀死所有容器
  'network rm',             // 删除网络
  'volume rm',              // 删除卷
  'container run --privileged',  // 特权容器
  'exec --privileged',      // 特权执行
];
```

---

## 6. kubectl CLI 工具集成

### 6.1 工具定义

```typescript
interface KubectlTool extends CliTool {
  name: 'kubectl';
  description: 'Kubernetes 命令行工具';
  version: '>=1.20.0';
  dangerousCommands: string[];
}
```

### 6.2 危险命令

```typescript
const kubectlDangerousCommands = [
  'delete namespace',        // 删除命名空间
  'delete pods --all',        // 删除所有 Pod
  'delete deployments --all', // 删除所有 Deployment
  'delete services --all',   // 删除所有 Service
  'delete configmap --all',   // 删除所有 ConfigMap
  'delete secret --all',      // 删除所有 Secret
  'exec --privileged',       // 特权执行
  'run --rm',                // 运行临时 Pod
  'rolling-update',          // 滚动更新
  'scale deployment',        // 扩缩容
];
```

---

## 7. 工具注册表实现

### 7.1 注册表类

```typescript
class ToolRegistry implements CliToolRegistry {
  private tools: Map<string, CliTool> = new Map();

  register(tool: CliTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): CliTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): CliTool[] {
    return Array.from(this.tools.values());
  }

  isCommandDangerous(toolName: string, command: string): boolean {
    const tool = this.getTool(toolName);
    if (!tool) return false;
    return tool.dangerousCommands?.includes(command) ?? false;
  }

  getCommandInfo(toolName: string, commandName: string): CliCommand | undefined {
    const tool = this.getTool(toolName);
    if (!tool) return undefined;
    return tool.commands[commandName];
  }

  isRegistered(name: string): boolean {
    return this.tools.has(name);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }
}
```

### 7.2 全局注册表实例

```typescript
export const globalRegistry = new ToolRegistry();

globalRegistry.register(gitTool);
globalRegistry.register(npmTool);
globalRegistry.register(dockerTool);
globalRegistry.register(kubectlTool);
```

---

## 8. 工具发现与加载

### 8.1 静态加载

在启动时加载内置工具：

```typescript
import { globalRegistry } from './registry';
import { gitTool } from './tools/git';
import { npmTool } from './tools/npm';
import { dockerTool } from './tools/docker';
import { kubectlTool } from './tools/kubectl';

export function loadBuiltinTools(): void {
  const tools = [gitTool, npmTool, dockerTool, kubectlTool];
  for (const tool of tools) {
    try {
      globalRegistry.register(tool);
      console.log(`Loaded tool: ${tool.name}`);
    } catch (error) {
      console.error(`Failed to load tool ${tool.name}:`, error);
    }
  }
}
```

### 8.2 动态加载

从配置文件或插件目录加载工具：

```typescript
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

export async function loadCustomTools(pluginsDir: string): Promise<void> {
  try {
    const files = await readdir(pluginsDir);
    for (const file of files) {
      if (!file.endsWith('.tool.ts') && !file.endsWith('.tool.js')) {
        continue;
      }
      const modulePath = join(pluginsDir, file);
      const module = await import(modulePath);
      const tool = module.default || module.tool;
      if (tool && isCliTool(tool)) {
        globalRegistry.register(tool);
      }
    }
  } catch (error) {
    console.error('Failed to load custom tools:', error);
  }
}
```

---

## 9. 命令执行与安全检测

### 9.1 安全检测流程

```typescript
interface SecurityCheckResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
  dangerLevel?: 'low' | 'medium' | 'high' | 'critical';
}

async function checkCommandSecurity(
  toolName: string,
  command: string,
  args: string[]
): Promise<SecurityCheckResult> {
  const tool = globalRegistry.getTool(toolName);
  if (!tool) {
    return { allowed: false, reason: `Unknown tool: ${toolName}` };
  }

  // 1. 检查是否是危险命令
  const isDangerous = globalRegistry.isCommandDangerous(toolName, command);
  if (!isDangerous) {
    return { allowed: true };
  }

  // 2. 获取命令信息
  const cmdInfo = globalRegistry.getCommandInfo(toolName, command);
  if (!cmdInfo) {
    return { allowed: false, reason: `Unknown command: ${command}` };
  }

  // 3. 返回需要确认的结果
  return {
    allowed: true,
    requiresConfirmation: cmdInfo.requiresConfirmation,
    dangerLevel: cmdInfo.dangerLevel,
    reason: cmdInfo.description,
  };
}
```

### 9.2 执行函数

```typescript
interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode: number;
  duration: number;
}

async function executeCommand(
  toolName: string,
  command: string,
  args: string[],
  options: { dryRun?: boolean; cwd?: string } = {}
): Promise<ExecutionResult> {
  const securityCheck = await checkCommandSecurity(toolName, command, args);

  if (!securityCheck.allowed) {
    return {
      success: false,
      error: securityCheck.reason,
      exitCode: 1,
      duration: 0,
    };
  }

  if (securityCheck.requiresConfirmation) {
    // 需要用户确认
    const confirmed = await promptConfirmation(
      `执行危险命令 ${command}?`,
      securityCheck.dangerLevel
    );
    if (!confirmed) {
      return {
        success: false,
        error: 'User rejected command',
        exitCode: 1,
        duration: 0,
      };
    }
  }

  // 构建完整命令
  const fullCommand = `${toolName} ${command} ${args.join(' ')}`;

  if (options.dryRun) {
    return {
      success: true,
      output: `[Dry Run] ${fullCommand}`,
      exitCode: 0,
      duration: 0,
    };
  }

  // 执行命令
  const startTime = Date.now();
  try {
    const result = await execAsync(fullCommand, { cwd: options.cwd });
    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr,
      exitCode: result.exitCode,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      exitCode: 1,
      duration: Date.now() - startTime,
    };
  }
}
```

---

## 10. 工具注册引导系统

### 10.1 引导流程

```
┌─────────────────────────────────────┐
│ 1. 检测环境                          │
│    • 扫描 PATH 中的可用工具           │
│    • 检测已安装的工具版本             │
│    • 识别工具类型                     │
└─────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│ 2. 预览注册                          │
│    • 显示发现的工具列表               │
│    • 展示每个工具的命令数量           │
│    • 标识危险命令                     │
└─────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│ 3. 用户确认                          │
│    • 选择要注册的工具                 │
│    • 确认危险命令提示                 │
└─────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│ 4. 完成注册                          │
│    • 写入配置文件                     │
│    • 显示注册结果                     │
└─────────────────────────────────────┘
```

### 10.2 引导命令

```bash
# 启动引导
vectahub tools guide

# 扫描可用工具
vectahub tools scan

# 列出已注册工具
vectahub tools list

# 注册单个工具
vectahub tools register git
vectahub tools register docker

# 注销工具
vectahub tools unregister npm
```

### 10.3 配置文件

```yaml
# ~/.vectahub/tools-config.yaml
tools:
  - name: git
    enabled: true
    version: ">=2.30.0"
    autoUpdate: false

  - name: docker
    enabled: true
    version: ">=20.0.0"
    autoUpdate: true

  - name: kubectl
    enabled: false
    version: ">=1.20.0"
    autoUpdate: false
```

### 10.4 配置文件验证规则

| 规则 | 说明 |
|------|------|
| `name` 必填 | 工具名称不能为空 |
| `version` 格式 | 必须符合 semver 格式 |
| `enabled` 布尔 | 必须为 true/false |
| `autoUpdate` 布尔 | 必须为 true/false |

### 10.5 配置文件校验命令

```bash
# 校验配置文件
vectahub tools validate

# 校验并显示详细信息
vectahub tools validate --verbose

# 从文件校验
vectahub tools validate --config ./my-tools.yaml
```

---

## 11. 工具自动发现系统

> 自动扫描用户系统环境，发现已安装的 CLI 工具并引导注册，零配置即可使用。

### 11.1 设计目标

1. **零配置启动**：自动发现系统中已安装的 CLI 工具
2. **智能识别**：通过 PATH、版本检测、命令帮助等多种方式识别工具
3. **渐进式注册**：发现 → 预览 → 确认 → 注册
4. **环境感知**：感知包管理器、版本管理器、容器运行时等生态

### 11.2 发现层级

| 层级 | 范围 | 示例 |
|------|------|------|
| **PATH** | 系统命令 | `git`, `docker`, `kubectl` |
| **版本管理器** | asdf, pyenv, nvm | `node`, `python`, `ruby` |
| **包管理器** | npm, brew, apt | `npm`, `brew`, `apt` |
| **容器环境** | Docker, Podman | `docker`, `podman` |
| **云 CLI** | AWS, GCP, Azure | `aws`, `gcloud`, `az` |

### 11.3 发现策略

```typescript
interface DiscoveryStrategy {
  name: string;
  scan(): Promise<DiscoveredTool[]>;
  priority: number;
}

class PathDiscovery implements DiscoveryStrategy {
  name = 'PATH';
  priority = 1;

  async scan(): Promise<DiscoveredTool[]> {
    const PATH_DIRS = process.env.PATH?.split(':') || [];
    const discovered: DiscoveredTool[] = [];

    for (const dir of PATH_DIRS) {
      try {
        const files = await readdir(dir);
        for (const file of files) {
          if (isExecutable(join(dir, file))) {
            discovered.push({
              name: file,
              path: join(dir, file),
              strategy: 'PATH',
            });
          }
        }
      } catch {
        // 忽略无法访问的目录
      }
    }

    return this.deduplicate(discovered);
  }
}

class VersionManagerDiscovery implements DiscoveryStrategy {
  name = 'VersionManager';
  priority = 2;

  async scan(): Promise<DiscoveredTool[]> {
    const discovered: DiscoveredTool[] = [];

    // asdf
    const asdfTools = await this.scanAsdf();
    discovered.push(...asdfTools);

    // nvm
    const nvmTools = await this.scanNvm();
    discovered.push(...nvmTools);

    // pyenv
    const pyenvTools = await this.scanPyenv();
    discovered.push(...pyenvTools);

    return discovered;
  }
}

class PackageManagerDiscovery implements DiscoveryStrategy {
  name = 'PackageManager';
  priority = 3;

  async scan(): Promise<DiscoveredTool[]> {
    const discovered: DiscoveredTool[] = [];

    // npm global
    const npmGlobal = await execAsync('npm list -g --depth=0 --json');
    const npmPkgs = JSON.parse(npmGlobal).dependencies || {};
    for (const [name] of Object.entries(npmPkgs)) {
      discovered.push({
        name,
        path: `npm:${name}`,
        strategy: 'NPM',
      });
    }

    // brew
    try {
      const brewList = await execAsync('brew list --versions');
      for (const line of brewList.stdout.split('\n')) {
        const [name, version] = line.trim().split(' ');
        if (name) {
          discovered.push({
            name,
            path: `brew:${name}`,
            version,
            strategy: 'Brew',
          });
        }
      }
    } catch {
      // brew 不可用
    }

    return discovered;
  }
}
```

### 11.4 发现结果处理

```typescript
interface DiscoveredTool {
  name: string;
  path: string;
  version?: string;
  strategy: 'PATH' | 'VersionManager' | 'PackageManager' | 'Container';
  lastSeen?: Date;
  confidence: number;
}

class DiscoveryProcessor {
  private registry: ToolRegistry;

  async process(discovered: DiscoveredTool[]): Promise<ProcessedResult[]> {
    const results: ProcessedResult[] = [];

    for (const tool of discovered) {
      // 1. 匹配已知工具
      const matched = this.matchKnownTool(tool);
      if (!matched) continue;

      // 2. 过滤已注册
      if (this.registry.isRegistered(matched.name)) {
        results.push({
          tool: matched,
          status: 'already_registered',
        });
        continue;
      }

      // 3. 评估版本兼容性
      const versionCheck = this.checkVersion(matched);
      if (!versionCheck.compatible) {
        results.push({
          tool: matched,
          status: 'version_incompatible',
          reason: versionCheck.reason,
        });
        continue;
      }

      // 4. 标记危险命令
      const dangerCheck = this.assessDanger(matched);
      if (dangerCheck.hasDangerous) {
        matched.hasDangerous = true;
        matched.dangerousCommands = dangerCheck.commands;
      }

      results.push({
        tool: matched,
        status: 'ready_to_register',
        warnings: dangerCheck.warnings,
      });
    }

    return results;
  }

  private matchKnownTool(discovered: DiscoveredTool): CliTool | null {
    const knownTools = ['git', 'docker', 'kubectl', 'npm', 'node', 'python', 'ruby'];

    for (const name of knownTools) {
      if (discovered.name === name || discovered.name.startsWith(`${name}-`)) {
        return this.createToolDefinition(name, discovered);
      }
    }

    return null;
  }
}
```

### 11.5 自动注册流程

```typescript
async function autoDiscoverAndRegister(): Promise<AutoDiscoveryResult> {
  const strategies: DiscoveryStrategy[] = [
    new PathDiscovery(),
    new VersionManagerDiscovery(),
    new PackageManagerDiscovery(),
    new ContainerDiscovery(),
  ];

  // 1. 并行扫描
  const scanResults = await Promise.all(
    strategies.map(s => s.scan())
  );

  // 2. 合并结果
  const allDiscovered = scanResults.flat();

  // 3. 处理结果
  const processor = new DiscoveryProcessor(globalRegistry);
  const processed = await processor.process(allDiscovered);

  // 4. 分类
  const ready = processed.filter(r => r.status === 'ready_to_register');
  const warnings = processed.filter(r => r.warnings?.length);

  // 5. 自动注册高置信度工具
  const autoRegister = ready.filter(r => r.tool.confidence >= 0.9);
  for (const item of autoRegister) {
    globalRegistry.register(item.tool);
  }

  return {
    total: allDiscovered.length,
    readyToRegister: ready.length,
    autoRegistered: autoRegister.length,
    alreadyRegistered: processed.filter(r => r.status === 'already_registered').length,
    warnings,
  };
}
```

### 11.6 CLI 命令

```bash
# 自动发现并注册
vectahub tools discover

# 只扫描不注册
vectahub tools discover --scan-only

# 显示详细信息
vectahub tools discover --verbose

# 设置发现源
vectahub tools discover --sources PATH,NPM,Brew

# 扫描特定工具
vectahub tools discover --filter "git,docker,kubectl"
```

---

## 12. CLI 工具类型定义

### 12.1 CliTool 接口

```typescript
interface CliTool {
  name: string;                    // 工具名称
  description: string;             // 工具描述
  version: string;                 // 支持的版本范围
  commands: Record<string, CliCommand>;  // 命令集合
  dangerousCommands?: string[];    // 危险命令列表
}
```

### 12.2 CliCommand 接口

```typescript
interface CliCommand {
  name: string;                     // 命令名称
  description: string;              // 命令描述
  args?: CliArg[];                  // 参数定义
  options?: CliOption[];            // 选项定义
  dangerLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical';
  requiresConfirmation?: boolean;   // 是否需要用户确认
  executionMode?: ExecutionMode;    // 执行模式要求
}

interface CliArg {
  name: string;
  description: string;
  required: boolean;
  variadic?: boolean;
}

interface CliOption {
  name: string;
  short?: string;
  description: string;
  takesValue: boolean;
  required?: boolean;
}

type ExecutionMode = 'strict' | 'relaxed' | 'consensus';
```

---

## 13. 最佳实践

### 13.1 工具定义原则

1. **完整描述**：每个命令都应有清晰的描述和使用示例
2. **危险标记**：危险命令必须设置 `dangerLevel` 和 `requiresConfirmation`
3. **版本兼容**：明确声明支持的版本范围
4. **参数校验**：提供完整的参数定义

### 13.2 安全集成

1. **双重检测**：工具定义的危险命令 + 安全协议的通用规则
2. **白名单优先**：安全命令加入白名单，避免重复确认
3. **审计追溯**：所有命令执行都记录审计日志

### 13.3 扩展开发

```typescript
export const myTool: CliTool = {
  name: 'mytool',
  description: '我的自定义工具',
  version: '>=1.0.0',
  commands: {
    run: {
      name: 'run',
      description: '运行任务',
      usage: 'mytool run [options]',
      examples: ['mytool run --name test'],
      options: [
        { name: 'name', alias: 'n', description: '任务名称' }
      ],
      dangerous: false,
    },
  },
};
```

---

## 14. 功能清单

### 14.1 核心功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **工具注册表** | 管理 CLI 工具注册 | ✅ 已实现 | P0 |
| **工具发现** | 自动发现可用工具 | ✅ 已实现 | P1 |
| **命令定义** | 定义工具命令结构 | ✅ 已实现 | P0 |
| **安全检测** | 命令安全级别检查 | ✅ 已实现 | P0 |
| **引导系统** | 引导用户注册工具 | ✅ 已实现 | P1 |
| **PATH 扫描** | 扫描系统 PATH 中的工具 | ✅ 已实现 | P0 |
| **包管理器扫描** | 扫描 npm/brew/apt 包 | ✅ 已实现 | P1 |

### 14.2 内置工具支持

| 工具 | 命令数 | 状态 | 优先级 |
|------|--------|------|--------|
| **git** | 22 | ✅ 已实现 | P0 |
| **npm** | 14 | ✅ 已实现 | P0 |
| **docker** | 0 | 🔲 待实现 | P0 |
| **kubectl** | 0 | 🔲 待实现 | P1 |
| **curl** | 0 | 🔲 待实现 | P1 |
| **grep/find** | 0 | 🔲 待实现 | P2 |
| **ssh/scp** | 0 | 🔲 待实现 | P2 |

### 14.3 高级功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **动态加载** | 从插件目录加载工具 | 🔲 待实现 | P1 |
| **工具别名** | 支持工具别名 | 🔲 待实现 | P2 |
| **命令缓存** | 缓存常用命令结果 | 🔲 待实现 | P2 |
| **工具版本** | 检测和显示工具版本 | ✅ 已实现 | P1 |
| **依赖检查** | 检查工具依赖关系 | 🔲 待实现 | P1 |

### 14.4 自动发现功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **PATH 扫描** | 扫描系统 PATH 中的工具 | ✅ 已实现 | P0 |
| **包管理器扫描** | 扫描 npm/brew/apt 包 | ✅ 已实现 | P1 |
| **版本管理器扫描** | 扫描 asdf/nvm/pyenv | 🔲 待实现 | P1 |
| **容器环境扫描** | 扫描 Docker/Podman | 🔲 待实现 | P2 |
| **云 CLI 扫描** | 扫描 aws/gcloud/az | 🔲 待实现 | P2 |

---

## 15. 业务架构

### 15.1 工具注册流程

```
环境扫描 → 工具发现 → 用户确认 → 注册工具 → 写入配置 → 完成注册
```

### 15.2 业务组件

| 组件 | 职责 | 输入 | 输出 |
|------|------|------|------|
| **ToolScanner** | 扫描可用工具 | 系统 PATH | 工具列表 |
| **ToolRegistry** | 管理工具注册表 | 工具实例 | 注册结果 |
| **SecurityChecker** | 命令安全检测 | 工具+命令 | 安全报告 |
| **ConfigManager** | 配置管理 | 配置数据 | 配置文件 |
| **GuideSystem** | 引导用户注册 | 用户选择 | 注册结果 |
| **DiscoveryProcessor** | 处理发现结果 | 原始发现数据 | 处理结果 |

### 15.3 业务规则

1. **默认内置**：Git/NPM/Docker 等常用工具默认注册
2. **安全优先**：所有工具命令必须通过安全检测
3. **动态加载**：支持从插件目录动态加载工具
4. **版本兼容**：支持不同版本的同一工具
5. **依赖检查**：注册时检查工具依赖关系
6. **置信度阈值**：高置信度工具自动注册（>=0.9）

---

## 16. 技术架构

### 16.1 技术选型

| 分类 | 技术 | 版本 | 说明 |
|------|------|------|------|
| **CLI 框架** | Commander.js | 12.x | 命令行解析 |
| **YAML 解析** | yaml | 2.x | 配置解析 |
| **TypeScript** | 5.x | - | 类型安全 |
| **文件系统** | fs/promises | Node.js | 异步 IO |
| **语义版本** | semver | 7.x | 版本比较 |

### 16.2 模块结构

```
src/tools/
├── registry.ts               # 工具注册表
├── scanner.ts                # 工具扫描器
├── security.ts               # 安全检测
├── guide.ts                  # 引导系统
├── discovery/                # 工具发现
│   ├── path.ts               # PATH 扫描
│   ├── version-manager.ts    # 版本管理器扫描
│   ├── package-manager.ts    # 包管理器扫描
│   └── container.ts          # 容器环境扫描
└── definitions/              # 工具定义
    ├── git.ts                # Git 工具定义
    ├── npm.ts                # NPM 工具定义
    ├── docker.ts             # Docker 工具定义
    └── kubectl.ts            # Kubectl 工具定义
```

### 16.3 数据流

```
用户命令 → scanner.ts → registry.ts → security.ts → 执行结果 → 输出
```

### 16.4 关键接口

| 接口 | 方法 | 描述 |
|------|------|------|
| **ToolRegistry** | `register(tool)` | 注册工具 |
| **ToolRegistry** | `getTool(name)` | 获取工具 |
| **ToolRegistry** | `getAllTools()` | 获取所有工具 |
| **ToolScanner** | `scan()` | 扫描可用工具 |
| **SecurityChecker** | `check(tool, command)` | 安全检测 |
| **GuideSystem** | `guide()` | 启动引导流程 |
| **DiscoveryProcessor** | `process(tools)` | 处理发现结果 |

---

## 17. AI CLI 工具适配器

> 支持将工作流步骤委派给 AI CLI 工具执行，实现跨工具协作。

### 17.1 设计目标

1. **统一接口**：通过 AIAdapter 接口统一不同 AI CLI 工具的调用方式
2. **Headless 模式**：所有 AI 工具都支持非交互式命令行调用
3. **会话复用**：支持 AI 工具会话保持，减少重复启动开销
4. **安全隔离**：AI 工具执行需通过 VectaHub 安全检测

### 17.2 支持的 AI CLI 工具

| 工具 | Headless 命令 | 输出格式 | 沙盒兼容 | 推荐超时 |
|------|--------------|---------|---------|---------|
| **Gemini CLI** | `gemini -p "prompt"` | text/json | ❌ 否 | 120s |
| **Claude Code** | `claude -p "prompt"` | text/json | ✅ 是 | 180s |
| **Codex CLI** | `codex exec "prompt"` | text/JSONL | ✅ 是（云端） | 300s |
| **Aider** | `aider --message "prompt"` | text | ✅ 是 | 120s |
| **OpenCLI** | `opencli <site> <command>` | text/json | ✅ 是 | 30s |

### 17.3 AI CLI 适配器接口

```typescript
interface AIAdapter {
  name: string;
  version: string;
  headlessCommand: string;
  allowedTools?: string[];
  maxTurns?: number;
  outputFormat?: 'text' | 'json' | 'stream-json';
  sandboxCompatible: boolean;
  recommendedTimeout: number;
  healthCheck(): Promise<boolean>;
  buildCommand(prompt: string, context?: Record<string, unknown>, options?: AIDelegateOptions): string;
  parseOutput(stdout: string, options?: AIDelegateOptions): ParsedAIOutput;
}

interface ParsedAIOutput {
  success: boolean;
  result: string;
  metadata?: Record<string, unknown>;
  tokenUsage?: number;
  error?: string;
}
```

### 17.4 Gemini CLI 适配器

#### 17.4.1 基本信息

```typescript
const GEMINI_ADAPTER: AIAdapter = {
  name: 'gemini',
  version: '>=2.5.0',
  headlessCommand: 'gemini -p',
  allowedTools: ['Read', 'Edit', 'Bash'],
  maxTurns: 10,
  outputFormat: 'json',
  sandboxCompatible: false,  // 沙盒模式有已知问题
  recommendedTimeout: 120000,
};
```

#### 17.4.2 Headless 模式命令

```bash
# ✅ 正确的 Gemini Headless 用法
gemini -p "Review this code"
gemini --prompt "What is machine learning?"
gemini -p "Fix the bug in auth.py" --allowedTools "Read,Edit,Bash"
gemini -p "Explain this code" --output-format json
```

#### 17.4.3 命令构建逻辑

```typescript
buildCommand(prompt, context, options): string {
  let cmd = `${this.headlessCommand} "${prompt}"`;
  if (options?.allowedTools) {
    cmd += ` --allowedTools "${options.allowedTools.join(',')}"`;
  }
  if (options?.maxTurns) {
    cmd += ` --max-turns ${options.maxTurns}`;
  }
  if (options?.outputFormat) {
    cmd += ` --output-format ${options.outputFormat}`;
  }
  if (context) {
    const ctxFile = writeContextToFile(context);
    cmd += ` --context ${ctxFile}`;
  }
  return cmd;
}
```

### 17.5 Claude Code 适配器

#### 17.5.1 基本信息

```typescript
const CLAUDE_ADAPTER: AIAdapter = {
  name: 'claude',
  version: '>=1.0.33',
  headlessCommand: 'claude -p',
  allowedTools: ['Read', 'Edit', 'Bash'],
  maxTurns: 10,
  outputFormat: 'json',
  sandboxCompatible: true,
  recommendedTimeout: 180000,
};
```

#### 17.5.2 Headless 模式命令

```bash
# ✅ 正确的 Claude Code Headless 用法
claude -p "Find and fix the bug in auth.py"
claude -p "Write unit tests" --allowedTools "Read,Edit,Bash"
claude -p "Review the code" --output-format json
```

#### 17.5.3 命令构建逻辑

```typescript
buildCommand(prompt, context, options): string {
  let cmd = `${this.headlessCommand} "${prompt}"`;
  if (options?.allowedTools) {
    cmd += ` --allowedTools "${options.allowedTools.join(',')}"`;
  }
  if (options?.maxTurns) {
    cmd += ` --max-turns ${options.maxTurns}`;
  }
  if (options?.outputFormat) {
    cmd += ` --output-format ${options.outputFormat}`;
  }
  return cmd;
}
```

### 17.6 Codex CLI 适配器

#### 17.6.1 基本信息

```typescript
const CODEX_ADAPTER: AIAdapter = {
  name: 'codex',
  version: '>=1.0.0',
  headlessCommand: 'codex exec',
  allowedTools: ['Read', 'Edit', 'Bash'],
  maxTurns: 10,
  outputFormat: 'json',
  sandboxCompatible: true,  // 自带云端沙盒
  recommendedTimeout: 300000,
};
```

#### 17.6.2 Headless 模式命令

```bash
# ✅ 正确的 Codex Headless 用法
codex exec "为 README.md 添加安装说明"
codex exec "运行测试套件，修复所有失败的测试" --full-auto
codex exec "Write unit tests" --json
codex exec "Do whatever needed" --yolo  # 跳过所有确认（危险！）
```

#### 17.6.3 命令构建逻辑

```typescript
buildCommand(prompt, context, options): string {
  let cmd = `${this.headlessCommand} "${prompt}"`;
  if (options?.allowedTools) {
    cmd += ` --allowedTools "${options.allowedTools.join(',')}"`;
  }
  if (options?.maxTurns) {
    cmd += ` --max-turns ${options.maxTurns}`;
  }
  if (options?.outputFormat === 'json') {
    cmd += ' --json';
  }
  if (options?.timeout) {
    cmd += ` --timeout ${options.timeout}`;
  }
  return cmd;
}
```

### 17.7 Aider 适配器

#### 17.7.1 基本信息

```typescript
const AIDER_ADAPTER: AIAdapter = {
  name: 'aider',
  version: '>=0.50.0',
  headlessCommand: 'aider --message',
  allowedTools: ['Read', 'Edit', 'Bash'],
  maxTurns: 10,
  outputFormat: 'text',
  sandboxCompatible: true,
  recommendedTimeout: 120000,
};
```

#### 17.7.2 Headless 模式命令

```bash
# ✅ 正确的 Aider Headless 用法
aider --message "make a script that prints hello" hello.js
aider --msg "add docstrings to all functions" *.py
aider -m "fix the bug in auth.py" --yes --dry-run
```

#### 17.7.3 命令构建逻辑

```typescript
buildCommand(prompt, context, options): string {
  let cmd = `${this.headlessCommand} "${prompt}"`;
  if (options?.allowedTools) {
    cmd += ` --yes`;
  }
  return cmd;
}
```

### 17.8 OpenCLI 适配器

#### 17.8.1 基本信息

```typescript
const OPENCLI_ADAPTER: AIAdapter = {
  name: 'opencli',
  version: '>=1.7.0',
  headlessCommand: 'opencli',
  maxTurns: 1,
  outputFormat: 'text',
  sandboxCompatible: true,
  recommendedTimeout: 30000,
};
```

#### 17.8.2 命令示例

```bash
# ✅ OpenCLI 命令示例
opencli bilibili hot --limit 5
opencli xiaohongshu search --query "AI"
opencli twitter upload --files ./downloads/*.mp4
```

#### 17.8.3 命令构建逻辑

```typescript
buildCommand(prompt, context, options): string {
  // OpenCLI 命令格式：opencli <site> <command> [options]
  // prompt 应该符合 "site command --options" 格式
  return `${this.headlessCommand} ${prompt}`;
}
```

### 17.9 AI CLI 工具发现

#### 17.9.1 自动发现

```bash
# 自动发现已安装的 AI CLI 工具
vectahub tools discover --ai

🤖 Scanning for AI CLI tools...
  ✅ gemini v2.5.0 found (Headless: gemini -p)
  ✅ claude v1.0.33 found (Headless: claude -p)
  ✅ codex v1.0.0 found (Headless: codex exec)
  ✅ aider v0.50.0 found (Headless: aider --message)

📋 Registering AI tools...
  ✅ gemini registered with sandboxCompatible=false
  ✅ claude registered with sandboxCompatible=true
  ✅ codex registered with sandboxCompatible=true
  ✅ aider registered with sandboxCompatible=true

💡 Tip: Run 'vectahub tools list --ai' to see all registered AI tools
```

#### 17.9.2 查看 AI 工具列表

```bash
vectahub tools list --ai

🤖 Available AI Adapters:
  ✅ gemini v2.5.0 (Headless: gemini -p, Sandbox: ❌)
  ✅ claude v1.0.33 (Headless: claude -p, Sandbox: ✅)
  ✅ codex v1.0.0 (Headless: codex exec, Sandbox: ✅)
  ✅ aider v0.50.0 (Headless: aider --message, Sandbox: ✅)
  ✅ opencli v1.7.6 (Headless: opencli, Sandbox: ✅)
```

### 17.10 委派工作流示例

```yaml
# ~/.vectahub/workflows/ai-assisted-dev.yaml
name: "AI 辅助开发流程"
session_config:
  timeout: 1800000
  maxTokenUsage: 100000
  keepAlive: true

steps:
  - id: review
    type: delegate
    delegate_to: gemini
    delegate_prompt: "Review the code in src/ for potential bugs"
    outputVar: reviewResult
    delegate_options:
      maxTurns: 5
      allowedTools: ["Read"]
      outputFormat: "json"

  - id: fix
    type: delegate
    delegate_to: claude
    delegate_prompt: "Fix the issues: ${review}"
    delegate_context:
      review: "${reviewResult}"
    outputVar: fixResult
    delegate_options:
      allowedTools: ["Read", "Edit", "Bash"]
      maxTurns: 10

  - id: tests
    type: delegate
    delegate_to: aider
    delegate_prompt: "Write unit tests for the fixed code"
    outputVar: testResult
    delegate_options:
      allowedTools: ["Read", "Edit", "Bash"]

  - id: run-tests
    type: exec
    cli: "npm"
    args: ["test"]
    dependsOn: ["tests"]
```

### 17.11 沙盒兼容性处理

| AI 工具 | 沙盒兼容 | 处理策略 |
|---------|---------|---------|
| **Gemini** | ❌ 否 | 检测到 Gemini 时自动禁用 VectaHub 沙盒，使用工具自带的安全机制 |
| **Claude Code** | ✅ 是 | 通过 `--allowedTools "Read,Edit,Bash"` 控制权限 |
| **Codex CLI** | ✅ 是（云端） | Codex 在云端沙盒执行，VectaHub 只需传递命令 |
| **Aider** | ✅ 是 | 通过 `--yes` 跳过确认，使用工具权限控制 |
| **OpenCLI** | ✅ 是 | 本身安全，不需要额外沙盒 |

### 17.12 超时控制配置

```yaml
# AI CLI 工具推荐超时设置
timeout:
  gemini: 120000  # 2 分钟
  claude: 180000  # 3 分钟（agent 模式可能需要更长时间）
  codex: 300000   # 5 分钟（云端执行，可能更慢）
  aider: 120000   # 2 分钟
  opencli: 30000  # 30 秒（非 AI 工具，较快）
```

### 17.13 错误处理与重试

```typescript
interface RetryPolicy {
  maxRetries: number;
  retryOnExitCodes: number[];
  backoffMs: number;
}

const DEFAULT_RETRY: RetryPolicy = {
  maxRetries: 2,
  retryOnExitCodes: [1, 124],  // 1=一般错误，124=超时
  backoffMs: 2000,
};
```

### 17.14 上下文传递策略

| 上下文大小 | 传递方式 | 示例 |
|-----------|---------|------|
| **小上下文** | 直接通过 stdin 传递 | `gemini -p "Fix this bug: ${bug_description}"` |
| **中等上下文** | 通过临时文件传递 | `echo '${review_result}' > /tmp/review.json` |
| **大上下文** | 通过项目索引传递 | `vectahub index ./src` → `gemini -p "Review entire project"` |

### 17.15 守护进程模式

> 通过持久运行的 AI CLI 进程复用会话，避免重复启动开销。

#### 17.15.1 守护进程架构

```
┌──────────────────┐     IPC (Unix Socket)     ┌──────────────────────┐
│  VectaHub CLI    │◄────────────────────────►│  vectahub-daemon     │
│  (客户端)        │                           │  (守护进程)          │
└──────────────────┘                           └──────────┬───────────┘
                                                          │
                                               spawn() / stdio
                                                          │
                        ┌──────────────────┬──────────────┼──────────────┐
                        ▼                  ▼              ▼              ▼
                   ┌─────────┐      ┌─────────┐    ┌─────────┐   ┌─────────┐
                   │Gemini CLI│     │Claude   │    │ Codex   │   │ Aider   │
                   │(持久进程)│     │(持久进程)│    │(持久进程)│   │(持久进程)│
                   └─────────┘      └─────────┘    └─────────┘   └─────────┘
```

#### 17.15.2 AI 工具在守护进程中的生命周期

| 阶段 | 说明 | 命令 |
|------|------|------|
| **创建** | 守护进程启动 AI CLI 工具进程 | `spawn('gemini', [], { stdio: ['pipe', 'pipe', 'pipe'] })` |
| **保持** | 进程持续运行，等待任务 | 进程保持空闲状态 |
| **执行** | 通过 stdin 发送 prompt，stdout 接收结果 | `process.stdin.write(prompt)` |
| **复用** | 同一进程处理多个任务 | 上下文保持 |
| **清理** | 空闲超时或会话过期时终止 | `process.kill()` |

#### 17.15.3 守护进程与 AI 工具交互协议

```typescript
// 通过 stdin/stdout 与 AI CLI 通信
interface SessionProtocol {
  // 发送任务
  send(session: AISession, prompt: string): void;
  
  // 接收输出（流式）
  onOutput(session: AISession, callback: (data: string) => void): void;
  
  // 检测输出完成
  isComplete(output: string): boolean;
  
  // 错误处理
  onError(session: AISession, callback: (error: Error) => void): void;
}

// 输出完整性检测
function isOutputComplete(output: string): boolean {
  return (
    output.includes('\n\n') ||        // 双换行
    output.includes('✅') ||          // 完成标记
    output.includes('Done') ||        // Done 文本
    output.includes('Finished') ||
    isJSONComplete(output)            // JSON 完整性
  );
}
```

#### 17.15.4 各 AI 工具的守护进程兼容性

| AI 工具 | 守护进程兼容 | 注意事项 |
|---------|------------|---------|
| **Gemini CLI** | ⚠️ 部分兼容 | 沙盒模式有已知问题，建议使用非沙盒模式 |
| **Claude Code** | ✅ 完全兼容 | 支持 stdin/stdout 交互，上下文保持良好 |
| **Codex CLI** | ✅ 完全兼容 | 自带云端沙盒，守护进程只需传递命令 |
| **Aider** | ✅ 完全兼容 | 支持 `--message` 参数，可重复调用 |
| **OpenCLI** | ❌ 不适合 | 本身就是非交互工具，无需守护进程 |

### 17.16 混合架构策略

VectaHub 支持两种执行模式，根据场景自动选择：

| 模式 | 适用场景 | 优点 | 缺点 |
|------|---------|------|------|
| **Headless** | 单次调用、不同 AI 工具 | 实现简单、资源占用低 | 重复启动开销、上下文丢失 |
| **Daemon** | 多次调用、相同 AI 工具 | 会话复用、上下文保持 | 资源占用高、实现复杂 |
| **Auto** | 智能切换 | 兼顾性能和资源 | 需要策略配置 |

#### 自动切换策略

```yaml
# ~/.vectahub/config.yaml
ai_execution:
  mode: auto
  
  # 使用守护进程的条件
  use_daemon_when:
    min_steps: 2                    # 至少 2 个 AI 步骤
    max_time_between_steps: 300000  # 步骤间最大间隔 5 分钟
    same_adapter: true              # 相同 AI 适配器
  
  # 使用 Headless 的条件
  use_headless_when:
    max_steps: 1                    # 只有 1 个 AI 步骤
    different_adapters: true        # 不同 AI 适配器
```

---

## 18. 功能清单

### 18.1 AI CLI 工具支持

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **AIAdapter 接口** | 统一 AI CLI 工具调用接口 | 🔲 待实现 | P0 |
| **Gemini 适配器** | Gemini CLI Headless 支持 | 🔲 待实现 | P1 |
| **Claude 适配器** | Claude Code Headless 支持 | 🔲 待实现 | P1 |
| **Codex 适配器** | Codex CLI Headless 支持 | 🔲 待实现 | P1 |
| **Aider 适配器** | Aider Headless 支持 | 🔲 待实现 | P1 |
| **OpenCLI 适配器** | OpenCLI 委派支持 | 🔲 待实现 | P1 |
| **AI 工具自动发现** | 扫描并注册已安装的 AI CLI | 🔲 待实现 | P1 |
| **会话管理** | AI 工具会话复用 | 🔲 待实现 | P1 |
| **上下文传递** | 步骤间上下文传递 | 🔲 待实现 | P1 |
| **沙盒兼容处理** | 自动处理沙盒兼容性 | 🔲 待实现 | P1 |
| **重试机制** | 委派失败自动重试 | 🔲 待实现 | P2 |
| **守护进程支持** | 持久化运行 AI 工具 | 🔲 待实现 | P1 |
| **任务队列** | 守护进程任务调度 | 🔲 待实现 | P1 |
| **健康检查** | AI 会话健康监控 | 🔲 待实现 | P1 |
| **自动启动/停止** | 守护进程生命周期管理 | 🔲 待实现 | P2 |
| **混合架构策略** | Headless/Daemon/Auto 模式 | 🔲 待实现 | P1 |

### 18.2 高级功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **多 AI 并行执行** | 同时委派给多个 AI | 🔲 待实现 | P2 |
| **执行结果智能合并** | 合并多个 AI 的输出 | 🔲 待实现 | P2 |
| **AI 自动编排** | 用 LLM 决定委派给哪个工具 | 🔲 待实现 | P2 |
| **工具市场** | 社区 AI 适配器 | 🔲 待实现 | P3 |

---
version: 2.1.0
lastUpdated: 2026-05-01
relatedTo:
  - 01_system_architecture.md
  - 02_sandbox_design.md
  - 03_ai_cli_framework_design.md
  - 06_workflow_engine_design.md
```
