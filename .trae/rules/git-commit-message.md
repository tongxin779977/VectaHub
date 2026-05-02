---
alwaysApply: false
description: "生成 git commit message 时遵循此规范"
scene: "git_commit"
version: 2.0.0
lastUpdated: 2026-05-02
---

# Git Commit Message

## 格式

```
[模块] 动词 + 做了什么（≤50字，不用句号）
```

## 模块名

`cli` / `nl` / `workflow` / `sandbox` / `cli-tools` / `utils` / `types` / `config` / `test`

## 示例

- `[nl] 添加意图匹配的置信度归一化`
- `[workflow] 修复并行步骤执行顺序问题`
- `[sandbox] 新增 macOS 沙盒检测`
- `[test] 补充 executor 单元测试`
- `[config] 更新默认沙盒策略为 block`
