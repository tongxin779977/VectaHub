import type { IEnvironmentService, IAuditService } from '../interfaces/index.js';
import type { AuditFailureMode, AuditQueryOptions } from '../interfaces/audit-service.js';
import { VectaHubError, ErrorType } from '../errors/index.js';
import {
  AuditLogger,
  createAuditHelper,
  type AuditHelper,
  type AuditEvent,
  generateSessionId,
} from './index.js';

/**
 * 审计服务实现
 * 默认使用 fail-open 错误隔离。
 * 对于必须保留审计完整性的入口，可显式切换为 fail-closed。
 */
export class AuditService implements IAuditService {
  private readonly environment: IEnvironmentService;
  private readonly auditLogger: AuditLogger;
  private readonly auditHelper: AuditHelper;
  private readonly onError: (error: Error) => void;
  private readonly failureMode: AuditFailureMode;

  constructor(
    environment: IEnvironmentService,
    options?: {
      sessionId?: string;
      onError?: (error: Error) => void;
      failureMode?: AuditFailureMode;
    },
  ) {
    this.environment = environment;
    this.failureMode = options?.failureMode ?? 'fail-open';
    if (!options?.onError && this.failureMode === 'fail-open') {
      throw new VectaHubError('AuditService fail-open mode requires an explicit onError handler', ErrorType.CONFIGURATION);
    }
    this.onError = options?.onError ?? ((error) => {
      throw error;
    });

    const baseDir = this.environment.getPath('logs', 'audit');
    const actualSessionId = options?.sessionId || generateSessionId();
    this.auditLogger = new AuditLogger(actualSessionId, baseDir, {
      onError: (error) => this.handleAuditFailure(error),
    });

    this.auditHelper = createAuditHelper(this.auditLogger);
  }

  getFailureMode(): AuditFailureMode {
    return this.failureMode;
  }

  /**
   * 获取审计日志记录器。
   * fail-open 会记录错误并继续；fail-closed 会把写入异常抛回调用方。
   */
  getLogger(): {
    write(event: AuditEvent): void;
    query(options?: AuditQueryOptions): AuditEvent[];
    export(format: 'json' | 'csv'): string;
    getSessionId(): string;
  } {
    return {
      write: (event: AuditEvent) => {
        try {
          this.auditLogger.write(event);
        } catch (error) {
          this.handleAuditFailure(error as Error);
        }
      },
      query: (options?: AuditQueryOptions) => {
        return this.auditLogger.query(options);
      },
      export: (format: 'json' | 'csv') => {
        return this.auditLogger.export(format);
      },
      getSessionId: () => {
        return this.auditLogger.getSessionId();
      },
    };
  }

  /**
   * 获取审计便捷方法集
   */
  getHelper(): AuditHelper {
    // 包装所有方法，并遵守当前服务的失败策略
    return this.wrapHelperWithErrorHandling(this.auditHelper);
  }

  private wrapHelperWithErrorHandling(helper: AuditHelper): AuditHelper {
    return {
      log: (event) => this.runAuditHelperCall(() => helper.log(event)),
      cliCommand: (cmd, args, sessionId) => this.runAuditHelperCall(() => helper.cliCommand(cmd, args, sessionId)),
      cliOutput: (cmd, output, sessionId) => this.runAuditHelperCall(() => helper.cliOutput(cmd, output, sessionId)),
      workflowStart: (workflowId, intent, sessionId, metadata) => this.runAuditHelperCall(() => helper.workflowStart(workflowId, intent, sessionId, metadata)),
      workflowEnd: (workflowId, status, duration, sessionId) => this.runAuditHelperCall(() => helper.workflowEnd(workflowId, status, duration, sessionId)),
      workflowStep: (stepId, cli, args, sessionId, metadata) => this.runAuditHelperCall(() => helper.workflowStep(stepId, cli, args, sessionId, metadata)),
      securityAlert: (ruleId, command, severity, sessionId) => this.runAuditHelperCall(() => helper.securityAlert(ruleId, command, severity, sessionId)),
      securityAction: (action, target, result, sessionId) => this.runAuditHelperCall(() => helper.securityAction(action, target, result, sessionId)),
      configChange: (module, key, oldVal, newVal, sessionId) => this.runAuditHelperCall(() => helper.configChange(module, key, oldVal, newVal, sessionId)),
      intentMatch: (intent, confidence, params, sessionId, metadata) => this.runAuditHelperCall(() => helper.intentMatch(intent, confidence, params, sessionId, metadata)),
      executorResult: (stepId, cli, exitCode, duration, sessionId, metadata) => this.runAuditHelperCall(() => helper.executorResult(stepId, cli, exitCode, duration, sessionId, metadata)),
      fileOperation: (operation, path, sessionId, success, error) => this.runAuditHelperCall(() => helper.fileOperation(operation, path, sessionId, success, error)),
      sandboxDetect: (command, isDangerous, severity, sessionId) => this.runAuditHelperCall(() => helper.sandboxDetect(command, isDangerous, severity, sessionId)),
    };
  }

  private runAuditHelperCall(call: () => void): void {
    try {
      call();
    } catch (error) {
      this.handleAuditFailure(this.normalizeError(error));
    }
  }

  private normalizeError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  private handleAuditFailure(error: Error): void {
    if (this.failureMode === 'fail-closed') {
      throw error;
    }
    this.onError(error);
  }
}
