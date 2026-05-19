import type { IEnvironmentService, IAuditService } from '../interfaces/index.js';
import type { AuditQueryOptions } from '../interfaces/audit-service.js';
import {
  AuditLogger,
  createAuditHelper,
  type AuditHelper,
  type AuditEvent,
  generateSessionId,
} from './index.js';

/**
 * 审计服务实现
 * 支持错误隔离：审计日志写入失败不会影响主流程
 */
export class AuditService implements IAuditService {
  private readonly environment: IEnvironmentService;
  private readonly auditLogger: AuditLogger;
  private readonly auditHelper: AuditHelper;
  private readonly onError: (error: Error) => void;

  constructor(
    environment: IEnvironmentService,
    sessionId?: string,
    onError?: (error: Error) => void,
  ) {
    this.environment = environment;
    this.onError = onError || ((error) => {
      console.error('[AUDIT] 审计日志写入失败:', error.message);
    });

    const baseDir = this.environment.getPath('logs', 'audit');
    const actualSessionId = sessionId || generateSessionId();
    this.auditLogger = new AuditLogger(actualSessionId, baseDir);

    // 注入错误处理回调到审计日志记录器
    (this.auditLogger as any).onError = this.onError;

    this.auditHelper = createAuditHelper(this.auditLogger);
  }

  /**
   * 获取审计日志记录器，带有错误隔离机制
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
          // 审计日志写入失败不应影响主流程
          this.onError(error as Error);
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
    // 包装所有方法，确保错误隔离
    return this.wrapHelperWithErrorHandling(this.auditHelper);
  }

  private wrapHelperWithErrorHandling(helper: AuditHelper): AuditHelper {
    const wrapped: Partial<AuditHelper> = {};

    for (const [key, method] of Object.entries(helper)) {
      wrapped[key as keyof AuditHelper] = (...args: any[]) => {
        try {
          (method as Function)(...args);
        } catch (error) {
          this.onError(error as Error);
        }
      };
    }

    return wrapped as AuditHelper;
  }
}
