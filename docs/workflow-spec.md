# Workflow 规格

本文面向编写 VectaHub workflow YAML/JSON 的用户。执行生命周期见 [工作流生命周期规格](./contracts/workflow-lifecycle.md)。

## 基本结构

一个 workflow 至少包含 `name` 和 `steps`。新写的 workflow 建议显式带上 `schemaVersion`，用于后续格式迁移和保存前校验：

```yaml
schemaVersion: "1.0"
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
| `schemaVersion` | 建议 | Workflow 文件格式版本。当前源码模型尚未强制要求该字段，但后续保存、读取、迁移和校验应以它作为入口。 |
| `id` | 否 | 工作流唯一标识。由引擎创建的 workflow 会生成 id；手写文件可以省略。 |
| `name` | 是 | 工作流名称。 |
| `mode` | 否 | 执行模式：`strict`、`relaxed`、`consensus`。 |
| `steps` | 是 | 步骤数组。 |

保存和执行历史见 [CLI 使用手册](./usage.md)。

## 版本与保存正确性

Workflow 版本要区分两件事：

- `schemaVersion` 表示文件格式版本，例如 `"1.0"`。
- workflow history version 表示某个 workflow 定义的历史快照版本。

当前代码里已经有 workflow 历史版本能力，但保存出来的 workflow 文件还没有强制内嵌 `schemaVersion`。后续应补齐的保存合同是：

1. 保存前先把 workflow 序列化成目标 YAML/JSON。
2. 立刻用同一套读取逻辑 parse 回来。
3. 校验 `schemaVersion`、顶层字段和 steps 结构。
4. 校验 step 类型、必填字段、依赖关系和静态可执行性。
5. 通过后才写入文件；可选再做落盘后回读。

这能保证保存文件“可解析、可回读、结构完整、静态上可执行”。外部命令是否存在、网络是否可用、权限是否满足、运行时变量是否完整，仍只能在执行期验证。

## 当前执行模型

当前 workflow engine 的主执行路径是：

```text
读取 workflow
-> 校验依赖关系
-> 拓扑排序
-> 按排序结果执行步骤
-> 写入 step output
-> 保存 execution record
```

这意味着当前主 engine 更接近“依赖感知的本地顺序执行器”，而不是大型分布式调度平台。

当前已经存在的能力：

- `dependsOn` 会参与依赖校验和拓扑排序。
- 前序步骤输出可以通过 `outputVar` 或步骤 id 传给后续步骤。
- `parallel` 可以并行执行自己 `body` 内的子步骤。
- execution record 会记录步骤状态、输出、错误和耗时信息。
- `resume` 可以从失败步骤重新执行后续步骤。

当前边界：

- `parallel` 是一个 step 类型，不等于整个 workflow 默认并行调度。
- 代码里有独立的依赖感知 parallel executor，但主 workflow engine 尚未统一到一个 DAG ready queue scheduler。
- `delegate` 是目标编排入口；是否能执行取决于运行路径是否注册了对应 handler。
- execution record 目前还没有绑定 workflow 定义 hash 或定义快照，因此旧执行恢复时需要防止 workflow 已经被修改。

后续推荐的目标合同见 [工作流引擎架构设计](./design/workflow-engine-architecture.md)。

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

把步骤委托给外部 Agent CLI。当前类型系统和 step 校验已经包含 `delegate`，但默认 executor 是否能直接执行它取决于是否注册了对应 handler。因此它应该被理解为“多 Agent CLI 编排的目标合同入口”，不能误写成所有 workflow 路径都已经完整支持。

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

目标执行路径：

```text
delegate step
-> Agent Registry
-> Runtime Catalog
-> Invocation Renderer
-> Runtime Bootstrap / Preflight
-> Agent CLI process
-> outputVar / artifact
```

当前边界：

- 当前源码已有 Agent registry 和 adapter 层。
- 当前默认 workflow executor 尚未把 `delegate` handler 作为完整内建执行路径。
- `custom` Agent CLI 应先按显式 descriptor 设计，不能写成当前已经支持任意自动注册。

Agent Runtime 设计见 [Agent CLI 注册与 Runtime 架构设计](./design/agent-cli-runtime-architecture.md)。

## 多 Agent CLI 编排合同

VectaHub 的长期工作流能力应该支持“一个小 CLI 调度多个更强的 Agent CLI”。推荐模型是：VectaHub 负责 workflow 合同、依赖、变量、artifact、trace、风险确认和恢复；外部 Agent CLI 负责各自擅长的具体工作。

一个典型链路：

1. 用 `opencli` 或某个 Agent CLI 收集信息。
2. 把输出写入 `outputVar` 或 artifact。
3. 下一个 Agent CLI 读取前一步结果并做整理、改写、实现或验证。
4. VectaHub 记录每一步状态、输出、错误和恢复信息。

目标形态示例：

```yaml
schemaVersion: "1.0"
name: research-then-write-docs
mode: relaxed
steps:
  - id: collect-info
    type: opencli
    site: project
    command: inspect
    args: ["chat", "workflow"]
    outputVar: research_summary

  - id: refine-doc
    type: delegate
    delegateTo: gemini
    dependsOn: [collect-info]
    delegatePrompt: "基于 ${research_summary} 整理成交互式 CLI 与 workflow 编排设计文档。"
    delegateOptions:
      outputFormat: text
    outputVar: refined_doc

  - id: implement-doc
    type: delegate
    delegateTo: codex
    dependsOn: [refine-doc]
    delegatePrompt: "把 ${refined_doc} 落到 docs 中，保持当前中文文档风格。"
    delegateOptions:
      maxTurns: 3
      outputFormat: text
```

当前应坚持的边界：

- 如果需要“现在就稳定执行”，优先使用已经接入 executor 的 `exec`、`opencli`、`if`、`for_each`、`parallel`。
- 如果使用 `delegate`，必须确认运行路径已经注册对应 handler。
- Agent CLI 的接入事实应来自 Agent registry，而不是在 workflow 里硬编码一堆不受控命令。
- 多 Agent 编排不等于 autonomous swarm；每一步仍必须有清晰输入、输出、依赖和失败语义。
- 每个 Agent CLI step 都应单独做 preflight、权限确认、timeout、trace 和失败分类。

## Artifact 与输出交接

小输出可以使用 `outputVar` 在步骤之间传递。大输出，尤其是研究材料、长文档、代码审查结果，应该落成 artifact，再传给后续步骤。

推荐合同：

```yaml
steps:
  - id: collect
    type: delegate
    delegateTo: codex
    delegatePrompt: "收集项目文档处理能力现状。"
    outputVar: research_summary
    artifacts:
      - name: research_doc
        path: artifacts/research.md

  - id: summarize
    type: delegate
    delegateTo: gemini
    dependsOn: [collect]
    delegatePrompt: "读取 artifacts/research.md，并生成面向用户的摘要。"
    inputArtifacts:
      - artifacts/research.md
```

当前源码的 `Step` 类型还没有把 `artifacts` / `inputArtifacts` 作为正式字段，因此这部分是目标合同，不应被写成当前已完整实现。落地时应把 artifact 目录、run id、读写权限、trace 链接和清理策略一起设计。

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
