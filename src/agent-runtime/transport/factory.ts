/**
 * Transport factory: creates AgentTransport instances from config.
 * See docs/01-acp-transport.md § 传输工厂.
 */

import type { AgentTransport } from './types.js';
import { AcpTransport } from './acp-transport.js';

export interface AcpConfig {
  agentId: string;
  command: string;
  args: string[];
  defaultTimeoutMs: number;
  permissionMode: 'ask' | 'allow' | 'deny';
}

export function createTransport(config: AcpConfig): AgentTransport {
  return new AcpTransport(config);
}
