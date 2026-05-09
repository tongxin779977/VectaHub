# VS Code 插件开发自动化路线图

> 版本: 1.0.0 | 最后更新: 2026-05-09
> 定位: VectaHub TypeScript 版本 VS Code 插件的开发自动化实施文档

---

## 0. 文档目标

本文档用于指导 `packages/vectahub-vscode-extension` 后续开发，目标是把插件从
“任务入口面板”升级为“开发自动化控制台”。

最终用户目标:

- 自动识别项目里的开发任务。
- 一键执行开发、检查、测试、构建等任务链。
- 自动拉取 GitHub Actions / CI 报错。
- 把失败项转成诊断队列任务。
- 一键批量处理诊断队列。
- 长任务可查看、可取消、可恢复认知，不要求用户一直守在终端旁边。

---

## 1. 强制开发边界

### 1.1 必须遵守

- 插件第一优先级是提高日常开发效率，不是堆满高级入口。
- 任务面板只展示高频、必要、当前项目真实存在的任务。
- 任何执行路径必须经过统一 CLI adapter，不得绕过 VectaHub CLI 直接执行自然语言生成的命令。
- 自然语言执行默认 `strict + preview first`。
- 危险命令、高风险修复、批量修复必须有确认或暂停机制。
- 自动化任务必须有状态: pending、running、completed、failed、cancelled 或 needs-confirmation。
- 长驻任务必须可停止，插件退出时必须清理子进程。
- 所有新增能力必须配套测试，不能只改 UI。
- 错误消息必须告诉用户失败点和下一步，不能只显示 unknown error。

### 1.2 禁止事项

- 禁止在插件里静默安装 CLI。
- 禁止默认使用 relaxed 模式执行普通任务。
- 禁止把所有 package scripts 无脑平铺到主面板。
- 禁止解析人类日志作为长期协议；需要结构化数据时必须推动 CLI JSON 输出。
- 禁止吞掉 CI、队列、子进程失败。
- 禁止用 setTimeout 伪造执行完成状态。
- 禁止只做按钮入口，不实现真实状态、错误处理和测试。
- 禁止长驻 dev server 按普通短任务处理。
- 禁止在自动修复失败后继续盲目重试。
- 禁止为了通过测试改弱测试断言。

### 1.3 Agent 实施硬性检查

每个阶段完成前，Agent 必须回答:

1. 改了哪些文件，为什么必须改这些文件。
2. 哪些功能是已实现，哪些只是保留入口。
3. 失败路径如何处理。
4. 用户是否能取消或停止长任务。
5. 是否新增或更新测试。
6. 是否执行了插件 compile / lint / test 中适用的命令。
7. 是否存在需要 CLI 侧补齐的 JSON 协议。

如果任一项无法满足，不能标记阶段完成。

---

## 2. 当前基础

当前插件已有能力:

- Activity Bar 容器和 Tasks / Advanced 两个视图。
- CLI 自动检测和 `doctor --json` 初始检查。
- package scripts、Git 状态、Doctor 的基础任务识别。
- 自然语言意图执行和 dry-run 预览入口。
- GitHub Actions 错误拉取入口。
- 诊断队列读取和一键处理入口。
- ProcessManager 用于插件退出时回收进程。

当前主要缺口:

- 开发任务识别不完整，缺少 dev、start、serve、preview、watch、format、coverage 等任务类型。
- `previewBeforeRun` 配置没有贯穿所有执行路径。
- 一键开发任务链尚未形成。
- dev server 这类长驻任务没有独立生命周期。
- CI 拉取、诊断队列、自动修复之间没有完整闭环。
- 队列状态、最近失败、运行摘要不够清晰。
- 很多能力只是入口，缺少验收级状态反馈和测试覆盖。

---

## 3. 总体阶段拆分

实施分为 7 个大阶段。每个大阶段都可以继续拆成多个小阶段独立交付。

| 阶段 | 名称 | 目标 |
| --- | --- | --- |
| M0 | 基线确认 | 明确 CLI / 插件当前可用能力和协议缺口 (✅ 已完成) |
| M1 | 任务识别增强 | 自动发现真实开发任务和质量检查任务 (✅ 已完成) |
| M2 | 任务面板重组 | 把侧边栏升级为高频开发控制台 |
| M3 | 一键任务链 | 支持一键检查全部和开发任务链 |
| M4 | 长驻任务管理 | 支持 dev server 启动、状态和停止 |
| M5 | CI 失败闭环 | 拉取 CI 错误并进入诊断队列 |
| M6 | 队列自动化 | 批量处理、取消、状态刷新和失败摘要 |
| M7 | 风险控制与体验收口 | 预览、确认、历史、通知和最终验证 |

---

## 4. M0 基线确认 (✅ 已完成)

### 4.1 目标

确认当前 VS Code 插件和 CLI 的真实能力，避免后续开发基于假设推进。

### 4.2 小阶段

#### M0.1 插件构建基线

验收结果:

- `npm run compile`: **Available** (成功编译)。
- `npm run lint`: **Failed**。由于项目根目录升级到 ESLint 9 但缺失 `eslint.config.js` 导致配置迁移错误。
  - **插件 fallback 策略**：暂时忽略根目录 lint 规则。
  - **修复计划**：安排在 **M1 阶段**（任务识别增强）开始前，全局修复 ESLint 9 配置迁移。
- `npm run test` (`vscode-test`): **Failed**。缺少或配置错误的执行二进制文件（新版已变更为 `@vscode/test-cli`）。
  - **插件 fallback 策略**：暂时依赖核心逻辑单元测试（vitest）。
  - **修复计划**：安排在 **M2 阶段**（任务面板重组）重写 UI 交互测试时，顺便升级和修复 extension 的 UI 测试套件。

#### M0.2 CLI JSON 协议基线

验收结果:

- `vectahub doctor --json`: **Available**。
- `vectahub run --dry-run --json <intent>`: **Available**。
- `vectahub run --json <intent>`: **Available**。
- `vectahub run-command --json -- <cli> <args...>`: **Available**。
- `vectahub tools list --json`: **Available**。
- `vectahub security test --json <command>`: **Failed/Partial**。执行卡死或触发 `EventEmitter memory leak` 警告，未能稳定输出 JSON。
  - **插件 fallback 策略**：插件暂时改用 `run-command --dry-run --json` 获取安全状态。
  - **修复计划**：这是 CLI 核心的安全检测 Bug，必须在 **M7 阶段**（风险控制与体验收口）完善安全预览机制之前彻底修复。

#### M0.3 自动化系统命令基线

验收结果:

- `sys:fetch-gh-actions-errors`: **Available** (正常输出包含 `gh run list` 和 JS 转换脚本的工作流)。
- `sys:process-diagnostic-queue`: **Available** (正常输出包含读取状态并 `for_each` 的工作流)。

### 4.3 涉及模块

- `packages/vectahub-vscode-extension/src/extension.ts`
- `packages/vectahub-vscode-extension/src/cli/adapter.ts`
- `packages/vectahub-vscode-extension/src/commands/fetchGhErrors.ts`
- `packages/vectahub-vscode-extension/src/commands/processAllQueue.ts`

### 4.4 完成标准

- ✅ 有真实验证结果。
- ✅ 有协议缺口列表。
- ✅ 后续阶段知道哪些能直接开发，哪些需要先补 CLI。

---

## 5. M1 任务识别增强 (✅ 已完成)

### 5.1 目标

任务面板自动识别项目中的日常开发任务，而不是只识别 test、build、lint、typecheck。

### 5.2 任务分类

#### 开发服务

识别脚本:

- `dev`
- `start`
- `serve`

展示建议:

- 启动开发服务
- 启动项目
- 启动服务

#### 预览和监听

识别脚本:

- `preview`
- `watch`
- `build:watch`
- `test:watch`

展示建议:

- 预览构建结果
- 监听构建
- 监听测试

#### 质量检查

识别脚本:

- `lint`
- `typecheck`
- `check`
- `validate`
- `format`
- `format:check`

展示建议:

- 代码检查
- 类型检查
- 项目检查
- 项目验证
- 格式化代码
- 检查格式

#### 测试和覆盖率

识别脚本:

- `test`
- `test:unit`
- `test:e2e`
- `coverage`

展示建议:

- 运行测试
- 单元测试
- E2E 测试
- 测试覆盖率

#### 构建和组件预览

识别脚本:

- `build`
- `storybook`

展示建议:

- 构建项目
- 启动 Storybook

### 5.3 小阶段

#### M1.1 扩展任务类型

改动:

- 扩展 `ProjectTask.kind`。
- 保留已有 kind 兼容性。

验收:

- TypeScript 类型不退化为 `string` 或 `any`。
- 现有测试不因类型变化失效。

#### M1.2 扩展 package scripts 识别规则

改动:

- 增加脚本名到任务 kind / label / description 的映射。
- 按实际 package manager 生成执行命令。

验收:

- npm、pnpm 项目均可识别。
- 没有脚本时不生成假任务。
- 同一脚本不重复展示。

#### M1.3 增加更多脚本入口

目标:

- 主面板只放高频脚本。
- 低频或未知脚本进入“更多 package scripts”。

验收:

- 不把所有脚本平铺到主面板。
- 用户仍能找到非标准脚本。

### 5.4 涉及模块

- `packages/vectahub-vscode-extension/src/project/taskModel.ts`
- `packages/vectahub-vscode-extension/src/project/packageScripts.ts`
- `packages/vectahub-vscode-extension/src/project/packageManager.ts`
- `packages/vectahub-vscode-extension/test/crossProject.logic.test.ts`

### 5.5 完成标准

- 能识别开发、质量、测试、构建、预览、监听类任务。
- 有覆盖 npm / pnpm fixture 的测试。
- 面板不会被低频脚本污染。

---

## 6. M2 任务面板重组

### 6.1 目标

把 Tasks 视图从“入口列表”改为“开发自动化控制台”。

### 6.2 目标结构

```text
一键开发
  启动开发服务
  运行开发任务链
  停止当前任务

质量检查
  运行测试
  代码检查
  类型检查
  构建项目
  一键检查全部

CI 修复
  拉取 GitHub Actions 错误
  分析最新 CI 失败
  自动处理诊断队列

自动化队列
  待处理
  处理中
  已完成
  失败

Git 仓库
  Git 状态

VectaHub 核心
  环境检查
  执行自定义意图
```

### 6.3 小阶段

#### M2.1 分类渲染

改动:

- 按任务 kind 和 source 分组。
- 空分类不展示或展示明确空状态。

验收:

- 高频任务在首屏可见。
- Advanced 仍保留工具、安全、工作流等低频入口。

#### M2.2 队列状态展示

改动:

- 读取 `diagnostic-queue.json`。
- 按状态分组展示。

验收:

- 队列为空时显示明确状态。
- 文件变化后自动刷新。
- JSON 损坏时不崩溃，提示数据不可读。

#### M2.3 刷新体验

改动:

- 保留刷新按钮。
- 拉取 CI / 处理队列后主动刷新。

验收:

- 用户不需要重启 VS Code 才看到变化。

### 6.4 涉及模块

- `packages/vectahub-vscode-extension/src/views/tasksView.ts`
- `packages/vectahub-vscode-extension/src/views/treeItems.ts`
- `packages/vectahub-vscode-extension/src/commands/refreshProjectTasks.ts`

### 6.5 完成标准

- Tasks 视图结构清楚。
- 高频任务和自动化队列都有明确位置。
- Advanced 不抢主路径。

---

## 7. M3 一键任务链

### 7.1 目标

用户点一次即可执行常用开发检查，不需要手动一个个跑命令。

### 7.2 默认任务链

第一版默认顺序:

```text
typecheck -> lint -> test -> build
```

规则:

- 只执行当前项目真实存在的任务。
- 不存在的任务跳过并写入摘要。
- 任一步失败即停止。
- 失败任务进入诊断流程或提示用户拉取/处理队列。

### 7.3 小阶段

#### M3.1 任务链生成

新增建议:

- `src/execution/devPipeline.ts`

职责:

- 从已识别任务中选出质量检查任务。
- 按固定优先级排序。
- 生成可执行计划列表。

验收:

- 不依赖 UI 才能测试。
- 任务顺序稳定。

#### M3.2 一键检查命令

新增建议:

- `src/commands/runCheckPipeline.ts`

职责:

- 执行 typecheck / lint / test / build。
- 显示进度。
- 支持取消。
- 输出摘要。

验收:

- 失败即停止。
- 取消后不继续执行后续任务。
- 每一步有清晰状态。

#### M3.3 开发任务链命令

新增建议:

- `src/commands/runDevPipeline.ts`

职责:

- 面向“开发前准备”或“提交前检查”。
- 可包含 install / format:check / typecheck / lint / test / build。

验收:

- install 不能默认每次强制执行，除非用户选择或检测到依赖缺失。
- 不允许自动修改代码格式，除非用户明确选择 format。

### 7.4 涉及模块

- `packages/vectahub-vscode-extension/src/execution/planBuilder.ts`
- `packages/vectahub-vscode-extension/src/execution/planRunner.ts`
- `packages/vectahub-vscode-extension/src/commands/runProjectTask.ts`
- `packages/vectahub-vscode-extension/src/extension.ts`

### 7.5 完成标准

- 用户能一键跑完整检查链。
- 失败点明确。
- 任务链逻辑有单元测试。

---

## 8. M4 长驻任务管理

### 8.1 目标

正确支持 `dev`、`start`、`serve`、`preview` 这类不会自动退出的任务。

### 8.2 小阶段

#### M4.1 长驻任务识别

规则:

- dev / start / serve / preview 默认视为 long-running。
- watch / test:watch / build:watch 默认视为 long-running。

验收:

- 长驻任务不进入普通“等待退出后完成”流程。

#### M4.2 启动和停止

新增建议:

- `src/commands/startDevServer.ts`
- `src/commands/stopRunningTask.ts`

要求:

- 启动前检查是否已有同类任务运行。
- 提供停止入口。
- 插件 deactivate 时回收进程。

验收:

- 重复启动不会产生多个失控进程。
- 停止后状态栏和任务面板更新。

#### M4.3 状态栏集成

状态建议:

- `VectaHub: Ready`
- `VectaHub: Running`
- `VectaHub: Dev Server`
- `VectaHub: Failed`
- `VectaHub: CLI Missing`

验收:

- 点击状态栏能打开相关输出或任务面板。

### 8.3 涉及模块

- `packages/vectahub-vscode-extension/src/cli/process-manager.ts`
- `packages/vectahub-vscode-extension/src/ui/statusBar.ts`
- `packages/vectahub-vscode-extension/src/ui/output.ts`

### 8.4 完成标准

- dev server 可启动、可停止、可观察。
- 插件退出不遗留子进程。

---

## 9. M5 CI 失败闭环

### 9.1 目标

从 GitHub Actions 获取失败信息，转成可处理的诊断任务。

### 9.2 小阶段

#### M5.1 拉取前检查

检查:

- 当前目录是否是 Git 仓库。
- 是否存在远程 GitHub 仓库。
- GitHub CLI 或 VectaHub 相关能力是否可用。
- 当前用户是否已授权。

验收:

- 没有权限时提示授权，而不是显示未知错误。

#### M5.2 拉取失败记录

入口:

- `vectahub run -f sys:fetch-gh-actions-errors`

要求:

- 执行时显示进度。
- 成功后刷新队列。
- 发现失败项时提示用户处理队列。

验收:

- 拉取成功后 Tasks 视图能看到队列变化。
- 拉取失败时 Output 有具体原因。

#### M5.3 队列转换协议

要求:

- CI 失败必须转成结构化诊断任务。
- 每个任务至少包含 title、description、status、commandToFix 或 nextAction。

验收:

- 插件不猜测日志格式。
- 缺字段时显示 needs-confirmation。

### 9.3 涉及模块

- `packages/vectahub-vscode-extension/src/commands/fetchGhErrors.ts`
- `packages/vectahub-vscode-extension/src/views/tasksView.ts`
- CLI 侧系统工作流: `sys:fetch-gh-actions-errors`

### 9.4 完成标准

- 用户能一键拉取 CI 失败。
- 失败项能进入诊断队列。
- 队列可视化刷新。

---

## 10. M6 队列自动化

### 10.1 目标

让用户一键处理诊断队列，过程中不需要一直守着，但风险任务必须暂停确认。

### 10.2 队列状态

标准状态:

```text
pending
processing
completed
failed
cancelled
needs-confirmation
```

### 10.3 小阶段

#### M6.1 队列读取和校验

要求:

- 队列文件不存在时返回空队列。
- JSON 损坏时提示错误。
- 未知状态进入 needs-confirmation 或 failed。

验收:

- 插件不会因队列文件异常崩溃。

#### M6.2 批量处理

入口:

- `vectahub run -f sys:process-diagnostic-queue`

要求:

- 启动前确认。
- 显示总任务数和当前任务。
- 支持取消。
- 每个任务结束后刷新视图。

验收:

- 队列为空不执行。
- 中途取消能停止。
- 失败不会被标记为成功。

#### M6.3 失败摘要

要求:

- 完成后展示成功数、失败数、跳过数。
- 失败项保留在队列或历史里。
- 用户能打开 Output 查看详情。

验收:

- 用户离开一段时间后回来，能知道最终结果。

### 10.4 涉及模块

- `packages/vectahub-vscode-extension/src/commands/processAllQueue.ts`
- `packages/vectahub-vscode-extension/src/project/taskHistory.ts`
- `packages/vectahub-vscode-extension/src/ui/notifications.ts`
- `packages/vectahub-vscode-extension/src/ui/output.ts`

### 10.5 完成标准

- 队列可批量处理。
- 处理过程可取消。
- 结果可追踪。
- 高风险任务不会静默执行。

---

## 11. M7 风险控制与体验收口

### 11.1 目标

自动化能力足够强，但不会失控；用户不盯着终端也能理解结果。

### 11.2 小阶段

#### M7.1 预览策略贯穿

要求:

- `previewBeforeRun=true` 时，自然语言任务必须先 dry-run。
- 危险命令必须确认。
- 批量任务启动前必须确认。
- 队列中高风险项必须暂停。

验收:

- runIntent 不得绕过 previewBeforeRun。
- runProjectTask 对高风险命令必须进入确认路径。

#### M7.2 历史记录

要求:

- 记录最近运行。
- 记录最近失败。
- 面板可展示最近失败入口。

验收:

- 失败任务不会被写成 success。
- 历史至少在当前 VS Code 会话内可用。

#### M7.3 通知和输出

要求:

- 长任务完成后通知。
- 失败通知可打开 Output。
- Output 不输出 secrets、完整环境变量或 token。

验收:

- 错误可定位。
- 通知不刷屏。

### 11.3 涉及模块

- `packages/vectahub-vscode-extension/src/commands/runIntent.ts`
- `packages/vectahub-vscode-extension/src/commands/previewIntent.ts`
- `packages/vectahub-vscode-extension/src/commands/runProjectTask.ts`
- `packages/vectahub-vscode-extension/src/config/settings.ts`
- `packages/vectahub-vscode-extension/src/project/taskHistory.ts`
- `packages/vectahub-vscode-extension/src/ui/notifications.ts`

### 11.4 完成标准

- 自动化路径有预览、确认、取消、历史和错误摘要。
- 用户能放心离开，不需要盯着终端。

---

## 12. 测试要求

### 12.1 必测范围

每个阶段至少覆盖以下之一:

- 纯逻辑单元测试。
- VS Code 命令注册或执行测试。
- CLI adapter mock 测试。
- fixture 项目识别测试。

### 12.2 推荐测试文件

现有:

- `packages/vectahub-vscode-extension/test/crossProject.logic.test.ts`
- `packages/vectahub-vscode-extension/test/taskHistory.test.ts`
- `packages/vectahub-vscode-extension/src/test/extension.test.ts`

建议新增:

- `packages/vectahub-vscode-extension/test/packageScripts.test.ts`
- `packages/vectahub-vscode-extension/test/devPipeline.test.ts`
- `packages/vectahub-vscode-extension/test/diagnosticQueue.test.ts`

### 12.3 验证命令

插件侧:

```bash
cd packages/vectahub-vscode-extension
npm run compile
npm run lint
npm test
```

根项目受影响时:

```bash
npm run typecheck
npm test -- --run
```

### 12.4 禁止测试偷懒

- 不允许只测试函数被调用，不断言结果。
- 不允许把失败路径 mock 成成功。
- 不允许删除现有断言来通过测试。
- 不允许把类型改成 `any` 绕过测试。
- 不允许跳过长任务取消、队列损坏、CLI 缺失等边界。

---

## 13. 数据和协议边界

### 13.1 插件负责

- UI 展示。
- 命令入口。
- 任务识别。
- 执行计划组织。
- 调用 CLI。
- 状态栏、Output、通知。
- 当前会话内历史。
- 诊断队列文件读取和展示。

### 13.2 CLI 负责

- 自然语言解析。
- dry-run 计划生成。
- 真实命令执行。
- 安全检测。
- GitHub Actions 失败抓取。
- 诊断队列处理。
- 结构化 JSON 输出。

### 13.3 不允许混淆

- 插件不得自己实现自然语言命令解释器。
- 插件不得直接修改业务代码来“修复 CI”，除非 CLI 明确返回可执行计划且经过确认。
- 插件不得把 CLI 人类日志当作稳定 API。

---

## 14. 第一轮建议实施范围

第一轮只做高收益闭环，不直接做全自动改代码:

1. 扩展开发任务识别。
2. 重组 Tasks 面板。
3. 新增“一键检查全部”。
4. 增强 GitHub CI 错误拉取后的队列刷新和提示。
5. 增强“一键处理诊断队列”的进度、取消和失败提示。

第一轮不做:

- 自动提交代码。
- 自动 push。
- 自动 force retry CI。
- Webview Chat。
- 图形化 workflow 编辑器。
- 跨仓库批量自动修复。

第一轮验收:

- 打开 VS Code 后，用户能在 VectaHub 面板看到开发、检查、CI、队列四类高频入口。
- 用户能一键跑 typecheck / lint / test / build 中项目实际存在的任务。
- 用户能一键拉取 CI 失败并看到队列变化。
- 用户能一键处理队列，并在完成后看到结果摘要。
- 所有新增逻辑有测试。

---

## 15. 阶段完成模板

每完成一个阶段，开发 Agent 必须在回复中按以下格式说明:

```markdown
## 完成范围

## 修改文件

## 行为变化

## 边界处理

## 测试结果

## 未完成或需要确认
```

如果存在未完成项，必须说明原因和下一步，不能用“后续优化”笼统带过。
