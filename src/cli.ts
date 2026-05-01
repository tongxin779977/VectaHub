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
import { formatErrorMessage, ErrorType } from './utils/errors.js';
import { aiCmd } from './utils/ai.js';

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
