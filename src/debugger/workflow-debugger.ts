import { getLogger } from '../utils/logger.js';
import { type Workflow } from '../types/workflow.js';
import { type Breakpoint, type DebugState, type StepFrame, type ErrorInfo, type ExecutionHistory, type StepExecution, type WatchExpression, type DebugEvent, BreakpointType } from './debugger-api.js';
import vm from 'vm';

const ALLOWED_EXPRESSION_CHARS = /^[\w\s.+\-*/%<>=!&|()\[\]'"?:]*$/;

function sanitizeExpression(expression: string): { valid: boolean; message?: string } {
  const trimmed = expression.trim();
  
  if (!trimmed) {
    return { valid: false, message: 'Empty expression' };
  }

  if (trimmed.length > 500) {
    return { valid: false, message: 'Expression too long' };
  }

  if (!ALLOWED_EXPRESSION_CHARS.test(trimmed)) {
    return { valid: false, message: 'Expression contains invalid characters' };
  }

  const dangerousPatterns = [
    /(?:^|\s)eval\s*\(/,
    /(?:^|\s)Function\s*\(/,
    /(?:^|\s)require\s*\(/,
    /(?:^|\s)process\s*\./,
    /(?:^|\s)global\s*\./,
    /(?:^|\s)Buffer\s*\(/,
    /(?:^|\s)__dirname/,
    /(?:^|\s)__filename/,
    /\$\{.*\}/,
    /`.*`/,
    /(?:^|\s)new\s+Function\s*\(/,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(trimmed)) {
      return { valid: false, message: 'Expression contains dangerous code' };
    }
  }

  return { valid: true };
}

export interface SandboxOptions {
  timeout?: number;
  memoryLimit?: number;
}

const DEFAULT_TIMEOUT = 1000;
const DEFAULT_MEMORY_LIMIT = 1024 * 1024 * 10; 

function freezeObject(obj: unknown): void {
  if (typeof obj === 'object' && obj !== null) {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach((prop) => {
      const value = (obj as Record<string, unknown>)[prop];
      if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
        freezeObject(value);
      }
    });
  }
}

function createSandboxContext(
  variables: Record<string, unknown>,
  options: SandboxOptions = {},
): { context: vm.Context; timeout: number; memoryLimit: number } {
  const safeGlobals = {
    Math: Math,
    Date: Date,
    JSON: JSON,
    Object: Object.freeze(Object),
    Array: Object.freeze(Array),
    String: Object.freeze(String),
    Number: Object.freeze(Number),
    Boolean: Object.freeze(Boolean),
    ...variables,
  };

  freezeObject(safeGlobals);

  return {
    context: vm.createContext(safeGlobals),
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
    memoryLimit: options.memoryLimit ?? DEFAULT_MEMORY_LIMIT,
  };
}

export class WorkflowDebugger {
  private logger = getLogger('debugger');
  private breakpoints = new Map<string, Breakpoint>();
  private watchExpressions = new Map<string, WatchExpression>();
  private executionHistory: ExecutionHistory[] = [];
  private currentState: DebugState | null = null;
  private eventListeners: Array<(event: DebugEvent) => void> = [];
  private isPaused = false;
  private stepMode = false;

  setBreakpoint(stepId: string, type: BreakpointType = 'step', condition?: string): string {
    const id = `bp-${stepId}-${Date.now()}`;
    
    if (type === 'condition' && condition) {
      const sanitizeResult = sanitizeExpression(condition);
      if (!sanitizeResult.valid) {
        throw new Error(`Invalid breakpoint condition: ${sanitizeResult.message}`);
      }
    }

    const breakpoint: Breakpoint = {
      id,
      stepId,
      type,
      condition,
      enabled: true,
      hitCount: 0,
    };
    this.breakpoints.set(id, breakpoint);
    this.logger.info(`Breakpoint set: ${id} on step ${stepId}`);
    return id;
  }

  removeBreakpoint(breakpointId: string): void {
    this.breakpoints.delete(breakpointId);
    this.logger.info(`Breakpoint removed: ${breakpointId}`);
  }

  enableBreakpoint(breakpointId: string): void {
    const bp = this.breakpoints.get(breakpointId);
    if (bp) {
      bp.enabled = true;
      this.logger.info(`Breakpoint enabled: ${breakpointId}`);
    }
  }

  disableBreakpoint(breakpointId: string): void {
    const bp = this.breakpoints.get(breakpointId);
    if (bp) {
      bp.enabled = false;
      this.logger.info(`Breakpoint disabled: ${breakpointId}`);
    }
  }

  getBreakpoints(): Breakpoint[] {
    return Array.from(this.breakpoints.values());
  }

  addWatchExpression(expression: string): string {
    const sanitizeResult = sanitizeExpression(expression);
    if (!sanitizeResult.valid) {
      throw new Error(`Invalid watch expression: ${sanitizeResult.message}`);
    }

    const id = `watch-${Date.now()}`;
    const watch: WatchExpression = { id, expression };
    this.watchExpressions.set(id, watch);
    return id;
  }

  removeWatchExpression(watchId: string): void {
    this.watchExpressions.delete(watchId);
  }

  getWatchExpressions(): WatchExpression[] {
    return Array.from(this.watchExpressions.values());
  }

  async evaluateWatchExpressions(variables: Record<string, unknown>): Promise<void> {
    const timeout = DEFAULT_TIMEOUT;
    
    const evaluatePromises = Array.from(this.watchExpressions.entries()).map(
      async ([id, watch]) => {
        const { context: sandbox } = createSandboxContext(variables);
        try {
          const result = vm.runInNewContext(`(${watch.expression})`, sandbox, {
            timeout,
            displayErrors: false,
          });
          watch.value = result;
          watch.error = undefined;
        } catch (error) {
          watch.error = (error as Error).message;
          watch.value = undefined;
        }
        return id;
      }
    );

    await Promise.all(evaluatePromises);
  }

  async runWorkflow(workflow: Workflow): Promise<DebugState> {
    this.currentState = {
      workflowId: workflow.id,
      currentStepId: '',
      status: 'running',
      variables: {},
      callStack: [],
      breakpoints: this.getBreakpoints(),
    };

    const history: ExecutionHistory = {
      workflowId: workflow.id,
      startTime: Date.now(),
      status: 'running',
      steps: [],
    };

    this.executionHistory.push(history);

    const stepExecutions: StepExecution[] = [];

    for (const step of workflow.steps) {
      if (this.isPaused && !this.stepMode) {
        await this.waitForResume();
      }

      this.currentState.currentStepId = step.id;

      const stepName = (step as any).name || step.id;
      const stepExecution: StepExecution = {
        stepId: step.id,
        stepName,
        status: 'running',
        startTime: Date.now(),
        inputs: { ...this.currentState.variables },
        outputs: {},
      };

      stepExecutions.push(stepExecution);

      const frame: StepFrame = {
        stepId: step.id,
        stepName,
        timestamp: Date.now(),
        inputs: { ...this.currentState.variables },
        outputs: {},
      };

      this.currentState.callStack.push(frame);

      this.triggerEvent('step', { stepId: step.id, stepName });

      try {
        if (await this.checkBreakpoint(step.id, this.currentState.variables)) {
          this.pause();
          this.triggerEvent('breakpoint', { stepId: step.id });
          if (!this.stepMode) {
            await this.waitForResume();
          }
        }

        const outputs = await this.executeStep(step, this.currentState.variables);
        
        stepExecution.outputs = outputs;
        stepExecution.status = 'completed';
        stepExecution.endTime = Date.now();

        frame.outputs = outputs;
        this.currentState.variables = { ...this.currentState.variables, ...outputs };

        await this.evaluateWatchExpressions(this.currentState.variables);

        this.currentState.callStack.pop();

        if (this.stepMode) {
          this.pause();
          this.triggerEvent('pause', { stepId: step.id });
        }

      } catch (error) {
        const errorInfo: ErrorInfo = {
          message: (error as Error).message,
          stack: (error as Error).stack || '',
          timestamp: Date.now(),
          stepId: step.id,
        };

        stepExecution.status = 'error';
        stepExecution.error = errorInfo;
        stepExecution.endTime = Date.now();

        this.currentState.status = 'error';
        this.currentState.lastError = errorInfo;

        this.triggerEvent('error', errorInfo);
        break;
      }
    }

    if (this.currentState.status !== 'error') {
      this.currentState.status = 'completed';
      history.status = 'completed';
      this.triggerEvent('complete', {});
    }

    history.endTime = Date.now();
    history.steps = stepExecutions;

    return this.currentState;
  }

  private async checkBreakpoint(stepId: string, variables: Record<string, unknown>): Promise<boolean> {
    const { context: sandbox, timeout } = createSandboxContext(variables);

    for (const bp of this.breakpoints.values()) {
      if (!bp.enabled || bp.stepId !== stepId) continue;

      bp.hitCount++;

      if (bp.type === 'step') {
        return true;
      }

      if (bp.type === 'condition' && bp.condition) {
        try {
          const result = vm.runInNewContext(`(${bp.condition})`, sandbox, {
            timeout,
            displayErrors: false,
          });
          if (result) {
            return true;
          }
        } catch {
          this.logger.warn(`Failed to evaluate condition for breakpoint ${bp.id}`);
        }
      }
    }
    return false;
  }

  private async executeStep(step: any, inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (typeof step.execute === 'function') {
      return await step.execute(inputs);
    }
    return {};
  }

  pause(): void {
    this.isPaused = true;
    if (this.currentState) {
      this.currentState.status = 'paused';
    }
    this.logger.info('Execution paused');
  }

  resume(): void {
    this.isPaused = false;
    this.stepMode = false;
    if (this.currentState) {
      this.currentState.status = 'running';
    }
    this.logger.info('Execution resumed');
    this.triggerEvent('resume', {});
  }

  stepOver(): void {
    this.isPaused = false;
    this.stepMode = true;
    this.logger.info('Step over');
  }

  private resumePromise?: Promise<void>;
  private resumeResolve?: () => void;

  private waitForResume(): Promise<void> {
    return new Promise((resolve) => {
      this.resumePromise = new Promise((res) => {
        this.resumeResolve = res;
      });
      this.resumePromise.then(resolve);
    });
  }

  private triggerEvent(type: DebugEvent['type'], data: unknown): void {
    const event: DebugEvent = { type, timestamp: Date.now(), data };
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  onEvent(listener: (event: DebugEvent) => void): void {
    this.eventListeners.push(listener);
  }

  offEvent(listener: (event: DebugEvent) => void): void {
    const index = this.eventListeners.indexOf(listener);
    if (index !== -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  getState(): DebugState | null {
    return this.currentState;
  }

  getHistory(): ExecutionHistory[] {
    return [...this.executionHistory];
  }

  getHistoryById(workflowId: string): ExecutionHistory | undefined {
    return this.executionHistory.find(h => h.workflowId === workflowId);
  }

  clearHistory(): void {
    this.executionHistory = [];
    this.logger.info('Execution history cleared');
  }

  reset(): void {
    this.breakpoints.clear();
    this.watchExpressions.clear();
    this.currentState = null;
    this.isPaused = false;
    this.stepMode = false;
    this.logger.info('Debugger reset');
  }
}

export const workflowDebugger = new WorkflowDebugger();