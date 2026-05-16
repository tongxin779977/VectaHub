# Workflow 规格

本文面向编写 VectaHub workflow YAML/JSON 的用户。执行生命周期见 [工作流生命周期规格](./specs/workflow-lifecycle.md)。

## 基本结构

一个 workflow 至少包含 `name` 和 `steps`：

```yaml
name: check-project
mode: relaxed
steps:
  - id: status
    type: exec
    cli: git
    args: ["status"]
```

运行文件：

```bash
vectahub run --file ./check-project.yaml
```

## 顶层字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 工作流名称。 |
| `mode` | 否 | 执行模式：`strict`、`relaxed`、`consensus`。 |
| `steps` | 是 | 步骤数组。 |

保存和执行历史见 [CLI 使用手册](./usage.md)。

## 步骤通用字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 步骤唯一标识。 |
| `type` | 是 | 步骤类型。 |
| `dependsOn` | 否 | 依赖步骤 id 数组。 |
| `body` | 按类型 | 子步骤数组，供控制流步骤使用。 |

当前步骤类型包括：

```text
exec
for_each
if
parallel
opencli
delegate
```

## `exec`

执行本地 CLI 命令。

```yaml
steps:
  - id: test
    type: exec
    cli: npm
    args: ["test"]
```

要求：

- `cli` 必填。
- `args` 可选，建议始终写成字符串数组。
- 命令会经过 VectaHub 的安全扫描和执行模式约束。

## `for_each`

按行遍历 `items`，并为每个 item 执行 `body`。

```yaml
steps:
  - id: print-files
    type: for_each
    items: |
      README.md
      package.json
    body:
      - id: print-item
        type: exec
        cli: echo
        args: ["${item}"]
```

要求：

- `items` 必填。
- `body` 必填。
- 当前 item 可通过 `${item}` 引用。

## `if`

条件满足时执行 `body`。

```yaml
steps:
  - id: run-when-debug
    type: if
    condition: "debug == true"
    body:
      - id: print-debug
        type: exec
        cli: echo
        args: ["debug enabled"]
```

也可以引用前序步骤输出中的退出码：

```yaml
steps:
  - id: build
    type: exec
    cli: npm
    args: ["run", "build"]
  - id: after-build
    type: if
    condition: "${build.exitCode} == 0"
    body:
      - id: success
        type: exec
        cli: echo
        args: ["build ok"]
```

要求：

- `condition` 必填。
- `body` 可包含一个或多个子步骤。

## `parallel`

并行执行 `body` 中的子步骤。

```yaml
steps:
  - id: checks
    type: parallel
    body:
      - id: lint
        type: exec
        cli: npm
        args: ["run", "lint"]
      - id: typecheck
        type: exec
        cli: npm
        args: ["run", "typecheck"]
```

如果任一子步骤失败，parallel 步骤会失败。

## `opencli`

调用 OpenCLI 站点命令。

```yaml
steps:
  - id: opencli-list
    type: opencli
    site: example.com
    command: list-items
```

要求：

- `site` 必填。
- `command` 必填。

## `delegate`

把步骤委托给外部 Agent CLI。

```yaml
steps:
  - id: ask-agent
    type: delegate
    delegateTo: codex
    delegatePrompt: "Review the current project and summarize test gaps."
    delegateOptions:
      maxTurns: 3
      outputFormat: text
```

要求：

- `delegateTo` 必填，可用值包括 `gemini`、`claude`、`codex`、`aider`、`custom`。
- `delegatePrompt` 必填。
- Agent 配置边界见 [配置手册](./configuration.md)。

## 变量插值

步骤字段支持 `${name}` 形式的插值。常见来源包括：

- `vectahub run --variable key=value` 传入的变量。
- `for_each` 中的 `${item}`。
- 前序步骤输出中的字段。

示例：

```bash
vectahub run --file ./ci.yaml --variable packageManager=npm
```

```yaml
name: ci-check
steps:
  - id: test
    type: exec
    cli: "${packageManager}"
    args: ["test"]
```

## 完整示例

```yaml
name: project-check
mode: relaxed
steps:
  - id: status
    type: exec
    cli: git
    args: ["status", "--short"]

  - id: checks
    type: parallel
    body:
      - id: typecheck
        type: exec
        cli: npm
        args: ["run", "typecheck"]
      - id: test
        type: exec
        cli: npm
        args: ["run", "test:run"]

  - id: done
    type: exec
    cli: echo
    args: ["checks complete"]
```

先预览再执行：

```bash
vectahub run --file ./project-check.yaml --dry-run
vectahub run --file ./project-check.yaml
```

