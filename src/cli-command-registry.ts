import { Command } from 'commander';
import type { InfrastructureContext } from './infrastructure/context.js';
import { formatErrorMessage } from './infrastructure/errors/index.js';

/** Binding for a simple factory-created command. */
interface SimpleCommandBinding {
  name: string;
  exportName: string;
  isFactory: true;
}

/** Binding for a directly exported command instance. */
interface DirectCommandBinding {
  name: string;
  exportName: string;
  isFactory: false;
}

/** Binding for a command produced by a multi-factory function. */
interface MultiFactoryBinding {
  name: string;
  resultKey: string;
}

/** Union of all command binding types. */
type CommandBinding = SimpleCommandBinding | DirectCommandBinding;

/** Registry entry for a module that exports individual command factories. */
interface CommandRegistryEntry {
  modulePath: string;
  bindings: CommandBinding[];
  needsAgentRuntime?: boolean;
}

/** Registry entry for a module that exports a multi-command factory. */
interface MultiFactoryRegistryEntry {
  modulePath: string;
  multiFactory: string;
  bindings: MultiFactoryBinding[];
  needsAgentRuntime?: boolean;
}

/** Union of all registry entry types. */
type RegistryEntry = CommandRegistryEntry | MultiFactoryRegistryEntry;

/** Type guard to check if an entry uses a multi-factory pattern. */
function isMultiFactoryEntry(entry: RegistryEntry): entry is MultiFactoryRegistryEntry {
  return 'multiFactory' in entry;
}

/** Static registry of all command modules and their bindings. */
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
  { modulePath: './commands/draft.js', bindings: [{ name: 'draft', exportName: 'createDraftCommand', isFactory: true }] },
];

/** Metadata for a lazy-loaded command proxy. */
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
  { name: 'draft', description: '管理 Workflow Drafts' },
  { name: 'dev', description: '开发命令' },
];

const loadedCommands = new Set<string>();
const commandLoadErrors = new Map<string, string>();

/** Cache for command name to registry entry lookups, avoiding repeated Array.find(). */
const commandLookupCache = new Map<string, RegistryEntry | null>();

/** Pending module imports to avoid duplicate async operations. */
const pendingImports = new Map<string, Promise<unknown>>();

/** Cache for registered command instances to avoid duplicate registration. */
const registeredCommandCache = new Map<string, Command>();

/** Cache for command module instances to avoid duplicate imports. */
const commandModuleCache = new Map<string, Record<string, unknown>>();

/** Track command registration attempts for deduplication. */
const commandRegistrationAttempts = new Map<string, Promise<void>>();

/**
 * Look up a registry entry by command name with O(1) cache lookup.
 * @param commandName - The command name to look up.
 * @returns The matching registry entry, or null if not found.
 */
function getRegistryEntry(commandName: string): RegistryEntry | null {
  const cached = commandLookupCache.get(commandName);
  if (cached !== undefined) {
    return cached;
  }

  const entry = COMMAND_REGISTRY.find(e =>
    e.bindings.some(b => b.name === commandName),
  ) ?? null;

  commandLookupCache.set(commandName, entry);
  return entry;
}

/**
 * Import a module with deduplication to avoid loading the same module twice.
 * Uses module cache to avoid re-importing already loaded modules.
 * @param modulePath - The module path to import.
 * @returns The imported module.
 */
async function importWithDedup(modulePath: string): Promise<Record<string, unknown>> {
  const cachedModule = commandModuleCache.get(modulePath);
  if (cachedModule) {
    return cachedModule;
  }

  const pending = pendingImports.get(modulePath);
  if (pending) {
    return pending as Promise<Record<string, unknown>>;
  }

  const importPromise = import(modulePath).then(module => {
    const moduleObj = module as Record<string, unknown>;
    commandModuleCache.set(modulePath, moduleObj);
    return moduleObj;
  }).finally(() => {
    pendingImports.delete(modulePath);
  });

  pendingImports.set(modulePath, importPromise);
  return importPromise;
}

/**
 * Preload multiple commands in parallel for faster startup.
 * Commands that share the same module will be deduplicated.
 * @param commandNames - Array of command names to preload.
 * @param program - The Commander program instance.
 * @param ctx - The infrastructure context.
 * @returns Promise that resolves when all commands are loaded.
 */
export async function preloadCommands(
  commandNames: string[],
  program: Command,
  ctx: InfrastructureContext,
): Promise<void> {
  const unloaded = commandNames.filter(name => !loadedCommands.has(name));
  if (unloaded.length === 0) return;

  const loadPromises = unloaded.map(name => lazyLoadCommand(name, program, ctx));
  await Promise.allSettled(loadPromises);
}

/**
 * Remove a command from the Commander program by name.
 * @param program - The Commander program instance.
 * @param name - The command name to remove.
 */
function removeCommandFromProgram(program: Command, name: string): void {
  const mutable = program as unknown as { commands: Command[] };
  mutable.commands = mutable.commands.filter(c => c.name() !== name);
}

/**
 * Load the Agent runtime (providers from config) if not already loaded.
 * @param ctx - The infrastructure context.
 * @throws {Error} When agent runtime initialization fails.
 */
async function loadAgentRuntime(ctx: InfrastructureContext): Promise<void> {
  if (loadedCommands.has('agent-runtime')) return;

  try {
    if (getCliMainTestFailureMode(ctx) === 'agent-runtime') {
      throw new Error('forced agent-runtime failure');
    }
    // config-loader removed; no-op for now
    loadedCommands.add('agent-runtime');
  } catch (error) {
    throw new Error(`Agent runtime initialization failed: ${formatErrorMessage(error, 'Agent 运行时')}`, { cause: error });
  }
}

/**
 * Load CLI tool integrations (git, npm, docker, curl) if not already loaded.
 * @param ctx - The infrastructure context.
 * @throws {Error} When CLI tool registration fails.
 */
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

/**
 * Get the test failure mode from environment variable for testing error paths.
 * @param ctx - The infrastructure context.
 * @returns The failure mode or null if not set.
 */
function getCliMainTestFailureMode(ctx: InfrastructureContext): 'cli-tools' | 'agent-runtime' | null {
  const mode = ctx.environment.getEnv('VECTAHUB_TEST_FORCE_CLI_MAIN_FAILURE');
  if (mode === 'cli-tools' || mode === 'agent-runtime') {
    return mode;
  }
  return null;
}

/**
 * Load the dev command group with status, module, validate, test, and build subcommands.
 * @param program - The Commander program instance.
 * @param ctx - The infrastructure context.
 */
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

/**
 * Lazily load a single command by name, replacing its proxy in the program.
 * Uses cached registry lookup for O(1) command resolution.
 * Implements command registration deduplication to avoid duplicate registration.
 * @param commandName - The name of the command to load.
 * @param program - The Commander program instance.
 * @param ctx - The infrastructure context for dependency injection.
 * @throws {Error} When command loading fails (error is caught and logged internally).
 */
export async function lazyLoadCommand(
  commandName: string,
  program: Command,
  ctx: InfrastructureContext,
): Promise<void> {
  if (loadedCommands.has(commandName)) return;

  const pendingRegistration = commandRegistrationAttempts.get(commandName);
  if (pendingRegistration) {
    return pendingRegistration;
  }

  const registrationPromise = doLazyLoadCommand(commandName, program, ctx);
  commandRegistrationAttempts.set(commandName, registrationPromise);

  try {
    await registrationPromise;
  } finally {
    commandRegistrationAttempts.delete(commandName);
  }
}

/**
 * Internal implementation of lazy command loading.
 * @param commandName - The name of the command to load.
 * @param program - The Commander program instance.
 * @param ctx - The infrastructure context for dependency injection.
 */
async function doLazyLoadCommand(
  commandName: string,
  program: Command,
  ctx: InfrastructureContext,
): Promise<void> {
  try {
    if (commandName === 'dev') {
      await loadDevCommand(program, ctx);
      return;
    }

    const entry = getRegistryEntry(commandName);
    if (!entry) return;

    if (entry.needsAgentRuntime) {
      await loadAgentRuntime(ctx);
    }

    const module = await importWithDedup(entry.modulePath);

    if (isMultiFactoryEntry(entry)) {
      const factoryFn = module[entry.multiFactory] as (ctx: InfrastructureContext) => Record<string, Command>;
      const factoryResult = factoryFn(ctx);
      for (const binding of entry.bindings) {
        removeCommandFromProgram(program, binding.name);
        program.addCommand(factoryResult[binding.resultKey]);
        loadedCommands.add(binding.name);
        registeredCommandCache.set(binding.name, factoryResult[binding.resultKey]);
      }
    } else {
      for (const binding of entry.bindings) {
        removeCommandFromProgram(program, binding.name);
        const cmd = binding.isFactory
          ? (module[binding.exportName] as (ctx: InfrastructureContext) => Command)(ctx)
          : module[binding.exportName] as Command;
        program.addCommand(cmd);
        loadedCommands.add(binding.name);
        registeredCommandCache.set(binding.name, cmd);
      }
    }
  } catch (error) {
    const msg = (error as Error).message || String(error);
    commandLoadErrors.set(commandName, msg);
    ctx.logger.getLogger('cli-main').error({ commandName, error }, 'Failed to lazy-load command');
  }
}

/**
 * Lazily load the Agent runtime (providers from config).
 * @param ctx - The infrastructure context.
 * @throws {Error} When agent runtime initialization fails.
 */
export async function lazyLoadAgentRuntime(ctx: InfrastructureContext): Promise<void> {
  await loadAgentRuntime(ctx);
}

/**
 * Lazily load CLI tool integrations (git, npm, docker, curl).
 * @param ctx - The infrastructure context.
 * @throws {Error} When CLI tool registration fails.
 */
export async function lazyLoadCliTools(ctx: InfrastructureContext): Promise<void> {
  await loadCliTools(ctx);
}

/**
 * Resolve a command name from argv if it has a --help flag.
 * @param argv - The command line arguments.
 * @returns The command name if found with --help flag, null otherwise.
 */
export function resolveLazyCommandForHelp(argv: string[]): string | null {
  const hasHelpFlag = argv.includes('--help') || argv.includes('-h');
  if (!hasHelpFlag) return null;

  const commandName = argv.find((arg) => !arg.startsWith('-'));
  if (!commandName) return null;

  return LAZY_COMMAND_METAS.some((cmd) => cmd.name === commandName) ? commandName : null;
}

/**
 * Register proxy commands for all lazy-loadable commands.
 * Each proxy lazily loads the real command on first invocation.
 * @param program - The Commander program instance.
 * @param ctx - The infrastructure context.
 */
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
          const remainingArgs = cmdIndex !== -1
            ? ctx.environment.getArgv().slice(cmdIndex + 1)
            : lazyProxyCmd.args;
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
