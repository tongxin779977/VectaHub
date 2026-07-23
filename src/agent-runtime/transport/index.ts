export type {
  AgentTransport,
  TransportRequest,
  TransportResult,
  TransportError,
  TransportErrorCode,
} from './types.js';

export {
  AcpProtocolError,
  ProcessExitError,
  TimeoutError,
  mapErrorToTransportError,
  stopToErrorCode,
} from './error-mapper.js';

export {
  descriptorToAcpOptions,
  buildAcpArgs,
} from './descriptor-mapper.js';

export {
  createTraceBridge,
  type TraceBridge,
} from './trace-bridge.js';

export {
  createAuditBridge,
  type AuditBridge,
} from './audit-bridge.js';

export {
  handleAcpPermission,
  buildIntentionFromAcpTool,
  findOption,
  type AcpPermissionRequest,
  type PermissionResult,
} from './security-bridge.js';

export {
  createTransport,
  type AcpConfig,
} from './factory.js';

export { AcpTransport } from './acp-transport.js';
