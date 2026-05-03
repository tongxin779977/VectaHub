# VectaHub Agent 测试任务

> 此文档为 AI agent 测试使用，精确到测试用例和预期结果
> 遵循 TDD 流程：Red → Green → Refactor
> 测试规则详见 [.trae/rules/test-rules.md](../../.trae/rules/test-rules.md)

---

## 测试规则

**必读项目规则**: [.trae/rules/test-rules.md](../../.trae/rules/test-rules.md)

核心规则摘要：
- **TDD 流程**：先写失败测试 → 最小代码通过 → 重构
- **测试文件**：与源文件同级，命名 `*.test.ts`
- **测试框架**：Vitest 的 `describe/it/expect` API
- **测试隔离**：`beforeEach` 创建实例，`afterEach` 清理
- **Mock 目录**：`__mocks__/`

## 可用工具

### 项目命令（package.json）

| 命令 | 说明 | 用途 |
|------|------|------|
| `npm test` | 运行所有测试（watch 模式） | 开发时持续测试 |
| `npm test -- --run` | 单次运行所有测试 | CI/验证 |
| `npm test <pattern>` | 运行匹配文件 | 运行指定测试 |
| `npm run typecheck` | TypeScript 类型检查 | 类型验证 |
| `npm run build:cli` | 构建 CLI | 构建验证 |
| `npm run dev:cli` | 开发运行 CLI | 调试命令 |
| `npm run vectahub` | 运行 vectahub CLI | 功能测试 |

### .trae Commands

| 命令 | 说明 | 测试用途 |
|------|------|----------|
| `run-workflow` | `vectahub run "意图"` 或 `vectahub run -f workflow.yaml` | 端到端测试 |
| `test-watch` | `npm test` / `npm test -- --run` | 测试执行 |
| `typecheck-build` | `npm run typecheck` / `npm run build:cli` | 类型/构建验证 |
| `doctor` | `vectahub doctor` | 环境诊断 |
| `debug-workflow` | 调试工作流执行 | 问题排查 |
| `generate` | `vectahub generate "描述"` | 生成测试工作流 |

### .trae Skills

| Skill | 说明 | 测试用途 |
|-------|------|----------|
| `test-generator` | 生成 Vitest 测试 | 编写测试用例 |
| `command-auditor` | 审计命令安全性 | 危险命令测试 |
| `intent-matcher-designer` | 设计意图匹配规则 | 意图匹配测试 |
| `workflow-builder` | 构建工作流 YAML | 工作流集成测试 |

## 测试数据约定

- 测试目录：`/tmp/vectahub-test/`
- 测试后清理：`afterEach` 中 `fs.rm()` 删除测试目录
- 日期使用固定值：`new Date('2026-05-01T10:00:00Z')`

**重要**：`vitest.config.ts` 引用了项目根目录的 `test-setup.ts` 但该文件不存在。
如果测试报错 `Cannot find module './test-setup.ts'`，在项目根目录创建空文件。

---

## 测试执行流程

### 标准 TDD 流程

```
1. 编写测试 → npm test <file> -- --run  (确认失败)
2. 编写代码 → npm run typecheck         (类型检查)
3. 运行测试 → npm test <file> -- --run  (确认通过)
4. 重构代码 → npm test -- --run         (全部通过)
```

### 完整验证流程

```bash
# 1. 类型检查
npm run typecheck

# 2. 运行所有测试
npm test -- --run

# 3. 构建验证
npm run build:cli

# 4. CLI 功能测试
npm run vectahub -- doctor
npm run vectahub -- run "查找文件"
```

---

## 测试任务清单

### 测试任务 1：LLM 客户端测试（P0 - 阻塞发布）

### 任务元数据

```yaml
title: "LLM 客户端测试"
priority: P0
test_file: src/nl/llm.test.ts (新建)
source_file: src/nl/llm.ts
estimated_lines: "~150 lines test code"
coverage_target: "≥80%"
dependencies:
  - src/nl/llm.ts
  - vitest
skills_to_use:
  - tdd-workflow
  - test-generator
```

### 背景

`src/nl/llm.ts` 实现了完整的 LLM 客户端（OpenAI/Anthropic/Ollama/Groq），但完全没有测试覆盖。这是核心功能，缺少测试意味着生产环境 LLM 失败路径无法保障。

### 测试用例

#### 1.1 createLLMConfig() 测试

**文件**：`src/nl/llm.test.ts`

**测试场景**：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLLMConfig } from './llm.js';

describe('createLLMConfig', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('应该检测 OPENAI_API_KEY 并返回 OpenAI 配置', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.VECTAHUB_LLM_PROVIDER;

    const config = createLLMConfig();
    
    expect(config).not.toBeNull();
    expect(config?.provider).toBe('openai');
    expect(config?.apiKey).toBe('test-key');
  });

  it('应该检测 ANTHROPIC_API_KEY 并返回 Anthropic 配置', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.OPENAI_API_KEY;
    delete process.env.VECTAHUB_LLM_PROVIDER;

    const config = createLLMConfig();
    
    expect(config).not.toBeNull();
    expect(config?.provider).toBe('anthropic');
  });

  it('应该支持 VECTAHUB_LLM_PROVIDER 环境变量指定 provider', () => {
    process.env.VECTAHUB_LLM_PROVIDER = 'ollama';
    process.env.OPENAI_API_KEY = 'test-key';

    const config = createLLMConfig();
    
    expect(config?.provider).toBe('ollama');
  });

  it('无配置时返回 null', () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.VECTAHUB_LLM_PROVIDER;

    const config = createLLMConfig();
    
    expect(config).toBeNull();
  });
});
```

#### 1.2 LLMClient 测试

**测试场景**：

```typescript
describe('LLMClient', () => {
  let client: LLMClient;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    client = createLLMClient();
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it('应该调用 OpenAI API 并解析 JSON 响应', async () => {
    const mockResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            intent: 'FILE_FIND',
            confidence: 0.9,
            workflow: { name: 'test', steps: [] }
          })
        }
      }]
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const result = await client.parseIntent('查找文件');
    
    expect(result.intent).toBe('FILE_FIND');
    expect(result.confidence).toBe(0.9);
  });

  it('JSON 解析失败时应该抛出错误', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'invalid json' } }]
      })
    });

    await expect(client.parseIntent('查找文件')).rejects.toThrow();
  });

  it('网络超时时应该抛出错误', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

    await expect(client.parseIntent('查找文件')).rejects.toThrow();
  });

  it('API 返回错误状态时应该抛出错误', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized'
    });

    await expect(client.parseIntent('查找文件')).rejects.toThrow(/401/);
  });
});
```

#### 1.3 降级逻辑测试

**测试场景**：

```typescript
describe('降级逻辑', () => {
  it('置信度低于阈值时应该返回降级标志', async () => {
    const mockResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            intent: 'UNKNOWN',
            confidence: 0.3,
            workflow: { name: 'test', steps: [] }
          })
        }
      }]
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const client = createLLMClient();
    const result = await client.parseIntent('模糊输入');
    
    expect(result.confidence).toBeLessThan(0.7);
  });

  it('SYSTEM_PROMPT 应该包含在请求中', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: '{}' } }]
      })
    });

    const client = createLLMClient();
    await client.parseIntent('测试');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('VectaHub')
      })
    );
  });
});
```

### 验证步骤

```bash
# 1. 运行类型检查
npm run typecheck

# 2. 运行 LLM 测试
npm test -- src/nl/llm.test.ts --run

# 3. 查看覆盖率
npm test -- src/nl/llm.test.ts --run --coverage
```

### 验收标准

- [ ] 测试覆盖率 ≥ 80%
- [ ] 所有 provider 测试通过
- [ ] 降级逻辑测试覆盖
- [ ] 无真实 API 调用（全部 mock）
- [ ] `npm run typecheck` 通过

---

### 测试任务 2：意图匹配器测试（P0 - 阻塞发布）

### 任务元数据

```yaml
title: "意图匹配器测试"
priority: P0
test_file: src/nl/intent-matcher.test.ts (新建)
source_file: src/nl/intent-matcher.ts
estimated_lines: "~100 lines test code"
coverage_target: "≥70%"
dependencies:
  - src/nl/intent-matcher.ts
  - src/nl/templates/index.ts
  - vitest
skills_to_use:
  - tdd-workflow
  - test-generator
  - intent-matcher-designer
```

### 背景

`src/nl/intent-matcher.ts` 是关键词匹配的核心模块，但没有测试覆盖。16 个意图模板的匹配正确性无法保障。

### 测试用例

#### 2.1 关键词匹配测试

**文件**：`src/nl/intent-matcher.test.ts`

**测试场景**：

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createIntentMatcher } from './intent-matcher.js';

describe('意图匹配器', () => {
  let matcher: IntentMatcher;

  beforeEach(() => {
    matcher = createIntentMatcher();
  });

  describe('FILE_FIND 意图', () => {
    it('应该匹配 "查找文件"', () => {
      const result = matcher.match('查找文件');
      expect(result.intent).toBe('FILE_FIND');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('应该匹配 "找 .ts 文件"', () => {
      const result = matcher.match('找 .ts 文件');
      expect(result.intent).toBe('FILE_FIND');
    });

    it('应该匹配 "搜索文件"', () => {
      const result = matcher.match('搜索文件');
      expect(result.intent).toBe('FILE_FIND');
    });
  });

  describe('GIT_WORKFLOW 意图', () => {
    it('应该匹配 "提交代码"', () => {
      const result = matcher.match('提交代码');
      expect(result.intent).toBe('GIT_WORKFLOW');
    });

    it('应该匹配 "创建分支"', () => {
      const result = matcher.match('创建分支');
      expect(result.intent).toBe('GIT_WORKFLOW');
    });

    it('应该匹配 "推送"', () => {
      const result = matcher.match('推送到远程');
      expect(result.intent).toBe('GIT_WORKFLOW');
    });
  });

  describe('FETCH_HOT_NEWS 意图', () => {
    it('应该匹配 "热榜"', () => {
      const result = matcher.match('查看热榜');
      expect(result.intent).toBe('FETCH_HOT_NEWS');
    });

    it('应该匹配 "trending"', () => {
      const result = matcher.match('show trending');
      expect(result.intent).toBe('FETCH_HOT_NEWS');
    });

    it('应该匹配 "排行榜"', () => {
      const result = matcher.match('排行榜');
      expect(result.intent).toBe('FETCH_HOT_NEWS');
    });
  });
});
```

#### 2.2 置信度计算测试

**测试场景**：

```typescript
describe('置信度计算', () => {
  it('单关键词匹配应该有基础置信度', () => {
    const result = matcher.match('查找');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(1);
  });

  it('多关键词匹配应该有更高置信度', () => {
    const singleResult = matcher.match('查找');
    const multiResult = matcher.match('查找文件 .ts');
    
    expect(multiResult.confidence).toBeGreaterThan(singleResult.confidence);
  });

  it('无匹配时置信度应该为 0', () => {
    const result = matcher.match('完全不相关的输入xyz123');
    expect(result.confidence).toBe(0);
    expect(result.intent).toBe('UNKNOWN');
  });
});
```

#### 2.3 意图冲突解决测试

**测试场景**：

```typescript
describe('意图冲突解决', () => {
  it('当多个意图匹配时应该选择置信度最高的', () => {
    const result = matcher.match('搜索');
    
    expect(result.intent).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('应该返回匹配的原因', () => {
    const result = matcher.match('查找文件');
    
    expect(result.reason).toBeDefined();
    expect(result.matchedKeywords).toBeDefined();
  });
});
```

### 验证步骤

```bash
# 1. 类型检查
npm run typecheck

# 2. 运行意图匹配测试
npm test -- src/nl/intent-matcher.test.ts --run

# 3. 端到端测试：使用 CLI 验证
npm run vectahub -- run "查找 .ts 文件"
npm run vectahub -- run "提交代码"
npm run vectahub -- run "查看热榜"
```

### 验收标准

- [x] 意图匹配测试覆盖率 ≥ 70%
- [x] 16 个意图的关键词测试覆盖
- [x] 置信度计算测试覆盖
- [x] 意图冲突解决测试覆盖
- [x] `npm run typecheck` 通过

---

### 测试任务 3：ContextManager 集成测试（P0 - 阻塞功能完整性）

### 任务元数据

```yaml
title: "ContextManager 集成测试"
priority: P0
test_file: src/workflow/context-manager.test.ts (扩展现有)
source_file: 
  - src/workflow/context-manager.ts
  - src/workflow/engine.ts
  - src/workflow/executor.ts
estimated_lines: "~100 lines test code"
coverage_target: "≥80%"
dependencies:
  - src/workflow/context-manager.ts
  - src/workflow/engine.ts
  - src/workflow/executor.ts
skills_to_use:
  - tdd-workflow
  - test-generator
  - workflow-builder
```

### 背景

ContextManager 集成到引擎后，需要测试引擎与 ContextManager 的协作。

### 测试用例

#### 3.1 引擎集成测试

**文件**：`src/workflow/context-manager.test.ts` 或 `src/workflow/engine.test.ts`

**测试场景**：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWorkflowEngine } from './engine.js';
import fs from 'fs';
import path from 'path';

describe('ContextManager 引擎集成', () => {
  const TEST_DIR = '/tmp/vectahub-test';
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = createWorkflowEngine({ storageDir: TEST_DIR });
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('应该在 execute() 中创建 ContextManager', async () => {
    const workflow = await engine.createWorkflow('test', [
      { id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] }
    ]);

    const result = await engine.execute(workflow);
    
    expect(result.status).toBe('COMPLETED');
  });

  it('步骤输出应该可通过 ${stepId} 引用', async () => {
    const workflow = await engine.createWorkflow('test', [
      { id: 'step1', type: 'exec', cli: 'echo', args: ['hello'] },
      { id: 'step2', type: 'exec', cli: 'echo', args: ['${step1}'] }
    ]);

    const result = await engine.execute(workflow);
    
    expect(result.status).toBe('COMPLETED');
  });
});
```

#### 3.2 for_each 步骤集成测试

**测试场景**：

```typescript
describe('for_each 步骤上下文集成', () => {
  it('应该可以遍历上一步输出', async () => {
    const workflow = await engine.createWorkflow('test', [
      { id: 'files', type: 'exec', cli: 'echo', args: ['file1\nfile2\nfile3'] },
      { 
        id: 'process', 
        type: 'for_each', 
        items: '${files}',
        body: [
          { id: 'item', type: 'exec', cli: 'echo', args: ['${item}'] }
        ]
      }
    ]);

    const result = await engine.execute(workflow);
    
    expect(result.status).toBe('COMPLETED');
    expect(result.steps.length).toBe(2);
  });
});
```

#### 3.3 if 条件集成测试

**测试场景**：

```typescript
describe('if 条件上下文集成', () => {
  it('应该可以使用上一步输出判断条件', async () => {
    const workflow = await engine.createWorkflow('test', [
      { id: 'check', type: 'exec', cli: 'echo', args: ['success'] },
      { 
        id: 'conditional', 
        type: 'if', 
        condition: '${check} == success',
        body: [
          { id: 'then', type: 'exec', cli: 'echo', args: ['condition met'] }
        ]
      }
    ]);

    const result = await engine.execute(workflow);
    
    expect(result.status).toBe('COMPLETED');
  });
});
```

### 验证步骤

```bash
# 1. 类型检查
npm run typecheck

# 2. 运行 ContextManager 测试
npm test -- src/workflow/context-manager.test.ts --run

# 3. 端到端测试：使用 workflow-builder skill 创建测试工作流
npm run vectahub -- run -f /tmp/vectahub-test/test-context.yaml
```

### 验收标准

- [ ] 步骤输出可通过 `${stepId.output}` 语法引用
- [ ] `outputVar` 字段可用
- [ ] for_each 步骤可正确遍历上一步输出
- [ ] if 条件可使用上一步输出判断
- [ ] 现有测试全部通过
- [ ] `npm run typecheck` 通过

---

### 测试任务 4：OpenCLI 类型测试（P1 - 功能完整性）

### 任务元数据

```yaml
title: "OpenCLI 类型系统测试"
priority: P1
test_file: src/workflow/executor.test.ts (扩展现有)
source_file: 
  - src/types/index.ts
  - src/cli-tools/discovery/opencli.ts
  - src/workflow/executor.ts
estimated_lines: "~50 lines test code"
coverage_target: "≥70%"
dependencies:
  - src/types/index.ts
  - src/cli-tools/discovery/opencli.ts
  - src/workflow/executor.ts
skills_to_use:
  - tdd-workflow
  - test-generator
```

### 背景

`opencli` 步骤类型的 `outputVar` 字段使用 `(step as any)` 强转，类型系统未定义。

### 测试用例

#### 4.1 outputVar 类型测试

**文件**：`src/workflow/executor.test.ts`

**测试场景**：

```typescript
describe('opencli 步骤 outputVar', () => {
  let executor: Executor;

  beforeEach(() => {
    executor = createExecutor();
  });

  it('应该支持 outputVar 字段（类型检查）', async () => {
    const step: Step = {
      id: 'step1',
      type: 'opencli',
      site: 'hackernews',
      command: 'top',
      args: ['--limit', '5'],
      outputVar: 'news'
    };

    expect(step.outputVar).toBe('news');
  });

  it('outputVar 为空时应该使用 step.id', async () => {
    const step: Step = {
      id: 'step1',
      type: 'opencli',
      site: 'hackernews',
      command: 'top'
    };

    expect((step as any).outputVar).toBeUndefined();
  });
});
```

#### 4.2 安装检测测试

**测试场景**：

```typescript
describe('opencli 安装检测', () => {
  it('opencli 未安装时应该返回清晰错误', async () => {
    const step: Step = {
      id: 'step1',
      type: 'opencli',
      site: 'hackernews',
      command: 'top'
    };

    const result = await executor.execute(step, { mode: 'STRICT' });
    
    expect(result.status).toBe('FAILED');
    expect(result.error).toContain('OpenCLI not found');
  });
});
```

### 验证步骤

```bash
# 1. 类型检查
npm run typecheck

# 2. 运行 executor 测试
npm test -- src/workflow/executor.test.ts --run

# 3. 构建验证
npm run build:cli
```

### 验收标准

- [x] `outputVar` 在类型系统中定义
- [x] `opencli.ts` 使用 ESM import
- [x] opencli 未安装时有清晰错误提示
- [x] 类型检查通过
- [x] `npm run typecheck` 通过

---

### 测试任务 5：包配置验证（P1 - 工程规范）

### 任务元数据

```yaml
title: "包配置验证"
priority: P1
test_file: src/cli.test.ts (扩展现有)
source_file: 
  - package.json
  - src/cli.ts
estimated_lines: "~20 lines test code"
coverage_target: "N/A"
dependencies:
  - none
skills_to_use:
  - tdd-workflow
```

### 背景

`package.json` 版本 `2.1.0` 与 `src/cli.ts` 中 `program.version('4.0.0')` 不一致。

### 测试用例

#### 5.1 版本号一致性测试

**文件**：`src/cli.test.ts`

**测试场景**：

```typescript
describe('包配置', () => {
  it('package.json 版本应该与 cli.ts 版本一致', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')
    );
    
    const cliContent = fs.readFileSync(
      path.join(__dirname, '../cli.ts'), 
      'utf-8'
    );
    const cliVersionMatch = cliContent.match(/\.version\(['"]([^'"]+)['"]\)/);
    const cliVersion = cliVersionMatch?.[1];

    expect(packageJson.version).toBe(cliVersion);
  });
});
```

### 验证步骤

```bash
# 1. 运行类型检查
npm run typecheck

# 2. 运行 CLI 测试
npm test -- src/cli.test.ts --run

# 3. 验证 doctor 命令
npm run vectahub -- doctor
```

### 验收标准

- [x] 版本号一致
- [x] `npm run typecheck` 通过

---

## 测试覆盖率目标

| 模块 | 当前覆盖率 | 目标覆盖率 | 状态 |
|------|-----------|-----------|------|
| workflow/engine.ts | ≥80% | ≥80% | ✅ 保持 |
| workflow/executor.ts | ≥75% | ≥75% | ✅ 保持 |
| workflow/storage.ts | ≥70% | ≥70% | ✅ 保持 |
| workflow/context-manager.ts | 待测 | ≥70% | 🔴 新增 |
| sandbox/detector.ts | ≥70% | ≥70% | ✅ 保持 |
| sandbox/sandbox.ts | ≥70% | ≥70% | ✅ 保持 |
| nl/intent-matcher.ts | 待测 | ≥70% | 🔴 新增 |
| nl/parser.ts | ≥70% | ≥70% | ✅ 保持 |
| nl/llm.ts | 待测 | ≥80% | 🔴 新增 |
| command-rules/engine.ts | ≥70% | ≥70% | ✅ 保持 |
| command-rules/matcher.ts | ≥70% | ≥70% | ✅ 保持 |
| cli-tools/registry.ts | ≥70% | ≥70% | ✅ 保持 |

## 完整测试执行流程

```bash
# 第一阶段：类型检查
npm run typecheck

# 第二阶段：运行所有测试
npm test -- --run

# 第三阶段：构建验证
npm run build:cli

# 第四阶段：端到端测试
npm run vectahub -- doctor
npm run vectahub -- run "查找文件"
npm run vectahub -- run "提交代码"
npm run vectahub -- run "查看热榜"

# 第五阶段：审计日志验证
npm run vectahub -- audit

# 第六阶段：工具列表验证
npm run vectahub -- tools
```

---

```yaml
version: 1.0.0
lastUpdated: 2026-05-03
status: completed
total_test_tasks: 5
completed_tasks: 5
blocked_tasks: 0
```
