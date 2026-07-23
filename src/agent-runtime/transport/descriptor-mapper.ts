/**
 * Maps AgentDescriptor (spawn-era type) to AcpClientOptions (ACP-era type).
 * See docs/01-acp-transport.md § AgentDescriptor → AcpClientOptions 映射.
 */

import type { AgentDescriptor } from '../../types/agent.js';
import type { AcpClientOptions } from '../acp/acp-types.js';
import type { TransportRequest } from './types.js';

/** Extract ACP client options from a spawn-era AgentDescriptor. */
export function descriptorToAcpOptions(
  descriptor: AgentDescriptor,
  request: TransportRequest,
): AcpClientOptions {
  return {
    command: descriptor.entryCommand,
    args: buildAcpArgs(descriptor),
    cwd: request.workspaceRoot,
    clientName: 'vectahub',
    clientVersion: getVectaHubVersion(),
    envPatch: { ...request.envPatch },
    timeoutMs: request.timeoutMs,
    onEvent: undefined,
    onPermission: request.onPermission,
  };
}

/** Build ACP subcommand args from descriptor. */
export function buildAcpArgs(descriptor: AgentDescriptor): string[] {
  if (descriptor.subcommand) {
    return [descriptor.subcommand, 'acp'];
  }
  return ['acp'];
}

function getVectaHubVersion(): string {
  // Lazy import to avoid circular dependency at module load time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pkg = require('../../../package.json');
  return pkg.version as string;
}
