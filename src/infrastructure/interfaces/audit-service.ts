import type { AuditEvent, AuditHelper } from '../audit/index.js';

export interface AuditQueryOptions {
  startDate?: Date;
  endDate?: Date;
  eventType?: string;
  module?: string;
  user?: string;
  command?: string;
  limit?: number;
}

export interface AuditLoggerInterface {
  write(event: AuditEvent): void;
  query(options?: AuditQueryOptions): AuditEvent[];
  export(format: 'json' | 'csv'): string;
  getSessionId(): string;
}

export type AuditFailureMode = 'fail-open' | 'fail-closed';

/**
 * 审计服务接口
 */
export interface IAuditService {
  /**
   * 获取审计日志记录器
   */
  getLogger(): AuditLoggerInterface;

  /**
   * 获取审计便捷方法集
   */
  getHelper(): AuditHelper;

  /**
   * 获取审计失败策略
   */
  getFailureMode(): AuditFailureMode;
}
