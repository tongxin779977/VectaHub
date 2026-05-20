import { Command } from 'commander';
import { workflowDebugger } from '../debugger/workflow-debugger.js';
import { type Breakpoint, type ExecutionHistory } from '../debugger/debugger-api.js';
import { createCliOutput } from '../infrastructure/cli-output.js';

const output = createCliOutput();

function formatBreakpointTable(breakpoints: Breakpoint[]): void {
  if (breakpoints.length === 0) {
    output.text('  (no breakpoints)');
    return;
  }

  const typeNames: Record<string, string> = {
    step: 'Step',
    condition: 'Conditional',
    error: 'Error',
  };

  const statusColors: Record<string, string> = {
    true: '\x1b[32menabled\x1b[0m',
    false: '\x1b[33mdisabled\x1b[0m',
  };

  output.text(`  ${'ID'.padEnd(30)} ${'Step ID'.padEnd(20)} ${'Type'.padEnd(12)} ${'Status'.padEnd(12)} ${'Hits'.padEnd(6)} Condition`);
  output.text(`  ${'─'.repeat(30)} ${'─'.repeat(20)} ${'─'.repeat(12)} ${'─'.repeat(12)} ${'─'.repeat(6)} ${'─'.repeat(40)}`);

  for (const bp of breakpoints) {
    output.text(
      `  ${bp.id.padEnd(30)} ${bp.stepId.padEnd(20)} ${(typeNames[bp.type] || bp.type).padEnd(12)} ${statusColors[bp.enabled.toString()].padEnd(12)} ${bp.hitCount.toString().padEnd(6)} ${bp.condition || ''}`,
    );
  }
}

function formatHistoryTable(history: ExecutionHistory[]): void {
  if (history.length === 0) {
    output.text('  (no execution history)');
    return;
  }

  const statusColors: Record<string, string> = {
    running: '\x1b[34mrunning\x1b[0m',
    completed: '\x1b[32mcompleted\x1b[0m',
    error: '\x1b[31merror\x1b[0m',
    cancelled: '\x1b[33mcancelled\x1b[0m',
  };

  output.text(`  ${'Workflow ID'.padEnd(25)} ${'Status'.padEnd(12)} ${'Start Time'.padEnd(25)} ${'End Time'.padEnd(25)} ${'Steps'}`);
  output.text(`  ${'─'.repeat(25)} ${'─'.repeat(12)} ${'─'.repeat(25)} ${'─'.repeat(25)} ${'─'.repeat(10)}`);

  for (const entry of history) {
    const startTime = new Date(entry.startTime).toLocaleString();
    const endTime = entry.endTime ? new Date(entry.endTime).toLocaleString() : '-';
    output.text(
      `  ${entry.workflowId.padEnd(25)} ${statusColors[entry.status].padEnd(12)} ${startTime.padEnd(25)} ${endTime.padEnd(25)} ${entry.steps.length}`,
    );
  }
}

function formatVariables(variables: Record<string, unknown>): void {
  if (Object.keys(variables).length === 0) {
    output.text('  (no variables)');
    return;
  }

  output.text(`  ${'Name'.padEnd(30)} Value`);
  output.text(`  ${'─'.repeat(30)} ${'─'.repeat(60)}`);

  for (const [name, value] of Object.entries(variables)) {
    const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    output.text(`  ${name.padEnd(30)} ${valueStr}`);
  }
}

function createBreakpointCommand(): Command {
  const breakpointCmd = new Command('breakpoint')
    .description('Manage breakpoints');

  breakpointCmd
    .command('set')
    .description('Set a breakpoint')
    .argument('<stepId>', 'Step ID to break at')
    .option('-c, --condition <expr>', 'Conditional breakpoint expression')
    .action((stepId: string, options: { condition?: string }) => {
      const type = options.condition ? 'condition' : 'step';
      const id = workflowDebugger.setBreakpoint(stepId, type, options.condition);
      output.text(`\n✅ Breakpoint set: ${id}`);
    });

  breakpointCmd
    .command('list')
    .description('List all breakpoints')
    .action(() => {
      const breakpoints = workflowDebugger.getBreakpoints();
      output.text('\nBreakpoints:\n');
      formatBreakpointTable(breakpoints);
      output.blank();
    });

  breakpointCmd
    .command('enable')
    .description('Enable a breakpoint')
    .argument('<breakpointId>', 'Breakpoint ID')
    .action((breakpointId: string) => {
      workflowDebugger.enableBreakpoint(breakpointId);
      output.text(`\n✅ Breakpoint enabled: ${breakpointId}`);
    });

  breakpointCmd
    .command('disable')
    .description('Disable a breakpoint')
    .argument('<breakpointId>', 'Breakpoint ID')
    .action((breakpointId: string) => {
      workflowDebugger.disableBreakpoint(breakpointId);
      output.text(`\n✅ Breakpoint disabled: ${breakpointId}`);
    });

  breakpointCmd
    .command('remove')
    .description('Remove a breakpoint')
    .argument('<breakpointId>', 'Breakpoint ID')
    .action((breakpointId: string) => {
      workflowDebugger.removeBreakpoint(breakpointId);
      output.text(`\n✅ Breakpoint removed: ${breakpointId}`);
    });

  return breakpointCmd;
}

function createWatchCommand(): Command {
  const watchCmd = new Command('watch')
    .description('Manage watch expressions');

  watchCmd
    .command('add')
    .description('Add a watch expression')
    .argument('<expression>', 'Expression to watch')
    .action((expression: string) => {
      const id = workflowDebugger.addWatchExpression(expression);
      output.text(`\n✅ Watch expression added: ${id}`);
    });

  watchCmd
    .command('list')
    .description('List watch expressions')
    .action(() => {
      const watches = workflowDebugger.getWatchExpressions();
      output.text('\nWatch Expressions:\n');

      if (watches.length === 0) {
        output.text('  (no watch expressions)');
      } else {
        output.text(`  ${'ID'.padEnd(20)} ${'Expression'.padEnd(40)} ${'Value'.padEnd(30)} ${'Error'}`);
        output.text(`  ${'─'.repeat(20)} ${'─'.repeat(40)} ${'─'.repeat(30)} ${'─'.repeat(30)}`);

        for (const watch of watches) {
          const valueStr = watch.error
            ? `\x1b[31m${watch.error}\x1b[0m`
            : typeof watch.value === 'object'
              ? JSON.stringify(watch.value)
              : String(watch.value);
          output.text(
            `  ${watch.id.padEnd(20)} ${watch.expression.padEnd(40)} ${valueStr.padEnd(30)} ${watch.error ? '' : '-'}`,
          );
        }
      }
      output.blank();
    });

  watchCmd
    .command('remove')
    .description('Remove a watch expression')
    .argument('<watchId>', 'Watch expression ID')
    .action((watchId: string) => {
      workflowDebugger.removeWatchExpression(watchId);
      output.text(`\n✅ Watch expression removed: ${watchId}`);
    });

  return watchCmd;
}

export const debugCmd = new Command('debug')
  .description('Debug workflows with breakpoints and step execution');

debugCmd.addCommand(createBreakpointCommand());
debugCmd.addCommand(createWatchCommand());

debugCmd
  .command('state')
  .description('Show current debugger state')
  .action(() => {
    const state = workflowDebugger.getState();
    if (!state) {
      output.text('\nNo active debug session');
      return;
    }

    output.text('\nDebugger State:\n');
    output.text(`  Workflow ID: ${state.workflowId}`);
    output.text(`  Current Step: ${state.currentStepId}`);
    output.text(`  Status: ${state.status}`);

    output.text('\n  Variables:');
    formatVariables(state.variables);

    output.text('\n  Call Stack:');
    if (state.callStack.length === 0) {
      output.text('  (empty)');
    } else {
      for (const frame of state.callStack) {
        output.text(`    - ${frame.stepName} (${frame.stepId})`);
      }
    }

    if (state.lastError) {
      output.text('\n  Last Error:');
      output.text(`    Message: ${state.lastError.message}`);
      output.text(`    Step: ${state.lastError.stepId}`);
    }

    output.blank();
  });

debugCmd
  .command('history')
  .description('Show execution history')
  .action(() => {
    const history = workflowDebugger.getHistory();
    output.text('\nExecution History:\n');
    formatHistoryTable(history);
    output.blank();
  });

debugCmd
  .command('clear-history')
  .description('Clear execution history')
  .action(() => {
    workflowDebugger.clearHistory();
    output.text('\n✅ Execution history cleared');
  });

debugCmd
  .command('reset')
  .description('Reset debugger state')
  .action(() => {
    workflowDebugger.reset();
    output.text('\n✅ Debugger reset');
  });
