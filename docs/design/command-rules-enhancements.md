# Command Rules 增强功能设计

> Document Status: Current Implementation / Architecture Design
> Authority: Command Rules 模块的增强功能设计文档，包括 Schema 验证、Happy Path 测试覆盖和 JSDoc 文档完善。

## 概述

Command Rules 模块是 VectaHub 的命令安全控制子系统，负责通过黑白名单机制对用户命令进行安全评估。模块由 loader（规则加载）、engine（规则引擎）、matcher（模式匹配）三层组成，支持全局和项目两级规则作用域。

当前模块已具备基本功能，但在以下三个方面存在改进空间：

1. **Schema 验证**：`isCommandRuleSet` 类型守卫仅做基础结构检查，缺少详细错误信息、模式语法校验、规则 ID 唯一性校验等能力。
2. **Happy Path 测试**：现有测试集中在错误路径，缺少对 `loadGlobalBlocklist`、`loadProjectAllowlist` 等公共 API 的成功加载场景覆盖。
3. **JSDoc 文档**：函数级文档注释较为简略，缺少 `@param`、`@returns`、`@throws`、`@example` 等结构化标签。

## 增强功能

### 1. Schema 验证增强

**文件**: `src/command-rules/loader.ts`

当前 `isCommandRuleSet` 类型守卫仅检查字段存在性和类型，不返回具体错误原因。增强方案引入结构化验证结果和更细粒度的校验规则。

#### 验证结果接口

```typescript
interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

interface CommandRuleValidationOptions {
  validatePatternSyntax?: boolean;   // 是否校验模式转正则后的语法，默认 true
  validateUniqueIds?: boolean;       // 是否校验规则 ID 唯一性，默认 true
  validateVersionFormat?: boolean;   // 是否校验 semver 格式，默认 false
}
```

#### 验证规则

| 校验项 | 当前状态 | 增强目标 |
|--------|----------|----------|
| 顶层对象非空 | ✅ 已实现 | 保持不变 |
| `version` 为 string | ✅ 已实现 | 增加可选 semver 格式校验 |
| `description` 为 string | ✅ 已实现 | 保持不变 |
| `rules` 为数组 | ✅ 已实现 | 保持不变 |
| 每条规则含 `id` | ✅ 已实现 | 保持不变 |
| 每条规则含 `pattern` | ✅ 已实现 | 保持不变 |
| `action` 为 `block` 或 `allow` | ✅ 已实现 | 保持不变 |
| `pattern` 转正则后语法合法 | ❌ 未实现 | 新增 |
| `id` 在同一规则集内唯一 | ❌ 未实现 | 新增 |
| `version` 符合 semver | ❌ 未实现 | 新增（可选） |

#### 使用示例

```typescript
import { validateRuleSet } from './loader.js';

const result = validateRuleSet(parsedJson, {
  validatePatternSyntax: true,
  validateUniqueIds: true,
});

if (!result.valid) {
  console.error('规则集校验失败:');
  for (const err of result.errors) {
    console.error(`  - ${err}`);
  }
}
```

#### 实现细节

- `isCommandRuleSet` 保留为快速布尔守卫，用于内部热路径
- 新增 `validateRuleSet` 函数返回结构化错误列表，用于配置加载和用户提示
- 模式语法校验复用 [matcher.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/src/command-rules/matcher.ts) 中 `matchPattern` 的正则转换逻辑，对每个 pattern 预编译一次 `RegExp` 并捕获 `SyntaxError`
- 规则 ID 唯一性通过 `Set<string>` 在单次遍历中完成
- 验证失败不中断加载流程（由调用方决定是否 throw），但 `loadRuleSet` 在验证失败时记录 warning 日志并继续加载有效规则

### 2. Happy Path 测试覆盖

**文件**: `src/command-rules/loader.test.ts`

现有测试仅有 1 个成功加载用例，覆盖的是 `loadRuleSet` 的基础场景。增强方案补充所有公共 API 的成功路径测试和边界场景。

#### 当前测试覆盖

| 测试文件 | 用例数 | Happy Path | Error Path |
|----------|--------|------------|------------|
| `loader.test.ts` | 5 | 1 | 4 |
| `engine.test.ts` | 15 | 15 | 0 |
| `matcher.test.ts` | 8 | 8 | 0 |

#### 新增测试用例

```typescript
// loader.test.ts 新增用例

describe('loadRuleSet happy paths', () => {
  it('returns empty rules array when file contains valid rule set with no rules', () => {
    const ruleSet = { version: '1.0', description: 'empty', rules: [] };
    const filePath = join(tempDir, 'empty.json');
    writeFileSync(filePath, JSON.stringify(ruleSet), 'utf-8');

    const result = loadRuleSet(filePath, deps);

    expect(result).toEqual([]);
  });

  it('loads single rule correctly', () => {
    const ruleSet = {
      version: '1.0',
      description: 'single',
      rules: [{ id: 'only', pattern: 'ls', action: 'allow' }],
    };
    const filePath = join(tempDir, 'single.json');
    writeFileSync(filePath, JSON.stringify(ruleSet), 'utf-8');

    const result = loadRuleSet(filePath, deps);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('only');
  });

  it('preserves optional fields (reason, description, examples)', () => {
    const ruleSet = {
      version: '1.0',
      description: 'full',
      rules: [
        {
          id: 'full-rule',
          pattern: 'git *',
          action: 'allow',
          description: 'Git commands',
          reason: 'safe',
          examples: ['git status', 'git log'],
        },
      ],
    };
    const filePath = join(tempDir, 'full.json');
    writeFileSync(filePath, JSON.stringify(ruleSet), 'utf-8');

    const result = loadRuleSet(filePath, deps);

    expect(result[0].reason).toBe('safe');
    expect(result[0].description).toBe('Git commands');
    expect(result[0].examples).toEqual(['git status', 'git log']);
  });
});

describe('loadGlobalBlocklist / loadGlobalAllowlist', () => {
  it('loadGlobalBlocklist returns rules from blocklist.json', () => {
    const configDir = join(tempDir, 'config');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'blocklist.json'),
      JSON.stringify({
        version: '1.0',
        description: 'global blocklist',
        rules: [{ id: 'g-bl', pattern: 'rm *', action: 'block' }],
      }),
      'utf-8',
    );

    const result = loadGlobalBlocklist({
      logger: deps.logger,
      getGlobalConfigPath: () => configDir,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('g-bl');
  });

  it('loadGlobalAllowlist returns rules from allowlist.json', () => {
    const configDir = join(tempDir, 'config');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'allowlist.json'),
      JSON.stringify({
        version: '1.0',
        description: 'global allowlist',
        rules: [{ id: 'g-wl', pattern: 'ls', action: 'allow' }],
      }),
      'utf-8',
    );

    const result = loadGlobalAllowlist({
      logger: deps.logger,
      getGlobalConfigPath: () => configDir,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('g-wl');
  });
});

describe('loadProjectBlocklist / loadProjectAllowlist', () => {
  it('loadProjectBlocklist returns rules from project .vectahub dir', () => {
    const projectPath = join(tempDir, 'project');
    const rulesDir = join(projectPath, '.vectahub', 'command-rules');
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(
      join(rulesDir, 'blocklist.json'),
      JSON.stringify({
        version: '1.0',
        description: 'project blocklist',
        rules: [{ id: 'p-bl', pattern: 'git push --force *', action: 'block' }],
      }),
      'utf-8',
    );

    const result = loadProjectBlocklist(projectPath, deps);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p-bl');
  });

  it('loadProjectAllowlist returns empty when projectPath is undefined', () => {
    const result = loadProjectAllowlist(undefined, deps);

    expect(result).toEqual([]);
  });
});

describe('ensureConfigDir', () => {
  it('returns the config path from deps', () => {
    const expected = '/home/user/.config/vectahub';

    const result = ensureConfigDir({ getGlobalConfigPath: () => expected });

    expect(result).toBe(expected);
  });
});
```

#### 实现细节

- 使用临时目录（`mkdtempSync`）隔离文件系统依赖，与现有测试模式一致
- Happy path 测试覆盖：空规则集、单规则、完整可选字段、全局加载、项目加载、undefined projectPath 边界
- 每个公共导出函数至少 1 个 happy path 用例
- 目标：loader.test.ts 从 5 个用例增长到 12+ 个用例

### 3. JSDoc 文档完善

**文件**: `src/command-rules/loader.ts`、`src/command-rules/types.ts`、`src/command-rules/engine.ts`

当前函数级文档为单行 `/** ... */` 注释，缺少结构化标签。增强方案为所有公共 API 补充完整的 JSDoc 标签。

#### 当前文档状态

| 文件 | 公共 API 数 | 有 JSDoc | 有 @param | 有 @returns | 有 @throws |
|------|-------------|----------|-----------|-------------|------------|
| `loader.ts` | 6 | 6 | 0 | 0 | 0 |
| `types.ts` | 6 | 0 | N/A | N/A | N/A |
| `engine.ts` | 7 | 7 | 0 | 0 | 0 |
| `matcher.ts` | 2 | 2 | 0 | 0 | 0 |

#### 增强示例：loader.ts

```typescript
/**
 * 从 JSON 文件加载命令规则集。
 *
 * 读取指定路径的 JSON 文件，验证其结构是否符合 {@link CommandRuleSet} 规范，
 * 并返回解析后的规则数组。当文件不存在时返回空数组（不视为错误）。
 *
 * @param filePath - JSON 规则文件的绝对路径
 * @param deps - 依赖注入对象，至少包含 logger
 * @returns 解析后的 {@link CommandRule} 数组；文件不存在时为空数组
 * @throws {Error} 当文件内容不是合法 JSON 时
 * @throws {Error} 当 JSON 结构不符合 CommandRuleSet 规范时
 *
 * @example
 * ```typescript
 * const rules = loadRuleSet('/path/to/rules.json', { logger: console });
 * console.log(`加载了 ${rules.length} 条规则`);
 * ```
 */
export function loadRuleSet(
  filePath: string,
  deps: Pick<CommandRuleLoaderDeps, 'logger'>,
): CommandRule[] {
  // ...
}
```

#### 增强示例：types.ts

```typescript
/**
 * 单条命令规则定义。
 *
 * 每条规则通过 `pattern` 匹配命令，通过 `action` 决定放行或拦截。
 * `reason` 和 `description` 用于安全审计和用户提示。
 */
export interface CommandRule {
  /** 规则唯一标识符，在同一规则集内不可重复 */
  id: string;
  /** 命令匹配模式，支持精确匹配和 `*` 通配符 */
  pattern: string;
  /** 匹配后的动作：`block` 拦截，`allow` 放行 */
  action: 'block' | 'allow';
  /** 拦截原因，当 action 为 block 时建议必填 */
  reason?: string;
  /** 规则描述，用于白名单场景说明用途 */
  description?: string;
  /** 命令示例列表，用于文档和测试 */
  examples?: string[];
}
```

#### 增强示例：engine.ts

```typescript
/**
 * 命令规则引擎，对命令进行黑白名单安全评估。
 *
 * 按以下优先级顺序评估规则：
 * 1. 项目黑名单（最高优先级）
 * 2. 全局黑名单
 * 3. 项目白名单
 * 4. 全局白名单
 * 5. 默认策略（兜底）
 *
 * 黑名单优先于白名单：当同一命令同时命中黑白名单时，黑名单生效。
 */
export class CommandRuleEngine {
  /**
   * 评估命令并返回安全决策。
   *
   * @param fullCommand - 待评估的完整命令字符串
   * @returns {@link CommandRuleResult} 包含决策结果、匹配规则和提示信息
   *
   * @example
   * ```typescript
   * const engine = createCommandRuleEngine(config);
   * const result = engine.evaluate('sudo rm -rf /');
   * if (result.decision === 'block') {
   *   console.error(result.message);
   * }
   * ```
   */
  evaluate(fullCommand: string): CommandRuleResult {
    // ...
  }
}
```

#### 实现细节

- 所有公共函数和类方法补充 `@param`、`@returns`、`@throws` 标签
- 接口的每个字段补充行内 `/** ... */` 注释
- 包含至少一个 `@example` 代码块用于关键 API
- 使用 `{@link Type}` 语法交叉引用类型定义
- JSDoc 使用中文描述（与用户面向文档一致），代码标识符保持英文

## 架构图

```mermaid
graph TD
    A[Command Rules 模块] --> B[Schema 验证增强]
    A --> C[Happy Path 测试覆盖]
    A --> D[JSDoc 文档完善]

    B --> B1[isCommandRuleSet 快速守卫]
    B --> B2[validateRuleSet 结构化验证]
    B --> B3[模式语法预编译校验]
    B --> B4[规则 ID 唯一性校验]

    C --> C1[loadRuleSet 空规则集]
    C --> C2[loadRuleSet 单规则]
    C --> C3[loadGlobalBlocklist 加载]
    C --> C4[loadProjectAllowlist undefined 边界]
    C --> C5[ensureConfigDir 路径返回]

    D --> D1[loader.ts 函数级 JSDoc]
    D --> D2[types.ts 接口字段注释]
    D --> D3[engine.ts 类和方法文档]
    D --> D4[matcher.ts 模式匹配文档]

    B2 --> E[SchemaValidationResult]
    E --> E1[valid: boolean]
    E --> E2[errors: string[]]

    B3 --> F[复用 matchPattern 正则转换]
    B4 --> G[Set 去重检测]
```

## 性能影响

### Schema 验证增强

- **优点**: 提前发现配置错误，返回可操作的错误信息，降低运行时失败率
- **缺点**: 验证逻辑增加少量 CPU 开销（正则预编译、Set 遍历）
- **建议**: `isCommandRuleSet` 保持为轻量守卫用于热路径；`validateRuleSet` 仅在配置加载时调用，不影响命令评估性能

### Happy Path 测试覆盖

- **优点**: 提高回归安全性，减少重构风险，文档化预期行为
- **缺点**: 测试运行时间略有增加（预估 +200ms）
- **建议**: 使用临时目录隔离文件系统，避免测试间干扰

### JSDoc 文档完善

- **优点**: 提升 IDE 体验（悬浮提示、自动补全），降低新贡献者上手成本
- **缺点**: 源文件体积增加约 15-20%
- **建议**: 保持描述与实现同步更新，避免文档漂移

## 测试覆盖

所有增强功能都有对应的测试覆盖计划：

| 测试文件 | 当前用例数 | 新增用例数 | 增强后总数 |
|----------|-----------|-----------|-----------|
| `loader.test.ts` | 5 | 7 | 12 |
| `loader.test.ts`（Schema 验证） | 0 | 4 | 4 |
| `engine.test.ts` | 15 | 0 | 15 |
| `matcher.test.ts` | 8 | 0 | 8 |

**新增测试用例明细**：

- `loader.test.ts` Happy Path: 7 个用例（空规则集、单规则、完整可选字段、全局 blocklist 加载、全局 allowlist 加载、项目 blocklist 加载、项目 allowlist undefined 边界、ensureConfigDir）
- `loader.test.ts` Schema 验证: 4 个用例（模式语法非法、ID 重复、version 格式、结构化错误返回）

**总计**: 从 28 个用例增长到 39 个用例，覆盖率目标 loader 模块 >=70%

## 最佳实践

### 1. Schema 验证

```typescript
// ✅ 推荐：加载时使用结构化验证，获取详细错误信息
const result = validateRuleSet(parsedData, { validatePatternSyntax: true });
if (!result.valid) {
  logger.warn({ errors: result.errors }, '规则集校验失败，部分规则未加载');
}

// ❌ 避免：仅依赖类型守卫，丢失错误上下文
if (!isCommandRuleSet(data)) {
  throw new Error('Invalid'); // 无法定位具体问题
}
```

### 2. Happy Path 测试

```typescript
// ✅ 推荐：每个公共 API 至少一个 happy path 用例
it('loadGlobalBlocklist returns rules from blocklist.json', () => {
  // arrange: 创建临时配置目录和规则文件
  // act: 调用 loadGlobalBlocklist
  // assert: 验证返回的规则与文件内容一致
});

// ❌ 避免：只测试错误路径，忽略成功场景
it('throws when file is malformed', () => { /* ... */ });
// 缺少: it('loads valid rules correctly', () => { /* ... */ });
```

### 3. JSDoc 文档

```typescript
// ✅ 推荐：完整的 JSDoc 标签 + 中文描述 + @example
/**
 * 从 JSON 文件加载命令规则集。
 *
 * @param filePath - JSON 规则文件的绝对路径
 * @param deps - 依赖注入对象
 * @returns 解析后的规则数组；文件不存在时为空数组
 * @throws {Error} 当文件内容不是合法 JSON 时
 *
 * @example
 * ```typescript
 * const rules = loadRuleSet('/path/to/rules.json', { logger: console });
 * ```
 */
export function loadRuleSet(filePath: string, deps: Pick<CommandRuleLoaderDeps, 'logger'>): CommandRule[] { ... }

// ❌ 避免：单行注释缺少结构化信息
/** Load a command rule set from a JSON file. */
export function loadRuleSet(filePath: string, deps: Pick<CommandRuleLoaderDeps, 'logger'>): CommandRule[] { ... }
```

### 4. 类型守卫与验证函数分离

```typescript
// ✅ 推荐：类型守卫用于类型收窄，验证函数用于错误报告
if (isCommandRuleSet(data)) {
  return data.rules; // 快速路径，类型安全
}

const validation = validateRuleSet(data);
// 使用 validation.errors 报告问题

// ❌ 避免：在类型守卫中执行重量级验证逻辑
function isCommandRuleSet(data: unknown): data is CommandRuleSet {
  // 正则预编译、Set 去重等不应放在这里
}
```

## 相关文档

- [Agent Runtime 增强功能设计](./agent-runtime-enhancements.md)
- [Agent CLI 注册与 Runtime 架构设计](./agent-cli-runtime-architecture.md)
- [Agent 操作规范](../agent-operating-guide.md)
