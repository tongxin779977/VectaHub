import type {
  IEnvironmentService,
  IConfigService,
  ILoggerService,
  IEventBus,
  IAuditService,
} from './interfaces/index.js';
import { createEnvironmentService } from './environment/index.js';
import { ConfigService } from './config/service.js';
import { LoggerService } from './logger/service.js';
import { EventBus } from './event/bus.js';
import { AuditService } from './audit/service.js';

/**
 * 基础设施上下文
 * 统一管理所有基础设施服务的依赖注入容器
 */
export class InfrastructureContext {
  readonly environment: IEnvironmentService;
  readonly config: IConfigService;
  readonly logger: ILoggerService;
  readonly eventBus: IEventBus;
  readonly audit: IAuditService;

  constructor(options?: {
    environment?: IEnvironmentService;
    config?: IConfigService;
    logger?: ILoggerService;
    eventBus?: IEventBus;
    audit?: IAuditService;
  }) {
    // 依赖注入，如果没有提供则使用默认实现
    this.environment = options?.environment ?? createEnvironmentService();
    this.config = options?.config ?? new ConfigService(this.environment);
    this.logger = options?.logger ?? new LoggerService(this.environment);
    this.eventBus = options?.eventBus ?? new EventBus();
    this.audit = options?.audit ?? new AuditService(this.environment);
  }

  /**
   * 创建一个具有覆盖选项的新上下文（用于局部替换某些服务）
   */
  with(overrides: Partial<{
    environment: IEnvironmentService;
    config: IConfigService;
    logger: ILoggerService;
    eventBus: IEventBus;
    audit: IAuditService;
  }>): InfrastructureContext {
    return new InfrastructureContext({
      environment: overrides.environment ?? this.environment,
      config: overrides.config ?? this.config,
      logger: overrides.logger ?? this.logger,
      eventBus: overrides.eventBus ?? this.eventBus,
      audit: overrides.audit ?? this.audit,
    });
  }
}

/**
 * 默认全局上下文（向后兼容用）
 * 建议显式创建 InfrastructureContext 而不是依赖这个单例
 */
let defaultContext: InfrastructureContext | null = null;

/**
 * 获取默认上下文（懒加载）
 */
export function getDefaultContext(): InfrastructureContext {
  if (!defaultContext) {
    defaultContext = new InfrastructureContext();
  }
  return defaultContext;
}

/**
 * 重置默认上下文（用于测试）
 */
export function resetDefaultContext(): void {
  defaultContext = null;
}
