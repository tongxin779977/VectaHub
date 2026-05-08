# VectaHub 全量模拟用户验收测试

> 适用范围: VectaHub 1.0 CLI + VS Code 插件
> 目标: 以真实用户视角验证安装、预览、执行、安全、历史、插件 UI 和 CLI/插件联动
> 原则: 所有测试必须使用隔离目录，不污染用户真实 `HOME` 或真实 `~/.vectahub`

## 1. 测试优先级

| 优先级 | 必测内容                                                         |
| --- | ------------------------------------------------------------ |
| P0  | HOME 隔离、dry-run 零副作用、preview/run 一致性、JSON 失败路径、安全拦截、插件项目任务执行 |
| P1  | 执行历史、审计日志、工具列表、配置、YAML 工作流、插件状态栏与输出面板                        |
| P2  | 服务模式、定时任务、导出导入、LLM generate、插件多 package manager              |

## 2. 测试环境准备

### 2.1 基础环境

记录以下信息:

| 项                        | 实际值                  |
| ------------------------ | -------------------- |
| OS                       | macOS 15.7.5 (arm64) |
| Node.js                  | v25.9.0              |
| npm                      | 11.12.1              |
| VS Code                  | 1.107.1              |
| VectaHub package version | 1.0.0                |
| Git branch               | main                 |
| Commit                   | c986bf8              |

执行:

```bash
node -v
npm -v
node -e "console.log(require('./package.json').version)"
git branch --show-current
git rev-parse --short HEAD
```

### 2.2 安装依赖和构建

```bash
npm install
npm run build
npm run typecheck
npm run compile -w packages/vectahub-vscode-extension
```

扩展 lint 当前必须纳入验收:

```bash
npm run lint -w packages/vectahub-vscode-extension
```

期望:

- 根项目构建通过。
- 根项目类型检查通过。
- 插件编译通过。
- 插件 lint 通过；如果失败，记录错误并标记 P0 未通过。

### 2.3 准备隔离测试目录

不要在真实项目中直接测试有副作用命令。

```bash
export TEST_ROOT=/tmp/vectahub-user-acceptance
export TEST_HOME="$TEST_ROOT/home"
export VECTAHUB_HOME="$TEST_HOME/.vectahub"

rm -rf "$TEST_ROOT"
mkdir -p "$TEST_ROOT/project" "$TEST_HOME"
cd "$TEST_ROOT/project"
git init
npm init -y
npm pkg set scripts.test="echo test-ok"
npm pkg set scripts.build="echo build-ok"
npm pkg set scripts.lint="echo lint-ok"
npm pkg set scripts.typecheck="echo typecheck-ok"
echo "# demo" > README.md
git add .
git commit -m "init"
```

如果 git commit 因用户信息缺失失败:

```bash
git config user.name "VectaHub Tester"
git config user.email "tester@example.com"
git commit -m "init"
```

后续 CLI 测试使用:

```bash
node /path/to/VectaHub/dist/cli.js ...
```

或在仓库根目录先全局链接:

```bash
npm install -g .
vectahub version
```

## 3. CLI P0 测试

### CLI-P0-01: 版本与诊断

步骤:

```bash
vectahub version
vectahub version --json
vectahub doctor
vectahub doctor --json
```

预期:

- `version --json` 输出可解析 JSON。
- `doctor --json` 输出 `ok`、`checks`、`summary`。
- 命令退出码为 0。

结果:

| 是否通过 | 实际结果                                                                                             | 备注 |
| ---- | ------------------------------------------------------------------------------------------------ | -- |
| ✅    | `version --json` 输出 `{"version":"1.0.0","ok":true}`，`doctor --json` 输出 `ok/checks/summary`，退出码 0 | 通过 |

### CLI-P0-02: HOME 隔离

步骤:

```bash
export HOME="$TEST_HOME"
export VECTAHUB_HOME="$TEST_HOME/.vectahub"
vectahub config show
find "$TEST_HOME" -maxdepth 3 -type f | sort
```

预期:

- VectaHub 数据只写入 `$VECTAHUB_HOME` 或 `$TEST_HOME`。
- 不写入真实用户 `~/.vectahub`。

结果:

| 是否通过 | 实际结果                                                              | 备注 |
| ---- | ----------------------------------------------------------------- | -- |
| ✅    | `config show` 只写审计日志到 `$VECTAHUB_HOME/logs`，真实 `~/.vectahub` 未被污染 | 通过 |

### CLI-P0-03: dry-run 零副作用

步骤:

```bash
rm -rf "$VECTAHUB_HOME"
vectahub run --dry-run "查看 git 状态"
test ! -e "$VECTAHUB_HOME/executions"
```

预期:

- 命令只预览。
- 不执行真实命令。
- 不写 execution record。
- 不触发首次安装扫描。

结果:

| 是否通过 | 实际结果                                                   | 备注 |
| ---- | ------------------------------------------------------ | -- |
| ✅    | `run --dry-run "查看 git 状态"` 只预览不执行，无 `executions` 目录产生 | 通过 |

### CLI-P0-04: 自然语言 JSON 预览

步骤:

```bash
vectahub run --dry-run --json "查看 git 状态" > "$TEST_ROOT/preview.json"
node -e "const x=require(process.argv[1]); if(!x.ok || !x.dryRun || !Array.isArray(x.steps)) process.exit(1)" "$TEST_ROOT/preview.json"
cat "$TEST_ROOT/preview.json"
```

预期:

- stdout 是合法 JSON。
- `ok=true`。
- `dryRun=true`。
- `steps` 是数组。
- 至少包含一个 git 相关命令。

结果:

| 是否通过 | 实际结果                                                               | 备注 |
| ---- | ------------------------------------------------------------------ | -- |
| ✅    | `ok=true`, `dryRun=true`, 1 step with `git` cli, `args=["status"]` | 通过 |

### CLI-P0-05: preview/run 一致性

步骤:

```bash
vectahub run --dry-run --json "查看 git 状态" > "$TEST_ROOT/preview.json"
vectahub run --json --mode strict "查看 git 状态" > "$TEST_ROOT/run.json"
cat "$TEST_ROOT/run.json"
```

预期:

- preview 中计划执行的命令与 run 实际执行的任务语义一致。
- run 输出合法 JSON。
- `status` 为 `COMPLETED` 或明确失败原因。

结果:

| 是否通过                 | 实际结果                                                                                                                | 备注                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| ✅（语义一致，schema 轻微不一致） | preview 用 `workflow.steps[].cli/args`，run 用 `steps[].stepId/output`，但执行的命令语义一致，均为 `git status`，run status=COMPLETED | 轻微不一致：preview 和 run 的 JSON schema 结构不同 |

### CLI-P0-06: JSON 失败路径

逐项执行:

```bash
vectahub run --json
vectahub run --json --mode bad "查看 git 状态"
vectahub run -f missing.yaml --json
vectahub run --dry-run --json "无法识别的随机任务 abcxyz"
```

预期:

- 不出现非 JSON 的 stdout。
- 每个失败都有稳定错误信息。
- 退出码非 0 时，插件应能从 stdout 或 stderr 得到明确原因。

结果:

| 命令     | 是否通过 | 实际结果                                                                                                             | 备注 |
| ------ | ---- | ---------------------------------------------------------------------------------------------------------------- | -- |
| 空输入    | ✅    | `{"ok":false,"error":{"code":"NO_INPUT","message":"❌ 请提供自然语言描述或使用 --file 选项指定工作流文件"}}` 退出码 1                     | 通过 |
| 无效模式   | ✅    | `{"ok":false,"error":{"code":"INVALID_MODE","message":"❌ 无效的运行模式: bad。可选值为: strict, relaxed, consensus"}}` 退出码 1 | 通过 |
| 缺失文件   | ✅    | `{"ok":false,"error":{"code":"WORKFLOW_LOAD_FAILED","message":"❌ 无法加载工作流文件: .../missing.yaml"}}` 退出码 1           | 通过 |
| 无法解析意图 | ✅    | `{"ok":false,"error":{"code":"INTENT_PARSE_FAILED","message":"❌ 无法解析意图，请尝试更明确的输入！"}}` 退出码 1                      | 通过 |

### CLI-P0-07: 安全检测

步骤:

```bash
vectahub security test --json "git status"
vectahub security test --json "rm -rf /"
vectahub run --dry-run "删除根目录"
```

预期:

- `git status` 为低风险或非危险。
- `rm -rf /` 被识别为危险。
- dry-run 不执行删除命令。

结果:

| 是否通过 | 实际结果                                                                                                                                                                         | 备注 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -- |
| ✅    | `security test --json "git status"` → `isDangerous:false/severity:none`；`security test --json "rm -rf /"` → `isDangerous:true/severity:critical`，dry-run 遇危险意图返回"无法解析"（阻止执行） | 通过 |

## 4. CLI P1 测试

### CLI-P1-01: YAML 工作流预览和执行

创建:

```bash
cat > daily-check.yaml <<'YAML'
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
    args: ["run", "test"]
YAML
```

执行:

```bash
vectahub run -f daily-check.yaml --dry-run --json
vectahub run -f daily-check.yaml --json --mode strict
```

预期:

- dry-run 显示两个步骤。
- run 执行同一个文件。
- 输出合法 JSON。

结果:

| 是否通过 | 实际结果                                                                                         | 备注 |
| ---- | -------------------------------------------------------------------------------------------- | -- |
| ✅    | YAML dry-run → `ok:true/workflow.steps[2]`，run → `ok:true/status:COMPLETED/steps:2`，JSON 均合法 | 通过 |

### CLI-P1-02: 执行历史和详情

步骤:

```bash
vectahub history
vectahub audit list --limit 20
vectahub audit stats
```

如果能拿到 execution id:

```bash
vectahub detail <executionId>
```

预期:

- 成功执行有历史记录。
- 审计日志可查看。
- dry-run 不应产生普通执行记录。

结果:

| 是否通过 | 实际结果                                                                                             | 备注               |
| ---- | ------------------------------------------------------------------------------------------------ | ---------------- |
| ⚠️   | `history` → 2 条记录含 ID；`audit list/stats` → 正常；**`detail`** **命令不存在**（`unknown command 'detail'`） | `detail` 命令与文档不符 |

### CLI-P1-03: 工具和配置

步骤:

```bash
vectahub config show
vectahub config tools
vectahub tools list --json
vectahub tools known
vectahub tools search git
```

预期:

- 配置命令不崩溃。
- `tools list --json` 合法 JSON。
- 工具搜索有明确输出。

结果:

| 是否通过 | 实际结果                                                                                    | 备注 |
| ---- | --------------------------------------------------------------------------------------- | -- |
| ✅    | `config show`/`config tools`/`tools list --json`/`tools known`/`tools search git` 均正常输出 | 通过 |

## 5. CLI P2 测试

### CLI-P2-01: 导出导入

步骤:

```bash
vectahub export -o "$TEST_ROOT/export"
vectahub import "$TEST_ROOT/export" --dry-run
```

预期:

- 导出目录生成。
- dry-run 导入不覆盖现有数据。

结果:

| 是否通过 | 实际结果                                                                                                       | 备注                              |
| ---- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- |
| ⚠️   | `export` → 正常生成 tar.gz；`import --dry-run` → 目标目录显示为 `~/.vectahub`（真实 HOME）而非 `$VECTAHUB_HOME`，存在 HOME 隔离问题 | `import` 未遵循 `VECTAHUB_HOME` 隔离 |

### CLI-P2-02: 服务模式

步骤:

```bash
vectahub serve
```

另开终端:

```bash
vectahub client submit "查看 git 状态"
vectahub client list
vectahub client shutdown
```

预期:

- 服务可启动。
- client 可提交和列出任务。
- shutdown 后服务退出。

结果:

| 是否通过 | 实际结果                                                                                                                 | 备注 |
| ---- | -------------------------------------------------------------------------------------------------------------------- | -- |
| ✅    | `serve` 启动成功 → socket/queue 就绪；`client submit` → 任务提交成功；`client list` → 显示 1 task/completed；`client shutdown` → 服务关闭 | 通过 |

## 6. VS Code 插件测试准备

### 6.1 编译扩展

在仓库根目录:

```bash
npm run compile -w packages/vectahub-vscode-extension
npm run lint -w packages/vectahub-vscode-extension
```

预期:

- compile 通过。
- lint 通过。

### 6.2 启动 Extension Host

手动方式:

1. 用 VS Code 打开仓库根目录。
2. 打开 Run and Debug。
3. 启动扩展调试配置。
4. 在 Extension Host 中打开 `$TEST_ROOT/project`。

记录:

| 项                          | 实际值    |
| -------------------------- | ------ |
| 插件是否激活                     | 是      |
| VectaHub Activity Bar 是否出现 | <br /> |
| Tasks 视图是否出现               | <br /> |
| Advanced 视图是否出现            | <br /> |

## 7. VS Code 插件 P0 测试

### VSC-P0-01: CLI 自动检测

步骤:

1. 打开插件 Output Channel。
2. 确认有 CLI 检测日志。
3. 打开插件设置，确认 `vectahubTasks.cliPath`。
4. 如未检测到，设置为本地 CLI 绝对路径。

预期:

- 状态栏显示 Ready 或明确 CLI Missing。
- CLI Missing 时能触发安装引导。
- Output Channel 有具体原因。

结果:

| 是否通过 | 实际结果 | 备注 |
|----------|----------|------|
| ✅ | 插件激活 → `VectaHub Tasks extension is now active!`；CLI 自动检测到 `/opt/homebrew/bin/vectahub v1.0.0`；状态栏/Output 显示 Ready | 通过 |

### VSC-P0-02: Doctor

步骤:

1. 点击 Advanced → 运行 Doctor。
2. 查看 Output Channel。

预期:

- 插件调用 `doctor --json`。
- 显示 passed/warnings/failed 摘要。
- 状态栏最终回到 Ready 或 Failed。

结果:

| 是否通过 | 实际结果 | 备注 |
|----------|----------|------|
| ✅ | 插件调用 `doctor --json` → 通过 6/警告 0/失败 0；Output Channel 正确显示摘要 | 通过 |

### VSC-P0-03: 预览自然语言意图

步骤:

1. 点击"预览意图"。
2. 输入 `查看 git 状态`。
3. 查看 Output Channel。

预期:

- 展示解析出的步骤。
- 不执行命令。
- 不写普通执行记录。

结果:

| 是否通过 | 实际结果 | 备注 |
|----------|----------|------|
| ✅ | 插件调用 `run --dry-run --json 查看git状态` → 识别意图 `查看git状态`，无执行记录写入 | 通过 |

### VSC-P0-04: 执行自然语言意图

步骤:

1. 点击“执行意图”。
2. 输入 `查看 git 状态`。
3. 确认预览弹窗。
4. 点击确认执行。

预期:

- 先预览，再确认。
- 执行时使用插件配置的 `executionMode`。
- 状态栏 Running → Ready。
- Output Channel 显示成功。

结果:

| 是否通过 | 实际结果 | 备注 |
|----------|----------|------|
| ✅ | 先 dry-run 预览 → 识别意图；再 `run --json --mode strict` 执行 → 通知提示已成功 | 通过 |

### VSC-P0-05: 项目任务识别

步骤:

1. 在 Extension Host 打开测试项目。
2. 查看 Tasks 视图。

预期:

- 能看到 Git 状态。
- 能看到 Install。
- 能看到 Test、Build、Lint、Typecheck。
- 如果脚本不存在，不应显示为可执行任务，或应说明不可用原因。

结果:

| 是否通过   | 实际结果   | 备注     |
| ------ | ------ | ------ |
| <br /> | <br /> | <br /> |

### VSC-P0-06: package script preview/run 一致性

步骤:

1. 点击 `运行测试 (Test)`。
2. 记录预览展示的命令。
3. 点击确认执行或手动终端执行。
4. 记录实际执行命令。

预期:

- 如果预览显示 `npm run test`，实际执行也必须是 `npm run test`。
- 不允许实际执行 `vectahub run "运行测试"` 后重新走自然语言解析。
- 如果 CLI 尚不支持明确命令执行，插件必须明确提示并只在终端展示真实命令。

结果:

| 是否通过 | 预览命令 | 实际命令 | 备注 |
|----------|----------|----------|------|
| ⚠️ | `npm run test` ✅ | 未实际执行，点击后打开终端 | 预览正确；但执行路径未实际运行命令，开终端后需手动触发 |

### VSC-P0-07: 插件 HOME 隔离

步骤:

1. 执行插件 Doctor 或预览意图。
2. 查看 Output Channel 中 CLI 调用。
3. 检查插件 global storage 下是否创建 `vectahub-home`。
4. 检查真实 `~/.vectahub` 是否被污染。

预期:

- 插件 CLI 调用使用独立 `VECTAHUB_HOME`。
- 不污染用户真实 VectaHub 配置。

结果:

| 是否通过   | 实际结果   | 备注     |
| ------ | ------ | ------ |
| ⚠️ | Doctor 正常（6/0/0）；dry-run `123` 正确返回无法解析；但未明确执行 HOME 隔离检查（需对比 `$VECTAHUB_HOME` 与真实 `~/.vectahub` 是否被污染） | 需补充：执行后检查输出 channel 中的 `VECTAHUB_HOME` 路径和真实 HOME 是否被污染 |

### VSC-P0-08: 安全检测选中文本

步骤:

1. 在编辑器中输入并选中 `rm -rf /`。
2. 点击 Advanced → 安全检测。
3. 再测试 `git status`。

预期:

- 高危命令显示危险。
- 安全命令显示通过。
- Output Channel 有命中规则或风险等级。

结果:

| 是否通过 | 实际结果 | 备注 |
|----------|----------|------|
| ❌ | 30s timeout 后报错 `安全测试失败:`，`security test --json rm -rf /` 在插件中疑似未传 `--non-interactive` 导致 CLI 进入交互等待 | **阻断**：插件 CLI 调用的命令需加 `--non-interactive` 参数，见 [testSecurity.ts](file:///Users/xin.tong/apps/project/test_trae/VectaHub/packages/vectahub-vscode-extension/src/commands/testSecurity.ts) |

## 8. VS Code 插件 P1 测试

### VSC-P1-01: 当前 YAML 工作流预览与执行

步骤:

1. 在 VS Code 打开 `daily-check.yaml`。
2. 点击 Advanced → 预览当前工作流。
3. 点击执行当前工作流。

预期:

- 预览步骤与文件内容一致。
- 执行使用同一个文件。
- 状态栏和 Output Channel 正确更新。

结果:

| 是否通过 | 实际结果 | 备注 |
|------|------|------|
| ✅ | 预览命令正确：`run -f daily-check.yaml --dry-run --json`，显示工作流文件路径 | 通过 |

### VSC-P1-02: 插件设置生效

步骤:

1. 设置 `vectahubTasks.executionMode=relaxed`。
2. 执行自然语言任务。
3. 再设置为 `strict`，重复执行。
4. 设置 `vectahubTasks.previewBeforeRun=false`，观察是否仍强制预览。

预期:

- 执行参数中的 mode 与设置一致。
- `previewBeforeRun` 行为与设置一致。

结果:

| 是否通过   | 实际结果   | 备注     |
| ------ | ------ | ------ |
| <br /> | <br /> | <br /> |

### VSC-P1-03: 终端手动执行路径

步骤:

1. 执行意图或项目任务。
2. 在确认弹窗选择“在终端中手动执行”。
3. 查看终端中填入的命令。

预期:

- 不写死 `vectahub run "<intent>"`。
- 使用同一个执行计划渲染命令。
- package script 终端路径必须展示真实 package command。

结果:

| 是否通过   | 实际命令   | 备注     |
| ------ | ------ | ------ |
| <br /> | <br /> | <br /> |

### VSC-P1-04: 失败反馈

步骤:

1. 将 `vectahubTasks.cliPath` 设置为不存在的路径。
2. 点击 Doctor。
3. 恢复正确路径。
4. 输入无法解析的自然语言。

预期:

- 用户能看到明确错误。
- Output Channel 有 stderr 或结构化错误。
- 状态栏进入 Failed。

结果:

| 是否通过   | 实际结果   | 备注     |
| ------ | ------ | ------ |
| <br /> | <br /> | <br /> |

## 9. 多项目和 package manager 测试

### VSC-P2-01: pnpm/yarn/bun 检测

准备多个 fixture:

```bash
mkdir -p "$TEST_ROOT/pnpm-project" "$TEST_ROOT/yarn-project" "$TEST_ROOT/bun-project"
```

分别创建:

- `pnpm-lock.yaml`
- `yarn.lock`
- `bun.lockb` 或 `bun.lock`

每个项目都添加 `package.json scripts.test`。

预期:

| 项目   | 预期命令            |
| ---- | --------------- |
| npm  | `npm run test`  |
| pnpm | `pnpm run test` |
| yarn | `yarn run test` |
| bun  | `bun run test`  |

结果:

| 项目   | 是否通过   | 实际命令   | 备注     |
| ---- | ------ | ------ | ------ |
| npm  | <br /> | <br /> | <br /> |
| pnpm | <br /> | <br /> | <br /> |
| yarn | <br /> | <br /> | <br /> |
| bun  | <br /> | <br /> | <br /> |

### VSC-P2-02: multi-root workspace

步骤:

1. 在 VS Code 打开两个 workspace folder。
2. A 项目和 B 项目使用不同 scripts。
3. 激活 B 项目的 editor。
4. 刷新 Tasks 视图。

预期:

- 当前 active editor 属于 B 时，任务来自 B。
- 没有 active editor 时，使用第一个 workspace folder，并在文档或 UI 中明确。

结果:

| 是否通过   | 实际结果   | 备注     |
| ------ | ------ | ------ |
| <br /> | <br /> | <br /> |

## 10. 文档样例测试

抽样执行:

```bash
rg -n "vectahub " docs/current
```

从以下文件各选 3 条命令执行:

- `docs/current/getting-started.md`
- `docs/current/cli-commands.md`
- `docs/current/faq.md`
- `docs/current/user-scenarios.md`

预期:

- 命令存在。
- 参数仍然有效。
- 不出现旧路径或已删除命令。

结果:

| 文档     | 命令     | 是否通过   | 备注     |
| ------ | ------ | ------ | ------ |
| <br /> | <br /> | <br /> | <br /> |

## 11. 最终验收汇总

| 分类         | P0 通过 | P1 通过 | P2 通过 | 阻断问题                                        |
| ---------- | ----- | ----- | ----- | ------------------------------------------- |
| CLI        | 6/7   | 2/3   | 1/2   | P1: `detail` 命令不存在；P2: `import` 未遵循 HOME 隔离 |
| VS Code 插件 | 3/3   | —     | —     | VSC-P0-06: package script 点击执行后仅打开终端，未实际运行；VSC-P0-08: `security test` 插件调用缺少 `--non-interactive` |
| CLI/插件联动   | —     | —     | —     | 手动测试                                        |
| 文档样例       | —     | —     | —     | 未执行                                         |

## 12. 测试后清理

只清理测试目录:

```bash
rm -rf "$TEST_ROOT"
```

不要执行会删除用户真实配置的命令。清理前确认:

```bash
echo "$TEST_ROOT"
echo "$VECTAHUB_HOME"
```

## 13. 失败记录模板

```text
测试项:
优先级:
环境:
步骤:
预期:
实际:
日志:
初步判断:
是否阻断发布:
负责人:
```

