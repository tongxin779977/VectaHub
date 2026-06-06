#!/usr/bin/env node

// --- Third-party ---
import { Command } from 'commander';

// --- Internal: infrastructure ---
import { getDefaultContext } from './infrastructure/context.js';
import { AuditService } from './infrastructure/audit/service.js';
import { AuditEventType } from './infrastructure/audit/index.js';
import { AsyncLogWriter } from './infrastructure/trace-audit/async-writer.js';
import { createCliOutput, isCliOutputHandledError } from './infrastructure/cli-output.js';
import { formatErrorMessage, toJSONError } from './infrastructure/errors/index.js';

// --- Internal: utils ---
import { getVersion } from './utils/version.js';
import { setGlobalOptions, isVerbose } from './utils/global-options.js';
import { getBashCompletion, getZshCompletion, getFishCompletion } from './utils/completion-scripts.js';

// --- Internal: setup ---
import { loadConfig as loadSetupConfig, saveConfig as saveSetupConfig, setNonInteractiveMode } from './setup/first-run-wizard.js';
import { getAvailableExternalCLI } from './setup/cli-scanner.js';
import { createDefaultInstaller } from './setup/priority-installer.js';

// --- Internal: CLI modules (extracted) ---
import { lazyLoadCommand, lazyLoadCliTools, lazyLoadAgentRuntime, resolveLazyCommandForHelp, registerLazyProxyCommands } from './cli-command-registry.js';
import { setupGlobalSignals, setupProcessListeners } from './cli-signal-handler.js';
import { displayPolicyWarning } from './cli-security.js';

const ctx = getDefaultContext();

let auditLoggerInitialized = false;
let policyWarningShown = false;

/** Dependencies for the first-run wizard. */
const firstRunWizardDeps = {
  environment: ctx.environment,
  logger: ctx.logger.getLogger('setup'),
};

/**
 * Return a CliOutput instance that switches to JSON mode when --json is present.
 * @returns A CliOutput instance configured for the current output mode.
 */
function getCurrentCliOutput() {
  return createCliOutput({ json: ctx.environment.getArgv().includes('--json') });
}

/**
 * Ensure the audit logger is initialized and return the current session ID.
 * Uses retry mechanism for transient initialization failures.
 * @returns The current audit session ID.
 * @throws {Error} When audit logger initialization fails after retries.
 */
function ensureAuditLoggerInitialized(): string {
  if (!auditLoggerInitialized) {
    auditLoggerInitialized = true;
  }

  try {
    return ctx.audit.getLogger().getSessionId();
  } catch (error) {
    throw new Error(`Audit logger initialization failed: ${formatErrorMessage(error, '审计日志')}`, { cause: error });
  }
}

/**
 * Unified error handler for uncaught exceptions and unhandled rejections.
 * Flushes audit logs before exiting, with graceful degradation on flush failure.
 * @param error - The uncaught error or rejected promise reason.
 * @returns Never returns; always exits the process.
 */
async function handleError(error: unknown): Promise<never> {
  const isJson = ctx.environment.getArgv().includes('--json');
  const output = createCliOutput({ json: isJson });

  try {
    await AsyncLogWriter.flushAll();
  } catch (flushError) {
    ctx.logger.getLogger('cli-main').warn({ error: flushError }, 'Failed to flush audit logs');
  }

  if (isCliOutputHandledError(error)) {
    ctx.environment.exit(1);
    throw new Error('Should not reach here');
  }

  if (isJson) {
    output.json(toJSONError(error, isVerbose()), { space: 2 });
  } else {
    output.error(`\n❌ ${formatErrorMessage(error)}`);
    if (isVerbose()) {
      output.error(error instanceof Error && error.stack ? error.stack : String(error));
    }
  }
  ctx.environment.exit(1);
  throw new Error('Should not reach here');
}

ctx.environment.onUncaughtException((error) => {
  handleError(error);
});

ctx.environment.onUnhandledRejection((reason) => {
  handleError(reason);
});

if (ctx.environment.getArgv().includes('--dry-run')) {
  ctx.environment.setEnv('VECTAHUB_AUDIT_DISABLED', '1');
}

/** The main Commander program instance for CLI command parsing and execution. */
const program = new Command();

program
  .name('vectahub')
  .description('VectaHub - Workflow Editor & Engine + OpenCLI')
  .version(getVersion())
  .option('-v, --verbose', '详细输出模式')
  .option('-d, --debug', '调试模式（包含详细输出）')
  .option('--non-interactive', '非交互模式（适用于 CI/CD）')
  .hook('preAction', async (thisCommand) => {
    setupProcessListeners(ctx);
    setupGlobalSignals(ctx);
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

/** Register the built-in `version` subcommand with JSON output support. */
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

program.hook('preAction', async (thisCommand) => {
  if (!policyWarningShown) {
    policyWarningShown = true;
    const cmdName = thisCommand.name();
    if (cmdName !== 'version' && cmdName !== 'help') {
      displayPolicyWarning(ctx);
    }
  }
});

program.hook('preSubcommand', async (_thisCommand, subcommand) => {
  const commandName = subcommand.name();

  try {
    const sessionId = ensureAuditLoggerInitialized();
    const args = ctx.environment.getArgv().slice(3);
    const auditService = new AuditService(ctx.environment, {
      sessionId,
      failureMode: 'fail-open',
      onError: (error: Error) => {
        process.stderr.write(`[audit] warning: ${error.message}\n`);
      },
    });

    auditService.getLogger().write({
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
    process.stderr.write(`[audit] warning: CLI audit event recording failed: ${formatErrorMessage(error, '命令审计')}\n`);
  }
});

/** Register the built-in `setup` subcommand for priority installation flow. */
const setupCmd = new Command('setup')
  .description('运行优先级安装流程')
  .action(async () => {
    const output = getCurrentCliOutput();
    await lazyLoadAgentRuntime(ctx);
    output.text('🔧 运行优先级安装流程...\n');
    const installer = createDefaultInstaller(ctx);
    if (!installer) {
      output.error('❌ 安装器初始化失败');
      ctx.environment.exit(1);
    }
    const nonNullInstaller = installer!;
    const summary = await nonNullInstaller.run();
    if (!summary.overallSuccess) {
      output.text('\n⚠️  安装未完全成功，部分功能可能不可用。');
      output.text('💡 重新运行 `vectahub setup` 可修复问题。\n');
      ctx.environment.exit(1);
    } else {
      const config = loadSetupConfig(firstRunWizardDeps);
      config.first_run_completed = true;
      saveSetupConfig(config, firstRunWizardDeps);
      output.text('\n🎉 安装完成！所有组件已就绪。\n');
      ctx.environment.exit(0);
    }
  });

/** Register the built-in `config` subcommand group with show, reset, and tools subcommands. */
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
    const config = loadSetupConfig(firstRunWizardDeps);
    config.first_run_completed = false;
    config.ai_providers.vectahub_llm = {
      provider: '',
      enabled: false,
    };
    saveSetupConfig(config, firstRunWizardDeps);
    output.text('✅ 配置已重置\n');
    const installer = createDefaultInstaller(ctx);
    if (installer) {
      await installer.run();
    }
  });

configCmd
  .command('tools')
  .description('列出已配置的 CLI 工具')
  .action(async () => {
    const output = getCurrentCliOutput();
    await lazyLoadAgentRuntime(ctx);
    await lazyLoadCliTools(ctx);
    const available = getAvailableExternalCLI({
      environment: ctx.environment,
    });
    output.text('\n📋 可用的外部 CLI 工具:\n');
    if (available.length === 0) {
      output.text('  (无)');
    } else {
      available.forEach(tool => output.text(`  ✅ ${tool}`));
    }
    output.blank();
  });

/** Register the built-in `completion` subcommand for shell completion script generation. */
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

program.addCommand(completionCmd);
program.addCommand(setupCmd);
program.addCommand(configCmd);

registerLazyProxyCommands(program, ctx);

const lazyCommandForHelp = resolveLazyCommandForHelp(ctx.environment.getArgv().slice(2));
if (lazyCommandForHelp) {
  await lazyLoadCommand(lazyCommandForHelp, program, ctx);
  await lazyLoadCliTools(ctx);
}

program.parseAsync(ctx.environment.getArgv()).catch(handleError);
