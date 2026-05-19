import { InfrastructureContext } from '../context.js';
import { MockEnvironmentService, MockLoggerService } from './mock-services.js';

export * from './mock-services.js';

/**
 * 创建一个纯内存的测试基础设施上下文
 */
export function createTestInfrastructureContext(): InfrastructureContext {
  const environment = new MockEnvironmentService();
  const logger = new MockLoggerService();
  
  return new InfrastructureContext({
    environment,
    logger,
  });
}
