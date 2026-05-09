import { Command } from 'commander';
import { getSecurityManager } from '../security-protocol/manager.js';
import { createWorkflowEngine } from '../workflow/engine.js';
import { createRecordManager } from '../execution/record-manager.js';
import { setMuted } from '../infrastructure/logger/index.js';
import type { Step, WorkflowMode } from '../types/index.js';
import type { ExecutionMetadata, ExecutionRecord as StoredRecord } from '../execution/types.js';
import type { ExecutionRecord as EngineRecord } from '../types/index.js';

interface RunCommandOptions {
  mode: 'strict' | 'relaxed' | 'consensus';
  json?: boolean;
  dryRun?: boolean;
}

export const runCommandCmd = new Command('run-command')
  .description('Directly run a CLI command with security scanning')
  .argument('<command...>', 'The command to execute')
  .option('-m, --mode <mode>', 'Execution mode (strict|relaxed|consensus)', 'relaxed')
  .option('--json', 'Output results in JSON format')
  .option('--dry-run', 'Show what would be executed without running')
  .action(async (commandArgs: string[], options: RunCommandOptions) => {
    if (options.json) {
      setMuted(true);
    }

    const fullCommand = commandArgs.join(' ');
    const cliTool = commandArgs[0];

    // 1. Security scanning
    const securityManager = getSecurityManager();
    const detectionResult = securityManager.detectCommand(fullCommand, cliTool);

    if (options.mode === 'strict' && detectionResult.isDangerous) {
      const errorOutput = {
        ok: false,
        error: {
          code: 'SECURITY_VIOLATION',
          message: `Command blocked by security policy: ${detectionResult.rule?.name || 'Unknown Rule'}`,
          matchedPattern: detectionResult.matchedPattern,
          severity: detectionResult.severity
        }
      };

      if (options.json) {
        console.log(JSON.stringify(errorOutput, null, 2));
      } else {
        console.error(`❌ Security Violation: ${errorOutput.error.message}`);
        console.error(`Reason: Matched pattern "${detectionResult.matchedPattern}"`);
      }
      process.exit(1);
    }

    // 2. Dry run handling
    if (options.dryRun) {
      if (options.json) {
        console.log(JSON.stringify({
          ok: true,
          dryRun: true,
          command: fullCommand,
          security: detectionResult
        }, null, 2));
      } else {
        console.log(`Dry-run: Would execute "${fullCommand}"`);
        if (detectionResult.isDangerous) {
          console.warn(`Warning: This command is flagged as ${detectionResult.severity} risk.`);
        }
      }
      return;
    }

    // 3. Execution
    try {
      const engine = createWorkflowEngine();
      await engine.loadWorkflows();

      const steps: Step[] = [{
        id: 'step_1',
        type: 'exec',
        cli: cliTool,
        args: commandArgs.slice(1)
      }];

      const workflow = await engine.createWorkflow(`direct_${Date.now()}`, steps);
      
      const result: EngineRecord = await engine.execute(workflow, {
        mode: options.mode as any,
        dryRun: options.dryRun
      });

      // 4. Recording
      const recordManager = createRecordManager();
      const metadata: ExecutionMetadata = {
        source: 'direct',
        cwd: process.cwd(),
        nlInput: fullCommand
      };

      // Convert EngineRecord (Date) to StoredRecord (string)
      const recordToSave: Partial<StoredRecord> = {
        executionId: result.executionId,
        workflowId: result.workflowId,
        workflowName: result.workflowName,
        status: result.status as any,
        startedAt: result.startedAt.toISOString(),
        finishedAt: result.endedAt?.toISOString(),
        duration: result.duration,
        steps: result.steps.map(s => ({
          stepId: s.stepId,
          stepName: s.stepId,
          command: fullCommand,
          status: s.status as any,
          startedAt: s.startAt?.toISOString(),
          finishedAt: s.endAt?.toISOString(),
          output: s.output?.join('\n'),
          error: s.error
        })),
        metadata: metadata as any
      };
      
      await recordManager.save(recordToSave as StoredRecord);

      // 5. Output
      if (options.json) {
        console.log(JSON.stringify({
          ok: result.status === 'COMPLETED',
          status: result.status,
          output: result.steps[0]?.output || [],
          error: result.steps[0]?.error,
          security: detectionResult
        }, null, 2));
      } else {
        if (result.status === 'COMPLETED') {
          console.log('✅ Command executed successfully');
          if (result.steps[0]?.output) {
            result.steps[0].output.forEach(line => console.log(line));
          }
        } else {
          console.error('❌ Command execution failed');
          if (result.steps[0]?.error) {
            console.error(result.steps[0].error);
          }
        }
      }

      if (result.status !== 'COMPLETED') {
        process.exit(1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.json) {
        console.log(JSON.stringify({
          ok: false,
          error: {
            code: 'EXECUTION_ERROR',
            message
          }
        }, null, 2));
      } else {
        console.error(`❌ Execution Error: ${message}`);
      }
      process.exit(1);
    }
  });
