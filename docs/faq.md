# VectaHub 常见问题（FAQ）

---

## 🚀 入门问题

### Q: VectaHub 是什么？

VectaHub 是一个 CLI 工具，将自然语言指令转换为可执行的本地自动化工作流。核心能力包括：

- **自然语言执行**：18 种意图类型 + 关键词匹配，无需配置 LLM 即可使用
- **Chat REPL**：交互式对话，多轮澄清后自动执行
- **YAML 工作流**：支持条件/循环/并行等复杂编排
- **AI 模块系统**：20 个功能模块 + 3 个 CLI 插件，工厂函数注册，零影响集成
- **安全沙箱**：危险命令检测 + sandbox-exec/bubblewrap 隔离执行

### Q: 需要编程基础吗？

不需要！普通用户可以完全用自然语言操作。只有要编写复杂 YAML 工作流时才需要一点基础。

### Q: 支持哪些操作系统？

目前支持 macOS 和 Linux。

---

## 🔧 安装与配置

### Q: 如何安装 VectaHub？

```bash
npm install -g vectahub
```

### Q: 需要配置 LLM 才能用吗？

**不需要！** VectaHub 支持关键词匹配模式，不配置 LLM 依然可以使用。但配置 LLM 后自然语言理解能力会更强。

### Q: 支持哪些 LLM 提供商？

- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Ollama (本地运行)

### Q: 如何配置 LLM？

```bash
vectahub setup
```

按照向导操作即可。

### Q: 配置 LLM 需要付费吗？

- OpenAI / Anthropic：需要，按量计费
- Ollama：免费，本地运行

### Q: 如何检查环境是否正常？

```bash
vectahub doctor
```

检查 Node.js、TypeScript、tsx、Vitest 及项目结构。加 `--verbose` 查看详情。

---

## 💡 使用问题

### Q: 如何用自然语言执行任务？

```bash
vectahub run "你想要做什么"
```

例如：

- `vectahub run "查看当前目录"` → 执行 `ls -la`
- `vectahub run "查看 git 状态"` → 执行 `git status`
- `vectahub run "跑测试"` → 执行 `npm test`
- `vectahub run "安装 lodash"` → 执行 `npm install lodash`

### Q: 如何使用 Chat REPL？

```bash
vectahub chat
```

进入交互式对话模式，可以多轮交流，系统会逐步澄清你的意图后自动执行。

```bash
# 指定会话名
vectahub chat --session myproject

# 禁用 LLM，纯关键词匹配
vectahub chat --no-llm
```

### Q: 自然语言理解不准确怎么办？

1. **描述更明确**：`"列出当前目录所有 .ts 文件"` 比 `"看看文件"` 更好
2. **使用关键词**：直接用命令关键词，例如 `"git status"`
3. **使用 --dry-run**：先预览，确认没问题再执行
4. **配置 LLM**：大语言模型理解能力更强

### Q: 如何预览不执行？

```bash
vectahub run --dry-run "你的命令"
```

### Q: 如何保存工作流？

```bash
# 执行时保存
vectahub run -s "压缩图片"

# 查看保存的工作流
vectahub list
```

### Q: 如何从文件运行工作流？

```bash
vectahub run -f workflow.yaml
```

### Q: 如何用 LLM 生成工作流？

```bash
vectahub generate "每天备份数据库"
```

生成的 YAML 可以查看、编辑后再执行：

```bash
# 生成并保存到文件
vectahub generate "部署到生产环境" -o deploy.yaml

# 生成后直接执行
vectahub generate "清理临时文件" -e
```

---

## 🔒 安全问题

### Q: VectaHub 安全吗？

是的！VectaHub 有多层安全机制：

1. **危险命令检测**：自动识别并阻止危险命令
2. **沙箱隔离**：在隔离环境中执行
3. **执行模式**：可以选择严格模式，每个命令都需要确认

### Q: 执行模式有什么区别？

| 模式 | 说明 |
|------|------|
| `relaxed` | 宽松模式，低风险命令自动执行 |
| `strict` | 严格模式，所有命令需要确认 |
| `consensus` | 协商模式，需要人工确认 |

### Q: 如何切换执行模式？

```bash
# 查看当前模式
vectahub mode

# 切换模式
vectahub mode strict
```

### Q: 如何测试命令是否安全？

```bash
vectahub security test "rm -rf /tmp/cache"
```

输出会显示该命令的危险等级和匹配的安全规则。

### Q: 沙箱是什么？

沙箱是一个隔离的执行环境，即使命令有风险也不会影响系统。

- macOS 使用 `sandbox-exec`
- Linux 使用 `bubblewrap`

---

## 📚 功能问题

### Q: 支持哪些外部工具？

内置支持：

- `git` — 版本控制
- `npm` — 包管理
- `docker` — 容器管理
- `curl` — HTTP 请求

以及 OpenCLI 适配器集成的 90+ 网站工具。

### Q: 如何查看可用工具？

```bash
# 列出所有已注册工具
vectahub tools list

# 搜索工具
vectahub tools search docker

# 查看工具详情
vectahub tools info git
```

### Q: 支持哪些工作流步骤类型？

| 步骤类型 | 说明 |
|---------|------|
| `exec` | 执行本地命令 |
| `if` | 条件判断 |
| `for_each` | 循环 |
| `parallel` | 并行执行 |
| `opencli` | 网站适配器 |
| `delegate` | 委托执行 |

### Q: 工作流可以暂停/恢复吗？

可以！执行中按暂停，之后可以从断点继续。

### Q: 支持定时任务吗？

支持！使用 `schedule` 命令：

```bash
# 添加定时任务
vectahub schedule add -n "daily-backup" -c "0 2 * * *" -e "vectahub run -f backup.yaml"

# 列出所有定时任务
vectahub schedule list

# 移除定时任务
vectahub schedule remove --id daily-backup
```

### Q: 支持并行执行吗？

支持！在 YAML 工作流中使用 `parallel` 步骤类型：

```yaml
steps:
  - type: parallel
    steps:
      - type: exec
        command: "npm test"
      - type: exec
        command: "npm run lint"
```

### Q: 工作流版本控制支持吗？

支持！可以保存多个版本并回滚：

```bash
# 查看工作流版本历史
vectahub list versions <workflowId>

# 回滚到指定版本
vectahub rollback <workflowId> <version>
```

### Q: 如何将工作流保存为模板？

```bash
# 将已有工作流保存为模板
vectahub templates save <workflowId> -n "deploy-template" -c "deployment"

# 查看可用模板
vectahub templates list

# 使用模板创建新工作流
vectahub templates use deploy-template -p env=production -o deploy.yaml
```

---

## 🔧 故障排除

### Q: `command not found: vectahub`

**解决方案**：

1. 确认 `npm install -g vectahub` 成功
2. 检查 Node.js 全局 bin 目录是否在 PATH 中
3. 尝试重新打开终端

### Q: 执行失败怎么办？

1. 先用 `--dry-run` 预览执行计划
2. 用 `vectahub doctor` 检查环境
3. 查看错误信息，确认是否是安全策略阻止
4. 用 `vectahub security test "你的命令"` 测试命令安全性

### Q: 如何查看执行历史？

```bash
# 查看最近执行记录
vectahub history

# 限制显示数量
vectahub history -l 20

# 按工作流筛选
vectahub history -w my-workflow

# 按状态筛选
vectahub history -s failed
```

### Q: 如何查看审计日志？

```bash
# 列出最近审计日志
vectahub audit list

# 查看统计信息
vectahub audit stats

# 按事件类型查询
vectahub audit query --event EXECUTION
```

### Q: 如何重置配置？

```bash
vectahub config reset
```

重置后会重新运行配置向导。

---

## 📊 高级问题

### Q: Client/Server 模式怎么用？

VectaHub 支持后台服务模式，通过 Unix Socket 通信：

```bash
# 启动服务
vectahub serve

# 守护进程模式
vectahub serve -d

# 提交任务
vectahub client submit "查看 git 状态"

# 查看任务状态
vectahub client status <task-id>

# 关闭服务
vectahub client shutdown
```

### Q: 如何管理 AI 守护进程？

```bash
vectahub daemon start
vectahub daemon status
vectahub daemon stop
```

### Q: 如何导出安全规则？

```bash
# 导出规则到 JSON
vectahub security export rules.json

# 从 JSON 导入规则
vectahub security import rules.json
```

---

## 🤝 社区与贡献

### Q: 如何报告 Bug？

请在 GitHub Issues 中报告，包含：

- 问题描述
- 复现步骤
- 错误信息
- 环境信息（OS / Node.js / VectaHub 版本）

### Q: 如何贡献代码？

欢迎 PR！请先看代码风格和测试要求。开发前运行 `vectahub verify` 确保通过。

---

## 📖 更多文档

- [快速开始](./getting-started.md) — 3 分钟上手
- [用户场景](./guides/user-scenarios.md) — 20 个真实使用场景
- [CLI 命令](./guides/cli-commands.md) — 完整命令参考
- [产品定位](./product/01_product_positioning.md) — 了解 VectaHub 适合谁
