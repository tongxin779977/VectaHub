#!/usr/bin/env node

import { Command } from 'commander';
import { check } from './utils/check.js';
import { status } from './utils/status.js';
import { moduleCmd } from './utils/module.js';
import { validate } from './utils/validate.js';
import { test } from './utils/test.js';
import { build } from './utils/build.js';
import { serveCmd, clientCmd } from './utils/serve.js';

const program = new Command();

program
  .name('vectahub')
  .description('VectaHub - Natural Language Workflow Engine')
  .version('2.1.0');

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
  .addCommand(clientCmd);

program.parse();
