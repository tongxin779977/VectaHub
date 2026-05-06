import { Command } from 'commander';
import { workflowDebugger } from '../debugger/workflow-debugger.js';
import { createConsoleLogger } from '../utils/logger.js';
import { type Breakpoint, type ExecutionHistory } from '../debugger/debugger-api.js';

const logger = createConsoleLogger('debug');

function formatBreakpointTable(breakpoints: Breakpoint[]): void {
  if (breakpoints.length === 0) {
    logger.info('  (no breakpoints)');
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

  console.log(`  ${'ID'.padEnd(30)} ${'Step ID'.padEnd(20)} ${'Type'.padEnd(12)} ${'Status'.padEnd(12)} ${'Hits'.padEnd(6)} Condition`);
  console.log(`  ${'─'.repeat(30)} ${'─'.repeat(20)} ${'─'.repeat(12)} ${'─'.repeat(12)} ${'─'.repeat(6)} ${'─'.repeat(40)}`);

  for (const bp of breakpoints) {
    console.log(
      `  ${bp.id.padEnd(30)} ${bp.stepId.padEnd(20)} ${(typeNames[bp.type] || bp.type).padEnd(12)} ${statusColors[bp.enabled.toString()].padEnd(12)} ${bp.hitCount.toString().padEnd(6)} ${bp.condition || ''}`
    );
  }
}

function formatHistoryTable(history: ExecutionHistory[]): void {
  if (history.length === 0) {
    logger.info('  (no execution history)');
    return;
  }

  const statusColors: Record<string, string> = {
    running: '\x1b[34mrunning\x1b[0m',
    completed: '\x1b[32mcompleted\x1b[0m',
    error: '\x1b[31merror\x1b[0m',
    cancelled: '\x1b[33mcancelled\x1b[0m',
  };

  console.log(`  ${'Workflow ID'.padEnd(25)} ${'Status'.padEnd(12)} ${'Start Time'.padEnd(25)} ${'End Time'.padEnd(25)} ${'Steps'}`);
  console.log(`  ${'─'.repeat(25)} ${'─'.repeat(12)} ${'─'.repeat(25)} ${'─'.repeat(25)} ${'─'.repeat(10)}`);

  for (const entry of history) {
    const startTime = new Date(entry.startTime).toLocaleString();
    const endTime = entry.endTime ? new Date(entry.endTime).toLocaleString() : '-';
    console.log(
      `  ${entry.workflowId.padEnd(25)} ${statusColors[entry.status].padEnd(12)} ${startTime.padEnd(25)} ${endTime.padEnd(25)} ${entry.steps.length}`
    );
  }
}

function formatVariables(variables: Record<string, unknown>): void {
  if (Object.keys(variables).length === 0) {
    console.log('  (no variables)');
    return;
  }

  console.log(`  ${'Name'.padEnd(30)} Value`);
  console.log(`  ${'─'.repeat(30)} ${'─'.repeat(60)}`);

  for (const [name, value] of Object.entries(variables)) {
    const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    console.log(`  ${name.padEnd(30)} ${valueStr}`);
  }
}

export const debugCmd = new Command('debug')
  .description('Debug workflows with breakpoints and step execution')
  .command('breakpoint')
  .description('Manage breakpoints')
  .command('set')
  .description('Set a breakpoint')
  .argument('<stepId>', 'Step ID to break at')
  .option('-c, --condition <expr>', 'Conditional breakpoint expression')
  .action((stepId: string, options) => {
    const type = options.condition ? 'condition' : 'step';
    const id = workflowDebugger.setBreakpoint(stepId, type, options.condition);
    logger.info(`\n✅ Breakpoint set: ${id}`);
  })
  .command('list')
  .description('List all breakpoints')
  .action(() => {
    const breakpoints = workflowDebugger.getBreakpoints();
    logger.info('\nBreakpoints:\n');
    formatBreakpointTable(breakpoints);
    console.log();
  })
  .command('enable')
  .description('Enable a breakpoint')
  .argument('<breakpointId>', 'Breakpoint ID')
  .action((breakpointId: string) => {
    workflowDebugger.enableBreakpoint(breakpointId);
    logger.info(`\n✅ Breakpoint enabled: ${breakpointId}`);
  })
  .command('disable')
  .description('Disable a breakpoint')
  .argument('<breakpointId>', 'Breakpoint ID')
  .action((breakpointId: string) => {
    workflowDebugger.disableBreakpoint(breakpointId);
    logger.info(`\n✅ Breakpoint disabled: ${breakpointId}`);
  })
  .command('remove')
  .description('Remove a breakpoint')
  .argument('<breakpointId>', 'Breakpoint ID')
  .action((breakpointId: string) => {
    workflowDebugger.removeBreakpoint(breakpointId);
    logger.info(`\n✅ Breakpoint removed: ${breakpointId}`);
  })
  .command('watch')
  .description('Manage watch expressions')
  .command('add')
  .description('Add a watch expression')
  .argument('<expression>', 'Expression to watch')
  .action((expression: string) => {
    const id = workflowDebugger.addWatchExpression(expression);
    logger.info(`\n✅ Watch expression added: ${id}`);
  })
  .command('list')
  .description('List watch expressions')
  .action(() => {
    const watches = workflowDebugger.getWatchExpressions();
    logger.info('\nWatch Expressions:\n');
    
    if (watches.length === 0) {
      logger.info('  (no watch expressions)');
    } else {
      console.log(`  ${'ID'.padEnd(20)} ${'Expression'.padEnd(40)} ${'Value'.padEnd(30)} ${'Error'}`);
      console.log(`  ${'─'.repeat(20)} ${'─'.repeat(40)} ${'─'.repeat(30)} ${'─'.repeat(30)}`);
      
      for (const watch of watches) {
        const valueStr = watch.error 
          ? `\x1b[31m${watch.error}\x1b[0m` 
          : typeof watch.value === 'object' 
            ? JSON.stringify(watch.value) 
            : String(watch.value);
        console.log(
          `  ${watch.id.padEnd(20)} ${watch.expression.padEnd(40)} ${valueStr.padEnd(30)} ${watch.error ? '' : '-'}`
        );
      }
    }
    console.log();
  })
  .command('remove')
  .description('Remove a watch expression')
  .argument('<watchId>', 'Watch expression ID')
  .action((watchId: string) => {
    workflowDebugger.removeWatchExpression(watchId);
    logger.info(`\n✅ Watch expression removed: ${watchId}`);
  })
  .command('state')
  .description('Show current debugger state')
  .action(() => {
    const state = workflowDebugger.getState();
    if (!state) {
      logger.info('\nNo active debug session');
      return;
    }

    logger.info('\nDebugger State:\n');
    console.log(`  Workflow ID: ${state.workflowId}`);
    console.log(`  Current Step: ${state.currentStepId}`);
    console.log(`  Status: ${state.status}`);
    
    console.log('\n  Variables:');
    formatVariables(state.variables);
    
    console.log('\n  Call Stack:');
    if (state.callStack.length === 0) {
      console.log('  (empty)');
    } else {
      for (const frame of state.callStack) {
        console.log(`    - ${frame.stepName} (${frame.stepId})`);
      }
    }
    
    if (state.lastError) {
      console.log('\n  Last Error:');
      console.log(`    Message: ${state.lastError.message}`);
      console.log(`    Step: ${state.lastError.stepId}`);
    }
    
    console.log();
  })
  .command('history')
  .description('Show execution history')
  .action(() => {
    const history = workflowDebugger.getHistory();
    logger.info('\nExecution History:\n');
    formatHistoryTable(history);
    console.log();
  })
  .command('clear-history')
  .description('Clear execution history')
  .action(() => {
    workflowDebugger.clearHistory();
    logger.info('\n✅ Execution history cleared');
  })
  .command('reset')
  .description('Reset debugger state')
  .action(() => {
    workflowDebugger.reset();
    logger.info('\n✅ Debugger reset');
  });
