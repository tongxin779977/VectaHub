import { getDefaultContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';
import type { AgentDescriptor, AgentWritableRuntimeHomePolicy } from './agent-cli-adapter.js';
import { djb2Hash } from '../infrastructure/paths/index.js';

export interface AgentRuntimeBootstrapResult {
  envPatch?: Record<string, string>;
  bootstrapApplied?: boolean;
}

function resolveUserDefaultHome(policy: AgentWritableRuntimeHomePolicy): string {
  const ctx = getDefaultContext();
  const envHome = ctx.environment.getEnv(policy.envVar)?.trim();
  if (envHome) {
    return ctx.environment.resolvePath(envHome);
  }
  const userHome = ctx.environment.getEnv('HOME') || ctx.environment.getEnv('USERPROFILE') || '';
  return ctx.environment.resolvePath(userHome, policy.defaultHomeSubdir);
}

async function copyBootstrapFile(sourceHome: string, targetHome: string, relativePath: string): Promise<boolean> {
  const ctx = getDefaultContext();
  const sourcePath = ctx.environment.resolvePath(sourceHome, relativePath);
  const targetPath = ctx.environment.resolvePath(targetHome, relativePath);
  if (!ctx.environment.exists(sourcePath)) {
    if (ctx.environment.exists(targetPath)) {
      ctx.environment.rm(targetPath, { force: true });
    }
    return false;
  }

  const sourceStat = ctx.environment.stat(sourcePath);
  if (!sourceStat.isDirectory() === false) { // isFile check: EnvironmentService.stat doesn't have isFile but has isDirectory
    // Wait, the original code used sourceStat.isFile().
    // EnvironmentService.stat returns { size: number; isDirectory(): boolean }
    // If it's not a directory, we assume it's a file for this bootstrap purpose (simplified)
  }
  
  if (sourceStat.isDirectory()) {
    throw new VectaHubError(`bootstrap source is not a file: ${sourcePath}`, ErrorType.FILESYSTEM);
  }

  await ctx.environment.mkdirAsync(ctx.environment.getDirname(targetPath), { recursive: true });
  ctx.environment.copyFile(sourcePath, targetPath);
  return true;
}

export async function bootstrapAgentRuntime(input: {
  descriptor: AgentDescriptor;
  workspaceRoot: string;
}): Promise<AgentRuntimeBootstrapResult> {
  const ctx = getDefaultContext();
  const writableRuntimeHome = input.descriptor.runtimePolicy?.writableRuntimeHome;
  if (!writableRuntimeHome) {
    return {};
  }

  const userDefaultHome = resolveUserDefaultHome(writableRuntimeHome);
  let copiedFiles = 0;
  const runtimeHome = ctx.environment.getPath('agent-homes', input.descriptor.id, djb2Hash(input.workspaceRoot));
  for (const file of writableRuntimeHome.bootstrapFiles) {
    await ctx.environment.mkdirAsync(runtimeHome, { recursive: true });
    const copied = await copyBootstrapFile(userDefaultHome, runtimeHome, file.relativePath);
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
