import { Command } from 'commander';
import type { InfrastructureContext } from './infrastructure/context.js';
import { formatErrorMessage } from './infrastructure/errors/index.js';

interface SimpleCommandBinding {
  name: string;
  exportName: string;
  isFactory: true;
}

interface DirectCommandBinding {
  name: string;
  exportName: string;
  isFactory: false;
}

interface MultiFactoryBinding {
  name: string;
  resultKey: string;
}

type CommandBinding = SimpleCommandBinding | DirectCommandBinding;

interface CommandRegistryEntry {
  modulePath: string;
  bindings: CommandBinding[];
  needsAgentRuntime?: boolean;
}

interface MultiFactoryRegistryEntry {
  modulePath: string;
  multiFactory: string;
  bindings: MultiFactoryBinding[];
  needsAgentRuntime?: boolean;
}

type RegistryEntry = CommandRegistryEntry | MultiFactoryRegistryEntry;

function isMultiFactoryEntry(entry: RegistryEntry): entry is MultiFactoryRegistryEntry {
  return 'multiFactory' in entry;
}

const COMMAND_REGISTRY: RegistryEntry[] = [
  { modulePath: './commands/run.js', bindings: [{ name: 'run', exportName: 'createRunCmd', isFactory: true }] },
  { modulePath: './commands/doctor.js', bindings: [{ name: 'doctor', exportName: 'createDoctorCmd', isFactory: true }] },
  { modulePath: './commands/serve.js', multiFactory: 'createServeCommands', bindings: [{ name: 'serve', resultKey: 'serveCmd' }, { name: 'client', resultKey: 'clientCmd' }] },
  { modulePath: './commands/security.js', bindings: [{ name: 'security', exportName: 'createSecurityCmd', isFactory: true }] },
  { modulePath: './commands/audit-cmd.js', bindings: [{ name: 'audit', exportName: 'createAuditCmd', isFactory: true }] },
  { modulePath: './commands/tools.js', bindings: [{ name: 'tools', exportName: 'createToolsCmd', isFactory: true }], needsAgentRuntime: true },
  { modulePath: './commands/list.js', bindings: [{ name: 'list', exportName: 'createListCmd', isFactory: true }] },
  { modulePath: './commands/mode.js', bindings: [{ name: 'mode', exportName: 'createModeCmd', isFactory: true }] },
  { modulePath: './commands/history.js', bindings: [{ name: 'history', exportName: 'createHistoryCmd', isFactory: true }] },
  { modulePath: './commands/detail.js', bindings: [{ name: 'detail', exportName: 'createDetailCmd', isFactory: true }] },
  { modulePath: './commands/rerun.js', bindings: [{ name: 'rerun', exportName: 'createRerunCmd', isFactory: true }] },
  { modulePath: './commands/resume.js', bindings: [{ name: 'resume', exportName: 'createResumeCmd', isFactory: true }] },
  { modulePath: './commands/archive.js', bindings: [{ name: 'archive', exportName: 'createArchiveCmd', isFactory: true }] },
  { modulePath: './commands/run-command.js', bindings: [{ name: 'run-command', exportName: 'createRunCommandCmd', isFactory: true }] },
  { modulePath: './commands/generate.js', bindings: [{ name: 'generate', exportName: 'createGenerateCmd', isFactory: true }] },
  { modulePath: './commands/schedule.js', bindings: [{ name: 'schedule', exportName: 'createScheduleCmd', isFactory: true }] },
  { modulePath: './commands/daemon.js', bindings: [{ name: 'daemon', exportName: 'daemonCmd', isFactory: false }] },
  { modulePath: './commands/templates.js', bindings: [{ name: 'templates', exportName: 'createTemplatesCmd', isFactory: true }] },
  { modulePath: './commands/list.js', bindings: [{ name: 'rollback', exportName: 'createRollbackCmd', isFactory: true }] },
  { modulePath: './commands/verify.js', bindings: [{ name: 'verify', exportName: 'createVerifyCmd', isFactory: true }] },
  { modulePath: './commands/chat.js', bindings: [{ name: 'chat', exportName: 'chatCmd', isFactory: false }], needsAgentRuntime: true },
  { modulePath: './commands/monitor.js', bindings: [{ name: 'monitor', exportName: 'createMonitorCmd', isFactory: true }] },
  { modulePath: './commands/debug.js', bindings: [{ name: 'debug', exportName: 'createDebugCmd', isFactory: true }] },
  { modulePath: './commands/export.js', bindings: [{ name: 'export', exportName: 'createExportCmd', isFactory: true }, { name: 'import', exportName: 'createImportCmd', isFactory: true }] },
  { modulePath: './commands/vscode-diagnostic.js', bindings: [{ name: 'vscode', exportName: 'createVscodeDiagnosticCmd', isFactory: true }], needsAgentRuntime: true },
  { modulePath: './commands/parse-doc.js', bindings: [{ name: 'parse-doc', exportName: 'createParseDocCmd', isFactory: true }] },
  { modulePath: './commands/run-task.js', bindings: [{ name: 'run-task', exportName: 'createRunTaskCmd', isFactory: true }, { name: 'run-task-clean-logs', exportName: 'createRunTaskCleanLogsCmd', isFactory: true }], needsAgentRuntime: true },
  { modulePath: './commands/trace.js', bindings: [{ name: 'trace', exportName: 'createTraceCmd', isFactory: true }] },
  { modulePath: './commands/doc-task-runs.js', bindings: [{ name: 'doc-task-runs', exportName: 'createDocTaskRunsCmd', isFactory: true }] },
  { modulePath: './commands/recover-task.js', bindings: [{ name: 'recover-task', exportName: 'createRecoverTaskCmd', isFactory: true }] },
  { modulePath: './commands/provider.js', bindings: [{ name: 'provider', exportName: 'createProviderCmd', isFactory: true }], needsAgentRuntime: true },
  { modulePath: './commands/queue.js', bindings: [{ name: 'queue', exportName: 'createQueueCmd', isFactory: true }] },
];

interface LazyCommandMeta {
  name: string;
  description: string;
  argument?: string;
}

/** Declarative metadata for all lazy-loaded commands. */
export const LAZY_COMMAND_METAS: LazyCommandMeta[] = [
  { name: 'run', description: '执行工作流' },
  { name: 'doctor', description: '运行系统诊断' },
  { name: 'chat', description: '启动交互式聊天会话' },
  { name: 'serve', description: '启动 VectaHub 服务器' },
  { name: 'client', description: '连接到 VectaHub 服务器' },
  { name: 'security', description: '安全管理命令' },
  { name: 'audit', description: '审计日志命令' },
  { name: 'tools', description: 'CLI 工具管理' },
  { name: 'list', description: '列出工作流' },
  { name: 'mode', description: '切换执行模式', argument: '[mode]' },
  { name: 'history', description: '查看执行历史' },
  { name: 'detail', description: '查看执行详情', argument: '<executionId>' },
  { name: 'rerun', description: '重跑历史执行', argument: '<executionId>' },
  { name: 'resume', description: '恢复失败或暂停执行', argument: '<executionId>' },
  { name: 'archive', description: '执行记录归档、恢复和删除' },
  { name: 'run-command', description: '直接运行 CLI 命令并进行安全扫描' },
  { name: 'generate', description: '生成工作流' },
  { name: 'schedule', description: '调度工作流' },
  { name: 'daemon', description: '守护进程管理' },
  { name: 'templates', description: '管理模板' },
  { name: 'rollback', description: '回滚操作' },
  { name: 'verify', description: '验证工作流' },
  { name: 'monitor', description: '监控工作流' },
  { name: 'debug', description: '调试工作流' },
  { name: 'export', description: '导出工作流' },
  { name: 'import', description: '导入工作流' },
  { name: 'vscode', description: 'VSCode IDE integration commands' },
  { name: 'parse-doc', description: '解析开发文档，提取结构化任务列表' },
  { name: 'run-task', description: '执行文档任务：调用 Agent CLI 执行开发任务' },
  { name: 'run-task-clean-logs', description: '清理当前工作目录下的 run-task 失败日志' },
  { name: 'doc-task-runs', description: '查询文档任务运行记录' },
  { name: 'recover-task', description: '恢复失败的文档任务' },
  { name: 'trace', description: '查看链路追踪数据' },
  { name: 'queue', description: '管理诊断队列' },
  { name: 'provider', description: 'AI Provider 管理' },
  { name: 'dev', description: '开发命令' },
];

const loadedCommands = new Set<string>();
const commandLoadErrors = new Map<string, string>();

function removeCommandFromProgram(program: Command, name: string): void {
  const mutable = program as unknown as { commands: Command[] };
  mutable.commands = mutable.commands.filter(c => c.name() !== name);
}

async function loadAgentRuntime(ctx: InfrastructureContext): Promise<void> {
  if (loadedCommands.has('agent-runtime')) return;

  try {
    if (getCliMainTestFailureMode(ctx) === 'agent-runtime') {
      throw new Error('forced agent-runtime failure');
    }
    const { loadProvidersFromConfig } = await import('./agent-runtime/config-loader.js');
    await loadProvidersFromConfig();
    loadedCommands.add('agent-runtime');
  } catch (error) {
    throw new Error(`Agent runtime initialization failed: ${formatErrorMessage(error, 'Agent 运行时')}`, { cause: error });
  }
}

async function loadCliTools(ctx: InfrastructureContext): Promise<void> {
  if (loadedCommands.has('cli-tools')) return;

  try {
    if (getCliMainTestFailureMode(ctx) === 'cli-tools') {
      throw new Error('forced cli-tools failure');
    }
    const { getCliToolRegistry } = await import('./cli-tools/index.js');
    const { gitTool } = await import('./cli-tools/tools/git.js');
    const { npmTool } = await import('./cli-tools/tools/npm.js');
    const { dockerTool } = await import('./cli-tools/tools/docker.js');
    const { curlTool } = await import('./cli-tools/tools/curl.js');

    const registry = getCliToolRegistry();
    registry.register(gitTool);
    registry.register(npmTool);
    registry.register(dockerTool);
    registry.register(curlTool);
    loadedCommands.add('cli-tools');
  } catch (error) {
    throw new Error(`CLI tool registration failed: ${formatErrorMessage(error, '工具注册')}`, { cause: error });
  }
}

function getCliMainTestFailureMode(ctx: InfrastructureContext): 'cli-tools' | 'agent-runtime' | null {
  const mode = ctx.environment.getEnv('VECTAHUB_TEST_FORCE_CLI_MAIN_FAILURE');
  if (mode === 'cli-tools' || mode === 'agent-runtime') {
    return mode;
  }
  return null;
}

async function loadDevCommand(program: Command, ctx: InfrastructureContext): Promise<void> {
  removeCommandFromProgram(program, 'dev');
  const { createStatusCmd } = await import('./commands/status.js');
  const { moduleCmd } = await import('./commands/module.js');
  const { createValidateCmd } = await import('./commands/validate.js');
  const { createTestCmd } = await import('./commands/test.js');
  const { createBuildCmd } = await import('./commands/build.js');
  const devCmd = new Command('dev').description('Development commands for multi-agent collaboration');
  devCmd.addCommand(createStatusCmd(ctx)).addCommand(moduleCmd).addCommand(createValidateCmd(ctx)).addCommand(createTestCmd(ctx)).addCommand(createBuildCmd(ctx));
  program.addCommand(devCmd, { hidden: true });
  loadedCommands.add('dev');
}

/** Lazily load a single command by name, replacing its proxy in the program. */
export async function lazyLoadCommand(
  commandName: string,
  program: Command,
  ctx: InfrastructureContext,
): Promise<void> {
  if (loadedCommands.has(commandName)) return;

  try {
    if (commandName === 'dev') {
      await loadDevCommand(program, ctx);
      return;
    }

    const entry = COMMAND_REGISTRY.find(e =>
      e.bindings.some(b => b.name === commandName),
    );
    if (!entry) return;

    if (entry.needsAgentRuntime) {
      await loadAgentRuntime(ctx);
    }

    const module = await import(entry.modulePath);

    if (isMultiFactoryEntry(entry)) {
      const factoryResult = module[entry.multiFactory](ctx);
      for (const binding of entry.bindings) {
        removeCommandFromProgram(program, binding.name);
        program.addCommand(factoryResult[binding.resultKey]);
        loadedCommands.add(binding.name);
      }
    } else {
      for (const binding of entry.bindings) {
        removeCommandFromProgram(program, binding.name);
        const cmd = binding.isFactory
          ? module[binding.exportName](ctx)
          : module[binding.exportName];
        program.addCommand(cmd);
        loadedCommands.add(binding.name);
      }
    }
  } catch (error) {
    const msg = (error as Error).message || String(error);
    commandLoadErrors.set(commandName, msg);
    ctx.logger.getLogger('cli-main').error({ commandName, error }, 'Failed to lazy-load command');
  }
}

/** Lazily load the Agent runtime (providers from config). */
export async function lazyLoadAgentRuntime(ctx: InfrastructureContext): Promise<void> {
  await loadAgentRuntime(ctx);
}

/** Lazily load CLI tool integrations (git, npm, docker, curl). */
export async function lazyLoadCliTools(ctx: InfrastructureContext): Promise<void> {
  await loadCliTools(ctx);
}

/** Resolve a command name from argv if it has a --help flag. */
export function resolveLazyCommandForHelp(argv: string[]): string | null {
  const hasHelpFlag = argv.includes('--help') || argv.includes('-h');
  if (!hasHelpFlag) return null;

  const commandName = argv.find((arg) => !arg.startsWith('-'));
  if (!commandName) return null;

  return LAZY_COMMAND_METAS.some((cmd) => cmd.name === commandName) ? commandName : null;
}

/** Register proxy commands for all lazy-loadable commands. */
export function registerLazyProxyCommands(program: Command, ctx: InfrastructureContext): void {
  for (const cmdInfo of LAZY_COMMAND_METAS) {
    const lazyProxyCmd = new Command(cmdInfo.name)
      .description(cmdInfo.description);

    if (cmdInfo.argument) {
      lazyProxyCmd.argument(cmdInfo.argument);
    }

    lazyProxyCmd
      .allowUnknownOption()
      .arguments('[args...]')
      .action(async () => {
        const { createCliOutput } = await import('./infrastructure/cli-output.js');
        const output = createCliOutput({ json: ctx.environment.getArgv().includes('--json') });
        const cmdName = cmdInfo.name;
        if (!loadedCommands.has(cmdName)) {
          await lazyLoadCommand(cmdName, program, ctx);
          await loadCliTools(ctx);
        }

        const loadedCmd = program.commands.find(c => c.name() === cmdName);
        if (loadedCmd && loadedCmd !== lazyProxyCmd) {
          const cmdIndex = ctx.environment.getArgv().findIndex(arg => arg === cmdName);
          const remainingArgs = ctx.environment.getArgv().slice(cmdIndex + 1);
          await loadedCmd.parseAsync(remainingArgs, { from: 'user' });
        } else {
          const loadError = commandLoadErrors.get(cmdName);
          output.error(`❌ Command '${cmdName}' failed to load properly`);
          if (loadError) {
            output.error(`   原因: ${loadError}`);
          }
          ctx.environment.exit(1);
        }
      });
    program.addCommand(lazyProxyCmd);
  }
}
