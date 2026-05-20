import { Command } from 'commander';
import { getSecurityGuard } from '../security-protocol/factory.js';
import type { CommandIntention, SecurityContext } from '../types/security.js';
import { createWorkflowEngine } from '../workflow/engine.js';
import { createRecordManager } from '../execution/record-manager.js';
import { getDefaultContext } from '../infrastructure/context.js';
import type { Step } from '../types/index.js';
import type { ExecutionMetadata, ExecutionRecord as StoredRecord } from '../execution/types.js';
import type { ExecutionRecord as EngineRecord } from '../types/index.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

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
    const ctx = getDefaultContext();
    if (options.json) {
      ctx.logger.setMuted(true);
    }

    const fullCommand = commandArgs.join(' ');
    const cliTool = commandArgs[0];

    // 1. 安全扫描与评估
    const guard = getSecurityGuard();
    const securityContext: SecurityContext = {
      cwd: ctx.environment.getCwd(),
      sessionId: `direct-${Date.now()}`,
      isDryRun: options.dryRun,
    };
    const intention: CommandIntention = {
      rawCommand: fullCommand,
      tool: cliTool,
      args: commandArgs.slice(1),
    };

    const decision = await guard.assess(intention, securityContext);

    // 严格模式：任何非通过决策均阻断
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
        console.log(JSON.stringify(errorOutput, null, 2));
      } else {
        console.error(`❌ 安全违规: ${errorOutput.error.message}`);
        console.error(`原因: ${decision.reason || '未授权的操作'}`);
      }
      throw new VectaHubError(`Security violation: ${decision.reason || decision.ruleName}`, ErrorType.SECURITY);
    }

    // 宽松模式：拦截 BLOCKED，警告 REQUIRES_CONFIRMATION
    if (options.mode === 'relaxed') {
      if (decision.decision === 'BLOCKED') {
        console.error(`❌ 安全策略拦截: ${decision.reason || '该操作已被禁止'}`);
        throw new VectaHubError(`Security policy blocked: ${decision.reason}`, ErrorType.SECURITY);
      }
      if (decision.decision === 'REQUIRES_CONFIRMATION') {
        if (options.json) {
          console.error(JSON.stringify({
            ok: true,
            warning: {
              message: `命令具有 ${decision.riskLevel} 风险`,
              rule: decision.ruleName,
              reason: decision.reason
            }
          }, null, 2));
        } else {
          console.warn(`⚠️  警告: 该命令被标记为 ${decision.riskLevel} 风险`);
          console.warn(`   规则: ${decision.ruleName || 'Unknown'}`);
          console.warn(`   原因: ${decision.reason}`);
          console.warn(`   继续执行中...\n`);
        }
      }
    }

    // 2. 干运行模式处理
    if (options.dryRun) {
      if (options.json) {
        console.log(JSON.stringify({
          ok: true,
          dryRun: true,
          command: fullCommand,
          security: decision
        }, null, 2));
      } else {
        console.log(`Dry-run: Would execute "${fullCommand}"`);
        if (decision.decision !== 'PASSED') {
          console.warn(`Warning: This command is flagged as ${decision.riskLevel} risk.`);
        }
      }
      return;
    }

    // 3. 执行流程
    try {
      const engine = createWorkflowEngine({ audit: ctx.audit.getHelper(), environment: ctx.environment });
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

      // 4. 执行记录保存
      const recordManager = createRecordManager();
      const metadata: ExecutionMetadata = {
        source: 'direct',
        cwd: process.cwd(),
        nlInput: fullCommand
      };

      // 脱敏处理输出内容
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

      // 5. 结果输出
      if (options.json) {
        console.log(JSON.stringify({
          ok: result.status === 'COMPLETED',
          status: result.status,
          output: redactedOutput.split('\n'),
          error: result.steps[0]?.error,
          security: decision
        }, null, 2));
      } else {
        if (result.status === 'COMPLETED') {
          console.log('✅ Command executed successfully');
          console.log(redactedOutput);
        } else {
          console.error('❌ Command execution failed');
          if (result.steps[0]?.error) {
            console.error(result.steps[0].error);
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
      throw new VectaHubError(message, ErrorType.RUNTIME, error);
    }
  });
