# BUG 清单

| 序号 | 标题 | 状态 | 位置 | 修复版本 |
|:---:|------|:----:|------|:--------:|
| 1 | 动态导入可能导致运行时错误 | **已修复** | `src/skills/init.ts#L34-38` | - |

---

## 详情

### 1. 动态导入可能导致运行时错误

**问题描述**：
- 使用 `require()` 动态导入模块存在风险：
  1. 如果模块文件不存在或导出错误，会导致运行时错误；
  2. 无法在编译时进行类型检查。

**修复方案**：
- 将动态 `require()` 改为静态 `import` 语句
- 导入的模块包括：`createIntentSkill`、`createWorkflowSkill`、`createPipelineSkill`、`createPromptRegistry`、`createLLMDialogControlSkill`
- 保留条件分支中的 try-catch 错误处理逻辑

**影响文件**：
- `src/skills/init.ts`

**修复状态**：已修复
