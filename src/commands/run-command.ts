import { Command } from 'commander';
import { format } from 'node:util';
import { getSecurityGuard } from '../security-protocol/factory.js';
import type { CommandIntention, SecurityContext } from '../types/security.js';
import { createWorkflowEngine } from '../workflow/engine.js';
import { createRecordManager } from '../execution/record-manager.js';
import type { InfrastructureContext } from '../infrastructure/context.js';
import type { Step } from '../types/index.js';
import type { ExecutionMetadata, ExecutionRecord as StoredRecord } from '../execution/types.js';
import type { ExecutionRecord as EngineRecord } from '../types/index.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

interface RunCommandOptions {
  mode: 'strict' | 'relaxed' | 'consensus';
  json?: boolean;
  dryRun?: boolean;
}

interface RunCommandOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
  warn(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

function createRunCommandOutput(): RunCommandOutput {
  const writeLine = (stream: NodeJS.WriteStream, message?: unknown, optionalParams: unknown[] = []): void => {
    stream.write(`${format(message, ...optionalParams)}\n`);
  };

  return {
    log(message?: unknown, ...optionalParams: unknown[]): void {
      writeLine(process.stdout, message, optionalParams);
    },
    warn(message?: unknown, ...optionalParams: unknown[]): void {
      writeLine(process.stderr, message, optionalParams);
    },
    error(message?: unknown, ...optionalParams: unknown[]): void {
      writeLine(process.stderr, message, optionalParams);
    },
  };
}

export function createRunCommandCmd(context: InfrastructureContext): Command {
  const logger = context.logger.getLogger('run-command');
  const output = createRunCommandOutput();

  return new Command('run-command')
    .description('Directly run a CLI command with security scanning')
    .argument('<command...>', 'The command to execute')
    .option('-m, --mode <mode>', 'Execution mode (strict|relaxed|consensus)', 'relaxed')
    .option('--json', 'Output results in JSON format')
    .option('--dry-run', 'Show what would be executed without running')
    .action(async (commandArgs: string[], options: RunCommandOptions) => {
      if (options.json) {
        context.logger.setMuted(true);
      }

      const fullCommand = commandArgs.join(' ');
      const cliTool = commandArgs[0];

      const guard = getSecurityGuard();
      const securityContext: SecurityContext = {
        cwd: context.environment.getCwd(),
        sessionId: `direct-${Date.now()}`,
        isDryRun: options.dryRun,
      };
      const intention: CommandIntention = {
        rawCommand: fullCommand,
        tool: cliTool,
        args: commandArgs.slice(1),
      };

      const decision = await guard.assess(intention, securityContext);

      if (options.mode === 'strict' && decision.decision !== 'PASSED') {
        const errorOutput = {
          ok: false,
          error: {
            code: 'SECURITY_VIOLATION',
            message: `安全策略拦截: ${decision.reason || decision.ruleName || '未知规则'}`,
            riskLevel: decision.riskLevel,
            ruleName: decision.ruleName
          }
        };

        if (options.json) {
          output.log(JSON.stringify(errorOutput, null, 2));
        } else {
          output.error(`❌ 安全违规: ${errorOutput.error.message}`);
          output.error(`原因: ${decision.reason || '未授权的操作'}`);
        }
        throw new VectaHubError(`Security violation: ${decision.reason || decision.ruleName}`, ErrorType.SECURITY);
      }

      if (options.mode === 'relaxed') {
        if (decision.decision === 'BLOCKED') {
          output.error(`❌ 安全策略拦截: ${decision.reason || '该操作已被禁止'}`);
          throw new VectaHubError(`Security policy blocked: ${decision.reason}`, ErrorType.SECURITY);
        }
        if (decision.decision === 'REQUIRES_CONFIRMATION') {
          if (options.json) {
            output.error(JSON.stringify({
              ok: true,
              warning: {
                message: `命令具有 ${decision.riskLevel} 风险`,
                rule: decision.ruleName,
                reason: decision.reason
              }
            }, null, 2));
          } else {
            output.warn(`⚠️  警告: 该命令被标记为 ${decision.riskLevel} 风险`);
            output.warn(`   规则: ${decision.ruleName || 'Unknown'}`);
            output.warn(`   原因: ${decision.reason}`);
            output.warn(`   继续执行中...\n`);
          }
        }
      }

      if (options.dryRun) {
        if (options.json) {
          output.log(JSON.stringify({
            ok: true,
            dryRun: true,
            command: fullCommand,
            security: decision
          }, null, 2));
        } else {
          output.log(`Dry-run: Would execute "${fullCommand}"`);
          if (decision.decision !== 'PASSED') {
            output.warn(`Warning: This command is flagged as ${decision.riskLevel} risk.`);
          }
        }
        return;
      }

      try {
        const engine = createWorkflowEngine({
          audit: context.audit.getHelper(),
          environment: context.environment,
          logger,
        });
        await engine.loadWorkflows();

        const steps: Step[] = [{
          id: 'step_1',
          type: 'exec',
          cli: cliTool,
          args: commandArgs.slice(1)
        }];

        const workflow = await engine.createWorkflow(`direct-${Date.now()}`, steps);

        const result: EngineRecord = await engine.execute(workflow, {
          mode: options.mode,
          dryRun: options.dryRun
        });

        const recordManager = createRecordManager();
        const metadata: ExecutionMetadata = {
          source: 'direct',
          cwd: context.environment.getCwd(),
          nlInput: fullCommand
        };

        const rawOutput = result.steps[0]?.output?.join('\n') || '';
        const redactedOutput = guard.redactOutput(rawOutput, securityContext);

        const recordToSave: StoredRecord = {
          executionId: result.executionId,
          workflowId: result.workflowId,
          workflowName: result.workflowName,
          status: result.status,
          startedAt: result.startedAt.toISOString(),
          finishedAt: result.endedAt?.toISOString(),
          duration: result.duration,
          steps: result.steps.map(s => ({
            stepId: s.stepId,
            stepName: s.stepId,
            command: fullCommand,
            status: s.status,
            startedAt: s.startAt?.toISOString(),
            finishedAt: s.endAt?.toISOString(),
            output: guard.redactOutput(s.output?.join('\n') || '', securityContext),
            error: s.error
          })),
          metadata: metadata as unknown as Record<string, unknown>
        };

        await recordManager.save(recordToSave);

        if (options.json) {
          output.log(JSON.stringify({
            ok: result.status === 'COMPLETED',
            status: result.status,
            output: redactedOutput.split('\n'),
            error: result.steps[0]?.error,
            security: decision
          }, null, 2));
        } else {
          if (result.status === 'COMPLETED') {
            output.log('✅ Command executed successfully');
            output.log(redactedOutput);
          } else {
            output.error('❌ Command execution failed');
            if (result.steps[0]?.error) {
              output.error(result.steps[0].error);
            }
          }
        }

        if (result.status !== 'COMPLETED') {
          throw new VectaHubError('Command execution failed', ErrorType.RUNTIME);
        }
      } catch (error) {
        if (error instanceof VectaHubError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
          output.log(JSON.stringify({
            ok: false,
            error: {
              code: 'EXECUTION_ERROR',
              message
            }
          }, null, 2));
        } else {
          output.error(`❌ Execution Error: ${message}`);
        }
        throw new VectaHubError(message, ErrorType.RUNTIME, error);
      }
    });
}
