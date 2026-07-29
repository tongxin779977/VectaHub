import type { Step, ExecutionStatus } from '../../types/index.js';
import type { StepHandler, ExecutorOptions, ExecutionContext, ExecuteStepFn, ExecutionResult, HandlerDependencies } from './types.js';
import type { AIModule, AIModuleContext, AIModuleResult } from '../../skills/ai-modules/types.js';
import type { DelegateStepResult } from '../../skills/ai-modules/agent-delegate/types.js';
import { makeDelegationDecision, delegatedTaskRequiresVerification } from '../../orchestration-plan/index.js';
import type { WorkerResult, WorkerFailureKind } from '../../types/worker-result.js';
import type { AgentDescriptor } from '../../types/agent.js';
import type { SecurityContext } from '../../types/security.js';
import type { TraceContext } from '../../infrastructure/trace/types.js';
import type {
  AgentTransport,
  TransportRequest,
  TransportResult,
  TransportErrorCode,
} from '../../agent-runtime/transport/types.js';
import type { AcpToolCallEvent } from '../../agent-runtime/acp/acp-types.js';

// allow: SIZE_OK — carries two coexisting execution paths (legacy AIModule +
// new ACP transport) during the staged migration. Drops to ~210 pure LOC once
// the legacy agentModule path is removed in a follow-up migration step.

export interface DelegateHandlerDeps {
  /** DI-provided transport; required for the ACP execution path. */
  getTransport?: () => AgentTransport;
  /** DI-provided descriptor resolver; falls back to a minimal descriptor built from the agent id. */
  getDescriptor?: (agentId: string) => AgentDescriptor | null;
  getEnvironmentCwd?: () => string;
  /**
   * Legacy spawn executor. Retained as an optional field so existing wiring
   * (engine.ts) keeps typechecking during the ACP migration; the transport path
   * ignores it. Remove once engine.ts is migrated to provide `getTransport`.
   */
  exec?: HandlerDependencies['exec'];
  /** Legacy AIModule path (backward compatibility). */
  agentModule?: AIModule<string, DelegateStepResult>;
}

/** Map TransportErrorCode to WorkerFailureKind (type-safe, no cast). */
function mapTransportErrorToFailureKind(code: TransportErrorCode): WorkerFailureKind {
  switch (code) {
    case 'PROMPT_TIMEOUT':
      return 'timeout';
    case 'PERMISSION_REJECTED':
      return 'security_blocked';
    case 'AGENT_SPAWN_FAILED':
    case 'AGENT_CRASHED':
    case 'INITIALIZE_FAILED':
    case 'SESSION_CREATE_FAILED':
    case 'PROTOCOL_ERROR':
      return 'internal_error';
    default:
      return 'unknown';
  }
}

/** Build a minimal but type-correct descriptor fallback when no resolver is wired. */
function buildFallbackDescriptor(agentId: string): AgentDescriptor {
  return {
    id: agentId,
    displayName: agentId,
    entryCommand: agentId,
    promptTransport: 'arg',
    nonInteractiveFlags: [],
    approvalPolicySupport: 'none',
    structuredOutputSupport: false,
    preflightSpec: { versionArgs: [] },
    dryRunRenderMode: 'prompt-only',
  };
}

/** Map a TransportResult to a WorkerResult (structured, no stdout/stderr parsing). */
function mapTransportToWorkerResult(
  transportResult: TransportResult,
  workerId: string,
  executionTimeMs: number,
  verificationRequired: boolean,
): WorkerResult {
  return {
    schemaVersion: '1.0',
    workerId,
    status: transportResult.success ? 'success' : 'failure',
    summary: transportResult.output,
    exitCode: transportResult.success ? 0 : 1,
    failureKind: transportResult.error
      ? mapTransportErrorToFailureKind(transportResult.error.code)
      : undefined,
    failureReason: transportResult.error?.message,
    changedFiles: transportResult.changedFiles.map((path) => ({
      path,
      status: 'modified' as const,
    })),
    artifacts: transportResult.toolCalls.map((tc: AcpToolCallEvent) => ({
      id: tc.toolCallId,
      type: tc.kind,
      summary: tc.title,
    })),
    executionTimeMs,
    redacted: true,
    verificationRequired,
  };
}

export const createDelegateHandler = (deps: DelegateHandlerDeps = {}): StepHandler => {
  // Backward compatibility: legacy AIModule path
  if (deps.agentModule) {
    const agentModule = deps.agentModule;
    return async (
      step: Step,
      _options: ExecutorOptions,
      _context: ExecutionContext,
      _executeStep: ExecuteStepFn,
      startTime: number
    ): Promise<ExecutionResult> => {
      const { delegateTo, delegatePrompt, delegateContext, delegateOptions } = step;

      if (!delegateTo || !delegatePrompt) {
        return {
          stepId: step.id,
          status: 'FAILED',
          error: 'delegate step requires delegateTo and delegatePrompt',
          duration: Date.now() - startTime,
        };
      }

      const moduleContext: AIModuleContext = {
        delegateTo,
        metadata: {
          ...delegateContext,
          allowedTools: delegateOptions?.allowedTools,
        },
      };

      const canHandle = await agentModule.canHandle(moduleContext);
      if (!canHandle) {
        return {
          stepId: step.id,
          status: 'FAILED',
          error: `Agent delegate module cannot handle delegation to "${delegateTo}"`,
          duration: Date.now() - startTime,
        };
      }

      try {
        const result: AIModuleResult<DelegateStepResult> = await agentModule.execute(
          delegatePrompt,
          moduleContext
        );

        if (!result.success) {
          return {
            stepId: step.id,
            status: 'FAILED',
            error: result.error || `Delegation to "${delegateTo}" failed`,
            duration: Date.now() - startTime,
          };
        }

        const delegateResult = result.data;
        const status = delegateResult?.status === 'completed' ? 'COMPLETED' : 'FAILED';

        return {
          stepId: step.id,
          status,
          output: delegateResult?.output ? [delegateResult.output] : undefined,
          error: status === 'FAILED' ? delegateResult?.output : undefined,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          stepId: step.id,
          status: 'FAILED',
          error: `Delegate execution error: ${errorMessage}`,
          duration: Date.now() - startTime,
        };
      }
    };
  }

  // ACP transport path
  return async (
    step: Step,
    options: ExecutorOptions,
    _context: ExecutionContext,
    _executeStep: ExecuteStepFn,
    startTime: number
  ): Promise<ExecutionResult> => {
    const { delegateTo, delegatePrompt } = step;

    if (!delegateTo || !delegatePrompt) {
      return {
        stepId: step.id,
        status: 'FAILED',
        error: 'delegate step requires delegateTo and delegatePrompt',
        duration: Date.now() - startTime,
      };
    }

    const transport = deps.getTransport?.();
    if (!transport) {
      return {
        stepId: step.id,
        status: 'FAILED',
        error: `No agent delegate module registered. Cannot delegate to "${delegateTo}"`,
        duration: Date.now() - startTime,
      };
    }

    // Delegation policy check
    const mockTask = {
      id: step.id,
      executor: 'agent' as const,
      delegateTo,
      kind: 'transform' as const,
      sideEffect: 'write' as const,
      title: `Delegate to ${delegateTo}`,
      dependsOn: [],
      inputs: [],
      outputs: [],
      confidence: 'medium' as const,
      needsConfirmation: false,
    };
    const delegationDecision = makeDelegationDecision(mockTask);
    if (!delegationDecision.canDelegate) {
      return {
        stepId: step.id,
        status: 'FAILED',
        error: delegationDecision.blockingReason || `Cannot delegate to "${delegateTo}"`,
        duration: Date.now() - startTime,
      };
    }

    const descriptor = deps.getDescriptor?.(delegateTo) ?? buildFallbackDescriptor(delegateTo);
    const workspaceRoot = deps.getEnvironmentCwd?.() ?? process.cwd();

    // dry-run: preview without spawning the agent
    if (options.dryRun) {
      return {
        stepId: step.id,
        status: 'COMPLETED',
        output: [`[dry-run] delegate to ${delegateTo}: ${delegatePrompt}`],
        duration: Date.now() - startTime,
      };
    }

    const sessionId = options.sessionId ?? step.id;
    const traceContext: TraceContext = { traceId: sessionId };
    const securityContext: SecurityContext = {
      cwd: workspaceRoot,
      sessionId,
      taskId: step.id,
    };

    const request: TransportRequest = {
      descriptor,
      workspaceRoot,
      taskPrompt: delegatePrompt,
      mode: 'run',
      traceContext,
      parentSpanId: '',
      securityContext,
      timeoutMs: options.timeout ?? 300000,
    };

    const execStartTime = Date.now();
    let transportResult: TransportResult;
    try {
      transportResult = await transport.execute(request);
    } catch (error) {
      transportResult = {
        success: false,
        output: '',
        toolCalls: [],
        stopReason: 'cancelled',
        changedFiles: [],
        events: [],
        error: {
          code: 'UNKNOWN',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
    const executionTimeMs = Date.now() - execStartTime;

    const workerResult = mapTransportToWorkerResult(
      transportResult,
      delegateTo,
      executionTimeMs,
      delegatedTaskRequiresVerification(mockTask),
    );

    let status: ExecutionStatus = 'COMPLETED';
    let error: string | undefined;
    const output: string[] = [];

    if (workerResult.status === 'failure' || workerResult.status === 'cancelled') {
      status = 'FAILED';
      error = workerResult.failureReason || `Agent execution failed`;
    } else {
      output.push(workerResult.summary);
    }

    if (workerResult.changedFiles.length > 0) {
      output.push(
        `\nChanged files:\n${workerResult.changedFiles.map((f) => `- ${f.path} (${f.status})`).join('\n')}`,
      );
    }

    return {
      stepId: step.id,
      status,
      output: output.length > 0 ? output : undefined,
      error,
      exitCode: workerResult.exitCode,
      duration: Date.now() - startTime,
    };
  };
};
