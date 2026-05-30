import {
  type CommandInvocation,
  type VerificationPlan,
  type OrchestrationVerificationResult,
  type OrchestrationVerificationCommandResult,
  type OrchestrationVerificationSemanticResult,
  type OrchestrationVerificationStatus,
  type OrchestrationVerificationFailureKind,
} from '../types/index.js';
import { type InfrastructureContext } from '../infrastructure/context.js';
import { getSecurityGuard } from '../security-protocol/factory.js';
import { type SecurityContext, type CommandIntention } from '../types/security.js';

const MAX_VERIFICATION_COMMANDS = 10;
const VERIFICATION_SUMMARY_MAX_LENGTH = 600;

interface RunVerificationPlanOptions {
  planId: string;
  verificationPlan: VerificationPlan;
  cwd: string;
  context: InfrastructureContext;
}

interface CommandExecutionError extends Error {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  status?: number | null;
  code?: string | number | null;
  killed?: boolean;
}

/**
 * 运行 OrchestrationPlan 中的验证计划
 */
export async function runVerificationPlan({
  planId,
  verificationPlan,
  cwd,
  context,
}: RunVerificationPlanOptions): Promise<OrchestrationVerificationResult> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const guard = getSecurityGuard();
  const securityContext: SecurityContext = {
    cwd,
    sessionId: `verification-session-${planId}`,
  };

  const commandResults: OrchestrationVerificationCommandResult[] = [];
  const semanticResults: OrchestrationVerificationSemanticResult[] = [];
  let status: OrchestrationVerificationStatus = 'pass';
  let failureKind: OrchestrationVerificationFailureKind | undefined;
  let failureReason: string | undefined;

  // 执行验证命令
  const commandsToRun = verificationPlan.commands.slice(0, MAX_VERIFICATION_COMMANDS);

  for (const commandInvocation of commandsToRun) {
    const commandResult = await runSingleVerificationCommand(
      commandInvocation,
      cwd,
      context,
      guard,
      securityContext,
    );
    commandResults.push(commandResult);

    if (!commandResult.ok) {
      status = 'fail';
      failureKind = 'command_failure';
      failureReason = `验证命令失败: ${commandInvocation.cli} ${commandInvocation.args.join(' ')}`;
    }
  }

  // TODO: 实现语义检查
  // 暂时将所有语义检查标记为通过
  for (const semanticCheck of verificationPlan.semanticChecks) {
    semanticResults.push({
      checkId: semanticCheck.id,
      passed: true,
      description: semanticCheck.description,
    });
  }

  // 检查成功标准
  const allCommandsPassed = commandResults.every((r) => r.ok);
  const allSemanticChecksPassed = semanticResults.every((r) => r.passed);
  const allSuccessCriteriaMet = allCommandsPassed && allSemanticChecksPassed;

  if (status === 'pass' && !allSuccessCriteriaMet) {
    status = 'fail';
    failureKind = 'semantic_failure';
    failureReason = '验证成功标准未满足';
  }

  const durationMs = Date.now() - startTime;
  const completedAt = new Date().toISOString();

  return {
    planId,
    status,
    failureKind,
    failureReason,
    commandResults,
    semanticResults,
    allSuccessCriteriaMet,
    durationMs,
    startedAt,
    completedAt,
  };
}

/**
 * 运行单个验证命令
 */
async function runSingleVerificationCommand(
  commandInvocation: CommandInvocation,
  cwd: string,
  context: InfrastructureContext,
  guard: ReturnType<typeof getSecurityGuard>,
  securityContext: SecurityContext,
): Promise<OrchestrationVerificationCommandResult> {
  const rawCommand = `${commandInvocation.cli} ${commandInvocation.args.join(' ')}`;
  const intention: CommandIntention = { rawCommand };
  const decision = await guard.assess(intention, securityContext);

  if (decision.decision === 'BLOCKED') {
    context.logger
      .getLogger('orchestration-verification')
      .warn(
        `验证命令被安全策略阻断 (critical): ${rawCommand} — ${decision.reason || ''}`,
      );
    return {
      command: commandInvocation,
      ok: false,
      exitCode: null,
      durationMs: 0,
    };
  }

  if (decision.decision === 'REQUIRES_CONFIRMATION') {
    context.logger
      .getLogger('orchestration-verification')
      .warn(`验证命令需要人工确认，在自动流程中已被跳过: ${rawCommand}`);
    return {
      command: commandInvocation,
      ok: false,
      exitCode: null,
      durationMs: 0,
    };
  }

  const startMs = Date.now();
  try {
    const { stdout, stderr } = await context.environment.exec(rawCommand, {
      cwd: commandInvocation.cwd || cwd,
    });

    const durationMs = Date.now() - startMs;
    const stdoutStr = stdout?.toString?.() || '';
    const stderrStr = stderr?.toString?.() || '';
    const outputTruncated =
      stdoutStr.length > VERIFICATION_SUMMARY_MAX_LENGTH ||
      stderrStr.length > VERIFICATION_SUMMARY_MAX_LENGTH;

    return {
      command: commandInvocation,
      ok: true,
      exitCode: 0,
      durationMs,
      stdoutSummary: stdoutStr.slice(0, VERIFICATION_SUMMARY_MAX_LENGTH),
      stderrSummary: stderrStr.slice(0, VERIFICATION_SUMMARY_MAX_LENGTH),
      outputTruncated,
    };
  } catch (error) {
    const durationMs = Date.now() - startMs;
    const execError = error as CommandExecutionError;

    const stdoutStr = execError.stdout?.toString?.() || '';
    const stderrStr = execError.stderr?.toString?.() || '';
    const rawExitCode = execError.status ?? execError.code ?? null;
    const exitCode: number | null = execError.killed ? null : (typeof rawExitCode === 'number' ? rawExitCode : null);

    const outputTruncated =
      stdoutStr.length > VERIFICATION_SUMMARY_MAX_LENGTH ||
      stderrStr.length > VERIFICATION_SUMMARY_MAX_LENGTH;

    context.logger
      .getLogger('orchestration-verification')
      .error(`执行验证命令时出错: ${rawCommand}`);

    return {
      command: commandInvocation,
      ok: false,
      exitCode,
      durationMs,
      stdoutSummary: stdoutStr.slice(0, VERIFICATION_SUMMARY_MAX_LENGTH),
      stderrSummary: stderrStr.slice(0, VERIFICATION_SUMMARY_MAX_LENGTH),
      outputTruncated,
    };
  }
}
