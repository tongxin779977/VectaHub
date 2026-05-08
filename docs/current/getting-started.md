# VectaHub 1.0 快速开始

> 适用版本: VectaHub 1.0.0
> 技术栈: TypeScript + Node.js + Commander.js + Vitest
> 运行要求: Node.js 21+

VectaHub 1.0 是一个本地 CLI 工具，用自然语言或 YAML 工作流生成并执行开发任务。它的核心能力是:

- 用自然语言生成可执行工作流。
- 从 YAML/JSON 文件执行工作流。
- 预览命令，不实际执行。
- 记录执行历史和审计日志。
- 管理安全规则、外部 CLI 工具和本地配置。

## 安装与检查

如果已经全局安装:

```bash
vectahub version
vectahub doctor
```

如果在源码仓库内开发:

```bash
npm install
npm run build
node dist/cli.js version
node dist/cli.js doctor
```

当前仓库的包版本以根目录 `package.json` 为准。

## 第一个任务

先用 dry-run 预览:

```bash
vectahub run --dry-run "查看 git 状态"
```

确认生成的命令符合预期后再执行:

```bash
vectahub run "查看 git 状态"
```

如果希望跳过确认和编辑:

```bash
vectahub run -y --no-edit "查看 git 状态"
```

## 使用 YAML 工作流

创建 `daily-check.yaml`:

```yaml
name: daily-check
mode: relaxed
steps:
  - id: git_status
    type: exec
    cli: git
    args: ["status"]
  - id: test
    type: exec
    cli: npm
    args: ["test"]
```

执行:

```bash
vectahub run -f daily-check.yaml
```

只预览:

```bash
vectahub run -f daily-check.yaml --dry-run
```

## 执行模式

VectaHub 1.0 暴露三种执行模式:

| 模式 | 用途 |
|------|------|
| `strict` | 更保守，适合不确定命令或插件调用场景 |
| `relaxed` | 默认模式，适合可信本地项目 |
| `consensus` | 高风险场景下要求人工确认 |

查看或切换模式:

```bash
vectahub mode
vectahub mode strict
```

单次执行指定模式:

```bash
vectahub run --mode strict "查看当前目录"
```

如果在 VS Code 扩展中使用该模式，应以扩展包的当前测试结果为准。

## 配置

首次配置或重新扫描环境:

```bash
vectahub setup
```

查看配置:

```bash
vectahub config show
vectahub config tools
```

重置配置:

```bash
vectahub config reset
```

## 安全检查

执行不确定命令前，可以先测试安全等级:

```bash
vectahub security test "git status"
vectahub security test "rm -rf dist"
```

查看当前安全策略:

```bash
vectahub security status
vectahub security policy
vectahub security list
```

## 历史和审计

查看执行历史:

```bash
vectahub history
vectahub detail <executionId>
```

查看审计日志:

```bash
vectahub audit list
vectahub audit stats
```

## 生成工作流

配置 LLM 后，可以用自然语言生成 YAML 工作流:

```bash
vectahub generate "检查 git 状态，然后运行测试" -o check.yaml
```

生成后保存:

```bash
vectahub generate "检查 git 状态，然后运行测试" -s
```

生成后立即执行:

```bash
vectahub generate "检查 git 状态，然后运行测试" -e
```

## 常用排障

`command not found: vectahub`:

- 确认已经安装 CLI。
- 确认 Node.js 全局 bin 目录在 `PATH` 中。
- 在源码仓库内可先用 `node dist/cli.js` 验证构建产物。

自然语言识别不准:

- 先使用更明确的描述，例如 `查看 git 状态`。
- 使用 `--dry-run` 检查生成结果。
- 配置 LLM 后再尝试复杂任务。

命令被安全策略阻止:

- 用 `vectahub security test "<command>"` 查看命中规则。
- 对可信项目可切换到 `relaxed`。
- 对高风险命令不要使用 `-y` 跳过确认。

## 下一步

- 查看 [CLI 命令参考](./cli-commands.md)
- 查看 [用户场景](./user-scenarios.md)
- 查看 [常见问题](./faq.md)
- 查看 [已知问题](./BUGS.md)
