#!/usr/bin/env node

import { Command } from 'commander';
import { initAuditLogger, getCurrentSessionId, audit } from './utils/audit.js';
import { check } from './commands/check.js';
import { status } from './commands/status.js';
import { moduleCmd } from './commands/module.js';
import { validate } from './commands/validate.js';
import { test } from './commands/test.js';
import { build } from './commands/build.js';
import { serveCmd, clientCmd } from './commands/serve.js';
import { securityCmd } from './commands/security.js';
import { auditCmd } from './commands/audit-cmd.js';
import { toolsCmd } from './commands/tools.js';
import { runCmd } from './commands/run.js';
import { listCmd } from './commands/list.js';
import { modeCmd } from './commands/mode.js';
import { historyCmd } from './commands/history.js';
import { doctorCmd } from './commands/doctor.js';
import { generateCmd } from './commands/generate.js';
import { scheduleCmd } from './commands/schedule.js';
import { daemonCmd } from './commands/daemon.js';
import { getCliToolRegistry } from './cli-tools/index.js';
import { gitTool } from './cli-tools/tools/git.js';
import { npmTool } from './cli-tools/tools/npm.js';
import { dockerTool } from './cli-tools/tools/docker.js';
import { curlTool } from './cli-tools/tools/curl.js';
import { formatErrorMessage } from './utils/errors.js';
import { loadConfig as loadUtilsConfig } from './utils/config.js';
import { isFirstRun, runFirstRunWizard, loadConfig as loadSetupConfig, saveConfig as saveSetupConfig } from './setup/first-run-wizard.js';
import { scanCLITools, updateCLIToolConfig, getAvailableExternalCLI } from './setup/cli-scanner.js';

try {
  initAuditLogger();
} catch (error) {
  console.warn('⚠️  审计日志初始化失败，将继续运行...');
  console.warn(`   原因: ${formatErrorMessage(error, '审计日志')}`);
}

try {
    const registry = getCliToolRegistry();
    registry.register(gitTool);
    registry.register(npmTool);
    registry.register(dockerTool);
    registry.register(curlTool);
  } catch (error) {
    console.warn('⚠️  工具注册失败，将继续运行...');
    console.warn(`   原因: ${formatErrorMessage(error, '工具注册')}`);
  }

/**
 * 安全策略警告模板
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
 * 显示安全策略警告 (在 Commander.js 上下文中)
 */
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
  .version('1.0.0')
  .hook('preAction', (thisCommand) => {
    displayPolicyWarning();
    
    try {
      const sessionId = getCurrentSessionId();
      const commandName = thisCommand.name();
      const args = process.argv.slice(3);
      audit.cliCommand(commandName, args, sessionId);
    } catch (error) {
      console.debug('审计日志记录失败:', formatErrorMessage(error, 'preAction'));
    }
  });

program
  .command('dev')
  .description('Development commands for multi-agent collaboration')
  .addCommand(check)
  .addCommand(status)
  .addCommand(moduleCmd)
  .addCommand(validate)
  .addCommand(test)
  .addCommand(build);

program
  .addCommand(serveCmd)
  .addCommand(clientCmd)
  .addCommand(securityCmd)
  .addCommand(auditCmd)
  .addCommand(toolsCmd)
  .addCommand(runCmd)
  .addCommand(listCmd)
  .addCommand(modeCmd)
  .addCommand(historyCmd)
  .addCommand(doctorCmd)
  .addCommand(generateCmd)
  .addCommand(scheduleCmd)
  .addCommand(daemonCmd);

// Setup 命令
const setupCmd = new Command('setup')
  .description('运行首次配置向导')
  .action(async () => {
    console.log('🔧 运行配置向导...\n');
    await runFirstRunWizard();
    await scanCLITools();
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
  .description('重置配置并重新运行向导')
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
    await runFirstRunWizard();
    await scanCLITools();
  });

configCmd
  .command('tools')
  .description('列出已配置的 CLI 工具')
  .action(() => {
    const available = getAvailableExternalCLI();
    console.log('\n📋 可用的外部 CLI 工具:\n');
    if (available.length === 0) {
      console.log('  (无)');
    } else {
      available.forEach(tool => console.log(`  ✅ ${tool}`));
    }
    console.log();
  });

program.addCommand(setupCmd);
program.addCommand(configCmd);

program.parse();
