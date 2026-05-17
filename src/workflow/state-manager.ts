import type { ExecutionRecord } from '../types/index.js';

export type ExecutionState =
  | 'IDLE'
  | 'RUNNING'
  | 'PAUSING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'ABORTING'
  | 'ABORTED';

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

const ALLOWED_TRANSITIONS: Record<ExecutionState, readonly ExecutionState[]> = {
  IDLE: ['RUNNING'],
  RUNNING: ['PAUSING', 'FAILED', 'COMPLETED', 'ABORTING'],
  PAUSING: ['PAUSED', 'ABORTING', 'FAILED'],
  PAUSED: ['RUNNING', 'ABORTING', 'FAILED'],
  COMPLETED: ['RUNNING'],
  FAILED: ['RUNNING'],
  ABORTING: ['ABORTED', 'FAILED'],
  ABORTED: ['RUNNING'],
};

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
      if (newState !== state) {
        const allowed = ALLOWED_TRANSITIONS[state];
        if (!allowed.includes(newState)) {
          throw new Error(`Invalid execution state transition: ${state} -> ${newState}`);
        }
      }
      state = newState;
      if (currentExecution) {
        switch (newState) {
          case 'RUNNING':
          case 'PAUSING':
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
