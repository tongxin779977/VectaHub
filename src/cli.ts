#!/usr/bin/env node

import process from 'node:process';

process.setMaxListeners(100);

process.on('warning', (warning) => {
  if (warning.name === 'MaxListenersExceededWarning') {
    return;
  }
  console.warn(warning);
});

import { globalEventManager } from './utils/event-manager.js';

const setupGlobalSignals = (() => {
  let initialized = false;
  return () => {
    if (initialized) return;
    initialized = true;

    globalEventManager.on('SIGINT', async () => {
      console.log('\n\n🛑 Shutting down...');
      await AsyncLogWriter.flushAll();
      process.exit(0);
    });

    globalEventManager.on('SIGTERM', async () => {
      console.log('\n\n🛑 Shutting down...');
      await AsyncLogWriter.flushAll();
      process.exit(0);
    });
  };
})();

setupGlobalSignals();

import { Command } from 'commander';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ESM-safe: use readFileSync (already imported) instead of require()
let _version: string | undefined;
function getVersion(): string {
  if (!_version) {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
    _version = pkg.version;
  }
  return _version!;
}
const VERSION = getVersion();
import { initAuditLogger, getCurrentSessionId, audit } from './utils/audit.js';
import { setGlobalOptions, isVerbose } from './utils/global-options.js';
import { setLogLevel, setMuted } from './infrastructure/logger/index.js';
// runCmd and doctorCmd are lazy-loaded via the placeholder system below
import { formatErrorMessage, toJSONError } from './utils/errors.js';
import { loadConfig as loadUtilsConfig } from './utils/config.js';
import { AsyncLogWriter } from './infrastructure/trace-audit/async-writer.js';

// Error handling helper
async function handleError(error: unknown): Promise<never> {
  const isJson = process.argv.includes('--json');
  
  // 确保审计日志刷盘
  try {
    await AsyncLogWriter.flushAll();
  } catch {
    // 忽略刷盘错误
  }
  
  if (isJson) {
    console.log(JSON.stringify(toJSONError(error), null, 2));
  } else {
    console.error(`\n❌ ${formatErrorMessage(error)}`);
    if (isVerbose()) {
      console.error(error);
    }
  }
  process.exit(1);
}

process.on('unhandledRejection', (reason) => {
  handleError(reason);
});

process.on('uncaughtException', (error) => {
  handleError(error);
});
import { isFirstRun, runFirstRunWizard, loadConfig as loadSetupConfig, saveConfig as saveSetupConfig, setNonInteractiveMode } from './setup/first-run-wizard.js';
import { scanCLITools, updateCLIToolConfig, getAvailableExternalCLI } from './setup/cli-scanner.js';
import { createDefaultInstaller } from './setup/priority-installer.js';
import { completeWorkflowNames, completeTemplateNames, completeConfigCommands, completeShellTypes } from './utils/completion.js';
import { getBashCompletion, getZshCompletion, getFishCompletion } from './utils/completion-scripts.js';

const loadedCommands = new Set<string>();
const commandLoadErrors = new Map<string, string>();

function removePlaceholderCommand(commandName: string): void {
  const existingCmd = program.commands.find(c => c.name() === commandName);
  if (existingCmd) {
    // Commander's commands array is readonly in types, use any cast for dynamic modification
    (program as any).commands = program.commands.filter((c: any) => c.name() !== commandName);
  }
}

async function lazyLoadCommand(commandName: string): Promise<void> {
  if (loadedCommands.has(commandName)) return;
  
  try {
    switch (commandName) {
      case 'run': {
        const { runCmd } = await import('./commands/run.js');
        removePlaceholderCommand('run');
        program.addCommand(runCmd);
        loadedCommands.add('run');
        break;
      }
      case 'doctor': {
        const { doctorCmd } = await import('./commands/doctor.js');
        removePlaceholderCommand('doctor');
        program.addCommand(doctorCmd);
        loadedCommands.add('doctor');
        break;
      }
      case 'serve':
      case 'client': {
        const { serveCmd, clientCmd } = await import('./commands/serve.js');
        removePlaceholderCommand('serve');
        removePlaceholderCommand('client');
        program.addCommand(serveCmd);
        program.addCommand(clientCmd);
        loadedCommands.add('serve');
        loadedCommands.add('client');
        break;
      }
      case 'security': {
        const { securityCmd } = await import('./commands/security.js');
        removePlaceholderCommand('security');
        program.addCommand(securityCmd);
        loadedCommands.add('security');
        break;
      }
      case 'audit': {
        const { auditCmd } = await import('./commands/audit-cmd.js');
        removePlaceholderCommand('audit');
        program.addCommand(auditCmd);
        loadedCommands.add('audit');
        break;
      }
      case 'tools': {
        const { toolsCmd } = await import('./commands/tools.js');
        removePlaceholderCommand('tools');
        program.addCommand(toolsCmd);
        loadedCommands.add('tools');
        break;
      }
      case 'list': {
        const { listCmd } = await import('./commands/list.js');
        removePlaceholderCommand('list');
        program.addCommand(listCmd);
        loadedCommands.add('list');
        break;
      }
      case 'mode': {
        const { modeCmd } = await import('./commands/mode.js');
        removePlaceholderCommand('mode');
        program.addCommand(modeCmd);
        loadedCommands.add('mode');
        break;
      }
      case 'history': {
        const { historyCmd } = await import('./commands/history.js');
        removePlaceholderCommand('history');
        program.addCommand(historyCmd);
        loadedCommands.add('history');
        break;
      }
      case 'detail': {
        const { detailCmd } = await import('./commands/detail.js');
        removePlaceholderCommand('detail');
        program.addCommand(detailCmd);
        loadedCommands.add('detail');
        break;
      }
      case 'run-command': {
        const { runCommandCmd } = await import('./commands/run-command.js');
        removePlaceholderCommand('run-command');
        program.addCommand(runCommandCmd);
        loadedCommands.add('run-command');
        break;
      }
      case 'generate': {
        const { generateCmd } = await import('./commands/generate.js');
        removePlaceholderCommand('generate');
        program.addCommand(generateCmd);
        loadedCommands.add('generate');
        break;
      }
      case 'schedule': {
        const { scheduleCmd } = await import('./commands/schedule.js');
        removePlaceholderCommand('schedule');
        program.addCommand(scheduleCmd);
        loadedCommands.add('schedule');
        break;
      }
      case 'daemon': {
        const { daemonCmd } = await import('./commands/daemon.js');
        removePlaceholderCommand('daemon');
        program.addCommand(daemonCmd);
        loadedCommands.add('daemon');
        break;
      }
      case 'templates': {
        const { templatesCmd, templatesUseCmd, templatesSaveCmd } = await import('./commands/templates.js');
        removePlaceholderCommand('templates');
        program.addCommand(templatesCmd.addCommand(templatesUseCmd).addCommand(templatesSaveCmd));
        loadedCommands.add('templates');
        break;
      }
      case 'rollback': {
        const { rollbackCmd } = await import('./commands/list.js');
        removePlaceholderCommand('rollback');
        program.addCommand(rollbackCmd);
        loadedCommands.add('rollback');
        break;
      }
      case 'verify': {
        const { verifyCmd } = await import('./commands/verify.js');
        removePlaceholderCommand('verify');
        program.addCommand(verifyCmd);
        loadedCommands.add('verify');
        break;
      }
      case 'chat': {
        const { chatCmd } = await import('./commands/chat.js');
        removePlaceholderCommand('chat');
        program.addCommand(chatCmd);
        loadedCommands.add('chat');
        break;
      }
      case 'monitor': {
        const { monitorCmd } = await import('./commands/monitor.js');
        removePlaceholderCommand('monitor');
        program.addCommand(monitorCmd);
        loadedCommands.add('monitor');
        break;
      }
      case 'debug': {
        const { debugCmd } = await import('./commands/debug.js');
        removePlaceholderCommand('debug');
        program.addCommand(debugCmd);
        loadedCommands.add('debug');
        break;
      }
      case 'export':
      case 'import': {
        const { exportCmd, importCmd } = await import('./commands/export.js');
        removePlaceholderCommand('export');
        removePlaceholderCommand('import');
        program.addCommand(exportCmd);
        program.addCommand(importCmd);
        loadedCommands.add('export');
        loadedCommands.add('import');
        break;
      }
      case 'vscode': {
        const { vscodeDiagnosticCmd } = await import('./commands/vscode-diagnostic.js');
        removePlaceholderCommand('vscode');
        program.addCommand(vscodeDiagnosticCmd);
        loadedCommands.add('vscode');
        break;
      }
      case 'parse-doc': {
        const { parseDocCmd } = await import('./commands/parse-doc.js');
        removePlaceholderCommand('parse-doc');
        program.addCommand(parseDocCmd);
        loadedCommands.add('parse-doc');
        break;
      }
      case 'run-task': {
        const { runTaskCmd } = await import('./commands/run-task.js');
        removePlaceholderCommand('run-task');
        program.addCommand(runTaskCmd);
        loadedCommands.add('run-task');
        break;
      }
      case 'trace': {
        const { traceCmd } = await import('./commands/trace.js');
        removePlaceholderCommand('trace');
        program.addCommand(traceCmd);
        loadedCommands.add('trace');
        break;
      }
      case 'doc-task-runs': {
        const { docTaskRunsCmd } = await import('./commands/doc-task-runs.js');
        removePlaceholderCommand('doc-task-runs');
        program.addCommand(docTaskRunsCmd);
        loadedCommands.add('doc-task-runs');
        break;
      }
      case 'dev': {
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
        removePlaceholderCommand('queue');
        program.addCommand(queueCmd);
        loadedCommands.add('queue');
        break;
      }
    }
  } catch (error) {
    const msg = (error as Error).message || String(error);
    commandLoadErrors.set(commandName, msg);
    console.error(`⚠️  加载命令 ${commandName} 失败:`, msg);
  }
}

async function lazyLoadCliTools(): Promise<void> {
  if (loadedCommands.has('cli-tools')) return;
  
  try {
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
    console.warn('⚠️  工具注册失败，将继续运行...');
    console.warn(`   原因: ${formatErrorMessage(error, '工具注册')}`);
  }
}

// Defer initAuditLogger() to preAction hook to avoid sync IO at top level
let _auditLoggerInitialized = false;
const isDryRunInvocation = process.argv.includes('--dry-run');
if (isDryRunInvocation) {
  process.env.VECTAHUB_AUDIT_DISABLED = '1';
}

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

function displayPolicyWarning(): void {
  if (process.argv.includes('--json')) {
    return;
  }

  try {
    const config = loadUtilsConfig();
    const policy = config.sandbox.defaultPolicy;
    
    if (policy !== 'block') {
      console.log(getSecurityWarningTemplate(policy));
      console.log();
    }
  } catch {
    // 静默失败
  }
}

const program = new Command();

program
  .name('vectahub')
  .description('VectaHub - Workflow Editor & Engine + OpenCLI')
  .version(VERSION)
  .option('-v, --verbose', '详细输出模式')
  .option('-d, --debug', '调试模式（包含详细输出）')
  .option('--non-interactive', '非交互模式（适用于 CI/CD）')
  .hook('preAction', async (thisCommand) => {
    // Lazy-init audit logger on first command invocation (not at top level)
    if (!_auditLoggerInitialized) {
      _auditLoggerInitialized = true;
      try {
        initAuditLogger();
      } catch (error) {
        console.warn('⚠️  审计日志初始化失败，将继续运行...');
        console.warn(`   原因: ${formatErrorMessage(error, '审计日志')}`);
      }
    }
    const opts = thisCommand.opts();
    if (opts.verbose || opts.debug) {
      setGlobalOptions({ verbose: opts.verbose || false, debug: opts.debug || false });
      setLogLevel(opts.debug ? 'debug' : 'info');
    }
    if (opts.nonInteractive) {
      setNonInteractiveMode(true);
    }
    const commandArgs = thisCommand.args || [];
    if (commandArgs.includes('--json') || process.argv.includes('--json')) {
      setMuted(true);
    }
  });

program
  .command('version')
  .description('显示版本信息')
  .option('--json', '以 JSON 格式输出')
  .action((options) => {
    const version = VERSION;
    if (options.json) {
      console.log(JSON.stringify({ version, ok: true }));
    } else {
      console.log(`v${version}`);
    }
  });

// Defer policy warning to preAction hook to avoid blocking --version path
let policyWarningShown = false;
program.hook('preAction', async (thisCommand) => {
  if (!policyWarningShown) {
    policyWarningShown = true;
    const cmdName = thisCommand.name();
    if (cmdName !== 'version' && cmdName !== 'help') {
      displayPolicyWarning();
    }
  }
});

// Hook for audit logging (lazy loading is handled in placeholder actions)
program.hook('preSubcommand', async (thisCommand, subcommand) => {
  const commandName = subcommand.name();
  
  try {
    const sessionId = getCurrentSessionId();
    const args = process.argv.slice(3);
    audit.cliCommand(commandName, args, sessionId);
  } catch {
    // audit logging failed silently
  }
});

// runCmd and doctorCmd are registered as lazy-loadable commands below

const setupCmd = new Command('setup')
  .description('运行优先级安装流程')
  .action(async () => {
    console.log('🔧 运行优先级安装流程...\n');
    const installer = createDefaultInstaller();
    if (!installer) {
      console.error('❌ 安装器初始化失败');
      process.exit(1);
    }
    const summary = await installer.run();
    if (!summary.overallSuccess) {
      console.log('\n⚠️  安装未完全成功，部分功能可能不可用。');
      console.log('💡 重新运行 `vectahub setup` 可修复问题。\n');
      process.exit(1);
    } else {
      const config = loadSetupConfig();
      config.first_run_completed = true;
      saveSetupConfig(config);
      console.log('\n🎉 安装完成！所有组件已就绪。\n');
      process.exit(0);
    }
  });

const configCmd = new Command('config')
  .description('管理 VectaHub 配置');

configCmd
  .command('show')
  .description('显示当前配置')
  .action(() => {
    const config = loadSetupConfig();
    console.log('\n📋 当前配置:\n');
    console.log(`首次启动完成: ${config.first_run_completed}`);
    console.log(`LLM 提供商: ${config.ai_providers.vectahub_llm.provider || '未配置'}`);
    console.log(`LLM 启用: ${config.ai_providers.vectahub_llm.enabled}`);
    console.log(`优先级: ${config.priority.join(' → ')}`);
    console.log('\n外部 CLI 工具:');
    for (const [name, cliConfig] of Object.entries(config.external_cli)) {
      console.log(`  ${name}: 启用=${cliConfig.enabled}, 权限=${cliConfig.has_permission}`);
    }
    console.log();
  });

configCmd
  .command('reset')
  .description('重置配置并重新运行安装流程')
  .action(async () => {
    console.log('⚠️  重置配置...\n');
    const config = loadSetupConfig();
    config.first_run_completed = false;
    config.ai_providers.vectahub_llm = {
      provider: '',
      enabled: false,
    };
    saveSetupConfig(config);
    console.log('✅ 配置已重置\n');
    const installer = createDefaultInstaller();
    if (installer) {
      await installer.run();
    }
  });

configCmd
  .command('tools')
  .description('列出已配置的 CLI 工具')
  .action(async () => {
    await lazyLoadCliTools();
    const available = getAvailableExternalCLI();
    console.log('\n📋 可用的外部 CLI 工具:\n');
    if (available.length === 0) {
      console.log('  (无)');
    } else {
      available.forEach(tool => console.log(`  ✅ ${tool}`));
    }
    console.log();
  });

const completionCmd = new Command('completion')
  .description('生成命令补全脚本')
  .argument('<shell>', '目标shell类型: bash, zsh, fish')
  .action((shell) => {
    switch (shell) {
      case 'bash':
        console.log(getBashCompletion());
        break;
      case 'zsh':
        console.log(getZshCompletion());
        break;
      case 'fish':
        console.log(getFishCompletion());
        break;
      default:
        console.error(`❌ 不支持的shell类型: ${shell}`);
        console.log('支持的类型: bash, zsh, fish');
        process.exit(1);
    }
  });



program.addCommand(completionCmd);
program.addCommand(setupCmd);
program.addCommand(configCmd);

// Register lazy-loadable commands with minimal placeholder - actual implementation loaded on use
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
  { name: 'doc-task-runs', description: '查询文档任务运行记录' },
  { name: 'trace', description: '查看链路追踪数据' },
  { name: 'queue', description: '管理诊断队列' },
  { name: 'dev', description: '开发命令' },
];

for (const cmdInfo of lazyLoadableCommands) {
  const placeholderCmd = new Command(cmdInfo.name)
    .description(cmdInfo.description);
  
  if ((cmdInfo as any).argument) {
    placeholderCmd.argument((cmdInfo as any).argument);
  }
  
  placeholderCmd
    .allowUnknownOption()
    .arguments('[args...]')
    .action(async () => {
      const cmdName = cmdInfo.name;
      if (!loadedCommands.has(cmdName)) {
        await lazyLoadCommand(cmdName);
        await lazyLoadCliTools();
      }
      
      const loadedCmd = program.commands.find(c => c.name() === cmdName);
      if (loadedCmd && loadedCmd !== placeholderCmd) {
        const cmdIndex = process.argv.findIndex(arg => arg === cmdName);
        const remainingArgs = process.argv.slice(cmdIndex + 1);
        await loadedCmd.parseAsync(remainingArgs, { from: 'user' });
      } else {
        const loadError = commandLoadErrors.get(cmdName);
        console.error(`❌ Command '${cmdName}' failed to load properly`);
        if (loadError) {
          console.error(`   原因: ${loadError}`);
        }
        process.exit(1);
      }
    });
  program.addCommand(placeholderCmd);
}

program.parseAsync(process.argv).catch(handleError);
