import type { ExecutionRecord } from '../types/index.js';

export type ExecutionState = string;

export interface ExecutionStateManager {
  currentExecution: ExecutionRecord | undefined;
  state: ExecutionState;
  currentStepIndex: number;
  pauseResolver: (() => void) | null;
  completionPromise: Promise<ExecutionRecord> | null;
  completionResolver: ((record: ExecutionRecord) => void) | null;
  setState(newState: ExecutionState): void;
  reset(): void;
}

export function createExecutionStateManager(): ExecutionStateManager {
  let currentExecution: ExecutionRecord | undefined;
  let state: ExecutionState = 'IDLE';
  let currentStepIndex = 0;
  let pauseResolver: (() => void) | null = null;
  let completionPromise: Promise<ExecutionRecord> | null = null;
  let completionResolver: ((record: ExecutionRecord) => void) | null = null;

  return {
    get currentExecution() { return currentExecution; },
    set currentExecution(v) { currentExecution = v; },
    get state() { return state; },
    get currentStepIndex() { return currentStepIndex; },
    set currentStepIndex(v) { currentStepIndex = v; },
    get pauseResolver() { return pauseResolver; },
    set pauseResolver(v) { pauseResolver = v; },
    get completionPromise() { return completionPromise; },
    set completionPromise(v) { completionPromise = v; },
    get completionResolver() { return completionResolver; },
    set completionResolver(v) { completionResolver = v; },

    setState(newState: ExecutionState): void {
      state = newState;
      if (currentExecution) {
        switch (newState) {
          case 'RUNNING':
            currentExecution.status = 'RUNNING';
            break;
          case 'PAUSED':
            currentExecution.status = 'PAUSED';
            break;
          case 'COMPLETED':
            currentExecution.status = 'COMPLETED';
            break;
          case 'FAILED':
            currentExecution.status = 'FAILED';
            break;
          case 'ABORTING':
          case 'ABORTED':
            currentExecution.status = 'ABORTED';
            break;
        }
      }
    },

    reset(): void {
      currentExecution = undefined;
      state = 'IDLE';
      currentStepIndex = 0;
      pauseResolver = null;
      completionPromise = null;
      completionResolver = null;
    },
  };
}
