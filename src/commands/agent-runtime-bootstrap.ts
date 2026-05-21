import { type InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';
import type { AgentDescriptor, AgentWritableRuntimeHomePolicy } from './agent-cli-adapter.js';
import { djb2Hash } from '../infrastructure/paths/index.js';

export interface AgentRuntimeBootstrapResult {
  envPatch?: Record<string, string>;
  bootstrapApplied?: boolean;
}

function resolveUserDefaultHome(context: InfrastructureContext, policy: AgentWritableRuntimeHomePolicy): string {
  const envHome = context.environment.getEnv(policy.envVar)?.trim();
  if (envHome) {
    return context.environment.resolvePath(envHome);
  }
  const userHome = context.environment.getEnv('HOME') || context.environment.getEnv('USERPROFILE') || '';
  return context.environment.resolvePath(userHome, policy.defaultHomeSubdir);
}

async function copyBootstrapFile(context: InfrastructureContext, sourceHome: string, targetHome: string, relativePath: string): Promise<boolean> {
  const sourcePath = context.environment.resolvePath(sourceHome, relativePath);
  const targetPath = context.environment.resolvePath(targetHome, relativePath);
  if (!context.environment.exists(sourcePath)) {
    if (context.environment.exists(targetPath)) {
      context.environment.rm(targetPath, { force: true });
    }
    return false;
  }

  const sourceStat = context.environment.stat(sourcePath);

  if (sourceStat.isDirectory()) {
    throw new VectaHubError(`bootstrap source is not a file: ${sourcePath}`, ErrorType.FILESYSTEM);
  }

  await context.environment.mkdirAsync(context.environment.getDirname(targetPath), { recursive: true });
  context.environment.copyFile(sourcePath, targetPath);
  return true;
}

export async function bootstrapAgentRuntime(
  context: InfrastructureContext,
  input: {
    descriptor: AgentDescriptor;
    workspaceRoot: string;
  },
): Promise<AgentRuntimeBootstrapResult> {
  const writableRuntimeHome = input.descriptor.runtimePolicy?.writableRuntimeHome;
  if (!writableRuntimeHome) {
    return {};
  }

  const userDefaultHome = resolveUserDefaultHome(context, writableRuntimeHome);
  let copiedFiles = 0;
  const runtimeHome = context.environment.getPath('agent-homes', input.descriptor.id, djb2Hash(input.workspaceRoot));
  for (const file of writableRuntimeHome.bootstrapFiles) {
    await context.environment.mkdirAsync(runtimeHome, { recursive: true });
    const copied = await copyBootstrapFile(context, userDefaultHome, runtimeHome, file.relativePath);
    if (copied) {
      copiedFiles += 1;
      continue;
    }
    if (file.required) {
      throw new VectaHubError(`missing required bootstrap file: ${file.relativePath}`, ErrorType.FILESYSTEM);
    }
  }

  if (writableRuntimeHome.requireAnyBootstrapFile && copiedFiles === 0) {
    throw new VectaHubError(`no bootstrap config files found in ${userDefaultHome}`, ErrorType.FILESYSTEM);
  }

  if (copiedFiles === 0 && writableRuntimeHome.fallbackToUserHomeWhenBootstrapMissing) {
    return {
      bootstrapApplied: false,
    };
  }

  return {
    bootstrapApplied: copiedFiles > 0 || !writableRuntimeHome.fallbackToUserHomeWhenBootstrapMissing,
    envPatch: {
      [writableRuntimeHome.envVar]: runtimeHome,
    },
  };
}
