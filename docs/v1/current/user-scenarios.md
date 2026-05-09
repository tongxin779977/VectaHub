# VectaHub 1.0 用户场景

这些场景按当前 1.0 CLI 能力整理，优先选择低风险、可验证的本地开发任务。

## 1. 检查本地环境

场景: 第一次使用或排查安装问题。

```bash
vectahub version
vectahub doctor
vectahub config show
```

预期: 能看到版本、环境诊断和当前配置。

## 2. 预览自然语言任务

场景: 不确定自然语言会生成什么命令。

```bash
vectahub run --dry-run "查看 git 状态"
```

预期: 只展示将执行的命令，不实际运行。

## 3. 执行安全只读任务

场景: 查看当前 Git 工作区状态。

```bash
vectahub run "查看 git 状态"
```

预期: 生成并执行类似 `git status` 的命令。

## 4. 跳过确认执行可信命令

场景: 在可信项目中快速执行只读命令。

```bash
vectahub run -y --no-edit "查看当前目录"
```

预期: 不进入编辑确认流程，直接执行。

## 5. 用文件运行工作流

场景: 团队共享固定检查流程。

```bash
vectahub run -f daily-check.yaml
```

预期: 按文件中的步骤执行。

## 6. 先预览文件工作流

场景: 执行别人写的工作流前先看影响范围。

```bash
vectahub run -f daily-check.yaml --dry-run
```

预期: 预览工作流步骤，不执行命令。

## 7. 保存常用自然语言工作流

场景: 把常用任务保存下来，后续复用。

```bash
vectahub run -s "检查 git 状态并运行测试"
vectahub list
```

预期: 执行后能在工作流列表中看到保存记录。

## 8. 查看执行历史

场景: 查找最近执行过什么。

```bash
vectahub history
vectahub detail <executionId>
```

预期: 能看到执行摘要和单次执行详情。

## 9. 重新执行历史任务

场景: 上一次任务配置正确，希望再次运行。

```bash
vectahub rerun <executionId>
```

预期: 基于历史执行记录重新运行。

## 10. 恢复失败任务

场景: 某个工作流中途失败，希望从失败点继续。

```bash
vectahub resume <executionId>
```

预期: 尝试从已有执行记录恢复。能否恢复取决于失败记录和工作流结构。

## 11. 检查命令风险

场景: 执行文件删除、发布、Docker 等命令前先审计。

```bash
vectahub security test "rm -rf dist"
vectahub security test "git status"
```

预期: 显示风险等级和命中的安全规则。

## 12. 切换执行模式

场景: 在 CI 或插件调用场景中使用更保守模式。

```bash
vectahub mode strict
vectahub run --mode strict "查看当前目录"
```

预期: 后续或单次执行使用指定模式。

## 13. 管理安全规则

场景: 查看、启用、禁用或导入导出规则。

```bash
vectahub security list
vectahub security export rules.json
vectahub security import rules.json
```

预期: 安全规则可被查看和迁移。

## 14. 查看工具能力

场景: 确认 VectaHub 识别了哪些外部 CLI。

```bash
vectahub tools list
vectahub tools info git
vectahub tools commands npm
```

预期: 显示工具、工具详情和已知命令。

## 15. 搜索工具或命令

场景: 不确定某个能力属于哪个工具。

```bash
vectahub tools search git
vectahub tools categories
```

预期: 能按关键词或分类找到工具。

## 16. 查看审计日志

场景: 追踪 CLI 操作、安全事件或执行行为。

```bash
vectahub audit list --limit 20
vectahub audit stats
```

预期: 显示近期审计日志和统计信息。

## 17. 生成工作流草稿

场景: 用 LLM 生成一个可编辑的 YAML 文件。

```bash
vectahub generate "检查 git 状态，然后运行测试" -o check.yaml
```

预期: 生成工作流文件。LLM 未配置时该能力可能不可用或效果有限。

## 18. 启动服务模式

场景: 需要通过本地服务提交任务。

```bash
vectahub serve
vectahub client submit "查看 git 状态"
```

预期: 服务启动后，客户端可以提交任务。

## 19. 管理定时任务

场景: 添加、查看、删除本地计划任务。

```bash
vectahub schedule add -n check -c "* * * * *" -e "npm test"
vectahub schedule list
```

预期: 定时任务记录被创建并可列出。

## 20. 导出本地数据

场景: 备份工作流、执行记录、配置或会话数据。

```bash
vectahub export -o backup
vectahub import backup --dry-run
```

预期: 导出数据，导入前可先 dry-run 查看影响。

## 使用建议

- 对有副作用的任务先使用 `--dry-run`。
- 对高风险命令先使用 `security test`。
- 对自动化场景使用 `--non-interactive`。
- 不要把 VS Code 插件路径当成 1.0 CLI 的主要验证路径。
