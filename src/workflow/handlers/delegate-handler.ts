import type { Step, ExecutionStatus } from '../../types/index.js';
import type { StepHandler, ExecutorOptions, ExecutionContext, ExecuteStepFn, ExecutionResult, HandlerDependencies } from './types.js';
import type { AIModule, AIModuleContext, AIModuleResult } from '../../skills/ai-modules/types.js';
import type { DelegateStepResult } from '../../skills/ai-modules/agent-delegate/types.js';
import { getAgentDescriptorById, getAgentAdapterById } from '../../commands/agent-cli-adapter.js';
import { makeDelegationDecision, delegatedTaskRequiresVerification } from '../../orchestration-plan/index.js';
import { normalizeWorkerResult } from '../../orchestration-plan/worker-result-normalizer.js';
import type { WorkerResult } from '../../types/worker-result.js';
import type { AgentAdapterInput } from '../../types/agent.js';
import { initializeBuiltInAgents } from '../../agent-runtime/factory.js';

// Initialize built-in agents on module load
initializeBuiltInAgents();

export interface DelegateHandlerDeps {
  exec?: HandlerDependencies['exec'];
  getEnvironmentCwd?: () => string;
  getEnvironmentSpawn?: HandlerDependencies['exec'];
  createChildEnv?: (traceContext: unknown, parentSpanId: string, envPatch?: Record<string, string>) => NodeJS.ProcessEnv;
  agentModule?: AIModule<string, DelegateStepResult>;
}

function resolvePreflightArgs(descriptor: ReturnType<typeof getAgentDescriptorById>): string[] {
  if (!descriptor) {
    return [];
  }

  if (descriptor.preflightSpec.readyArgs && descriptor.preflightSpec.readyArgs.length > 0) {
    return descriptor.preflightSpec.readyArgs;
  }

  if (descriptor.preflightSpec.invocableArgs && descriptor.preflightSpec.invocableArgs.length > 0) {
    return descriptor.preflightSpec.invocableArgs;
  }

  return descriptor.preflightSpec.versionArgs;
}

export const createDelegateHandler = (deps: DelegateHandlerDeps = {}): StepHandler => {
  // Backward compatibility: if agentModule is provided, use the old implementation
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

  // If no agentModule, and we don't have the required deps for new implementation
  // we should return the original error message for backward compatibility with tests
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

    // Check if required deps are available
    if (!deps.exec || !deps.getEnvironmentCwd) {
      return {
        stepId: step.id,
        status: 'FAILED',
        error: `No agent delegate module registered. Cannot delegate to "${delegateTo}"`,
        duration: Date.now() - startTime,
      };
    }

    // Check delegation policy first
    // Create a mock OrchestrationTask for delegation decision
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

    // Get agent descriptor and adapter
    const descriptor = getAgentDescriptorById(delegateTo);
    const adapter = getAgentAdapterById(delegateTo);
    if (!descriptor || !adapter) {
      return {
        stepId: step.id,
        status: 'FAILED',
        error: `Agent "${delegateTo}" not found or not supported`,
        duration: Date.now() - startTime,
      };
    }

    // Render the agent command
    const adapterInput: AgentAdapterInput = {
      descriptor,
      workspaceRoot: deps.getEnvironmentCwd(),
      taskPrompt: delegatePrompt,
      mode: options.dryRun ? 'dry-run' : 'run',
      outputMode: 'text',
    };
    const adapterOutput = adapter.render(adapterInput);

    if (options.dryRun) {
      return {
        stepId: step.id,
        status: 'COMPLETED',
        output: [adapterOutput.preview],
        duration: Date.now() - startTime,
      };
    }

    const preflightArgs = resolvePreflightArgs(descriptor);
    try {
      const preflightResult = await deps.exec(
        descriptor.entryCommand,
        preflightArgs,
        {
          ...options,
          cwd: deps.getEnvironmentCwd(),
        }
      );

      if (!preflightResult.success) {
        return {
          stepId: step.id,
          status: 'FAILED',
          error: `Agent "${delegateTo}" failed preflight`,
          exitCode: preflightResult.exitCode,
          duration: Date.now() - startTime,
        };
      }
    } catch (error) {
      return {
        stepId: step.id,
        status: 'FAILED',
        error: `Agent "${delegateTo}" failed preflight: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - startTime,
      };
    }

    // Execute the agent command
    const execStartTime = Date.now();
    let execResult;
    try {
      execResult = await deps.exec(adapterOutput.command, adapterOutput.args, {
        ...options,
        env: { ...process.env, ...adapterOutput.envPatch } as Record<string, string>,
        cwd: deps.getEnvironmentCwd(),
        stdinInput: adapterOutput.stdinInput,
      });
    } catch (error) {
      execResult = {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        duration: Date.now() - execStartTime,
      };
    }
    const executionTimeMs = Date.now() - execStartTime;

    // Normalize worker result
    const workerResult: WorkerResult = normalizeWorkerResult(
      delegateTo,
      {
        stdout: execResult.stdout,
        stderr: execResult.stderr,
        exitCode: execResult.exitCode,
        executionTimeMs,
      },
      delegatedTaskRequiresVerification(mockTask)
    );

    // Determine execution status
    let status: ExecutionStatus = 'COMPLETED';
    let error: string | undefined;
    const output: string[] = [];

    if (workerResult.status === 'failure' || workerResult.status === 'cancelled') {
      status = 'FAILED';
      error = workerResult.failureReason || `Agent execution failed (exit code ${workerResult.exitCode})`;
    } else if (workerResult.status === 'needs_review') {
      status = 'COMPLETED'; // Treat needs review as completed for now, verification will handle it
      output.push(workerResult.summary);
    } else {
      output.push(workerResult.summary);
    }

    // Add changed files info if available
    if (workerResult.changedFiles.length > 0) {
      output.push(`\nChanged files:\n${workerResult.changedFiles.map(f => `- ${f.path} (${f.status})`).join('\n')}`);
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
