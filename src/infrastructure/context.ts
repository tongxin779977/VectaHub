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
  private auditService?: IAuditService;

  constructor(options?: {
    environment?: IEnvironmentService;
    config?: IConfigService;
    logger?: ILoggerService;
    eventBus?: IEventBus;
    audit?: IAuditService;
    projectRoot?: string;
  }) {
    // 依赖注入，如果没有提供则使用默认实现
    this.environment = options?.environment ?? createEnvironmentService();
    this.config = options?.config ?? new ConfigService(this.environment);
    this.logger = options?.logger ?? new LoggerService(this.environment, { projectRoot: options?.projectRoot });
    this.eventBus = options?.eventBus ?? new EventBus();
    this.auditService = options?.audit;
  }

  get audit(): IAuditService {
    this.auditService ??= new AuditService(this.environment, {
      onError: (error) => {
        this.logger.getLogger('audit').warn({ error }, 'Audit log write failed');
      },
    });
    return this.auditService;
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
    projectRoot: string;
  }>): InfrastructureContext {
    return new InfrastructureContext({
      environment: overrides.environment ?? this.environment,
      config: overrides.config ?? this.config,
      logger: overrides.logger ?? this.logger,
      eventBus: overrides.eventBus ?? this.eventBus,
      audit: overrides.audit ?? this.audit,
      projectRoot: overrides.projectRoot,
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
 * 设置默认上下文（用于兼容桥和测试）
 */
export function setDefaultContext(context: InfrastructureContext): void {
  defaultContext = context;
}

/**
 * 重置默认上下文（用于测试）
 */
export function resetDefaultContext(): void {
  defaultContext = null;
}
