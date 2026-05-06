export type BreakpointType = 'step' | 'condition' | 'error';

export interface Breakpoint {
  id: string;
  stepId: string;
  type: BreakpointType;
  condition?: string;
  enabled: boolean;
  hitCount: number;
}

export interface DebugState {
  workflowId: string;
  currentStepId: string;
  status: 'running' | 'paused' | 'stopped' | 'completed' | 'error';
  variables: Record<string, unknown>;
  callStack: StepFrame[];
  breakpoints: Breakpoint[];
  lastError?: ErrorInfo;
}

export interface StepFrame {
  stepId: string;
  stepName: string;
  timestamp: number;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

export interface ErrorInfo {
  message: string;
  stack: string;
  timestamp: number;
  stepId: string;
}

export interface ExecutionHistory {
  workflowId: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'error' | 'cancelled';
  steps: StepExecution[];
}

export interface StepExecution {
  stepId: string;
  stepName: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  startTime: number;
  endTime?: number;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  error?: ErrorInfo;
}

export interface WatchExpression {
  id: string;
  expression: string;
  value?: unknown;
  error?: string;
}

export interface DebugEvent {
  type: 'breakpoint' | 'step' | 'error' | 'complete' | 'pause' | 'resume';
  timestamp: number;
  data: unknown;
}
