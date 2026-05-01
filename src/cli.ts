#!/usr/bin/env node

import { Command } from 'commander';
import { initAuditLogger, getCurrentSessionId, audit } from './utils/audit.js';
import { check } from './utils/check.js';
import { status } from './utils/status.js';
import { moduleCmd } from './utils/module.js';
import { validate } from './utils/validate.js';
import { test } from './utils/test.js';
import { build } from './utils/build.js';
import { serveCmd, clientCmd } from './utils/serve.js';
import { securityCmd } from './utils/security.js';
import { auditCmd } from './utils/audit-cmd.js';
import { toolsCmd } from './utils/tools.js';
import { runCmd } from './utils/run.js';
import { listCmd } from './utils/list.js';
import { modeCmd } from './utils/mode.js';
import { historyCmd } from './utils/history.js';
import { doctorCmd } from './utils/doctor.js';
import { getCliToolRegistry } from './cli-tools/index.js';
import { gitTool } from './cli-tools/tools/git.js';
import { formatErrorMessage } from './utils/errors.js';
import { aiCmd } from './utils/ai.js';
import { loadConfig } from './utils/config.js';

try {
  initAuditLogger();
} catch (error) {
  console.warn('⚠️  审计日志初始化失败，将继续运行...');
  console.warn(`   原因: ${formatErrorMessage(error, '审计日志')}`);
}

try {
  const registry = getCliToolRegistry();
  registry.register(gitTool);
} catch (error) {
  console.warn('⚠️  Git 工具注册失败，将继续运行...');
  console.warn(`   原因: ${formatErrorMessage(error, '工具注册')}`);
}

function displayPolicyWarning() {
  try {
    const config = loadConfig();
    const policy = config.sandbox.defaultPolicy;
    
    if (policy !== 'block') {
      console.log();
      console.log('╔══════════════════════════════════════════════════════════════╗');
      console.log('║  ⚠️  安全策略警告                                            ║');
      console.log('╠══════════════════════════════════════════════════════════════╣');
      console.log(`║  当前命令规则默认策略: ${policy}`);
      console.log('║                                                              ║');
      console.log('║  为了提高安全性，建议将默认策略设置为 "block"。            ║');
      console.log('║  这样未明确白名单的命令将被拒绝执行。                      ║');
      console.log('║                                                              ║');
      console.log('║  配置示例 (vectahub.config.yaml):                            ║');
      console.log('║    sandbox:                                                  ║');
      console.log('║      defaultPolicy: block                                    ║');
      console.log('║                                                              ║');
      console.log('║  可选策略:                                                   ║');
      console.log('║  - block: 默认拒绝 (推荐，最安全)                            ║');
      console.log('║  - allow: 默认允许                                           ║');
      console.log('║  - passthrough: 交给危险命令检测 (当前)                      ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.log();
    }
  } catch {
    // 静默失败
  }
}

displayPolicyWarning();

const program = new Command();

program
  .name('vectahub')
  .description('VectaHub - Natural Language Workflow Engine')
  .version('2.1.0')
  .hook('preAction', (thisCommand) => {
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
  .addCommand(aiCmd)
  .addCommand(runCmd)
  .addCommand(listCmd)
  .addCommand(modeCmd)
  .addCommand(historyCmd)
  .addCommand(doctorCmd);

program.parse();
