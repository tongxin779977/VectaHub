# AI CLI 环境发现与智能降级架构设计

> 本文档定义 VectaHub 如何自动检测用户环境中已安装的 AI CLI 工具，并在工具不可用时智能降级到内置 CLI 的完整架构。

---

## 1. 设计目标

1. **环境感知**: VectaHub 启动时自动扫描用户环境，发现可用的 AI CLI 工具
2. **智能降级**: 当用户指定的 AI 工具不可用时，自动选择最佳替代方案
3. **透明切换**: 用户无感知，降级策略自动执行并记录日志
4. **可扩展**: 支持动态添加新的 AI CLI 工具检测规则
5. **状态追踪**: 维护 AI 工具可用性清单，支持运行时更新

---

## 2. 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                    VectaHub 启动                                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              EnvironmentDetector (环境检测器)                     │
│  • 扫描 PATH: gemini, claude, codex, aider, opencli             │
│  • 测试可用性: --version / --help                               │
│  • 检查配置: API Key, 版本要求, 权限                             │
│  • 输出: ProviderStatus[]                                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              ProviderRegistry (提供者注册表)                      │
│  • 构建可用工具清单                                               │
│  • 分配优先级: 用户安装 > 内置 CLI > 降级方案                    │
│  • 维护兼容性矩阵                                                 │
│  • 输出: ProviderConfig[]                                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              FallbackStrategy (降级策略)                          │
│  • 用户指定 gemini → 检查可用性                                   │
│    ├── ✅ 可用 → 直接执行                                        │
│    ├── ❌ 未安装 → 降级到 claude (如果可用)                       │
│    ├── ❌ 无 API Key → 降级到内置模型                            │
│    └── ❌ 版本过低 → 提示升级或使用内置 CLI                      │
│  • 用户未指定 → 使用优先级最高的可用工具                          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              AIDelegateExecutor (委派执行器)                      │
│  • 执行实际 AI 任务                                               │
│  • 处理执行失败重试                                               │
│  • 返回结果或触发降级                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心类型定义

### 3.1 提供者状态

```typescript
// src/workflow/ai-env-detector.ts

export type ProviderStatus = 
  | 'available'      // 可用（已安装且配置正确）
  | 'installed'      // 已安装但缺少配置
  | 'not_found'      // 未安装
  | 'version_mismatch'  // 版本不匹配
  | 'permission_denied';  // 权限不足

export interface ProviderConfig {
  name: string;                // gemini, claude, codex, aider, opencli
  cliCommand: string;          // gemini, claude, codex, aider, opencli
  versionCommand: string;      // --version
  requiredEnvVars?: string[];  // 必需的环境变量
  minVersion?: string;         // 最低版本要求
  status: ProviderStatus;
  version?: string;            // 当前版本
  missingRequirements?: string[];  // 缺失的要求列表
  priority: number;            // 优先级 (0-100, 越高越优先)
  fallbackTargets?: string[];  // 降级目标列表
}

export interface EnvironmentReport {
  scannedAt: Date;
  providers: ProviderConfig[];
  totalAvailable: number;
  recommendedProvider: string;
  warnings: string[];
}
```

### 3.2 降级规则

```typescript
export interface FallbackRule {
  primary: string;              // 主提供者
  condition: FallbackCondition;  // 触发条件
  fallbacks: string[];          // 降级目标列表（按优先级排序）
  action: 'switch' | 'warn' | 'block';
}

export type FallbackCondition =
  | 'not_installed'             // 未安装
  | 'missing_api_key'           // 缺少 API Key
  | 'version_too_old'           // 版本过低
  | 'execution_failed'          // 执行失败
  | 'timeout'                   // 超时
  | 'permission_denied';        // 权限不足
```

---

## 4. EnvironmentDetector (环境检测器)

### 4.1 检测流程

```
VectaHub 启动
    │
    ▼
扫描 PATH 中的 AI CLI 命令
    ├── 使用 which/gemini/where 查找可执行文件
    ├── 测试执行: gemini --version
    ├── 检查环境变量: GEMINI_API_KEY
    ├── 验证版本: semver 比较
    │
    ▼
构建 ProviderConfig[]
    │
    ├── gemini:     ✅ available  (v2.5.1, API Key: ✅)
    ├── claude:     ❌ not_found
    ├── codex:      ⚠️ installed (v1.0.0, API Key: ❌)
    ├── aider:      ✅ available  (v0.52.0)
    └── opencli:    ❌ not_found
    │
    ▼
输出 EnvironmentReport
    ├── totalAvailable: 2
    ├── recommendedProvider: gemini
    └── warnings: ["codex 缺少 ANTHROPIC_API_KEY"]
```

### 4.2 实现代码

```typescript
// src/workflow/ai-env-detector.ts

import { spawn } from 'child_process';
import { which } from 'which';

export class EnvironmentDetector {
  private providers: Map<string, ProviderConfig>;

  constructor() {
    this.providers = new Map([
      ['gemini', {
        name: 'gemini',
        cliCommand: 'gemini',
        versionCommand: '--version',
        requiredEnvVars: ['GEMINI_API_KEY'],
        minVersion: '2.5.0',
        status: 'not_found',
        priority: 90,
        fallbackTargets: ['claude', 'codex', 'built-in'],
      }],
      ['claude', {
        name: 'claude',
        cliCommand: 'claude',
        versionCommand: '--version',
        requiredEnvVars: ['ANTHROPIC_API_KEY'],
        minVersion: '1.0.33',
        status: 'not_found',
        priority: 85,
        fallbackTargets: ['gemini', 'codex', 'built-in'],
      }],
      ['codex', {
        name: 'codex',
        cliCommand: 'codex',
        versionCommand: '--version',
        requiredEnvVars: ['OPENAI_API_KEY'],
        minVersion: '1.0.0',
        status: 'not_found',
        priority: 80,
        fallbackTargets: ['gemini', 'claude', 'built-in'],
      }],
      ['aider', {
        name: 'aider',
        cliCommand: 'aider',
        versionCommand: '--version',
        requiredEnvVars: [],
        minVersion: '0.50.0',
        status: 'not_found',
        priority: 75,
        fallbackTargets: ['gemini', 'claude', 'built-in'],
      }],
      ['opencli', {
        name: 'opencli',
        cliCommand: 'opencli',
        versionCommand: '--version',
        requiredEnvVars: [],
        minVersion: '1.0.0',
        status: 'not_found',
        priority: 70,
        fallbackTargets: ['gemini', 'claude', 'built-in'],
      }],
    ]);
  }

  async scan(): Promise<EnvironmentReport> {
    const warnings: string[] = [];
    const providers: ProviderConfig[] = [];

    for (const [name, config] of this.providers) {
      const providerStatus = await this.detectProvider(config);
      providers.push(providerStatus);

      if (providerStatus.status !== 'available' && providerStatus.missingRequirements) {
        warnings.push(
          `${name}: ${providerStatus.missingRequirements.join(', ')}`
        );
      }
    }

    const availableProviders = providers.filter(p => p.status === 'available');
    const recommended = availableProviders.length > 0
      ? availableProviders.reduce((a, b) => a.priority > b.priority ? a : b).name
      : 'built-in';

    return {
      scannedAt: new Date(),
      providers,
      totalAvailable: availableProviders.length,
      recommendedProvider: recommended,
      warnings,
    };
  }

  private async detectProvider(config: ProviderConfig): Promise<ProviderConfig> {
    const result = { ...config };

    // 1. 检查命令是否存在
    try {
      await which(config.cliCommand);
    } catch {
      result.status = 'not_found';
      result.missingRequirements = [`${config.cliCommand} not found in PATH`];
      return result;
    }

    // 2. 获取版本
    try {
      const version = await this.getVersion(config.cliCommand, config.versionCommand);
      result.version = version;

      if (config.minVersion && this.isVersionOlder(version, config.minVersion)) {
        result.status = 'version_mismatch';
        result.missingRequirements = [
          `version ${version} < ${config.minVersion}`
        ];
        return result;
      }
    } catch {
      result.status = 'not_found';
      result.missingRequirements = ['Failed to get version'];
      return result;
    }

    // 3. 检查环境变量
    const missingEnvVars: string[] = [];
    for (const envVar of config.requiredEnvVars || []) {
      if (!process.env[envVar]) {
        missingEnvVars.push(`Missing ${envVar}`);
      }
    }

    if (missingEnvVars.length > 0) {
      result.status = 'installed';
      result.missingRequirements = missingEnvVars;
      return result;
    }

    // 4. 所有检查通过
    result.status = 'available';
    return result;
  }

  private getVersion(cli: string, versionFlag: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cli, [versionFlag], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => stdout += data.toString());
      proc.stderr?.on('data', (data) => stderr += data.toString());

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim().split('\n')[0]);
        } else {
          reject(new Error(`Exit code ${code}: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  private isVersionOlder(current: string, required: string): boolean {
    // 简单的 semver 比较实现
    const parse = (v: string) => v.replace(/[^0-9.]/g, '').split('.').map(Number);
    const cur = parse(current);
    const req = parse(required);

    for (let i = 0; i < 3; i++) {
      if ((cur[i] || 0) < (req[i] || 0)) return true;
      if ((cur[i] || 0) > (req[i] || 0)) return false;
    }
    return false;
  }
}
```

---

## 5. ProviderRegistry (提供者注册表)

### 5.1 注册表职责

```
┌─────────────────────────────────────────────────────────────────┐
│                    ProviderRegistry                              │
│                                                                   │
│  输入: EnvironmentReport                                          │
│                                                                   │
│  • 构建可用工具优先级列表                                          │
│  • 记录不可用工具的原因                                           │
│  • 生成降级路径图                                                 │
│  • 提供快速查询接口                                               │
│                                                                   │
│  输出: ProviderConfig[] (按优先级排序)                            │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 实现代码

```typescript
// src/workflow/ai-provider-registry.ts

export class ProviderRegistry {
  private providers: ProviderConfig[] = [];
  private fallbackGraph: Map<string, string[]> = new Map();

  constructor(environmentReport: EnvironmentReport) {
    this.providers = environmentReport.providers;
    this.buildFallbackGraph();
  }

  getAvailableProviders(): ProviderConfig[] {
    return this.providers
      .filter(p => p.status === 'available')
      .sort((a, b) => b.priority - a.priority);
  }

  getProvider(name: string): ProviderConfig | undefined {
    return this.providers.find(p => p.name === name);
  }

  getFallbackTargets(provider: string): string[] {
    return this.fallbackGraph.get(provider) || ['built-in'];
  }

  getRecommendedProvider(): string {
    const available = this.getAvailableProviders();
    return available.length > 0 ? available[0].name : 'built-in';
  }

  canUseProvider(name: string): boolean {
    const provider = this.getProvider(name);
    return provider?.status === 'available';
  }

  private buildFallbackGraph(): void {
    for (const provider of this.providers) {
      const fallbacks = provider.fallbackTargets?.filter(target =>
        this.providers.some(p => p.name === target && p.status === 'available')
      ) || [];

      this.fallbackGraph.set(provider.name, [...fallbacks, 'built-in']);
    }
  }

  printStatus(): void {
    console.log('\n🤖 AI CLI Environment Status:');
    console.log('─'.repeat(50));

    for (const provider of this.providers.sort((a, b) => b.priority - a.priority)) {
      const icon = provider.status === 'available' ? '✅' :
                   provider.status === 'installed' ? '⚠️' : '❌';
      const version = provider.version ? ` v${provider.version}` : '';
      const missing = provider.missingRequirements?.join(', ') || '';

      console.log(`${icon} ${provider.name}${version} [${provider.status}]`);
      if (missing) {
        console.log(`   → Missing: ${missing}`);
      }
    }

    console.log('─'.repeat(50));
    console.log(`Recommended: ${this.getRecommendedProvider()}\n`);
  }
}
```

---

## 6. FallbackStrategy (智能降级策略)

### 6.1 降级决策流程

```
用户请求: "用 gemini 审查代码"
    │
    ▼
检查 gemini 可用性
    │
    ├── ✅ available → 直接执行
    │
    ├── ❌ not_installed
    │   ├── 查找降级目标: [claude, codex, built-in]
    │   ├── claude 可用? → ✅ 是 → 使用 claude 执行
    │   ├── codex 可用?  → ✅ 是 → 使用 codex 执行
    │   └── 都不行 → 使用内置 CLI
    │
    ├── ⚠️ installed (缺少 API Key)
    │   ├── 提示用户设置环境变量
    │   ├── 等待用户输入
    │   └── 超时 → 降级到下一个可用工具
    │
    └── ⚠️ version_mismatch
        ├── 提示升级
        └── 降级到兼容版本的工具
```

### 6.2 降级规则配置

```yaml
# ~/.vectahub/ai-config.yaml

fallback_rules:
  - primary: gemini
    fallbacks: [claude, codex, built-in]
    conditions:
      not_installed: auto_switch
      missing_api_key: prompt_then_switch
      version_too_old: auto_switch

  - primary: claude
    fallbacks: [gemini, codex, built-in]
    conditions:
      not_installed: auto_switch
      missing_api_key: prompt_then_switch
      execution_failed: retry_then_switch

  - primary: codex
    fallbacks: [gemini, claude, built-in]
    conditions:
      not_installed: auto_switch
      missing_api_key: auto_switch

  - primary: built-in
    fallbacks: []
    conditions:
      always: use_directly

user_preferences:
  auto_fallback: true           # 自动降级
  prompt_before_switch: false   # 降级前是否提示
  max_fallback_attempts: 3      # 最大降级次数
  timeout_ms: 30000             # 降级决策超时时间
```

### 6.3 实现代码

```typescript
// src/workflow/ai-fallback-strategy.ts

export class FallbackStrategy {
  private registry: ProviderRegistry;
  private config: FallbackConfig;

  constructor(registry: ProviderRegistry, config?: Partial<FallbackConfig>) {
    this.registry = registry;
    this.config = {
      autoFallback: true,
      promptBeforeSwitch: false,
      maxFallbackAttempts: 3,
      timeoutMs: 30000,
      ...config,
    };
  }

  async resolveProvider(requested: string | null): Promise<string> {
    // 如果未指定，返回推荐提供者
    if (!requested) {
      return this.registry.getRecommendedProvider();
    }

    // 检查请求的提供者是否可用
    if (this.registry.canUseProvider(requested)) {
      return requested;
    }

    // 不可用，尝试降级
    if (!this.config.autoFallback) {
      throw new Error(
        `Provider "${requested}" is not available. ` +
        `Set auto_fallback: true in config to enable automatic fallback.`
      );
    }

    return this.findFallbackTarget(requested, 0);
  }

  private async findFallbackTarget(primary: string, attempts: number): Promise<string> {
    if (attempts >= this.config.maxFallbackAttempts) {
      throw new Error(
        `All fallback attempts exhausted for "${primary}". ` +
        `Please install an AI CLI tool manually.`
      );
    }

    const fallbackTargets = this.registry.getFallbackTargets(primary);

    for (const target of fallbackTargets) {
      if (target === 'built-in') {
        return 'built-in';
      }

      if (this.registry.canUseProvider(target)) {
        if (this.config.promptBeforeSwitch) {
          const confirmed = await this.promptUser(
            `"${primary}" is not available. Switch to "${target}"?`
          );
          if (!confirmed) {
            continue;
          }
        }

        console.log(
          `⚠️  "${primary}" not available, falling back to "${target}"`
        );
        return target;
      }
    }

    throw new Error(`No fallback target available for "${primary}"`);
  }

  private async promptUser(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('Timeout, auto-switching...');
        resolve(true);
      }, this.config.timeoutMs);

      process.stdout.write(`${message} [Y/n] `);
      process.stdin.once('data', (data) => {
        clearTimeout(timeout);
        const answer = data.toString().trim().toLowerCase();
        resolve(answer === '' || answer === 'y' || answer === 'yes');
      });
    });
  }
}

interface FallbackConfig {
  autoFallback: boolean;
  promptBeforeSwitch: boolean;
  maxFallbackAttempts: number;
  timeoutMs: number;
}
```

---

## 7. 与现有模块集成

### 7.1 初始化流程

```typescript
// src/index.ts

import { EnvironmentDetector } from './workflow/ai-env-detector.js';
import { ProviderRegistry } from './workflow/ai-provider-registry.js';
import { FallbackStrategy } from './workflow/ai-fallback-strategy.js';

async function initialize(): Promise<void> {
  // 1. 环境检测
  const detector = new EnvironmentDetector();
  const envReport = await detector.scan();

  // 2. 构建注册表
  const registry = new ProviderRegistry(envReport);

  // 3. 创建降级策略
  const fallback = new FallbackStrategy(registry);

  // 4. 打印环境状态（首次启动时）
  if (process.argv.includes('--verbose')) {
    registry.printStatus();
  }

  // 5. 存储到全局上下文
  globalThis.vectahubContext = {
    registry,
    fallback,
    envReport,
  };
}
```

### 7.2 执行流程集成

```typescript
// src/workflow/executor.ts (修改现有文件)

import { globalThis.vectahubContext } from '../index.js';

export class Executor {
  async executeDelegate(step: Step, options: ExecutorOptions): Promise<StepResult> {
    const { fallback } = vectahubContext;

    // 解析目标提供者（含降级逻辑）
    const targetProvider = await fallback.resolveProvider(
      step.delegate_to || null
    );

    // 执行委派
    return this.executeWithProvider(targetProvider, step, options);
  }
}
```

---

## 8. 降级场景示例

### 8.1 场景 1: 用户先安装 Gemini CLI

```
环境检测结果:
  ✅ gemini     v2.5.1  [available]
  ❌ claude     [not_found]
  ❌ codex      [not_found]
  ✅ aider      v0.52.0 [available]

用户请求: "用 gemini 审查代码"
→ ✅ 使用 gemini 执行

用户请求: "用 claude 修复问题"
→ ⚠️  "claude" not available, falling back to "gemini"
→ ✅ 使用 gemini 执行

用户请求: "用 codex 写测试"
→ ⚠️  "codex" not available, falling back to "gemini"
→ ✅ 使用 gemini 执行
```

### 8.2 场景 2: 用户无任何 AI CLI

```
环境检测结果:
  ❌ gemini     [not_found]
  ❌ claude     [not_found]
  ❌ codex      [not_found]
  ❌ aider      [not_found]
  ❌ opencli    [not_found]

用户请求: "用 gemini 审查代码"
→ ⚠️  "gemini" not available, falling back to "built-in"
→ ✅ 使用内置 AI CLI 执行

提示: 安装 Gemini CLI 以获得更好的体验:
  npm install -g @google/gemini-cli
```

### 8.3 场景 3: 部分工具缺少 API Key

```
环境检测结果:
  ✅ gemini     v2.5.1  [available]
  ⚠️ claude     v1.0.35 [installed] → Missing ANTHROPIC_API_KEY
  ✅ codex      v1.0.0  [available]

用户请求: "用 claude 修复问题"
→ ⚠️  "claude" not available, falling back to "gemini"
→ ✅ 使用 gemini 执行

提示: 设置 ANTHROPIC_API_KEY 以启用 Claude:
  export ANTHROPIC_API_KEY=sk-ant-xxx
```

### 8.4 场景 4: 工具版本过低

```
环境检测结果:
  ⚠️ gemini     v2.3.0  [version_mismatch] → version 2.3.0 < 2.5.0
  ✅ claude     v1.0.35 [available]
  ✅ codex      v1.0.0  [available]

用户请求: "用 gemini 审查代码"
→ ⚠️  "gemini" version too old, falling back to "claude"
→ ✅ 使用 claude 执行

提示: 升级 Gemini CLI:
  npm update -g @google/gemini-cli
```

---

## 9. 降级决策树

```
用户请求 AI 执行
    │
    ▼
是否指定了提供者?
    ├── 否 → 使用推荐提供者 (优先级最高且 available)
    │
    └── 是 → 检查可用性
         │
         ├── available → 直接执行
         │
         ├── not_found → 降级路径: fallback_targets[0] → [1] → [2] → built-in
         │
         ├── installed (缺配置) → 提示用户设置 → 超时 → 降级
         │
         └── version_mismatch → 提示升级 → 降级
```

---

## 10. 配置文件格式

### 10.1 用户级配置

```yaml
# ~/.vectahub/ai-config.yaml

# 环境扫描
environment_scan:
  enabled: true                    # 启动时扫描环境
  show_report: false               # 是否打印检测报告
  scan_interval_ms: 86400000       # 重新扫描间隔 (24 小时)

# 降级策略
fallback:
  auto_fallback: true              # 自动降级
  prompt_before_switch: false      # 降级前提示
  max_attempts: 3                  # 最大降级次数
  timeout_ms: 30000                # 提示超时时间

# 提供者优先级（用户可自定义）
provider_priority:
  - name: gemini
    enabled: true
    priority: 90

  - name: claude
    enabled: true
    priority: 85

  - name: codex
    enabled: true
    priority: 80

  - name: aider
    enabled: true
    priority: 75

  - name: opencli
    enabled: true
    priority: 70

# 内置 AI CLI (兜底方案)
built_in_ai:
  enabled: true                    # 启用内置 AI
  model: "vectahub-ai-v1"         # 内置模型名称
  max_tokens: 4096                 # 最大 token 数
```

---

## 11. 日志与监控

### 11.1 日志输出格式

```
[2026-05-02 10:00:00] 🤖 Scanning AI CLI environment...
[2026-05-02 10:00:01] ✅ gemini v2.5.1 (PATH: /usr/local/bin/gemini)
[2026-05-02 10:00:01] ❌ claude (not found)
[2026-05-02 10:00:02] ✅ codex v1.0.0 (PATH: /usr/local/bin/codex)
[2026-05-02 10:00:02] ⚠️  aider v0.48.0 (version < 0.50.0)
[2026-05-02 10:00:02] 📊 2/5 providers available
[2026-05-02 10:00:02] 🎯 Recommended: gemini

[2026-05-02 10:05:00] 📝 User requested: "用 claude 修复问题"
[2026-05-02 10:05:00] ⚠️  "claude" not available, falling back to "gemini"
[2026-05-02 10:05:00] 🚀 Executing with gemini...
[2026-05-02 10:05:05] ✅ Task completed (4.2s)
```

### 11.2 错误处理

```typescript
// 降级失败时的错误消息
interface FallbackError {
  code: string;
  message: string;
  originalProvider: string;
  attemptedFallbacks: string[];
  suggestion: string;
}

// 示例
{
  code: 'FALLBACK_EXHAUSTED',
  message: 'All fallback attempts exhausted for "claude"',
  originalProvider: 'claude',
  attemptedFallbacks: ['gemini', 'codex', 'built-in'],
  suggestion: 'Please install an AI CLI tool: npm install -g @google/gemini-cli'
}
```

---

## 12. 与守护进程集成

### 12.1 守护进程启动时的环境检测

```typescript
// src/daemon/index.ts

class AIDaemon {
  async start(): Promise<void> {
    // 1. 环境检测
    const detector = new EnvironmentDetector();
    const envReport = await detector.scan();

    // 2. 构建注册表
    this.registry = new ProviderRegistry(envReport);

    // 3. 打印可用 AI 工具
    console.log(`🤖 AI Daemon starting with ${envReport.totalAvailable} available providers`);
    for (const provider of this.registry.getAvailableProviders()) {
      console.log(`  ✅ ${provider.name} v${provider.version}`);
    }

    // 4. 启动守护进程
    // ...
  }

  // 运行时动态检测新安装的工具
  async rescan(): Promise<void> {
    console.log('🔄 Rescanning AI CLI environment...');
    const detector = new EnvironmentDetector();
    const envReport = await detector.scan();
    this.registry = new ProviderRegistry(envReport);
    console.log(`✅ Rescan complete: ${envReport.totalAvailable} providers available`);
  }
}
```

### 12.2 CLI 命令

```bash
# 查看当前环境状态
vectahub ai status

# 重新扫描环境
vectahub ai rescan

# 查看可用提供者列表
vectahub ai list

# 测试特定提供者
vectahub ai test gemini

# 手动设置降级策略
vectahub ai config fallback.auto_fallback true
```

---

## 13. 测试用例

### 13.1 环境检测测试

```typescript
// src/workflow/ai-env-detector.test.ts

describe('EnvironmentDetector', () => {
  it('should detect available providers', async () => {
    const detector = new EnvironmentDetector();
    const report = await detector.scan();

    expect(report.totalAvailable).toBeGreaterThan(0);
    expect(report.providers.some(p => p.status === 'available')).toBe(true);
  });

  it('should report missing env vars', async () => {
    delete process.env.GEMINI_API_KEY;

    const detector = new EnvironmentDetector();
    const report = await detector.scan();

    const gemini = report.providers.find(p => p.name === 'gemini');
    expect(gemini?.status).toBe('installed');
    expect(gemini?.missingRequirements).toContain('Missing GEMINI_API_KEY');
  });

  it('should detect version mismatch', async () => {
    // Mock old version
    mockSpawn('gemini', '--version', '2.3.0');

    const detector = new EnvironmentDetector();
    const report = await detector.scan();

    const gemini = report.providers.find(p => p.name === 'gemini');
    expect(gemini?.status).toBe('version_mismatch');
  });
});
```

### 13.2 降级策略测试

```typescript
// src/workflow/ai-fallback-strategy.test.ts

describe('FallbackStrategy', () => {
  it('should use available provider', async () => {
    const strategy = new FallbackStrategy(mockRegistry(['gemini', 'codex']));

    const target = await strategy.resolveProvider('gemini');
    expect(target).toBe('gemini');
  });

  it('should fallback to next available', async () => {
    const strategy = new FallbackStrategy(mockRegistry(['codex']));

    const target = await strategy.resolveProvider('gemini');
    expect(target).toBe('codex');
  });

  it('should fallback to built-in when nothing available', async () => {
    const strategy = new FallbackStrategy(mockRegistry([]));

    const target = await strategy.resolveProvider('gemini');
    expect(target).toBe('built-in');
  });

  it('should throw when auto_fallback is disabled', async () => {
    const strategy = new FallbackStrategy(mockRegistry(['codex']), {
      autoFallback: false,
    });

    await expect(strategy.resolveProvider('gemini')).rejects.toThrow();
  });
});
```

---

## 14. 扩展指南

### 14.1 添加新的 AI CLI 工具

```typescript
// 在 EnvironmentDetector 的 providers Map 中添加新条目

this.providers.set('new-ai', {
  name: 'new-ai',
  cliCommand: 'new-ai',
  versionCommand: '--version',
  requiredEnvVars: ['NEW_AI_API_KEY'],
  minVersion: '1.0.0',
  status: 'not_found',
  priority: 85,
  fallbackTargets: ['gemini', 'claude', 'built-in'],
});
```

### 14.2 自定义检测逻辑

```typescript
// 如果某工具需要特殊检测，可以覆盖 detectProvider 方法

class CustomEnvironmentDetector extends EnvironmentDetector {
  async detectProvider(config: ProviderConfig): Promise<ProviderConfig> {
    if (config.name === 'new-ai') {
      // 自定义检测逻辑
      return this.customDetect(config);
    }
    return super.detectProvider(config);
  }
}
```

---

## 15. 性能优化

### 15.1 缓存策略

```typescript
// 环境检测结果缓存

class EnvironmentDetector {
  private cache: EnvironmentReport | null = null;
  private cacheExpiry: Date | null = null;

  async scan(force: boolean = false): Promise<EnvironmentReport> {
    if (!force && this.cache && this.cacheExpiry && new Date() < this.cacheExpiry) {
      return this.cache;
    }

    const report = await this.performScan();
    this.cache = report;
    this.cacheExpiry = new Date(Date.now() + 86400000); // 24 小时
    return report;
  }
}
```

### 15.2 并行检测

```typescript
// 使用 Promise.all 并行检测所有提供者

async scan(): Promise<EnvironmentReport> {
  const providerChecks = Array.from(this.providers.values()).map(
    config => this.detectProvider(config)
  );

  const providers = await Promise.all(providerChecks);
  // ...
}
```

---

## 16. 安全注意事项

1. **环境变量检查**: 不暴露 API Key 的实际值，只检查是否存在
2. **PATH 安全**: 只检测标准 PATH 路径下的可执行文件
3. **版本信息**: 只读取版本号，不执行其他操作
4. **用户权限**: 检测过程不需要 sudo 权限
5. **日志脱敏**: 日志中不记录敏感信息

---

## 17. 功能清单

### 17.1 核心功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **环境扫描** | 启动时检测 AI CLI 工具 | 🔲 待实现 | P0 |
| **可用性检测** | 版本/配置/权限检查 | 🔲 待实现 | P0 |
| **智能降级** | 自动选择最佳替代方案 | 🔲 待实现 | P0 |
| **降级提示** | 用户友好的降级通知 | 🔲 待实现 | P0 |
| **注册表查询** | 快速查询工具状态 | 🔲 待实现 | P0 |

### 17.2 高级功能

| 功能 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| **动态重扫描** | 运行时重新检测环境 | 🔲 待实现 | P1 |
| **用户偏好** | 自定义优先级配置 | 🔲 待实现 | P1 |
| **降级提示** | 引导用户安装缺失工具 | 🔲 待实现 | P1 |
| **缓存优化** | 检测结果缓存 | 🔲 待实现 | P2 |
| **并行检测** | 并行检测所有工具 | 🔲 待实现 | P2 |

### 17.3 CLI 命令

| 命令 | 描述 | 状态 | 优先级 |
|------|------|------|--------|
| `vectahub ai status` | 查看环境状态 | 🔲 待实现 | P1 |
| `vectahub ai rescan` | 重新扫描环境 | 🔲 待实现 | P1 |
| `vectahub ai list` | 列出可用提供者 | 🔲 待实现 | P1 |
| `vectahub ai test` | 测试特定提供者 | 🔲 待实现 | P2 |

---

## 18. 模块归属

| 模块 | 负责 Agent | 说明 |
|------|-----------|------|
| **EnvironmentDetector** | Agent D (Executor) | 环境检测逻辑 |
| **ProviderRegistry** | Agent D (Executor) | 提供者注册表 |
| **FallbackStrategy** | Agent D (Executor) | 降级策略引擎 |
| **CLI 命令** | Agent A (CLI) | ai status/rescan/list 命令 |
| **配置管理** | Agent G (Utils) | ai-config.yaml 解析 |
| **日志输出** | Agent G (Utils) | 降级日志格式化 |

---

```yaml
version: 1.0.0
lastUpdated: 2026-05-02
status: design_complete
relatedDocuments:
  - 03_ai_cli_framework_design.md
  - 06_workflow_engine_design.md
  - 07_module_design.md
  - 09_cli_tools_integration.md
```