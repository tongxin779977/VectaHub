# VectaHub 常见问题（FAQ）

---

## 🚀 入门问题

### Q: VectaHub 是什么？

VectaHub 是一个用自然语言定义本地自动化工作流的工具，支持安全执行和工作流复用。

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

### Q: 如何检查是否安装成功？

```bash
vectahub doctor
```

---

## 💡 使用问题

### Q: 如何用自然语言执行任务？

```bash
vectahub run "你想要做什么"
```

例如：
- `vectahub run "查看当前目录"`
- `vectahub run "查看 git 状态"`
- `vectahub run "跑测试"`

### Q: 自然语言理解不准确怎么办？

1. **配置 LLM**：大语言模型理解能力更强
2. **描述更明确**：`"列出当前目录所有 .ts 文件"` 比 `"看看文件"` 更好
3. **使用 --dry-run**：先预览，确认没问题再执行

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
vectahub security test "你的命令"
```

### Q: 沙箱是什么？

沙箱是一个隔离的执行环境，即使命令有风险也不会影响系统。
- macOS 使用 `sandbox-exec`
- Linux 使用 `bubblewrap`

---

## 📚 功能问题

### Q: 支持哪些工具？

内置支持：
- git
- npm
- docker
- curl

以及 OpenCLI 适配器集成的 90+ 网站工具。

### Q: 如何查看可用工具？

```bash
vectahub tools list
```

### Q: 如何查看工具详情？

```bash
vectahub tools info git
```

### Q: 支持哪些工作流步骤类型？

- `exec`：执行本地命令
- `if`：条件判断
- `for_each`：循环
- `parallel`：并行执行
- `opencli`：网站适配器

### Q: 工作流可以暂停/恢复吗？

可以！执行中按暂停，之后可以从断点继续。

---

## 🔧 故障排除

### Q: `command not found: vectahub`

**解决方案**：
1. 确认 `npm install -g vectahub` 成功
2. 检查 Node.js 全局 bin 目录是否在 PATH 中
3. 尝试重新打开终端

### Q: 执行失败怎么办？

1. 先用 `--dry-run` 预览
2. 用 `vectahub doctor` 检查环境
3. 查看错误信息，确认是否是安全策略阻止

### Q: 自然语言理解不准确怎么办？

1. **配置 LLM**：大语言模型理解能力更强
2. **描述更明确**：`"列出当前目录所有 .ts 文件"` 比 `"看看文件"` 更好
3. **使用关键词**：直接用关键词，例如 `"git status"`

### Q: 如何查看执行历史？

```bash
# 查看列表
vectahub audit list

# 查看统计
vectahub audit stats
```

### Q: 如何重置配置？

```bash
vectahub config reset
```

---

## 📊 高级问题

### Q: 支持定时任务吗？

支持！可以用 `schedule` 子命令。

### Q: 支持并行执行吗？

支持！在 YAML 工作流中使用 `parallel` 步骤类型。

### Q: 工作流版本控制支持吗？

支持！可以保存多个版本并回滚。

---

## 🤝 社区与贡献

### Q: 如何报告 Bug？

请在 GitHub Issues 中报告，包含：
- 问题描述
- 复现步骤
- 错误信息
- 环境信息（OS/Node.js/VectaHub 版本）

### Q: 如何贡献代码？

欢迎 PR！请先看代码风格和测试要求。

---

## 📖 更多文档

- [快速开始](./getting-started.md) - 3分钟上手
- [用户场景](./guides/user-scenarios.md) - 20个真实使用场景
- [CLI 命令](./guides/cli-commands.md) - 完整命令参考
- [产品定位](./product/01_product_positioning.md) - 了解 VectaHub 适合谁
