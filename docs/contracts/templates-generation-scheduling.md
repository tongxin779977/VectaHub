# 生成、模板与调度规格

## 目标

本文档覆盖 workflow 生成、模板使用和调度。实现依据为 `src/commands/generate.ts`、`src/commands/templates.ts` 和 `src/commands/schedule.ts`。

## LLM 生成 Workflow

```bash
vectahub generate "<description>"
vectahub generate "<description>" --output <file>
vectahub generate "<description>" --save
vectahub generate "<description>" --execute
```

行为：

- 使用 LLM 生成 YAML workflow。
- 需要配置可用 LLM 环境变量，例如 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY` 或 Ollama 相关配置。
- 生成结果会写入本地 YAML 文件。
- `--save` 会保存到 workflow 库。
- 当前 `--execute` 只提示执行命令，并不在该命令中直接执行 workflow。

## 本地模板

```bash
vectahub templates list
vectahub templates list --category <category>
vectahub templates list --tag <tag>
vectahub templates use <name> --param key=value
vectahub templates use <name> --output <file>
vectahub templates use <name> --save
vectahub templates save <workflow-id>
```

模板目录优先级：

```text
VECTAHUB_TEMPLATES_DIR
> config.templates.directory
> package 内置 templates 目录
```

`templates use` 会实例化模板；`--save` 会保存为 workflow；`--output` 会写 YAML 文件。

## 模板市场

```bash
vectahub templates search [keyword]
vectahub templates install <name>
vectahub templates sources list
vectahub templates sources add <name> <url> --branch <branch> --path <path>
vectahub templates sources remove <id>
vectahub templates sources update [id]
```

模板源支持 Git/GitHub 风格仓库。添加、更新和安装模板可能访问远程仓库，执行前需要确认来源可信。

## 调度

```bash
vectahub schedule add --name <name> --cron <expr> --workflow-file <file>
vectahub schedule add --name <name> --cron <expr> --command <command> --args a,b
vectahub schedule remove --id <id>
vectahub schedule list
```

调度条目包含：

- `name`
- `cron`
- `workflowFile`
- `command`
- `args`
- `enabled`
- `lastRun`
- `lastStatus`
- `runCount`
- `lastError`

## 边界

- 生成命令依赖 LLM，不可用时必须失败并提示配置。
- 模板安装和模板源更新涉及外部来源，不能当作纯本地操作。
- 调度规格只记录调度条目管理；实际调度执行语义以 scheduler 实现为准。

## 相关文档

- [工作流生命周期规格](./workflow-lifecycle.md)
- [配置与数据存储规格](./config-data-storage.md)
