import type { Step } from '../../types/index.js';
import type { StepHandler, ExecutorOptions, ExecutionContext, ExecuteStepFn, ExecutionResult } from './types.js';
import type { AIModule, AIModuleContext, AIModuleResult } from '../../skills/ai-modules/types.js';
import type { DelegateStepResult } from '../../skills/ai-modules/agent-delegate/types.js';

export interface DelegateHandlerDeps {
  agentModule?: AIModule<string, DelegateStepResult>;
}

export const createDelegateHandler = (deps: DelegateHandlerDeps = {}): StepHandler => {
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

    if (!deps.agentModule) {
      return {
        stepId: step.id,
        status: 'FAILED',
        error: `No agent delegate module registered. Cannot delegate to "${delegateTo}".`,
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

    const canHandle = await deps.agentModule.canHandle(moduleContext);
    if (!canHandle) {
      return {
        stepId: step.id,
        status: 'FAILED',
        error: `Agent delegate module cannot handle delegation to "${delegateTo}".`,
        duration: Date.now() - startTime,
      };
    }

    try {
      const result: AIModuleResult<DelegateStepResult> = await deps.agentModule.execute(
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
};
