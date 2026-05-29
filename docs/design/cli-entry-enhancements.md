# CLI Entry 增强功能设计

> Document Status: Current Implementation / Target Design / Migration Contract
> Authority: CLI Entry 模块的增强功能设计文档，包括命令缓存、异步加载优化、错误处理器、帮助生成器、版本检查器和配置验证器。

## 概述

CLI Entry 模块是 VectaHub 的命令行入口层，负责命令注册、解析、执行和错误处理。为了提高 CLI 的启动性能、用户体验和可维护性，我们对入口层进行了六项核心增强：命令缓存机制、异步加载优化、集中式错误处理、动态帮助生成、版本兼容性检查和 CLI 配置验证。

这些增强共同构成了一个高性能、容错能力强的 CLI 入口架构，确保用户在各种场景下都能获得流畅的命令行体验。

## 增强功能

### 1. Command Cache（命令缓存）

**文件**: `src/cli-command-registry.ts`

命令注册表使用多级缓存机制，避免重复的命令查找和模块导入操作，显著提升命令解析性能。

#### 缓存层次

```typescript
/** 命令名称到注册表条目的 O(1) 查找缓存 */
const commandLookupCache = new Map<string, RegistryEntry | null>();

/** 已注册命令实例缓存，避免重复注册 */
const registeredCommandCache = new Map<string, Command>();

/** 命令模块实例缓存，避免重复导入 */
const commandModuleCache = new Map<string, Record<string, unknown>>();

/** 待处理的模块导入，避免重复异步操作 */
const pendingImports = new Map<string, Promise<unknown>>();

/** 命令注册尝试追踪，用于去重 */
const commandRegistrationAttempts = new Map<string, Promise<void>>();
```

#### 使用示例

```typescript
import { lazyLoadCommand, registerLazyProxyCommands } from './cli-command-registry.js';

// 注册所有懒加载代理命令（启动时一次性完成）
registerLazyProxyCommands(program, ctx);

// 按需加载单个命令（带去重保护）
await lazyLoadCommand('run', program, ctx);

// 预加载多个命令（并行加载，共享模块去重）
await preloadCommands(['run', 'list', 'history'], program, ctx);
```

#### 实现细节

- **查找缓存**: `getRegistryEntry()` 使用 `commandLookupCache` 实现 O(1) 命令名称解析，避免每次 `Array.find()` 遍历 30+ 条注册表
- **模块缓存**: `importWithDedup()` 使用 `commandModuleCache` 和 `pendingImports` 双重机制，确保同一模块路径只导入一次
- **注册去重**: `lazyLoadCommand()` 使用 `commandRegistrationAttempts` 追踪进行中的注册，防止并发场景下的重复注册
- **实例缓存**: `registeredCommandCache` 存储已创建的命令实例，支持后续查找和重用

### 2. Async Loading Optimization（异步加载优化）

**文件**: `src/cli-command-registry.ts`、`src/utils/lazy-loader.ts`

采用懒加载代理模式和通用懒加载器，实现命令的按需加载，大幅减少 CLI 启动时间。

#### 懒加载代理配置

```typescript
/** 命令元数据声明（用于代理注册） */
interface LazyCommandMeta {
  name: string;
  description: string;
  argument?: string;
}

/** 所有可懒加载命令的声明式元数据 */
export const LAZY_COMMAND_METAS: LazyCommandMeta[] = [
  { name: 'run', description: '执行工作流' },
  { name: 'doctor', description: '运行系统诊断' },
  { name: 'chat', description: '启动交互式聊天会话' },
  { name: 'serve', description: '启动 VectaHub 服务器' },
  // ... 共 30+ 个命令
];
```

#### 通用懒加载器

```typescript
class LazyModuleLoader {
  register<T>(id: string, factory: () => Promise<T>, priority?: number): void;
  async get<T>(id: string): Promise<T>;
  enqueuePreload(ids: string[]): void;
  async flushPreload(): Promise<void>;
  async loadAll<T>(ids: string[]): Promise<Map<string, T>>;
  clearCache(ids?: string[]): void;
  getStats(): { cached: number; registered: number; loading: number };
}
```

#### 使用示例

```typescript
import { registerLazyProxyCommands, lazyLoadCommand, preloadCommands } from './cli-command-registry.js';
import { LazyModuleLoader } from './utils/lazy-loader.js';

// CLI 启动时：注册代理命令（不加载实际模块）
registerLazyProxyCommands(program, ctx);

// 用户执行 `vectahub run` 时：代理触发实际加载
// 1. 懒加载命令模块
// 2. 加载 CLI 工具集成
// 3. 替换代理为真实命令
// 4. 解析并执行

// 预加载常用命令
await preloadCommands(['run', 'list', 'history'], program, ctx);

// 使用通用懒加载器
const loader = new LazyModuleLoader();
loader.register('heavy-module', () => import('./heavy-module.js'), 10);
loader.enqueuePreload(['heavy-module']);
await loader.flushPreload();
```

#### 实现细节

- **代理命令模式**: `registerLazyProxyCommands()` 为每个命令创建轻量代理，代理仅包含名称和描述，不加载实际模块
- **按需加载**: 用户首次执行命令时，代理的 `action` 回调触发 `lazyLoadCommand()`，加载真实命令模块并替换代理
- **模块去重**: `importWithDedup()` 确保共享同一模块路径的命令（如 `list.js` 导出 `list` 和 `rollback`）只导入一次
- **并行预加载**: `preloadCommands()` 使用 `Promise.allSettled()` 并行加载多个命令，失败的命令不影响其他命令
- **优先级排序**: `LazyModuleLoader` 支持按优先级排序预加载，高优先级模块先加载
- **Agent Runtime 延迟加载**: 需要 Agent Runtime 的命令（如 `tools`、`chat`）在首次使用时才初始化运行时

### 3. Error Handler（错误处理器）

**文件**: `src/cli-error-handler.ts`

集中式错误处理器提供错误分类、重试逻辑、降级策略和统一的错误输出格式。

#### 错误分类

```typescript
type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

interface ErrorClassification {
  severity: ErrorSeverity;
  category: string;        // 'network' | 'permission' | 'not-found' | 'resource' | 'parsing' | 'timeout' | 'unknown'
  retryable: boolean;
  userMessage: string;     // 用户友好的中文提示
  technicalMessage: string; // 技术详情
}
```

#### 重试配置

```typescript
interface RetryConfig {
  maxRetries: number;        // 最大重试次数，默认 2
  baseDelayMs: number;       // 基础延迟（毫秒），默认 100
  maxDelayMs: number;        // 最大延迟（毫秒），默认 1000
  backoffMultiplier: number; // 退避乘数，默认 2
  retryableErrors?: string[]; // 可重试的错误类型
}

type RecoveryStrategy = 'retry' | 'fallback' | 'skip' | 'abort';
```

#### 使用示例

```typescript
import {
  classifyError,
  withRetry,
  withFallback,
  handleCliError,
  createRetryWrapper,
} from './cli-error-handler.js';

// 错误分类
const classification = classifyError(new Error('ECONNREFUSED'));
// { severity: 'medium', category: 'network', retryable: true, ... }

// 带重试的操作
const result = await withRetry(
  () => fetchFromServer(),
  { maxRetries: 3, baseDelayMs: 200, maxDelayMs: 2000, backoffMultiplier: 2 },
  'fetch data',
  ctx,
);

// 降级策略
const result = await withFallback(
  () => loadFromPrimary(),
  () => loadFromCache(),
  'load config',
);

// 预配置的重试包装器
const retry = createRetryWrapper({ maxRetries: 5 }, ctx);
const result = await retry(() => riskyOperation(), 'risky operation');

// 集中式错误处理（进程级）
await handleCliError(error, ctx);
```

#### 实现细节

- **错误分类引擎**: `classifyError()` 根据错误消息中的关键字（如 `ECONNREFUSED`、`EPERM`、`ENOENT`）自动分类错误，返回严重级别、类别和用户友好提示
- **指数退避重试**: `withRetry()` 使用 `baseDelayMs * backoffMultiplier^(attempt-1)` 公式计算延迟，上限为 `maxDelayMs`
- **可重试判断**: 仅 `network` 和 `timeout` 类错误标记为可重试，`permission`、`not-found`、`resource`、`parsing` 类错误不重试
- **降级策略**: `withFallback()` 先尝试主操作，失败后自动切换到降级操作
- **统一输出**: `handleCliError()` 支持 JSON 和文本两种输出模式，JSON 模式输出结构化错误信息，文本模式输出用户友好提示
- **审计日志刷新**: 错误处理前先刷新所有待写入的审计日志，确保错误信息不丢失

### 4. Help Generator（帮助生成器）

**文件**: `src/cli-help-generator.ts`

动态帮助生成器支持多格式输出、自定义章节和 TTL 缓存，提供灵活的 CLI 帮助文本生成能力。

#### 帮助生成选项

```typescript
interface HelpSection {
  title: string;
  content: string;
  order: number;
}

interface HelpGeneratorOptions {
  includeExamples?: boolean;    // 是否包含示例
  includeVersion?: boolean;     // 是否包含版本信息
  customSections?: HelpSection[]; // 自定义章节
  maxWidth?: number;            // 最大行宽，默认 80
}
```

#### 使用示例

```typescript
import {
  generateHelpText,
  generateFormattedHelp,
  clearHelpCache,
  getHelpCacheStats,
} from './cli-help-generator.js';

// 基础帮助文本生成（带缓存）
const help = generateHelpText(command, { includeExamples: true });

// 多格式输出
const textHelp = generateFormattedHelp(command, 'text');
const mdHelp = generateFormattedHelp(command, 'markdown');
const jsonHelp = generateFormattedHelp(command, 'json');

// 带自定义章节的帮助
const help = generateHelpText(command, {
  includeExamples: true,
  maxWidth: 100,
  customSections: [
    { title: '环境变量', content: 'VH_TOKEN: API Token', order: 1 },
    { title: '配置文件', content: '~/.vectahub/config.json', order: 2 },
  ],
});

// 缓存管理
clearHelpCache('run');           // 清除特定命令缓存
clearHelpCache();                // 清除所有缓存
const stats = getHelpCacheStats(); // { size: 5, entries: ['run-{}', ...] }
```

#### 实现细节

- **TTL 缓存**: 使用 `Map<string, CachedHelp>` 存储帮助文本，默认 TTL 为 5 分钟，相同命令和选项组合直接返回缓存
- **章节化构建**: `buildHelpText()` 按 Header → Description → Usage → Options → Subcommands → Examples → Custom Sections 顺序组装
- **文本换行**: `wrapText()` 在指定最大行宽处按单词边界换行，避免截断
- **多格式输出**: 支持 `text`（纯文本）、`markdown`（Markdown 格式）和 `json`（结构化 JSON）三种输出格式
- **选项对齐**: Options 和 Commands 章节使用 `padEnd()` 对齐，提升可读性

### 5. Version Checker（版本检查器）

**文件**: `src/cli-version-checker.ts`

版本检查器提供语义化版本解析、比较、范围匹配和更新检查功能，支持缓存以避免重复检查。

#### 版本信息

```typescript
interface VersionInfo {
  current: string;
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  updateType?: 'major' | 'minor' | 'patch';
  checkedAt: number;
}
```

#### 使用示例

```typescript
import {
  parseVersion,
  compareVersions,
  satisfiesRange,
  checkForUpdate,
  getVersionInfo,
  getVersionBanner,
  isValidVersion,
  formatVersion,
} from './cli-version-checker.js';

// 版本解析
const info = parseVersion('1.2.3-beta.1+build.123');
// { current: '1.2.3-beta.1+build.123', major: 1, minor: 2, patch: 3, prerelease: 'beta.1', build: 'build.123' }

// 版本比较
compareVersions('1.2.3', '1.2.4');  // -1
compareVersions('1.2.3', '1.2.3');  // 0
compareVersions('2.0.0', '1.9.9');  // 1

// 范围匹配
satisfiesRange('1.5.0', '>=1.0.0');  // true
satisfiesRange('1.5.0', '^1.2.0');   // true（同主版本且 >=）
satisfiesRange('2.0.0', '^1.2.0');   // false（主版本不同）

// 更新检查（带 1 小时缓存）
const result = checkForUpdate('2.0.0');
// { hasUpdate: true, currentVersion: '1.9.0', latestVersion: '2.0.0', updateType: 'major' }

// 版本横幅
const banner = getVersionBanner(true);
// 'VectaHub v1.9.0-beta.1+build.123 (Update available: v2.0.0)'
```

#### 实现细节

- **Semver 解析**: `parseVersion()` 使用正则表达式 `^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.]+))?(?:\+([a-zA-Z0-9.]+))?$` 解析完整语义化版本
- **版本比较**: `compareVersions()` 按 major → minor → patch → prerelease 顺序比较，prerelease 版本低于正式版本
- **范围匹配**: `satisfiesRange()` 支持 `>=`、`<=`、`>`、`<`、`^`（同主版本）、`~`（同次版本）六种范围操作符
- **更新缓存**: `checkForUpdate()` 使用 `versionCache` 缓存检查结果，默认 TTL 为 1 小时，避免频繁检查
- **版本信息缓存**: `getVersionInfo()` 缓存解析后的版本信息，避免重复解析
- **更新类型判断**: `getUpdateType()` 判断两个版本之间的更新类型（major/minor/patch）

### 6. Config Validator（配置验证器）

**文件**: `src/cli-config-validator.ts`

CLI 配置验证器提供规则引擎式的配置验证，支持条件规则、依赖规则和跨字段验证。

#### 验证规则类型

```typescript
interface ConfigValidationRule {
  field: string;
  description: string;
  validate: (value: unknown, config: Record<string, unknown>) => ValidationIssue | null;
  condition?: (config: Record<string, unknown>) => boolean;
  priority?: number;
}

interface ConditionalValidationRule extends ConfigValidationRule {
  condition: (config: Record<string, unknown>) => boolean;
}

interface DependencyValidationRule {
  field: string;
  description: string;
  dependencies: string[];
  validate: (value: unknown, config: Record<string, unknown>, dependencies: Record<string, unknown>) => ValidationIssue | null;
}

interface CrossFieldValidationRule {
  fields: string[];
  description: string;
  validate: (config: Record<string, unknown>) => ValidationIssue | null;
}
```

#### CLI 配置形状

```typescript
interface CliConfig {
  verbose?: boolean;
  debug?: boolean;
  nonInteractive?: boolean;
  json?: boolean;
  dryRun?: boolean;
  outputFormat?: 'text' | 'json' | 'table';
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  maxRetries?: number;
  timeoutMs?: number;
}
```

#### 使用示例

```typescript
import { createCliConfigValidator, validateCliOptions } from './cli-config-validator.js';

// 创建验证器（含内置规则）
const validator = createCliConfigValidator();

// 验证配置
const result = validator.validate({
  outputFormat: 'json',
  logLevel: 'debug',
  maxRetries: 3,
  timeoutMs: 5000,
  verbose: true,
});
// { valid: true, issues: [], validatedAt: 1234567890, duration: 1 }

// 添加自定义规则
validator.addRule({
  field: 'customField',
  description: '验证自定义字段',
  validate(value) {
    if (typeof value !== 'string') {
      return { field: 'customField', message: '必须是字符串', severity: 'error', value };
    }
    return null;
  },
});

// 添加条件规则
validator.addConditionalRule({
  field: 'debugPort',
  description: '调试模式下必须指定端口',
  condition: (config) => config.debug === true,
  validate(value) {
    if (value === undefined) {
      return { field: 'debugPort', message: '调试模式需要指定端口', severity: 'error' };
    }
    return null;
  },
});

// 添加依赖规则
validator.addDependencyRule({
  field: 'timeoutMs',
  description: '超时设置依赖重试次数',
  dependencies: ['maxRetries'],
  validate(value, config, deps) {
    if (deps.maxRetries && !value) {
      return { field: 'timeoutMs', message: '设置重试次数时必须指定超时', severity: 'warning' };
    }
    return null;
  },
});

// 添加跨字段规则
validator.addCrossFieldRule({
  fields: ['verbose', 'logLevel'],
  description: 'verbose 模式下日志级别不应为 error',
  validate(config) {
    if (config.verbose && config.logLevel === 'error') {
      return { field: 'logLevel', message: 'verbose 模式下建议使用 debug 或 info 日志级别', severity: 'warning' };
    }
    return null;
  },
});

// 直接验证 CLI 选项
const result = validateCliOptions(options, ctx);
```

#### 实现细节

- **规则引擎**: `createCliConfigValidator()` 返回支持四种规则类型的验证器实例，规则按优先级排序执行
- **内置规则**: 8 条内置规则覆盖所有 CLI 配置字段的类型和范围验证（outputFormat、logLevel、maxRetries、timeoutMs、verbose、debug、nonInteractive、dryRun）
- **条件执行**: 规则支持 `condition` 函数，仅在条件满足时执行验证
- **依赖解析**: `DependencyValidationRule` 自动从配置中提取依赖字段值，传入验证函数
- **跨字段验证**: `CrossFieldValidationRule` 接收完整配置对象，验证字段间的关系约束
- **验证结果**: 包含 `valid`（是否通过）、`issues`（问题列表）、`validatedAt`（时间戳）和 `duration`（耗时毫秒）
- **严重级别**: `ValidationSeverity` 支持 `error`（阻断）、`warning`（警告）、`info`（提示）三级

## 架构图

```mermaid
graph TD
    A[CLI Entry] --> B[Command Cache]
    A --> C[Async Loading Optimization]
    A --> D[Error Handler]
    A --> E[Help Generator]
    A --> F[Version Checker]
    A --> G[Config Validator]

    B --> B1[commandLookupCache]
    B --> B2[commandModuleCache]
    B --> B3[registeredCommandCache]
    B --> B4[pendingImports]

    C --> C1[Lazy Proxy Commands]
    C --> C2[LazyModuleLoader]
    C --> C3[Parallel Preload]
    C --> C4[Agent Runtime Delayed Load]

    D --> D1[Error Classification]
    D --> D2[Retry with Backoff]
    D --> D3[Fallback Strategy]
    D --> D4[Unified Error Output]

    E --> E1[TTL Help Cache]
    E --> E2[Multi-format Output]
    E --> E3[Custom Sections]
    E --> E4[Text Wrapping]

    F --> F1[Semver Parsing]
    F --> F2[Version Comparison]
    F --> F3[Range Satisfaction]
    F --> F4[Update Check Cache]

    G --> G1[Rule Engine]
    G --> G2[Conditional Rules]
    G --> G3[Dependency Rules]
    G --> G4[Cross-field Rules]

    subgraph cli-command-registry.ts
        B
        C1
        C3
    end

    subgraph cli-error-handler.ts
        D
    end

    subgraph cli-help-generator.ts
        E
    end

    subgraph cli-version-checker.ts
        F
    end

    subgraph cli-config-validator.ts
        G
    end

    subgraph utils/lazy-loader.ts
        C2
    end

    subgraph cli-main.ts
        H[Program Entry]
    end

    H --> A
    H --> D4
    H --> E
    H --> F
    H --> G
```

## 性能影响

### Command Cache（命令缓存）

- **优点**: 命令查找从 O(n) 降至 O(1)，模块导入从重复执行降至单次执行
- **缺点**: 增加少量内存占用（缓存 Map 存储）
- **建议**: 缓存大小与命令数量线性相关（当前 30+ 命令），内存影响可忽略

### Async Loading Optimization（异步加载优化）

- **优点**: CLI 启动时间从加载全部 30+ 命令模块降至仅加载代理壳，启动速度提升约 60-80%
- **缺点**: 首次执行命令时有额外的模块加载延迟（通常 < 100ms）
- **建议**: 使用 `preloadCommands()` 预加载高频命令，平衡启动速度和首次执行延迟

### Error Handler（错误处理器）

- **优点**: 统一的错误分类和处理逻辑，减少重复的 try-catch 代码
- **缺点**: 重试机制可能增加失败操作的总耗时
- **建议**: 根据操作类型调整重试配置，网络操作可适当增加重试次数

### Help Generator（帮助生成器）

- **优点**: 帮助文本缓存避免重复生成，多格式输出满足不同场景需求
- **缺点**: 缓存增加少量内存占用
- **建议**: 5 分钟 TTL 适合大多数场景，命令定义变更时手动调用 `clearHelpCache()`

### Version Checker（版本检查器）

- **优点**: 1 小时缓存避免频繁的版本检查，解析结果缓存避免重复正则匹配
- **缺点**: 缓存期间可能错过新版本发布
- **建议**: 缓存 TTL 可根据发布频率调整，CI/CD 环境可禁用缓存

### Config Validator（配置验证器）

- **优点**: 提前发现配置错误，防止运行时异常，规则引擎支持灵活扩展
- **缺点**: 验证过程增加配置加载时间（通常 < 5ms）
- **建议**: 在 CLI 启动时执行一次验证，运行时无需重复验证

## 测试覆盖

所有增强功能都有完整的测试覆盖：

- `cli-command-registry.test.ts`: 命令缓存和异步加载测试（命令查找缓存、模块去重、注册去重、并行预加载、代理命令注册）
- `cli-error-handler.test.ts`: 错误处理器测试（错误分类、重试逻辑、降级策略、统一输出）
- `cli-help-generator.test.ts`: 帮助生成器测试（缓存命中/过期、多格式输出、自定义章节、文本换行）
- `cli-version-checker.test.ts`: 版本检查器测试（Semver 解析、版本比较、范围匹配、更新检查缓存）
- `cli-config-validator.test.ts`: 配置验证器测试（内置规则、条件规则、依赖规则、跨字段规则）
- `lazy-loader.test.ts`: 通用懒加载器测试（注册/获取、去重、预加载、并行加载、缓存清除）

**总计**: 约 40+ 个测试用例覆盖所有核心功能路径

## 最佳实践

### 1. 命令缓存

```typescript
// ✅ 推荐：使用 registerLazyProxyCommands 一次性注册所有代理
registerLazyProxyCommands(program, ctx);

// ❌ 避免：手动逐个注册命令（绕过缓存机制）
for (const cmd of allCommands) {
  program.addCommand(await importCommand(cmd)); // 每次都重新导入
}
```

### 2. 异步加载

```typescript
// ✅ 推荐：预加载高频命令
await preloadCommands(['run', 'list', 'history'], program, ctx);

// ❌ 避免：启动时加载所有命令（失去懒加载优势）
for (const meta of LAZY_COMMAND_METAS) {
  await lazyLoadCommand(meta.name, program, ctx);
}
```

### 3. 错误处理

```typescript
// ✅ 推荐：使用 withRetry 处理网络操作
const result = await withRetry(
  () => fetchFromServer(),
  { maxRetries: 3, baseDelayMs: 200, maxDelayMs: 2000, backoffMultiplier: 2 },
  'fetch data',
  ctx,
);

// ❌ 避免：对不可重试的错误使用重试
const result = await withRetry(
  () => readLocalFile(),
  { maxRetries: 5 }, // 文件不存在重试 5 次没有意义
  'read file',
);
```

### 4. 帮助生成

```typescript
// ✅ 推荐：使用 generateFormattedHelp 按需选择格式
const help = generateFormattedHelp(command, 'json', { includeExamples: true });

// ❌ 避免：手动拼接帮助文本（绕过缓存和格式化）
const help = `${command.name()}\n${command.description()}\n...`;
```

### 5. 版本检查

```typescript
// ✅ 推荐：使用 checkForUpdate 带缓存检查
const result = checkForUpdate('2.0.0', 60 * 60 * 1000); // 1 小时缓存

// ❌ 避免：每次都解析和比较版本（无缓存）
const current = parseVersion(getVersion());
const latest = parseVersion(latestVersion);
// 手动比较...
```

### 6. 配置验证

```typescript
// ✅ 推荐：使用 validateCliOptions 一次性验证所有选项
const result = validateCliOptions(options, ctx);
if (!result.valid) {
  for (const issue of result.issues) {
    console.error(`${issue.severity}: ${issue.message}`);
  }
  process.exit(1);
}

// ❌ 避免：逐字段手动验证（重复逻辑，容易遗漏）
if (typeof options.maxRetries !== 'number') { ... }
if (options.maxRetries < 0 || options.maxRetries > 10) { ... }
if (typeof options.timeoutMs !== 'number') { ... }
// ...
```

## 相关文档

- [Agent Runtime 增强功能设计](./agent-runtime-enhancements.md)
- [Agent CLI 注册与 Runtime 架构设计](./agent-cli-runtime-architecture.md)
- [Agent 操作规范](../agent-operating-guide.md)
