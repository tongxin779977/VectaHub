import { getDefaultContext } from '../context.js';
import { createTraceAuditSystemWithDeps, type TraceAuditSystemDeps } from './system.js';
import type { TraceAuditConfig } from './types.js';

function createTraceAuditSystemBridgeDeps(): TraceAuditSystemDeps {
  const context = getDefaultContext();
  return {
    environment: context.environment,
    logger: context.logger,
  };
}

/**
 * 兼容桥接层：默认 context 仅用于历史链路审计 API。
 * @deprecated 建议使用 createTraceAuditSystemWithDeps(deps, config)
 */
export function createTraceAuditSystem(config?: Partial<TraceAuditConfig>) {
  return createTraceAuditSystemWithDeps(createTraceAuditSystemBridgeDeps(), config);
}
