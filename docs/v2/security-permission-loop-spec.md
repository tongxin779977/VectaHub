# Security & Permission Loop Spec (P4)

## 1. 用户目标和禁止事项

目标：确保所有 Agent 生成的命令和系统执行的验证命令都经过统一的安全策略评估，防止越权操作和敏感信息泄露。

禁止事项：
- 不允许 Agent 静默执行未经评估的高风险命令。
- 不在 Trace 或运行记录中保存任何 Secret/API Key。
- 不绕过 `VECTAHUB_HOME` 隔离策略。
- 不在 P4 阶段实现完整的 RBAC 用户管理（这属于 v2.0 服务化目标）。

## 2. 当前链路事实

当前链路：
- P2 建立了 `AgentTaskContract`。
- P3 实现了自动化验证命令执行。
- 现有 `src/command-rules/` 提供了一套基础的黑白名单规则。
- 现有 `src/security.ts` 提供了一些基础的安全检查逻辑。

当前问题：
- 验证命令直接通过 `execFile` 执行，缺乏统一的风险评级。
- Agent 权限检查分散在各处，没有统一的 `preflight` 闭环。
- Trace 记录尚未系统性地对敏感字段进行脱敏（Redaction）。

## 3. 根因分析
缺乏统一的安全评估引擎导致：
- 新增验证命令类型时，需要重复编写安全逻辑。
- 无法在执行前给用户提供清晰的“风险等级”反馈。
- 批量执行时，单个任务的安全失败可能导致整个批次状态不透明。

## 4. In Scope / Out of Scope

In Scope:
- 统一 Agent CLI 的可用性与权限 `preflight` 检查。
- 为 `validationCommands` 接入 `RiskAssessment` 引擎。
- 实现 Trace 和 Record 的敏感信息脱敏（Redaction）中间件。
- 在插件端实现高风险任务的“人工二次确认”拦截逻辑。

Out of Scope:
- 不做内核级沙箱（如 Docker 容器化）。
- 不做多租户权限隔离。
- 不做动态命令流量分析。

## 5. 数据合同

### 5.1 风险评估模型
```ts
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface CommandRiskAssessment {
  level: RiskLevel;
  ruleName?: string;
  reason?: string;
  suggestion?: string;
  needsConfirmation: boolean;
}
```

### 5.2 敏感信息脱敏配置
```ts
export interface RedactionConfig {
  patterns: RegExp[];
  replacement: string; // 默认 "[REDACTED]"
}
```

## 6. 生命周期合同

```text
Task Ready
-> Security Preflight (Agent availability & permissions)
-> if fail: failed_config
-> Agent 执行
-> Risk Assessment (on validation commands)
-> if high risk & no confirmation: needs_confirmation
-> else: run validation
```

## 7. 并发和共享状态设计
- 安全规则库单例加载，批量任务共享。
- 脱敏逻辑作为流式处理中间件，不影响并发性能。

## 8. 性能与内存预算
- 单条命令风险评估：< 5ms。
- 脱敏处理：O(n) 字符串扫描。
- 规则库初始化：< 50ms。

## 9. 安全与隐私边界
- **脱敏范围**：环境变量中的 Key、匹配模式的 Secret、用户 Home 路径。
- **全链路脱敏 (End-to-End Redaction)**：脱敏器必须作用于数据产生的第一现场。Agent 的原始输出流在写入磁盘 `.stdout` 文件和存入 JSON 摘要**之前**，必须先经过 `Redactor` 处理。**严禁**在磁盘上存储任何明文敏感信息。
- **拦截策略**：`high` 及以上风险级别必须在插件端触发弹窗确认。

## 10. 兼容和降级策略
- 如果安全评估引擎初始化失败，默认进入 `strict` 模式（拦截所有非内置命令）。
- 老插件不具备二次确认能力时，高风险命令直接失败。

## 11. 文件修改清单

CLI 侧：
- `src/security-protocol/engine.ts` (新)
- `src/security-protocol/redactor.ts` (新)
- `src/commands/run-task.ts` (接入 preflight)
- `src/utils/redact.ts` (新)

插件侧：
- `packages/vectahub-vscode-extension/src/security/riskUI.ts` (新)
- `packages/vectahub-vscode-extension/src/commands/runDocTasks.ts` (接入确认拦截)

## 12. 实施步骤

1. 实现统一的 `CommandRiskAssessment` 引擎。
2. 实现 `Redactor` 工具类，支持常见 Secret 模式匹配。
3. 在 `run-task` 的 `preflight` 阶段接入 Agent 权限校验。
4. 在验证命令执行前调用风险评估。
5. 在插件端捕获 `needs_confirmation` 状态并弹出 VS Code 确认框。
6. 全量开启 Trace 事件脱敏。

## 13. 测试计划
- 测试黑名单命令拦截。
- 测试敏感信息（如 `export API_KEY=xxx`）在 Trace 中的脱敏效果。
- 测试插件端二次确认逻辑。

## 14. 验收标准
- 任何命中 `critical` 规则的命令均被阻断。
- Trace 文件中不再出现匹配模式的敏感信息。
- 插件端能区分“静默执行”和“需确认执行”的任务。

## 15. Hardening backlog
- 动态更新安全规则库。
- 支持针对特定项目的安全例外白名单。
