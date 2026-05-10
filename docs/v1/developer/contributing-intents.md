# 为 VectaHub 贡献新意图

> 版本: 1.0.0 (Phase 6)
> 适用范围: 外部开发者贡献新意图能力

## 概述

在 Phase 6 架构中，新增一个意图能力需要遵循标准化的三步流程：

1. **定义 Schema** - 在意图模板中注册新意图
2. **添加 Mapping** - 配置意图到工作流步骤的映射
3. **跑通防腐层测试** - 验证映射的正确性和安全性

---

## 步骤 1：定义 Schema

在 `src/nl/templates/index.ts` 中添加新的意图模板：

```typescript
{
  intent: 'CUSTOM_INTENT_NAME',
  category: 'category_name',
  examples: [
    '用户可能输入的示例 1',
    '用户可能输入的示例 2',
  ],
  requiredParams: ['param1', 'param2'],
  patterns: [/regex_pattern/],
}
```

**字段说明**：
- `intent`: 意图名称（必须唯一，使用大写蛇形命名）
- `category`: 分类名称（用于组织和路由）
- `examples`: 用户可能输入的示例列表（用于 LLM 理解）
- `requiredParams`: 必需参数列表（缺失时会失败）
- `patterns`: 辅助匹配的正则模式

---

## 步骤 2：添加 Mapping

在 `src/nl/intent-step-mapping.ts` 中配置意图到工作流步骤的映射：

```typescript
const INTENT_STEP_MAPPINGS: Record<string, IntentStepMapping> = {
  CUSTOM_INTENT_NAME: {
    type: 'exec',
    cli: 'your_command',
    args: [
      'subcommand',
      '--option',
      '{{param1}}',
      '{{param2}}',
    ],
    required: ['param1', 'param2'],
  },
};
```

**映射规则**：
- `type`: 步骤类型（通常为 `exec`）
- `cli`: 要执行的 CLI 命令
- `args`: 命令参数数组，支持 `{{param}}` 模板变量
- `required`: 必需参数列表（与 Schema 中的 `requiredParams` 一致）

**安全约束**：
- `cli` 必须在允许列表中或已注册的工具
- 危险命令（rm/sudo/curl/docker/wget）会被拦截
- 带空格的参数保持为单个 `args` 元素

---

## 步骤 3：跑通防腐层测试

运行测试确保映射正确：

```bash
# 运行类型检查
npm run typecheck

# 运行映射测试
npm test -- src/nl/intent-step-mapping.test.ts

# 运行防映射漂移测试
npm test -- src/nl/intent-step-mapping.integration.test.ts
```

**测试覆盖要求**：

| 测试类型 | 验证内容 |
|----------|----------|
| Schema 一致性 | 新意图在 mapper 中必须存在映射 |
| 参数完整性 | 缺少 required 参数必须失败 |
| 未知意图处理 | 不存在的意图必须失败，不回退到任意 CLI |
| 命令格式校验 | 生成的 step 必须符合 executor 支持的结构 |
| 安全检测 | 危险命令必须被拦截 |

---

## 完整示例

### 示例：添加 `npm_install` 意图

**Step 1**: 在 `templates/index.ts` 中添加：
```typescript
{
  intent: 'NPM_INSTALL',
  category: 'package-management',
  examples: [
    '安装 lodash',
    '安装 react 和 react-dom',
    'npm install axios --save-dev',
  ],
  requiredParams: ['packages'],
}
```

**Step 2**: 在 `intent-step-mapping.ts` 中添加：
```typescript
NPM_INSTALL: {
  type: 'exec',
  cli: 'npm',
  args: ['install', '{{packages}}'],
  required: ['packages'],
}
```

**Step 3**: 运行测试验证：
```bash
npm run typecheck && npm test -- src/nl/intent-step-mapping.test.ts
```

---

## 最佳实践

1. **意图命名**：使用大写蛇形命名（如 `GIT_COMMIT`）
2. **参数设计**：最小化必需参数，提供合理默认值
3. **安全优先**：避免执行危险操作，敏感命令需要用户确认
4. **测试完备**：每个新意图必须有对应的单元测试和集成测试
5. **文档更新**：更新相关文档说明新意图的用途和使用方式

---

## 审核流程

提交 PR 后，CI 会自动运行：
1. **类型检查** - 确保 TypeScript 类型正确
2. **单元测试** - 验证映射逻辑正确性
3. **防映射漂移测试** - 确保 Schema 与 Mapping 同步
4. **安全扫描** - 检测危险命令和潜在漏洞