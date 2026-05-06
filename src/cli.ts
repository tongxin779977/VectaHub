#!/usr/bin/env node

import process from 'node:process';

process.setMaxListeners(100);

process.removeAllListeners('warning');

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

    globalEventManager.on('SIGINT', () => {
      console.log('\n\n🛑 Shutting down...');
      process.exit(0);
    });

    globalEventManager.on('SIGTERM', () => {
      console.log('\n\n🛑 Shutting down...');
      process.exit(0);
    });
  };
})();

setupGlobalSignals();

import { Command } from 'commander';
import { initAuditLogger, getCurrentSessionId, audit } from './utils/audit.js';
import { setGlobalOptions, isVerbose } from './utils/global-options.js';
import { setLogLevel } from './infrastructure/logger/index.js';
import { runCmd } from './commands/run.js';
import { doctorCmd } from './commands/doctor.js';
import { formatErrorMessage } from './utils/errors.js';
import { loadConfig as loadUtilsConfig } from './utils/config.js';
import { isFirstRun, runFirstRunWizard, loadConfig as loadSetupConfig, saveConfig as saveSetupConfig, setNonInteractiveMode } from './setup/first-run-wizard.js';
import { scanCLITools, updateCLIToolConfig, getAvailableExternalCLI } from './setup/cli-scanner.js';
import { createDefaultInstaller } from './setup/priority-installer.js';
import { completeWorkflowNames, completeTemplateNames, completeConfigCommands, completeShellTypes } from './utils/completion.js';
import { getBashCompletion, getZshCompletion, getFishCompletion } from './utils/completion-scripts.js';

const loadedCommands = new Set<string>();

async function lazyLoadCommand(commandName: string): Promise<void> {
  if (loadedCommands.has(commandName)) return;
  
  try {
    switch (commandName) {
      case 'serve':
      case 'client': {
        const { serveCmd, clientCmd } = await import('./commands/serve.js');
        program.addCommand(serveCmd);
        program.addCommand(clientCmd);
        loadedCommands.add('serve');
        loadedCommands.add('client');
        break;
      }
      case 'security': {
        const { securityCmd } = await import('./commands/security.js');
        program.addCommand(securityCmd);
        loadedCommands.add('security');
        break;
      }
      case 'audit': {
        const { auditCmd } = await import('./commands/audit-cmd.js');
        program.addCommand(auditCmd);
        loadedCommands.add('audit');
        break;
      }
      case 'tools': {
        const { toolsCmd } = await import('./commands/tools.js');
        program.addCommand(toolsCmd);
        loadedCommands.add('tools');
        break;
      }
      case 'list': {
        const { listCmd } = await import('./commands/list.js');
        program.addCommand(listCmd);
        loadedCommands.add('list');
        break;
      }
      case 'mode': {
        const { modeCmd } = await import('./commands/mode.js');
        program.addCommand(modeCmd);
        loadedCommands.add('mode');
        break;
      }
      case 'history': {
        const { historyCmd } = await import('./commands/history.js');
        program.addCommand(historyCmd);
        loadedCommands.add('history');
        break;
      }
      case 'generate': {
        const { generateCmd } = await import('./commands/generate.js');
        program.addCommand(generateCmd);
        loadedCommands.add('generate');
        break;
      }
      case 'schedule': {
        const { scheduleCmd } = await import('./commands/schedule.js');
        program.addCommand(scheduleCmd);
        loadedCommands.add('schedule');
        break;
      }
      case 'daemon': {
        const { daemonCmd } = await import('./commands/daemon.js');
        program.addCommand(daemonCmd);
        loadedCommands.add('daemon');
        break;
      }
      case 'templates': {
        const { templatesCmd, templatesUseCmd, templatesSaveCmd } = await import('./commands/templates.js');
        program.addCommand(templatesCmd.addCommand(templatesUseCmd).addCommand(templatesSaveCmd));
        loadedCommands.add('templates');
        break;
      }
      case 'rollback': {
        const { rollbackCmd } = await import('./commands/list.js');
        program.addCommand(rollbackCmd);
        loadedCommands.add('rollback');
        break;
      }
      case 'verify': {
        const { verifyCmd } = await import('./commands/verify.js');
        program.addCommand(verifyCmd);
        loadedCommands.add('verify');
        break;
      }
      case 'chat': {
        const { chatCmd } = await import('./commands/chat.js');
        program.addCommand(chatCmd);
        loadedCommands.add('chat');
        break;
      }
      case 'plugins': {
        const { pluginsCmd } = await import('./commands/plugins.js');
        program.addCommand(pluginsCmd);
        loadedCommands.add('plugins');
        break;
      }
      case 'monitor': {
        const { monitorCmd } = await import('./commands/monitor.js');
        program.addCommand(monitorCmd);
        loadedCommands.add('monitor');
        break;
      }
      case 'debug': {
        const { debugCmd } = await import('./commands/debug.js');
        program.addCommand(debugCmd);
        loadedCommands.add('debug');
        break;
      }
      case 'export':
      case 'import': {
        const { exportCmd, importCmd } = await import('./commands/export.js');
        program.addCommand(exportCmd);
        program.addCommand(importCmd);
        loadedCommands.add('export');
        loadedCommands.add('import');
        break;
      }
      case 'dev': {
        const { check } = await import('./commands/check.js');
        const { status } = await import('./commands/status.js');
        const { moduleCmd } = await import('./commands/module.js');
        const { validate } = await import('./commands/validate.js');
        const { test } = await import('./commands/test.js');
        const { build } = await import('./commands/build.js');
        const devCmd = new Command('dev').description('Development commands for multi-agent collaboration');
        devCmd.addCommand(check).addCommand(status).addCommand(moduleCmd).addCommand(validate).addCommand(test).addCommand(build);
        program.addCommand(devCmd, { hidden: true });
        loadedCommands.add('dev');
        break;
      }
    }
  } catch (error) {
    console.error(`⚠️  加载命令 ${commandName} 失败:`, (error as Error).message);
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

try {
  initAuditLogger();
} catch (error) {
  console.warn('⚠️  审计日志初始化失败，将继续运行...');
  console.warn(`   原因: ${formatErrorMessage(error, '审计日志')}`);
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
  .version('1.0.1')
  .option('-v, --verbose', '详细输出模式')
  .option('-d, --debug', '调试模式（包含详细输出）')
  .option('--non-interactive', '非交互模式（适用于 CI/CD）')
  .hook('preAction', async (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose || opts.debug) {
      setGlobalOptions({ verbose: opts.verbose || false, debug: opts.debug || false });
      setLogLevel(opts.debug ? 'debug' : 'info');
    }
    if (opts.nonInteractive) {
      setNonInteractiveMode(true);
    }
    
    const commandName = thisCommand.name();
    if (commandName !== 'vectahub') {
      await lazyLoadCommand(commandName);
      await lazyLoadCliTools();
    }
    
    displayPolicyWarning();
    
    try {
      const sessionId = getCurrentSessionId();
      const args = process.argv.slice(3);
      audit.cliCommand(commandName, args, sessionId);
    } catch {
      // audit logging failed silently
    }
  });

program
  .addCommand(runCmd)
  .addCommand(doctorCmd);

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
    } else {
      const config = loadSetupConfig();
      config.first_run_completed = true;
      saveSetupConfig(config);
      console.log('\n🎉 安装完成！所有组件已就绪。\n');
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

program.parse();
