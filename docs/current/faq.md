# VectaHub 1.0 常见问题

## VectaHub 1.0 是什么？

VectaHub 1.0 是本地 TypeScript CLI 项目，用于把自然语言或 YAML/JSON 工作流转换为可执行开发任务。它适合处理 Git、npm、文件检查、安全审计、执行历史等本地自动化场景。

## 需要 LLM 才能使用吗？

不一定。常见意图可以通过规则和关键词 fallback 处理。配置 LLM 后，复杂自然语言生成和 `generate` 命令会更有用。

配置入口:

```bash
vectahub setup
```

## 支持哪些系统？

文档和当前设计主要面向 macOS 与 Linux。Windows 不作为 1.0 的主要验证目标。

## 支持哪些 Node.js 版本？

根目录 `package.json` 要求 Node.js `>=21.0.0`。建议使用 Node.js 22 或更新版本。

## dry-run 会执行命令吗？

`vectahub run --dry-run` 的语义是预览，不执行生成的命令。它适合在运行高风险命令前确认真实命令。

示例:

```bash
vectahub run --dry-run "删除缓存"
```

## `--json` 是否所有命令都支持？

不是。1.0 中只有部分命令暴露 `--json`，例如 `version`、`run`、`tools list`、`security test`。不要把所有 CLI 输出都当成稳定 JSON 协议。

需要稳定 JSON 协议时，应优先使用已经明确支持 `--json` 的命令，并在自动化中处理失败退出码。

## 执行模式有什么区别？

| 模式 | 说明 |
|------|------|
| `strict` | 更保守，适合插件调用、CI 或不确定命令 |
| `relaxed` | 默认模式，适合可信本地项目 |
| `consensus` | 高风险命令需要确认 |

查看或切换:

```bash
vectahub mode
vectahub mode strict
```

## 如何先检查命令安全？

使用:

```bash
vectahub security test "git status"
vectahub security test "rm -rf dist"
```

也可以查看规则:

```bash
vectahub security list
vectahub security policy
```

## 如何执行 YAML 工作流？

```bash
vectahub run -f workflow.yaml
```

预览:

```bash
vectahub run -f workflow.yaml --dry-run
```

## 如何保存和查看工作流？

执行自然语言任务时加 `-s`:

```bash
vectahub run -s "检查 git 状态并运行测试"
```

查看保存的工作流:

```bash
vectahub list
```

## 如何查看执行历史？

```bash
vectahub history
vectahub detail <executionId>
```

审计日志:

```bash
vectahub audit list
vectahub audit stats
```

## 如何重新执行或恢复任务？

```bash
vectahub rerun <executionId>
vectahub resume <executionId>
```

这些命令依赖已有执行记录。实际可恢复范围取决于记录内容和失败点。

## 如何生成工作流？

配置 LLM 后使用:

```bash
vectahub generate "检查 git 状态，然后运行测试" -o check.yaml
```

保存到工作流库:

```bash
vectahub generate "检查 git 状态，然后运行测试" -s
```

## 如何查看外部 CLI 工具？

```bash
vectahub config tools
vectahub tools list
vectahub tools known
```

注册已知工具:

```bash
vectahub tools register git
```

## 如何启动服务模式？

```bash
vectahub serve
```

通过客户端提交任务:

```bash
vectahub client submit "查看 git 状态"
vectahub client list
```

服务模式属于高级能力，排障时优先确认普通 `vectahub run` 路径可用。

## VS Code 插件是否属于 1.0 核心路径？

不是。仓库中已有 VS Code 扩展包，但当前 1.0 用户文档以 CLI 为主。扩展包有独立的编译、lint 和集成测试路径。

## 为什么文档不再声明全部测试通过？

因为当前本地验证中存在类型检查失败点。文档只描述当前功能和用法，不把未验证通过的状态写成发布承诺。

发布前应重新执行:

```bash
npm run typecheck
npm run test:run
npm run build
```

## 相关文档

- [快速开始](./getting-started.md)
- [CLI 命令参考](./cli-commands.md)
- [用户场景](./user-scenarios.md)
- [已知问题](./BUGS.md)
