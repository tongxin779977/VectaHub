# VectaHub 快速开始

> 新手必读，3分钟上手 VectaHub！

---

## ⚡ 3分钟快速上手

### 第一步：检查环境（30秒）

```bash
# 确保 Node.js 版本是 21+
node -v

# 运行系统诊断
vectahub doctor
```

### 第二步：尝试第一条命令（1分钟）

```bash
# 用自然语言执行一个简单命令
vectahub run "查看当前目录"
```

看到结果了？恭喜你，已经可以使用 VectaHub 了！

### 第三步：尝试更多功能（1.5分钟）

```bash
# 查看可用工具
vectahub tools list

# 尝试另一个命令
vectahub run "查看 git 状态"
```

---

## 🎯 常用模式

### 模式一：自然语言执行（推荐新手）

**适用场景**：日常小任务，不想写代码

```bash
# 文件操作
vectahub run "列出当前目录所有文件"
vectahub run "查找昨天修改的文件"

# Git 操作
vectahub run "查看 git 状态"
vectahub run "提交所有更改，消息是'更新'"

# 项目操作
vectahub run "跑测试"
vectahub run "构建项目"
```

### 模式二：YAML 工作流（推荐高级用户）

**适用场景**：复杂任务，需要复用

创建 `daily-check.yaml`：

```yaml
name: 每日检查
steps:
  - id: step1
    type: exec
    cli: git
    args: ["status"]
  - id: step2
    type: exec
    cli: npm
    args: ["test"]
mode: relaxed
```

然后运行：

```bash
vectahub run -f daily-check.yaml
```

### 模式三：使用模板

**适用场景**：常用任务，快速启动

```bash
# 查看可用模板
vectahub templates list

# 使用模板
vectahub templates use git-commit
```

---

## ⚙️ 首次配置（可选）

### 配置 LLM（增强自然语言理解）

```bash
vectahub setup
```

按照向导配置 OpenAI、Anthropic 或 Ollama。

| 提供商 | 配置 |
|--------|------|
| OpenAI | 需要 API Key |
| Anthropic | 需要 API Key |
| Ollama | 本地运行，不需要 Key |

### 不配置 LLM 能用吗？

**能！** VectaHub 会降级使用关键词匹配模式，依然可以处理常见任务。

---

## 🔒 安全说明

### 执行模式

VectaHub 有三种执行模式：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `relaxed` | 宽松模式，低风险命令自动执行 | 日常使用，信任的项目 |
| `strict` | 严格模式，所有命令需要确认 | 公共机器，安全第一 |
| `consensus` | 协商模式，需要人工确认 | 关键操作 |

### 查看/切换模式

```bash
# 查看当前模式
vectahub mode

# 切换模式
vectahub mode strict
```

### 测试命令安全性

```bash
# 测试某个命令是否安全
vectahub security test "git status"
```

---

## 💡 最佳实践

### 1. 先用 --dry-run 预览

不确定命令会做什么？先用预览模式：

```bash
vectahub run --dry-run "删除缓存"
```

### 2. 保存常用工作流

使用 `-s` 选项保存工作流：

```bash
vectahub run -s "压缩图片并备份"
```

以后可以直接用 `vectahub list` 查看和复用。

### 3. 查看执行历史

```bash
# 查看执行记录
vectahub audit list

# 查看统计
vectahub audit stats
```

---

## 🔧 故障排除

### 问题：`command not found: vectahub`

**解决方案**：确保 `npm install -g vectahub` 成功，检查 Node.js 全局 bin 目录是否在 PATH 中。

### 问题：自然语言理解不准确

**解决方案**：
1. 配置 LLM (`vectahub setup`)
2. 尝试更明确的描述，例如 `"列出当前目录所有 .ts 文件"` 而不是 `"看看文件"`

### 问题：安全策略阻止了命令

**解决方案**：
1. 使用 `--dry-run` 确认命令
2. 用 `vectahub security test` 提前检查
3. 切换到 `relaxed` 模式（如果信任环境）

---

## 📚 下一步

- 查看 [用户场景](./guides/user-scenarios.md) - 20个真实使用场景
- 查看 [CLI 命令](./guides/cli-commands.md) - 完整命令参考
- 查看 [常见问题](./faq.md) - 更多问题解答
