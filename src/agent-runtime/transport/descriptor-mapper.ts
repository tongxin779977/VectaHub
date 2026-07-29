/**
 * Maps AgentDescriptor (spawn-era type) to AcpClientOptions (ACP-era type).
 * See docs/01-acp-transport.md § AgentDescriptor → AcpClientOptions 映射.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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

/** 读取 package.json 版本号(ESM 安全方式)。 */
function getVectaHubVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, '..', '..', '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
  return pkg.version;
}
