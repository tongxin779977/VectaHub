#!/usr/bin/env node

import { Command } from 'commander';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 引入基础设施模块
import { getDefaultContext } from './infrastructure/context.js';
import { Signal } from './infrastructure/interfaces/environment-service.js';
import { AuditService } from './infrastructure/audit/service.js';
import { AsyncLogWriter } from './infrastructure/trace-audit/async-writer.js';
import { AuditEventType } from './infrastructure/audit/index.js';
import { createCliOutput, isCliOutputHandledError } from './infrastructure/cli-output.js';

// 路径常量
const __dirname = dirname(fileURLToPath(import.meta.url));

// 全局 InfrastructureContext 实例
const ctx = getDefaultContext();

// 初始化标记
let _version: string | undefined;
let _auditLoggerInitialized = false;
let policyWarningShown = false;
let _signalsSetup = false;
let _processListenersSetup = false;

// 加载的命令集合
const loadedCommands = new Set<string>();
const commandLoadErrors = new Map<string, string>();

/**
 * 获取版本号（通过基础设施服务读取）
 */
function getVersion(): string {
  if (!_version) {
    try {
      const pkgPath = join(__dirname, '../package.json');
      const pkgContent = ctx.environment.readFile(pkgPath);
      const pkg = JSON.parse(pkgContent);
      _version = pkg.version;
    } catch (error) {
      ctx.logger.getLogger('cli-main').error({ error }, 'Failed to read package version');
      _version = '0.0.0';
    }
  }
  return _version!;
}

function getCurrentCliOutput() {
  return createCliOutput({ json: ctx.environment.getArgv().includes('--json') });
}

/**
 * 设置全局信号处理（通过基础设施）
 */
function setupGlobalSignals() {
  if (_signalsSetup) return;
  _signalsSetup = true;

  ctx.environment.onSignal(Signal.SIGINT, async () => {
    getCurrentCliOutput().text('\n\n🛑 Shutting down...');
    await AsyncLogWriter.flushAll();
    ctx.environment.exit(0);
  });

  ctx.environment.onSignal(Signal.SIGTERM, async () => {
    getCurrentCliOutput().text('\n\n🛑 Shutting down...');
    await AsyncLogWriter.flushAll();
    ctx.environment.exit(0);
  });
}

/**
 * 设置进程监听器（通过基础设施）
 */
function setupProcessListeners() {
  if (_processListenersSetup) return;
  _processListenersSetup = true;

  // 通过基础设施统一管理进程警告
  ctx.environment.onWarning((warning) => {
    if (warning.name === 'MaxListenersExceededWarning') {
      return;
    }
    if ((warning as Error & { code?: string }).code === 'DEP0205') {
      return;
    }
    ctx.logger.getLogger('cli-main').warn({ warning }, 'Process warning');
  });
}

// 引入必要的工具（保持现有功能）
import { setGlobalOptions, isVerbose } from './utils/global-options.js';
import { formatErrorMessage, toJSONError } from './infrastructure/errors/index.js';
import { loadConfig as loadSetupConfig, saveConfig as saveSetupConfig, setNonInteractiveMode } from './setup/first-run-wizard.js';
import { getAvailableExternalCLI } from './setup/cli-scanner.js';
import { createDefaultInstaller } from './setup/priority-installer.js';
import { getBashCompletion, getZshCompletion, getFishCompletion } from './utils/completion-scripts.js';

function getCliMainTestFailureMode(): 'cli-tools' | 'agent-runtime' | null {
  const mode = ctx.environment.getEnv('VECTAHUB_TEST_FORCE_CLI_MAIN_FAILURE');
  if (mode === 'cli-tools' || mode === 'agent-runtime') {
    return mode;
  }
  return null;
}

function ensureAuditLoggerInitialized(): string {
  if (!_auditLoggerInitialized) {
    _auditLoggerInitialized = true;
  }

  try {
    return ctx.audit.getLogger().getSessionId();
  } catch (error) {
    throw new Error(`Audit logger initialization failed: ${formatErrorMessage(error, '审计日志')}`, { cause: error });
  }
}

/**
 * 错误处理函数
 */
async function handleError(error: unknown): Promise<never> {
  const isJson = ctx.environment.getArgv().includes('--json');
  const output = createCliOutput({ json: isJson });
  
  // 确保审计日志刷盘
  try {
    await AsyncLogWriter.flushAll();
  } catch (error) {
    ctx.logger.getLogger('cli-main').warn({ error }, 'Failed to flush audit logs');
  }

  if (isCliOutputHandledError(error)) {
    ctx.environment.exit(1);
    throw new Error('Should not reach here');
  }
  
  if (isJson) {
    output.json(toJSONError(error), { space: 2 });
  } else {
    output.error(`\n❌ ${formatErrorMessage(error)}`);
    if (isVerbose()) {
      output.error(error instanceof Error && error.stack ? error.stack : String(error));
    }
  }
  // 使用基础设施的 exit 替代原生 process.exit
  ctx.environment.exit(1);
  // 用于类型安全的兜底（理论上不会到达）
  throw new Error('Should not reach here');
}

// 通过基础设施设置未处理错误监听器
ctx.environment.onUncaughtException((error) => {
  handleError(error);
});

ctx.environment.onUnhandledRejection((reason) => {
  handleError(reason);
});

// 移除懒加载代理命令
function removeLazyProxyCommand(commandName: string): void {
  const existingCmd = program.commands.find(c => c.name() === commandName);
  if (existingCmd) {
    // 使用类型安全的方式处理 Commander 的命令
    const programInternal = program as unknown as { commands: Command[] };
    programInternal.commands = programInternal.commands.filter(c => c.name() !== commandName);
  }
}

/**
 * 懒加载命令（保持原有逻辑）
 */
async function lazyLoadCommand(commandName: string): Promise<void> {
  if (loadedCommands.has(commandName)) return;
  
  try {
    switch (commandName) {
      case 'run': {
        const { createRunCmd } = await import('./commands/run.js');
        removeLazyProxyCommand('run');
        program.addCommand(createRunCmd(ctx));
        loadedCommands.add('run');
        break;
      }
      case 'doctor': {
        const { doctorCmd } = await import('./commands/doctor.js');
        removeLazyProxyCommand('doctor');
        program.addCommand(doctorCmd);
        loadedCommands.add('doctor');
        break;
      }
      case 'serve':
      case 'client': {
        const { serveCmd, clientCmd } = await import('./commands/serve.js');
        removeLazyProxyCommand('serve');
        removeLazyProxyCommand('client');
        program.addCommand(serveCmd);
        program.addCommand(clientCmd);
        loadedCommands.add('serve');
        loadedCommands.add('client');
        break;
      }
      case 'security': {
        const { securityCmd } = await import('./commands/security.js');
        removeLazyProxyCommand('security');
        program.addCommand(securityCmd);
        loadedCommands.add('security');
        break;
      }
      case 'audit': {
        const { auditCmd } = await import('./commands/audit-cmd.js');
        removeLazyProxyCommand('audit');
        program.addCommand(auditCmd);
        loadedCommands.add('audit');
        break;
      }
      case 'tools': {
        await lazyLoadAgentRuntime();
        const { toolsCmd } = await import('./commands/tools.js');
        removeLazyProxyCommand('tools');
        program.addCommand(toolsCmd);
        loadedCommands.add('tools');
        break;
      }
      case 'list': {
        const { listCmd } = await import('./commands/list.js');
        removeLazyProxyCommand('list');
        program.addCommand(listCmd);
        loadedCommands.add('list');
        break;
      }
      case 'mode': {
        const { modeCmd } = await import('./commands/mode.js');
        removeLazyProxyCommand('mode');
        program.addCommand(modeCmd);
        loadedCommands.add('mode');
        break;
      }
      case 'history': {
        const { historyCmd } = await import('./commands/history.js');
        removeLazyProxyCommand('history');
        program.addCommand(historyCmd);
        loadedCommands.add('history');
        break;
      }
      case 'detail': {
        const { detailCmd } = await import('./commands/detail.js');
        removeLazyProxyCommand('detail');
        program.addCommand(detailCmd);
        loadedCommands.add('detail');
        break;
      }
      case 'rerun': {
        const { rerunCmd } = await import('./commands/rerun.js');
        removeLazyProxyCommand('rerun');
        program.addCommand(rerunCmd);
        loadedCommands.add('rerun');
        break;
      }
      case 'resume': {
        const { resumeCmd } = await import('./commands/resume.js');
        removeLazyProxyCommand('resume');
        program.addCommand(resumeCmd);
        loadedCommands.add('resume');
        break;
      }
      case 'archive': {
        const { archiveCmd } = await import('./commands/archive.js');
        removeLazyProxyCommand('archive');
        program.addCommand(archiveCmd);
        loadedCommands.add('archive');
        break;
      }
      case 'run-command': {
        const { runCommandCmd } = await import('./commands/run-command.js');
        removeLazyProxyCommand('run-command');
        program.addCommand(runCommandCmd);
        loadedCommands.add('run-command');
        break;
      }
      case 'generate': {
        const { generateCmd } = await import('./commands/generate.js');
        removeLazyProxyCommand('generate');
        program.addCommand(generateCmd);
        loadedCommands.add('generate');
        break;
      }
      case 'schedule': {
        const { scheduleCmd } = await import('./commands/schedule.js');
        removeLazyProxyCommand('schedule');
        program.addCommand(scheduleCmd);
        loadedCommands.add('schedule');
        break;
      }
      case 'daemon': {
        const { daemonCmd } = await import('./commands/daemon.js');
        removeLazyProxyCommand('daemon');
        program.addCommand(daemonCmd);
        loadedCommands.add('daemon');
        break;
      }
      case 'templates': {
        const { templatesCmd, templatesUseCmd, templatesSaveCmd } = await import('./commands/templates.js');
        removeLazyProxyCommand('templates');
        program.addCommand(templatesCmd.addCommand(templatesUseCmd).addCommand(templatesSaveCmd));
        loadedCommands.add('templates');
        break;
      }
      case 'rollback': {
        const { rollbackCmd } = await import('./commands/list.js');
        removeLazyProxyCommand('rollback');
        program.addCommand(rollbackCmd);
        loadedCommands.add('rollback');
        break;
      }
      case 'verify': {
        const { verifyCmd } = await import('./commands/verify.js');
        removeLazyProxyCommand('verify');
        program.addCommand(verifyCmd);
        loadedCommands.add('verify');
        break;
      }
      case 'chat': {
        await lazyLoadAgentRuntime();
        const { chatCmd } = await import('./commands/chat.js');
        removeLazyProxyCommand('chat');
        program.addCommand(chatCmd);
        loadedCommands.add('chat');
        break;
      }
      case 'monitor': {
        const { monitorCmd } = await import('./commands/monitor.js');
        removeLazyProxyCommand('monitor');
        program.addCommand(monitorCmd);
        loadedCommands.add('monitor');
        break;
      }
      case 'debug': {
        const { debugCmd } = await import('./commands/debug.js');
        removeLazyProxyCommand('debug');
        program.addCommand(debugCmd);
        loadedCommands.add('debug');
        break;
      }
      case 'export':
      case 'import': {
        const { exportCmd, importCmd } = await import('./commands/export.js');
        removeLazyProxyCommand('export');
        removeLazyProxyCommand('import');
        program.addCommand(exportCmd);
        program.addCommand(importCmd);
        loadedCommands.add('export');
        loadedCommands.add('import');
        break;
      }
      case 'vscode': {
        await lazyLoadAgentRuntime();
        const { vscodeDiagnosticCmd } = await import('./commands/vscode-diagnostic.js');
        removeLazyProxyCommand('vscode');
        program.addCommand(vscodeDiagnosticCmd);
        loadedCommands.add('vscode');
        break;
      }
      case 'parse-doc': {
        const { parseDocCmd } = await import('./commands/parse-doc.js');
        removeLazyProxyCommand('parse-doc');
        program.addCommand(parseDocCmd);
        loadedCommands.add('parse-doc');
        break;
      }
      case 'run-task':
      case 'run-task-clean-logs': {
        await lazyLoadAgentRuntime();
        const { createRunTaskCmd, createRunTaskCleanLogsCmd } = await import('./commands/run-task.js');
        removeLazyProxyCommand('run-task');
        removeLazyProxyCommand('run-task-clean-logs');
        program.addCommand(createRunTaskCmd(ctx));
        program.addCommand(createRunTaskCleanLogsCmd(ctx));
        loadedCommands.add('run-task');
        loadedCommands.add('run-task-clean-logs');
        break;
      }
      case 'trace': {
        const { traceCmd } = await import('./commands/trace.js');
        removeLazyProxyCommand('trace');
        program.addCommand(traceCmd);
        loadedCommands.add('trace');
        break;
      }
      case 'doc-task-runs': {
        const { docTaskRunsCmd } = await import('./commands/doc-task-runs.js');
        removeLazyProxyCommand('doc-task-runs');
        program.addCommand(docTaskRunsCmd);
        loadedCommands.add('doc-task-runs');
        break;
      }
      case 'recover-task': {
        const { recoverTaskCmd } = await import('./commands/recover-task.js');
        removeLazyProxyCommand('recover-task');
        program.addCommand(recoverTaskCmd);
        loadedCommands.add('recover-task');
        break;
      }
      case 'dev': {
        removeLazyProxyCommand('dev');
        const { status } = await import('./commands/status.js');
        const { moduleCmd } = await import('./commands/module.js');
        const { validate } = await import('./commands/validate.js');
        const { test } = await import('./commands/test.js');
        const { build } = await import('./commands/build.js');
        const devCmd = new Command('dev').description('Development commands for multi-agent collaboration');
        devCmd.addCommand(status).addCommand(moduleCmd).addCommand(validate).addCommand(test).addCommand(build);
        program.addCommand(devCmd, { hidden: true });
        loadedCommands.add('dev');
        break;
      }
      case 'queue': {
        const { queueCmd } = await import('./commands/queue.js');
        removeLazyProxyCommand('queue');
        program.addCommand(queueCmd);
        loadedCommands.add('queue');
        break;
      }
    }
  } catch (error) {
    const msg = (error as Error).message || String(error);
    commandLoadErrors.set(commandName, msg);
    ctx.logger.getLogger('cli-main').error({ commandName, error }, 'Failed to lazy-load command');
  }
}

/**
 * 懒加载 CLI 工具（保持原有逻辑）
 */
async function lazyLoadCliTools(): Promise<void> {
  if (loadedCommands.has('cli-tools')) return;
  
  try {
    if (getCliMainTestFailureMode() === 'cli-tools') {
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
 * 懒加载 Agent 运行时（保持原有逻辑）
 */
async function lazyLoadAgentRuntime(): Promise<void> {
  if (loadedCommands.has('agent-runtime')) return;
  
  try {
    if (getCliMainTestFailureMode() === 'agent-runtime') {
      throw new Error('forced agent-runtime failure');
    }
    const { initializeBuiltInAgents } = await import('./agent-runtime/index.js');
    initializeBuiltInAgents();
    loadedCommands.add('agent-runtime');
  } catch (error) {
    throw new Error(`Agent runtime initialization failed: ${formatErrorMessage(error, 'Agent 运行时')}`, { cause: error });
  }
}

// 检查是否为干运行
const isDryRunInvocation = ctx.environment.getArgv().includes('--dry-run');
if (isDryRunInvocation) {
  ctx.environment.setEnv('VECTAHUB_AUDIT_DISABLED', '1');
}

/**
 * 安全策略警告模板（保持原有功能）
 */
function getSecurityWarningTemplate(policy: string): string {
  const blockTag = policy === 'block' ? ' (当前)' : '';
  const allowTag = policy === 'allow' ? ' (当前)' : '';
  const passthroughTag = policy === 'passthrough' ? ' (当前)' : '';

  return `
╔══════════════════════════════════════════════════════════════╗
║  ⚠️  安全策略警告                                            ║
╠══════════════════════════════════════════════════════════════╣
║  当前命令规则默认策略: ${policy}                            
║                                                              ║
║  为了提高安全性，建议将默认策略设置为 "block"。            ║
║  这样未明确白名单的命令将被拒绝执行。                      ║
║                                                              ║
║  配置示例 (vectahub.config.yaml):                            ║
║    sandbox:                                                  ║
║      defaultPolicy: block                                    ║
║                                                              ║
║  可选策略:                                                   ║
║  - block: 默认拒绝 (推荐，最安全)${blockTag}               
║  - allow: 默认允许${allowTag}                                 
║  - passthrough: 交给危险命令检测${passthroughTag}             
╚══════════════════════════════════════════════════════════════╝
`.trim();
}

/**
 * 显示安全策略警告（通过基础设施获取配置）
 */
function displayPolicyWarning(): void {
  if (ctx.environment.getArgv().includes('--json')) {
    return;
  }

  try {
    const config = ctx.config.getConfig();
    const policy = config.sandbox.defaultPolicy;
    
    if (policy !== 'block') {
      const output = getCurrentCliOutput();
      output.text(getSecurityWarningTemplate(policy));
      output.blank();
    }
  } catch (error) {
    throw new Error(`Security policy warning failed: ${formatErrorMessage(error, '安全策略')}`, { cause: error });
  }
}

// 创建 Commander 程序
const program = new Command();

program
  .name('vectahub')
  .description('VectaHub - Workflow Editor & Engine + OpenCLI')
  .version(getVersion())
  .option('-v, --verbose', '详细输出模式')
  .option('-d, --debug', '调试模式（包含详细输出）')
  .option('--non-interactive', '非交互模式（适用于 CI/CD）')
  .hook('preAction', async (thisCommand) => {
    setupProcessListeners();
    setupGlobalSignals();
    ensureAuditLoggerInitialized();
    const opts = thisCommand.opts();
    if (opts.verbose || opts.debug) {
      setGlobalOptions({ verbose: opts.verbose || false, debug: opts.debug || false });
      ctx.logger.setLogLevel(opts.debug ? 'debug' : 'info');
    }
    if (opts.nonInteractive) {
      setNonInteractiveMode(true);
    }
    const commandArgs = thisCommand.args || [];
    if (commandArgs.includes('--json') || ctx.environment.getArgv().includes('--json')) {
      ctx.logger.setMuted(true);
    }
  });

// 版本命令
program
  .command('version')
  .description('显示版本信息')
  .option('--json', '以 JSON 格式输出')
  .action((options) => {
    const output = createCliOutput({ json: Boolean(options.json) });
    const version = program.version();
    if (options.json) {
      output.json({ version, ok: true });
    } else {
      output.text(`v${version}`);
    }
  });

// 预执行钩子：显示策略警告
program.hook('preAction', async (thisCommand) => {
  if (!policyWarningShown) {
    policyWarningShown = true;
    const cmdName = thisCommand.name();
    if (cmdName !== 'version' && cmdName !== 'help') {
      displayPolicyWarning();
    }
  }
});

// 子命令钩子：使用基础设施的审计服务记录命令
program.hook('preSubcommand', async (thisCommand, subcommand) => {
  const commandName = subcommand.name();
  
  try {
    const sessionId = ensureAuditLoggerInitialized();
    const args = ctx.environment.getArgv().slice(3);
    const strictAudit = new AuditService(ctx.environment, {
      sessionId,
      failureMode: 'fail-closed',
    });
    
    strictAudit.getLogger().write({
      event: AuditEventType.CLI_COMMAND,
      timestamp: new Date().toISOString(),
      sessionId,
      module: 'cli',
      action: commandName,
      input: args,
      output: undefined,
      duration: undefined,
      success: true,
      error: undefined,
      metadata: {}
    });
  } catch (error) {
    throw new Error(`CLI audit event recording failed: ${formatErrorMessage(error, '命令审计')}`, { cause: error });
  }
});

// 设置命令
const setupCmd = new Command('setup')
  .description('运行优先级安装流程')
  .action(async () => {
    const output = getCurrentCliOutput();
    await lazyLoadAgentRuntime();
    output.text('🔧 运行优先级安装流程...\n');
    const installer = createDefaultInstaller();
    if (!installer) {
      output.error('❌ 安装器初始化失败');
      ctx.environment.exit(1);
    }
    // 告诉 TypeScript 我们已经检查过 null 了
    const nonNullInstaller = installer!;
    const summary = await nonNullInstaller.run();
    if (!summary.overallSuccess) {
      output.text('\n⚠️  安装未完全成功，部分功能可能不可用。');
      output.text('💡 重新运行 `vectahub setup` 可修复问题。\n');
      ctx.environment.exit(1);
    } else {
      const config = loadSetupConfig();
      config.first_run_completed = true;
      saveSetupConfig(config);
      output.text('\n🎉 安装完成！所有组件已就绪。\n');
      ctx.environment.exit(0);
    }
  });

// 配置命令
const configCmd = new Command('config')
  .description('管理 VectaHub 配置');

configCmd
  .command('show')
  .description('显示当前配置')
  .action(() => {
    const output = getCurrentCliOutput();
    const config = ctx.config.getConfig();
    output.text('\n📋 当前配置:\n');
    output.text(`首次启动完成: ${config.first_run_completed}`);
    output.text(`LLM 提供商: ${config.ai_providers.vectahub_llm?.provider || '未配置'}`);
    output.text(`LLM 启用: ${config.ai_providers.vectahub_llm?.enabled}`);
    output.text(`优先级: ${config.priority.join(' → ')}`);
    output.text('\n外部 CLI 工具:');
    for (const [name, cliConfig] of Object.entries(config.external_cli)) {
      output.text(`  ${name}: 启用=${cliConfig.enabled}, 权限=${cliConfig.has_permission}`);
    }
    output.blank();
  });

configCmd
  .command('reset')
  .description('重置配置并重新运行安装流程')
  .action(async () => {
    const output = getCurrentCliOutput();
    output.text('⚠️  重置配置...\n');
    const config = loadSetupConfig();
    config.first_run_completed = false;
    config.ai_providers.vectahub_llm = {
      provider: '',
      enabled: false,
    };
    saveSetupConfig(config);
    output.text('✅ 配置已重置\n');
    const installer = createDefaultInstaller();
    if (installer) {
      await installer.run();
    }
  });

configCmd
  .command('tools')
  .description('列出已配置的 CLI 工具')
  .action(async () => {
    const output = getCurrentCliOutput();
    await lazyLoadAgentRuntime();
    await lazyLoadCliTools();
    const available = getAvailableExternalCLI();
    output.text('\n📋 可用的外部 CLI 工具:\n');
    if (available.length === 0) {
      output.text('  (无)');
    } else {
      available.forEach(tool => output.text(`  ✅ ${tool}`));
    }
    output.blank();
  });

// 补全命令
const completionCmd = new Command('completion')
  .description('生成命令补全脚本')
  .argument('<shell>', '目标shell类型: bash, zsh, fish')
  .action((shell) => {
    const output = getCurrentCliOutput();
    switch (shell) {
      case 'bash':
        output.text(getBashCompletion());
        break;
      case 'zsh':
        output.text(getZshCompletion());
        break;
      case 'fish':
        output.text(getFishCompletion());
        break;
      default:
        output.error(`❌ 不支持的shell类型: ${shell}`);
        output.text('支持的类型: bash, zsh, fish');
        ctx.environment.exit(1);
    }
  });

// 注册所有顶级命令
program.addCommand(completionCmd);
program.addCommand(setupCmd);
program.addCommand(configCmd);

// 懒加载命令列表（保持原有功能）
const lazyLoadableCommands = [
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
  { name: 'dev', description: '开发命令' },
];

// 解析帮助命令的懒加载
function resolveLazyCommandForHelp(argv: string[]): string | null {
  const hasHelpFlag = argv.includes('--help') || argv.includes('-h');
  if (!hasHelpFlag) {
    return null;
  }

  const commandName = argv.find((arg) => !arg.startsWith('-'));
  if (!commandName) {
    return null;
  }

  return lazyLoadableCommands.some((cmd) => cmd.name === commandName) ? commandName : null;
}

// 注册所有懒加载命令的代理入口
for (const cmdInfo of lazyLoadableCommands) {
  const lazyProxyCmd = new Command(cmdInfo.name)
    .description(cmdInfo.description);
  
  if ('argument' in cmdInfo) {
    lazyProxyCmd.argument(cmdInfo.argument as string);
  }
  
  lazyProxyCmd
    .allowUnknownOption()
    .arguments('[args...]')
    .action(async () => {
      const output = getCurrentCliOutput();
      const cmdName = cmdInfo.name;
      if (!loadedCommands.has(cmdName)) {
        await lazyLoadCommand(cmdName);
        await lazyLoadCliTools();
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

// 提前加载帮助命令
const lazyCommandForHelp = resolveLazyCommandForHelp(ctx.environment.getArgv().slice(2));
if (lazyCommandForHelp) {
  await lazyLoadCommand(lazyCommandForHelp);
  await lazyLoadCliTools();
}

// 开始执行程序
program.parseAsync(ctx.environment.getArgv()).catch(handleError);
