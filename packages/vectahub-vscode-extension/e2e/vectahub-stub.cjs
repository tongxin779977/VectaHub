#!/usr/bin/env node
const fs = require('node:fs');

function appendLog(args) {
  const logPath = process.env.VECTAHUB_E2E_CLI_LOG_PATH;
  if (!logPath) {
    return;
  }
  fs.appendFileSync(logPath, `${JSON.stringify({ args, cwd: process.cwd() })}\n`, 'utf8');
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const args = process.argv.slice(2);
appendLog(args);

if (args.length === 1 && args[0] === '--version') {
  process.stdout.write('1.0.11\n');
  process.exit(0);
}

if (args[0] === 'doctor' && args[1] === '--json') {
  writeJson({ ok: true, summary: { passed: 3, warnings: 0, failed: 0 } });
  process.exit(0);
}

if (args[0] === 'tools' && args[1] === 'list' && args[2] === '--json') {
  writeJson({
    ok: true,
    tools: [
      {
        name: 'npm',
        description: 'Node package manager',
        commandCount: 4,
        dangerousCount: 0,
      },
    ],
  });
  process.exit(0);
}

if (args[0] === 'tools' && args[1] === 'agents' && args.includes('--json')) {
  writeJson({
    ok: true,
    agents: [
      {
        name: 'codex',
        installed: true,
        configured_enabled: true,
        has_permission: true,
        invocable: true,
        ready: true,
      },
    ],
  });
  process.exit(0);
}

if (args[0] === 'security' && args[1] === 'test' && args[2] === '--json') {
  writeJson({
    ok: true,
    isDangerous: false,
  });
  process.exit(0);
}

if (args[0] === 'parse-doc' && args.at(-1) === '--json') {
  writeJson({
    ok: true,
    tasks: [
      { id: 'DOC-1', label: 'Review roadmap milestones' },
      { id: 'DOC-2', label: 'Validate implementation sequence' },
    ],
  });
  process.exit(0);
}

if (args[0] === 'run-task' && args.includes('--json')) {
  writeJson({
    ok: true,
    command: 'codex exec',
    output: 'implemented',
    gitChanges: {
      changedFiles: [],
      shortStat: '',
    },
    verification: {
      ok: true,
      commands: [],
    },
    agentExecutionOutcome: 'implemented',
  });
  process.exit(0);
}

if (args[0] === 'run-command' && args[1] === '--dry-run' && args[2] === '--json') {
  writeJson({ ok: true });
  process.exit(0);
}

if (args[0] === 'run' && args[1] === '-f' && args[2] === 'sys:fetch-gh-actions-errors' && args.includes('--json')) {
  writeJson({
    ok: true,
    summary: {
      pendingCount: 1,
      processedCount: 0,
      failedCount: 0,
      remainingCount: 1,
      needsConfirmationCount: 0,
    },
  });
  process.exit(0);
}

if (args[0] === 'run' && args[1] === '-f' && args[2] === 'sys:process-diagnostic-queue' && args.includes('--json')) {
  writeJson({
    ok: true,
    summary: {
      pendingCount: 1,
      processedCount: 1,
      failedCount: 0,
      remainingCount: 0,
      needsConfirmationCount: 0,
    },
  });
  process.exit(0);
}

if (args[0] === 'queue' && args[1] === 'remove' && args.includes('--json')) {
  writeJson({ ok: true });
  process.exit(0);
}

if (args[0] === 'queue' && args[1] === 'clear' && args.includes('--json')) {
  writeJson({ ok: true });
  process.exit(0);
}

writeJson({ ok: true });
