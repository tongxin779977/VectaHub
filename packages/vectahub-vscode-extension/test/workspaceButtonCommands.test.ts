import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectTask } from '../src/project/taskModel.js'

const targetPaths = vi.hoisted(() => {
  function djb2Hash(input: string): string {
    let hash = 5381
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
    }
    return hash.toString(36)
  }

  const workspace = '/Users/xin.tong/apps/project/test_trae/财务智能表格处理'
  const vectahubHome = `${workspace}/.vectahub-test-home`
  return {
    workspace,
    doc: `${workspace}/docs/feature_roadmap.md`,
    vectahubHome,
    projectQueueFile: `${vectahubHome}/projects/${djb2Hash(workspace)}/diagnostic-queue.json`,
  }
})

const actualExistsSync = fs.existsSync.bind(fs)
const actualReadFileSync = fs.readFileSync.bind(fs)
const diagnosticQueueFixture = JSON.stringify([
  {
    id: 'queue-pending-1',
    title: 'Fix CI failure',
    description: 'Pending GitHub Actions diagnostics',
    source: 'github-actions',
    status: 'pending',
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
  },
  {
    id: 'queue-processing-1',
    title: 'Investigate lint warning',
    description: 'Processing project diagnostics',
    source: 'system',
    status: 'processing',
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
  },
])

const commandHandlers = new Map<string, (...args: any[]) => any>()
const quickPickMock = vi.hoisted(() => vi.fn())
const inputBoxMock = vi.hoisted(() => vi.fn())
const infoMessageMock = vi.hoisted(() => vi.fn())
const warningMessageMock = vi.hoisted(() => vi.fn())
const errorMessageMock = vi.hoisted(() => vi.fn())
const withProgressMock = vi.hoisted(() => vi.fn())
const openDialogMock = vi.hoisted(() => vi.fn())
const openTextDocumentMock = vi.hoisted(() => vi.fn())
const showTextDocumentMock = vi.hoisted(() => vi.fn())
const createTerminalMock = vi.hoisted(() => vi.fn())
const createOutputChannelMock = vi.hoisted(() => vi.fn())
const waitForCliReadyMock = vi.hoisted(() => vi.fn())
const runCliMock = vi.hoisted(() => vi.fn())
const detectProjectTasksMock = vi.hoisted(() => vi.fn())
const createVerifyPipelineMock = vi.hoisted(() => vi.fn())
const addTaskRecordMock = vi.hoisted(() => vi.fn())
const longRunningTaskManagerMock = vi.hoisted(() => ({
  isRunning: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  restart: vi.fn(),
  focusOutput: vi.fn(),
  getAllRunning: vi.fn(),
  onTaskStarted: vi.fn(),
  onTaskStopped: vi.fn(),
}))

const fakeContext = {
  extensionMode: 1,
  subscriptions: [] as Array<{ dispose?: () => void }>,
} as any

function registerCommand(name: string, handler: (...args: any[]) => any) {
  commandHandlers.set(name, handler)
  return { dispose: vi.fn() }
}

async function executeCommand(name: string, ...args: any[]) {
  const handler = commandHandlers.get(name)
  if (handler) {
    return await handler(...args)
  }
  return undefined
}

vi.mock('vscode', () => {
  class ThemeIcon {
    constructor(public readonly id: string) {}
  }

  class EventEmitter<T> {
    event = vi.fn()
    fire = vi.fn((_value?: T) => undefined)
  }

  class TreeItem {
    label?: string
    description?: string
    tooltip?: string
    command?: { command: string; title: string; arguments?: any[] }
    contextValue?: string
    iconPath?: unknown
    constructor(label?: string, _collapsibleState?: number) {
      this.label = label
    }
  }

  class RelativePattern {
    constructor(
      public readonly base: string,
      public readonly pattern: string
    ) {}
  }

  return {
    ExtensionMode: {
      Development: 1,
    },
    ProgressLocation: {
      Notification: 15,
    },
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    ThemeIcon,
    EventEmitter,
    TreeItem,
    RelativePattern,
    window: {
      activeTextEditor: undefined,
      showQuickPick: quickPickMock,
      showInputBox: inputBoxMock,
      showInformationMessage: infoMessageMock,
      showWarningMessage: warningMessageMock,
      showErrorMessage: errorMessageMock,
      withProgress: withProgressMock,
      showOpenDialog: openDialogMock,
      openTextDocument: openTextDocumentMock,
      showTextDocument: showTextDocumentMock,
      createTerminal: createTerminalMock,
      createOutputChannel: createOutputChannelMock,
      createTreeView: vi.fn(() => ({ dispose: vi.fn() })),
    },
    workspace: {
      workspaceFolders: [
        {
          uri: { fsPath: targetPaths.workspace },
          name: path.basename(targetPaths.workspace),
        },
      ],
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key: string, defaultValue?: unknown) => {
          if (key === 'autoDetectCli') return true
          if (key === 'previewBeforeRun') return false
          if (key === 'executionMode') return 'strict'
          if (key === 'cliPath') return 'vectahub'
          if (key === 'maxConcurrentTasks') return 1
          return defaultValue
        }),
      })),
      getWorkspaceFolder: vi.fn(() => ({
        uri: { fsPath: targetPaths.workspace },
        name: path.basename(targetPaths.workspace),
      })),
      createFileSystemWatcher: vi.fn(() => ({
        onDidChange: vi.fn(),
        onDidCreate: vi.fn(),
        onDidDelete: vi.fn(),
        dispose: vi.fn(),
      })),
      openTextDocument: openTextDocumentMock,
    },
    commands: {
      registerCommand: vi.fn(registerCommand),
      executeCommand: vi.fn(executeCommand),
    },
  }
})

vi.mock('../src/ui/output.js', () => ({
  initOutputChannel: vi.fn(() => ({ dispose: vi.fn(), appendLine: vi.fn(), show: vi.fn() })),
  getOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), show: vi.fn() })),
  logToOutput: vi.fn(),
}))

vi.mock('../src/ui/statusBar.js', () => ({
  initStatusBar: vi.fn(),
  updateStatusBar: vi.fn(),
}))

vi.mock('../src/cli/adapter.js', () => ({
  initCliAdapter: vi.fn(),
  getActiveWorkspaceFolder: vi.fn(() => targetPaths.workspace),
  getVectaHubHome: vi.fn(() => path.join(targetPaths.workspace, '.vectahub-test-home')),
  runCli: runCliMock,
}))

vi.mock('../src/cli/readiness.js', () => ({
  startCliDetection: vi.fn(async () => 'ready'),
  registerCliDetector: vi.fn(),
  getResolvedCliPath: vi.fn(() => 'vectahub'),
  waitForCliReady: waitForCliReadyMock,
}))

vi.mock('../src/cli/discovery.js', () => ({
  discoverCli: vi.fn(async () => ({
    exists: true,
    path: 'vectahub',
    version: '1.0.11',
  })),
}))

vi.mock('../src/project/detector.js', () => ({
  detectProjectTasks: detectProjectTasksMock,
}))

vi.mock('../src/execution/devPipeline.js', () => ({
  createVerifyPipeline: createVerifyPipelineMock,
}))

vi.mock('../src/project/taskHistory.js', () => ({
  addTaskRecord: addTaskRecordMock,
  getFailedTasks: vi.fn(() => []),
}))

vi.mock('../src/cli/longRunningTaskManager.js', () => ({
  LongRunningTaskManager: {
    getInstance: vi.fn(() => longRunningTaskManagerMock),
  },
}))

vi.mock('../src/execution/planBuilder.js', () => ({
  PlanBuilder: {
    buildIntentPlan: vi.fn((intent: string) => ({ type: 'intent', intent })),
    buildWorkflowFilePlan: vi.fn((file: string) => ({ type: 'workflow', file })),
    createProjectTaskPlan: vi.fn((task: ProjectTask) => ({ type: 'task', task })),
  },
}))

const previewMock = vi.fn()
const runMock = vi.fn()

vi.mock('../src/execution/planRunner.js', () => ({
  PlanRunner: class {
    preview = previewMock
    run = runMock
  },
}))

vi.mock('../src/commands/fetchGhErrors.js', () => ({
  registerFetchGhErrorsCommand: vi.fn(),
}))

vi.mock('../src/project/diagnostic-bridge.js', () => ({
  DiagnosticBridge: class {
    start = vi.fn(async () => 3210)
    dispose = vi.fn()
  },
  collectAllDiagnostics: vi.fn(() => []),
  filterDiagnostics: vi.fn((items: unknown[]) => items),
}))

vi.mock('../src/commands/listPackageScripts.js', async () => {
  const actual = await vi.importActual<typeof import('../src/commands/listPackageScripts.js')>('../src/commands/listPackageScripts.js')
  return actual
})

vi.mock('../src/commands/runProjectTask.js', async () => {
  const actual = await vi.importActual<typeof import('../src/commands/runProjectTask.js')>('../src/commands/runProjectTask.js')
  return actual
})

import * as vscode from 'vscode'
import { activate } from '../src/extension.js'
import { TasksViewProvider } from '../src/views/tasksView.js'
import { AdvancedViewProvider } from '../src/views/advancedView.js'
import type { VectaHubTreeItem } from '../src/views/treeItems.js'

function flattenItems(items: VectaHubTreeItem[]): VectaHubTreeItem[] {
  const result: VectaHubTreeItem[] = []
  for (const item of items) {
    result.push(item)
    if ('children' in item && Array.isArray((item as any).children)) {
      result.push(...flattenItems((item as any).children))
    }
  }
  return result
}

function collectCommandEntries(items: VectaHubTreeItem[]): Array<{ label: string; command: string; args: any[] }> {
  return flattenItems(items)
    .filter(item => item.command?.command)
    .map(item => ({
      label: item.label ?? '',
      command: item.command!.command,
      args: item.command!.arguments ?? [],
    }))
}

function hasRunCliCall(expectedArgs: string[]): boolean {
  return runCliMock.mock.calls.some(call => JSON.stringify(call[0]) === JSON.stringify(expectedArgs))
}

describe('workspace button commands', () => {
  beforeEach(() => {
    commandHandlers.clear()
    fakeContext.subscriptions.length = 0
    vi.clearAllMocks()
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath: fs.PathLike) => {
      if (String(filePath) === targetPaths.projectQueueFile) {
        return true
      }
      return actualExistsSync(filePath)
    })
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: fs.PathOrFileDescriptor, options?: any) => {
      if (String(filePath) === targetPaths.projectQueueFile) {
        return diagnosticQueueFixture as any
      }
      return actualReadFileSync(filePath, options)
    })
    vi.spyOn(TasksViewProvider.prototype, 'readDiagnosticQueue').mockReturnValue({
      tasks: JSON.parse(diagnosticQueueFixture),
    })

    longRunningTaskManagerMock.isRunning.mockImplementation((taskId?: string) => taskId === 'pkg-dev')
    longRunningTaskManagerMock.getAllRunning.mockReturnValue([
      { id: 'pkg-dev', label: '启动开发服务 (Dev)', kind: 'dev' },
    ])
    longRunningTaskManagerMock.stop.mockReturnValue(true)

    previewMock.mockResolvedValue({ ok: true })
    runMock.mockResolvedValue(undefined)
    waitForCliReadyMock.mockResolvedValue(true)

    quickPickMock.mockImplementation(async (items: any) => Array.isArray(items) ? items[0] : undefined)
    inputBoxMock.mockResolvedValue('查看 git 状态')
    infoMessageMock.mockImplementation(async (_message: string, ...items: string[]) => {
      if (items.includes('确认执行')) return '确认执行'
      if (items.includes('开始修复')) return '开始修复'
      if (items.includes('查看详情')) return '查看详情'
      return items[0]
    })
    warningMessageMock.mockImplementation(async (_message: string, ...items: string[]) => {
      if (items.includes('开始处理')) return '开始处理'
      if (items.includes('开始修复')) return '开始修复'
      if (items.includes('删除')) return '删除'
      if (items.includes('清空队列')) return '清空队列'
      if (items.includes('重试')) return '重试'
      return items[0]
    })
    errorMessageMock.mockResolvedValue(undefined)
    withProgressMock.mockImplementation(async (_options: any, task: any) => task({}, { isCancellationRequested: false, onCancellationRequested: vi.fn() }))
    openDialogMock.mockResolvedValue([{ fsPath: targetPaths.doc }])
    openTextDocumentMock.mockImplementation(async (file: string) => ({
      uri: { fsPath: file },
      fileName: file,
      languageId: file.endsWith('.yaml') || file.endsWith('.yml') ? 'yaml' : 'markdown',
      getText: vi.fn(() => ''),
    }))
    ;(vscode.window as any).activeTextEditor = {
      document: {
        uri: { fsPath: `${targetPaths.workspace}/.vectahub/workflows/sample.yaml` },
        fileName: `${targetPaths.workspace}/.vectahub/workflows/sample.yaml`,
        languageId: 'yaml',
        getText: vi.fn(() => '查看 git 状态'),
      },
      selection: { start: 0, end: 1 },
    }
    showTextDocumentMock.mockResolvedValue(undefined)
    createTerminalMock.mockImplementation(() => ({
      show: vi.fn(),
      sendText: vi.fn(),
    }))
    createOutputChannelMock.mockImplementation(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    }))

    detectProjectTasksMock.mockResolvedValue([
      {
        id: 'pkg-dev',
        kind: 'dev',
        label: '启动开发服务 (Dev)',
        source: 'package-json',
        available: true,
        command: { cli: 'npm', args: ['run', 'dev'] },
      },
      {
        id: 'pkg-build',
        kind: 'build',
        label: '构建项目 (Build)',
        source: 'package-json',
        available: true,
        command: { cli: 'npm', args: ['run', 'build'] },
      },
      {
        id: 'pkg-lint',
        kind: 'lint',
        label: '代码检查 (Lint)',
        source: 'package-json',
        available: true,
        command: { cli: 'npm', args: ['run', 'lint'] },
      },
      {
        id: 'pkg-type-check',
        kind: 'typecheck',
        label: '类型检查 (Typecheck)',
        source: 'package-json',
        available: true,
        command: { cli: 'npm', args: ['run', 'type-check'] },
      },
      {
        id: 'pkg-preview',
        kind: 'preview',
        label: '预览构建结果 (Preview)',
        source: 'package-json',
        available: true,
        command: { cli: 'npm', args: ['run', 'preview'] },
      },
      {
        id: 'git-status',
        kind: 'git-status',
        label: 'Git 状态 (Status)',
        source: 'git',
        available: true,
        command: { cli: 'git', args: ['status'] },
      },
      {
        id: 'vh-doctor',
        kind: 'doctor',
        label: '环境检查 (Doctor)',
        source: 'vectahub',
        available: true,
        command: { cli: 'vectahub', args: ['doctor'] },
      },
    ])

    createVerifyPipelineMock.mockReturnValue({
      plans: [{ id: 'lint' }, { id: 'build' }],
      included: [{ label: '代码检查 (Lint)' }, { label: '构建项目 (Build)' }],
      skipped: [],
    })

    runCliMock.mockImplementation(async (args: string[]) => {
      if (args[0] === 'doctor') {
        return { ok: true, data: { summary: { passed: 3, warnings: 0, failed: 0 } } }
      }
      if (args[0] === 'tools' && args[1] === 'agents') {
        return {
          ok: true,
          data: {
            agents: [
              {
                name: 'codex',
                installed: true,
                configured_enabled: true,
                has_permission: true,
                invocable: true,
                ready: true,
              },
            ],
          },
        }
      }
      if (args[0] === 'tools' && args[1] === 'list') {
        return {
          ok: true,
          data: {
            tools: [
              { name: 'npm', description: 'Node package manager', commandCount: 4, dangerousCount: 0 },
            ],
          },
        }
      }
      if (args[0] === 'security' && args[1] === 'test') {
        return { ok: true, data: { isDangerous: false } }
      }
      if (args[0] === 'run' && args[1] === '-f' && args[2] === 'sys:fetch-gh-actions-errors') {
        return {
          ok: true,
          data: { ok: true, summary: { pendingCount: 1, processedCount: 0, failedCount: 0, remainingCount: 1, needsConfirmationCount: 0 } },
        }
      }
      if (args[0] === 'run' && args[1] === '-f' && args[2] === 'sys:process-diagnostic-queue') {
        return {
          ok: true,
          data: { ok: true, summary: { pendingCount: 1, processedCount: 1, failedCount: 0, remainingCount: 0, needsConfirmationCount: 0 } },
        }
      }
      if (args[0] === 'queue' && args[1] === 'remove') {
        return { ok: true }
      }
      if (args[0] === 'queue' && args[1] === 'clear') {
        return { ok: true }
      }
      if (args[0] === 'run-command') {
        return { ok: true, data: { ok: true } }
      }
      if (args[0] === 'parse-doc') {
        return {
          ok: true,
          data: {
            tasks: [
              { id: 'DOC-1', label: 'readme task' },
            ],
          },
        }
      }
      if (args[0] === 'run-task') {
        return {
          ok: true,
          data: {
            ok: true,
            command: 'codex exec',
            output: 'implemented',
            diagnostics: {
              gitChanges: { changedFiles: [], shortStat: '' },
              failureKind: 'timeout',
              recoveryDecision: { kind: 'retry_direct', mode: 'confirm_required', summary: 'retry hint' },
            },
          },
        }
      }
      return { ok: true, data: {} }
    })
  })

  it('builds target workspace and simulates all actionable button commands', async () => {
    expect(fs.existsSync(path.join(targetPaths.workspace, 'frontend', 'dist', 'index.html'))).toBe(true)
    expect(fs.existsSync(targetPaths.doc)).toBe(true)

    await activate(fakeContext)

    const tasksProvider = new TasksViewProvider()
    tasksProvider.setSelectedDocPath(targetPaths.doc)
    tasksProvider.setSelectedAgentCli('codex')
    tasksProvider.setDocTasks([{ id: 'DOC-1', label: 'readme task', status: 'ready' }])

    const advancedProvider = new AdvancedViewProvider()

    const taskEntries = collectCommandEntries(await tasksProvider.getChildren())
    const advancedEntries = collectCommandEntries(await advancedProvider.getChildren())

    const actionableEntries = [...taskEntries, ...advancedEntries]
      .filter(entry => entry.command.startsWith('vectahubTasks.'))

    for (const entry of actionableEntries) {
      if (entry.command === 'vectahubTasks.runIntent' || entry.command === 'vectahubTasks.previewIntent') {
        await executeCommand(entry.command, '查看 git 状态')
        continue
      }
      await executeCommand(entry.command, ...entry.args)
    }
    await executeCommand('vectahubTasks.stopRunningTask')
    await executeCommand('vectahubTasks.removeQueueTask', 'queue-pending-1')
    await executeCommand('vectahubTasks.clearQueue')

    expect(commandHandlers.has('vectahubTasks.refreshProjectTasks')).toBe(true)
    expect(commandHandlers.has('vectahubTasks.runVerifyAll')).toBe(true)
    expect(commandHandlers.has('vectahubTasks.runProjectTask')).toBe(true)
    expect(commandHandlers.has('vectahubTasks.stopRunningTask')).toBe(true)
    expect(commandHandlers.has('vectahubTasks.selectDocFile')).toBe(true)
    expect(commandHandlers.has('vectahubTasks.parseDocTasks')).toBe(true)
    expect(commandHandlers.has('vectahubTasks.runDocTask')).toBe(true)
    expect(commandHandlers.has('vectahubTasks.runAllDocTasks')).toBe(true)
    expect(commandHandlers.has('vectahubTasks.removeQueueTask')).toBe(true)
    expect(commandHandlers.has('vectahubTasks.clearQueue')).toBe(true)
    expect(commandHandlers.has('vectahubTasks.syncAndFixCi')).toBe(true)
    expect(commandHandlers.has('vectahubTasks.doctor')).toBe(true)
    expect(commandHandlers.has('vectahubTasks.listTools')).toBe(true)
    expect(commandHandlers.has('vectahubTasks.testSecurity')).toBe(true)
    expect(commandHandlers.has('vectahubTasks.installCli')).toBe(true)
    expect(commandHandlers.has('vectahubTasks.configLlm')).toBe(true)

    expect(hasRunCliCall(['doctor', '--json'])).toBe(true)
    expect(hasRunCliCall(['tools', 'list', '--json'])).toBe(true)
    expect(hasRunCliCall(['security', 'test', '--json', '查看 git 状态'])).toBe(true)
    expect(hasRunCliCall(['run', '-f', 'sys:fetch-gh-actions-errors', '--json'])).toBe(true)
    expect(hasRunCliCall(['run', '-f', 'sys:process-diagnostic-queue', '--mode', 'relaxed', '--json'])).toBe(true)
    expect(hasRunCliCall(['queue', 'remove', 'queue-pending-1', '--json'])).toBe(true)
    expect(hasRunCliCall(['queue', 'clear', '--json', '--force'])).toBe(true)

    expect(createTerminalMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'VectaHub 安装' }))
    expect(createTerminalMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'VectaHub LLM 配置' }))
    expect(longRunningTaskManagerMock.focusOutput).toHaveBeenCalledWith('pkg-dev')
    expect(longRunningTaskManagerMock.stop).toHaveBeenCalledWith('pkg-dev')
    expect(longRunningTaskManagerMock.start).toHaveBeenCalled()
    expect(previewMock).toHaveBeenCalled()
    expect(runMock).toHaveBeenCalled()
    expect(addTaskRecordMock).toHaveBeenCalled()
    expect(infoMessageMock).toHaveBeenCalledWith(expect.stringContaining('执行成功'))
    expect(infoMessageMock).not.toHaveBeenCalledWith(expect.stringContaining('failureKind'))
    expect(infoMessageMock).not.toHaveBeenCalledWith(expect.stringContaining('recoveryDecision'))
  })
})
