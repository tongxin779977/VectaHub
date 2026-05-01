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

initAuditLogger();

const program = new Command();

program
  .name('vectahub')
  .description('VectaHub - Natural Language Workflow Engine')
  .version('2.1.0')
  .hook('preAction', (thisCommand) => {
    const sessionId = getCurrentSessionId();
    const commandName = thisCommand.name();
    const args = process.argv.slice(3);
    audit.cliCommand(commandName, args, sessionId);
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
  .addCommand(auditCmd);

program.parse();
