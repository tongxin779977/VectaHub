# Agent Runtime 健康度评估报告

## 基本信息

| 项目 | 值 |
|------|-----|
| 模块名称 | Agent Runtime |
| 目录路径 | `src/agent-runtime/` |
| 入口文件 | `index.ts` |
| 源文件数量 | 6 |
| 测试文件数量 | 0 |
| 总代码行数 | 728 |
| 评估日期 | 2026-05-27 |
| 评估人 | Architecture Agent |

## 总分与等级

| 指标 | 值 |
|------|-----|
| 总分 | 60/100 |
| 等级 | 🟠 D |
| 含义 | 较差，存在显著架构债务和质量缺陷，测试完全缺失是主要扣分项 |

## 维度评分明细

### 第一组：架构设计 (9/15)

| 维度 | 得分 | 扣分原因 |
|------|------|----------|
| D01 - 模块职责单一性 | 3/5 | `provider-registrar.ts` 共 313 行，超过 300 行阈值（-0.5）；该文件混合了 `GenericAdapter` 类（L29-L76，适配器渲染逻辑）、`ProviderRegistrar` 类（L78-L260，注册/注销/测试/刷新）、`loadProvidersFromConfig` 独立函数（L262-L300，配置加载）三种职责（-1）；`GenericAdapter` 应拆分为独立文件 |
| D02 - 依赖方向合理性 | 3/5 | `llm-inferencer.ts` 直接依赖 `nl/llm.ts`（L3），agent-runtime 作为运行时层反向依赖 nl 层（-0.5）；`provider-registrar.ts` 直接依赖 `setup/first-run-wizard-bridge.js`（L13），运行时层依赖设置层（-0.5）；虽使用 Deps 接口进行依赖注入缓解耦合，但默认实现仍直接耦合具体模块（-0.5）；无循环依赖 |
| D03 - 抽象层次一致性 | 3/5 | `interfaces.ts` 定义了 `IAgentAdapter` 和 `IAgentRegistry`（L9-L40），但实际实现使用 `types/agent.ts` 中的 `AgentAdapter` 和 `AgentRegistry`，接口文件成为孤立抽象（-1）；`provider-registrar.ts` 中 `persistProvider`（L212-L245）直接操作 `config.ai_providers` 原始对象结构，与高层注册逻辑混杂（-1） |

### 第二组：类型安全 (11/15)

| 维度 | 得分 | 扣分原因 |
|------|------|----------|
| D04 - 类型完整性 | 2/5 | 无 `any` 类型，无 `@ts-ignore`/`@ts-expect-error`；但 `provider-registrar.ts` L89 存在 `loadConfig() as unknown as Record<string, unknown>` 双重类型断言，实质等同于绕过类型检查（-1）；L90 存在 `config as unknown as import('../setup/first-run-wizard.js').VectaHubConfig` 双重断言（-1）；L264 存在 `loadConfig() as unknown as Record<string, unknown>` 再次出现（-0.5）；`llm-inferencer.ts` L139 `JSON.parse(jsonMatch[0]) as LlmInferenceResult` 未做运行时验证即断言（-0.5）；`loadProvidersFromConfig` 中 L273-L291 大量 `as string`、`as string[]`、`as 'arg' | 'stdin' | 'file' | 'positional'` 类型断言共 10 处（-0.5） |
| D05 - 类型导出规范 | 5/5 | 无 default export；无 `export let`；使用 named exports 一致；使用 `import type` 进行类型导入（registry.ts L1, cli-detector.ts L2, llm-inferencer.ts L1-L2, provider-registrar.ts L1-L9） |
| D06 - 泛型与工具类型 | 4/5 | 正确使用 `Pick<Console, 'warn'>` 工具类型定义 Logger 依赖（registry.ts L8, cli-detector.ts L6, llm-inferencer.ts L8, provider-registrar.ts L18）；使用 `Record<string, unknown>` 表示动态配置对象；`loadProvidersFromConfig` 中重复的属性访问模式可通过辅助函数泛型化（-0.5） |

### 第三组：代码风格 (13/15)

| 维度 | 得分 | 扣分原因 |
|------|------|----------|
| D07 - 命名规范一致性 | 5/5 | 文件名全部使用 kebab-case（cli-detector.ts, llm-inferencer.ts, provider-registrar.ts）；类名使用 PascalCase（AgentRegistryImpl, CliDetector, LlmInferencer, ProviderRegistrar, GenericAdapter）；接口使用 I 前缀 + PascalCase（IAgentAdapter, IAgentRegistry, ICliDetector, ILlmInferencer, IProviderRegistrar）；函数使用 camelCase；布尔变量语义清晰（found, available, enabled） |
| D08 - 导入组织规范 | 4/5 | 使用相对路径导入（`./registry.js`, `../types/agent.js`）；使用 `import type` 分离类型导入；`cli-detector.ts` L1-L2 标准库与类型导入之间缺少空行分隔（-0.5）；`llm-inferencer.ts` L1-L4 四行导入未按标准库/第三方/内部分组（-0.5） |
| D09 - 代码格式一致性 | 4/5 | ESLint 配置存在（`eslint.config.js`）；代码缩进一致使用 2 空格；大括号风格一致（K&R）；`provider-registrar.ts` L90 行超过 120 字符（-0.5） |

### 第四组：错误处理 (12/15)

| 维度 | 得分 | 扣分原因 |
|------|------|----------|
| D10 - 异常捕获完备性 | 4/5 | `cli-detector.ts` 所有 I/O 操作（detect L26, findCommandPath L53）均有 try/catch；`llm-inferencer.ts` infer（L108）、parseResponse（L133）、createLLMClient（L170）均有 try/catch；`provider-registrar.ts` register（L96）、test（L178）、persistProvider（L213）、removeProviderFromConfig（L248）、loadProvidersFromConfig（L263）均有 try/catch；`loadProvidersFromConfig` 使用 `console.error`（L298）而非注入的 logger，破坏错误处理一致性（-0.5）；`loadProvidersFromConfig` 吞没错误仅打印日志，无错误传播（-0.5） |
| D11 - 错误信息质量 | 4/5 | 错误信息包含上下文：`"Agent with ID "${descriptor.id}" is already registered"`（registry.ts L24）；`"CLI '${cliCommand}' not found: ${detectionResult.error}"`（provider-registrar.ts L103）；`"Missing required field in descriptor: ${field}"`（llm-inferencer.ts L155）；错误链保留：`"LLM inference failed: ${errorMessage}"`（llm-inferencer.ts L121）、`"Failed to parse LLM response: ${errorMessage}"`（llm-inferencer.ts L146）；部分错误信息可更具体（如 persistProvider 的错误）（-0.5） |
| D12 - 优雅降级 | 4/5 | `cli-detector.ts` detect 失败返回错误结果而非抛异常（L44-L49）；`provider-registrar.ts` register 失败返回 `{ success: false, error }` 结果（L136-L143）；`persistProvider` 失败仅记录日志不影响注册流程（L242-L244）；`loadProvidersFromConfig` 单个 provider 加载失败不影响其他 provider（L268-L296）；`llm-inferencer.ts` LLM 未配置时直接 throw 而非返回降级结果（-0.5） |

### 第五组：测试质量 (0/15)

| 维度 | 得分 | 扣分原因 |
|------|------|----------|
| D13 - 测试覆盖率 | 0/5 | 模块内无任何测试文件（.test.ts 或 .spec.ts）；6 个源文件均无对应单元测试（-5）；虽有 8 个外部测试文件引用 agent-runtime，但均为集成测试，不覆盖模块内部逻辑 |
| D14 - 测试设计质量 | 0/5 | 无测试可评估（-5）；无法验证测试是否有断言、是否覆盖多种场景、是否独立 |
| D15 - 测试可维护性 | 0/5 | 无测试可评估（-5）；无法验证测试命名、辅助工具、与实现的耦合度 |

### 第六组：第三方依赖 (8/10)

| 维度 | 得分 | 扣分原因 |
|------|------|----------|
| D16 - 封装层完整性 | 4/5 | `CliDetector` 通过 Deps 接口封装 `execSync`（cli-detector.ts L5-L7），提供 `execCommand` 抽象；`LlmInferencer` 封装 `LLMClient`（llm-inferencer.ts L88-L95），通过 Deps 注入；`ProviderRegistrar` 封装 `loadConfig`/`saveConfig`（provider-registrar.ts L89-L90）；`loadProvidersFromConfig`（L262-L300）直接调用 `loadConfig()` 而非通过注入的 configLoader，破坏封装一致性（-0.5） |
| D17 - 依赖必要性与版本 | 4/5 | 模块仅依赖 Node.js 标准库（`node:child_process`）和项目内部模块，无新增第三方依赖；内部依赖（`nl/llm`, `infrastructure/audit`, `setup/first-run-wizard-bridge`）均为必要依赖；`interfaces.ts` 定义了未使用的接口，属于冗余代码（-0.5） |

### 第七组：可维护性 (7/15)

| 维度 | 得分 | 扣分原因 |
|------|------|----------|
| D18 - 文档与注释质量 | 2/5 | 仅 `registry.ts` 的 `getAgentRegistry()`（L66-L69）和 `resetAgentRegistry()`（L77-L79）有 JSDoc；`interfaces.ts` 有模块级和接口级 JSDoc（L1-L4, L6-L8, L30-L32）；以下 13 个导出符号缺少 JSDoc：`CliDetectorDeps`、`CliDetector`、`getCliDetector`、`resetCliDetector`（cli-detector.ts）；`LlmInferencerDeps`、`LlmInferencer`、`getLlmInferencer`、`resetLlmInferencer`（llm-inferencer.ts）；`ProviderRegistrarDeps`、`ProviderRegistrar`、`getProviderRegistrar`、`resetProviderRegistrar`、`loadProvidersFromConfig`（provider-registrar.ts）（-2.5）；`interfaces.ts` 中的注释解释了"为什么"（Interface-first 原则），符合 G-06 |
| D19 - 代码重复度 | 2/5 | 单例模式在 4 个文件中完全重复（registry.ts L64-L75, cli-detector.ts L83-L94, llm-inferencer.ts L184-L195, provider-registrar.ts L302-L313），结构完全相同（-1）；静默 Logger 模式在 4 个文件中重复（registry.ts L11-L13, cli-detector.ts L17-L20, llm-inferencer.ts L13-L17, provider-registrar.ts L23-L27）（-1）；错误处理模式 `error instanceof Error ? error.message : String(error)` 在 provider-registrar.ts（L137, L189）和 llm-inferencer.ts（L119, L145）中重复（-0.5） |
| D20 - 技术债务标记 | 3/5 | 无 TODO/FIXME/HACK 标记；`interfaces.ts` 为死代码（未被任何文件导入或使用），定义了与 `types/agent.ts` 重复的接口，但未标记为废弃或待清理（-0.5）；`loadProvidersFromConfig` 中大量 `as string` 类型断言表明配置类型定义不完善，属于未标记的技术债务（-0.5）；`provider-registrar.ts` L58 硬编码 `descriptor.id === 'codex'` 特殊逻辑，未标记为临时方案（-0.5） |

## 关键发现

### P0 阻断问题

| 序号 | 文件 | 行号 | 问题描述 | 对应条例 |
|------|------|------|----------|----------|
| 1 | `src/agent-runtime/` | - | 模块零测试覆盖，6 个源文件无任何单元测试，无法验证功能正确性 | G-04 |

### P1 严重问题

| 序号 | 文件 | 行号 | 问题描述 | 对应条例 |
|------|------|------|----------|----------|
| 1 | `provider-registrar.ts` | L89, L90, L264 | 3 处 `as unknown as` 双重类型断言，完全绕过 TypeScript 类型检查 | TS-07 |
| 2 | `provider-registrar.ts` | L273-L291 | `loadProvidersFromConfig` 中 10 处 `as` 类型断言，配置对象缺少强类型定义 | TS-07 |
| 3 | `provider-registrar.ts` | L29-L76, L78-L260, L262-L300 | 单文件包含 3 种职责（GenericAdapter + ProviderRegistrar + loadProvidersFromConfig），超过 300 行 | G-03 |
| 4 | `llm-inferencer.ts` | L3 | 直接依赖 `nl/llm.ts`，agent-runtime 运行时层反向依赖 nl 层 | 3P-05 |
| 5 | `interfaces.ts` | L1-L40 | 定义的 `IAgentAdapter` 和 `IAgentRegistry` 未被任何文件使用，与 `types/agent.ts` 中的同名接口重复 | G-08 |
| 6 | `provider-registrar.ts` | L298 | `loadProvidersFromConfig` 使用 `console.error` 而非注入的 logger，破坏依赖注入一致性 | 3P-01 |

### P2 一般问题

| 序号 | 文件 | 行号 | 问题描述 | 对应条例 |
|------|------|------|----------|----------|
| 1 | `cli-detector.ts`, `llm-inferencer.ts`, `provider-registrar.ts` | - | 13 个导出符号缺少 JSDoc 文档 | TS-11 |
| 2 | 4 个文件 | - | 单例模式（getInstance + resetInstance）在 4 个文件中完全重复 | G-03 |
| 3 | 4 个文件 | - | 静默 Logger 工厂模式在 4 个文件中完全重复 | G-03 |
| 4 | `llm-inferencer.ts` | L139 | `JSON.parse` 结果直接 `as LlmInferenceResult` 断言，虽有 validateDescriptor 但验证不完整（仅检查部分字段） | TS-07 |
| 5 | `provider-registrar.ts` | L58 | 硬编码 `descriptor.id === 'codex'` 特殊逻辑，未抽象为可配置策略 | G-01 |
| 6 | `provider-registrar.ts` | L262-L300 | `loadProvidersFromConfig` 直接调用 `loadConfig()` 而非通过 Deps 注入的 configLoader | 3P-01 |
| 7 | `llm-inferencer.ts` | L102-L103 | LLM 未配置时直接 throw，无降级策略 | G-02 |

### P3 建议改进

| 序号 | 文件 | 行号 | 问题描述 | 对应条例 |
|------|------|------|----------|----------|
| 1 | `cli-detector.ts` | L1-L2 | 标准库与类型导入之间缺少空行分隔 | TS-09 |
| 2 | `llm-inferencer.ts` | L1-L4 | 四行导入未按标准库/第三方/内部分组 | TS-09 |
| 3 | `provider-registrar.ts` | L90 | 行长度超过 120 字符 | Google Style |
| 4 | `provider-registrar.ts` | L137, L189; `llm-inferencer.ts` L119, L145 | 错误处理模式 `error instanceof Error ? error.message : String(error)` 重复 4 次 | G-03 |
| 5 | `interfaces.ts` | L1-L40 | 死代码文件未标记为废弃 | G-09 |

## 改进建议

### 短期改进（1-2 周）

1. **添加单元测试**：为 6 个源文件创建对应的 `.test.ts` 文件，优先覆盖 `registry.ts`、`cli-detector.ts`、`llm-inferencer.ts` 的核心逻辑。利用已有的 Deps 接口进行 Mock 注入，测试成本较低。
2. **消除 `as unknown as` 双重断言**：为 `loadConfig()` 返回值定义强类型接口（如 `VectaHubRawConfig`），替换 `provider-registrar.ts` L89、L90、L264 的双重断言。
3. **删除 `interfaces.ts` 死代码**：该文件定义的 `IAgentAdapter` 和 `IAgentRegistry` 未被使用，与 `types/agent.ts` 重复，应直接删除。
4. **统一 `loadProvidersFromConfig` 的 logger 注入**：将 L298 的 `console.error` 替换为注入的 logger，与模块其他部分保持一致。

### 中期改进（1-2 月）

1. **拆分 `provider-registrar.ts`**：将 `GenericAdapter` 提取为独立的 `generic-adapter.ts` 文件；将 `loadProvidersFromConfig` 提取为独立的 `config-loader.ts` 文件。
2. **提取公共模式**：将单例模式、静默 Logger 工厂、错误处理辅助函数提取到 `src/agent-runtime/utils/` 或 `src/utils/` 中，消除 4 个文件中的重复代码。
3. **为 `loadProvidersFromConfig` 的配置对象定义强类型**：创建 `ProviderConfig` 接口替代 `Record<string, unknown>`，消除 L273-L291 的 10 处类型断言。
4. **补充 JSDoc 文档**：为所有 13 个缺少文档的导出符号添加 JSDoc，特别是 `ProviderRegistrar`、`LlmInferencer`、`CliDetector` 等核心类。

### 长期改进（3-6 月）

1. **重新审视依赖方向**：将 `llm-inferencer.ts` 对 `nl/llm.ts` 的直接依赖改为通过接口注入，使 agent-runtime 不直接依赖 nl 层实现。可创建 `ILLMClientFactory` 接口在 types 层定义。
2. **消除硬编码特殊逻辑**：将 `provider-registrar.ts` L58 的 `descriptor.id === 'codex'` 特殊处理抽象为 `AgentDescriptor` 上的可选配置字段（如 `outputLastMessageArg`）。
3. **建立测试覆盖率门禁**：将 agent-runtime 纳入 CI 覆盖率检查，设置 >=70% 的覆盖率目标。

## 标杆亮点

1. **依赖注入模式贯穿全模块** - 所有 4 个核心类均通过 Deps 接口注入依赖，支持测试和解耦（registry.ts L7-L9, cli-detector.ts L4-L7, llm-inferencer.ts L6-L9, provider-registrar.ts L15-L21）
2. **接口定义与类型分离** - 类型定义集中在 `types/agent.ts` 和 `types/provider.ts`，模块内类通过 `implements` 明确契约（registry.ts L15, cli-detector.ts L22, llm-inferencer.ts L88, provider-registrar.ts L78）
3. **优雅的错误结果模式** - `register()`、`test()`、`detect()` 等方法返回结构化结果对象而非抛异常，调用方可根据 `success`/`found` 字段决定处理策略（provider-registrar.ts L93-L143, cli-detector.ts L25-L49）
4. **`import type` 规范使用** - 全模块正确使用 `import type` 分离类型导入，符合 TS 规范且有利于 tree-shaking（registry.ts L1, cli-detector.ts L2, llm-inferencer.ts L1-L2, provider-registrar.ts L1-L9）
5. **Logger 类型设计** - 使用 `Pick<Console, 'warn'>` 精确约束 Logger 依赖类型，既保证最小接口又利用了 TypeScript 内置类型（registry.ts L8, cli-detector.ts L6）
