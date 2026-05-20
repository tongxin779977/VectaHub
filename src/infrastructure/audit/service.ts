import type { IEnvironmentService, IAuditService } from '../interfaces/index.js';
import type { AuditFailureMode, AuditQueryOptions } from '../interfaces/audit-service.js';
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
    this.onError = options?.onError || ((error) => {
      console.error('[AUDIT] 审计日志写入失败:', error.message);
    });

    const baseDir = this.environment.getPath('logs', 'audit');
    const actualSessionId = options?.sessionId || generateSessionId();
    this.auditLogger = new AuditLogger(actualSessionId, baseDir);

    // 注入错误处理回调到审计日志记录器
    (this.auditLogger as unknown as { onError?: (error: Error) => void }).onError = (error: Error) => {
      this.handleAuditFailure(error);
    };

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
        return this.auditLogger.query(options as any);
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
    const wrapped: Partial<AuditHelper> = {};

    for (const [key, method] of Object.entries(helper)) {
      wrapped[key as keyof AuditHelper] = (...args: any[]) => {
        try {
          const auditMethod = method as (...args: unknown[]) => void;
          auditMethod(...args);
        } catch (error) {
          this.handleAuditFailure(error as Error);
        }
      };
    }

    return wrapped as AuditHelper;
  }

  private handleAuditFailure(error: Error): void {
    if (this.failureMode === 'fail-closed') {
      throw error;
    }
    this.onError(error);
  }
}
