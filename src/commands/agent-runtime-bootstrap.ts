import { existsSync } from 'node:fs';
import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { AgentDescriptor, AgentWritableRuntimeHomePolicy } from './agent-cli-adapter.js';
import { djb2Hash, getVectaHubPath } from '../utils/paths.js';

export interface AgentRuntimeBootstrapResult {
  envPatch?: Record<string, string>;
  bootstrapApplied?: boolean;
}

function resolveUserDefaultHome(policy: AgentWritableRuntimeHomePolicy): string {
  const envHome = process.env[policy.envVar]?.trim();
  if (envHome) {
    return resolve(envHome);
  }
  return join(homedir(), policy.defaultHomeSubdir);
}

async function copyBootstrapFile(sourceHome: string, targetHome: string, relativePath: string): Promise<boolean> {
  const sourcePath = resolve(sourceHome, relativePath);
  const targetPath = resolve(targetHome, relativePath);
  if (!existsSync(sourcePath)) {
    if (existsSync(targetPath)) {
      await rm(targetPath, { force: true });
    }
    return false;
  }

  const sourceStat = await stat(sourcePath);
  if (!sourceStat.isFile()) {
    throw new Error(`bootstrap source is not a file: ${sourcePath}`);
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
  return true;
}

export async function bootstrapAgentRuntime(input: {
  descriptor: AgentDescriptor;
  workspaceRoot: string;
}): Promise<AgentRuntimeBootstrapResult> {
  const writableRuntimeHome = input.descriptor.runtimePolicy?.writableRuntimeHome;
  if (!writableRuntimeHome) {
    return {};
  }

  const userDefaultHome = resolveUserDefaultHome(writableRuntimeHome);
  let copiedFiles = 0;
  const runtimeHome = getVectaHubPath('agent-homes', input.descriptor.id, djb2Hash(input.workspaceRoot));
  for (const file of writableRuntimeHome.bootstrapFiles) {
    await mkdir(runtimeHome, { recursive: true });
    const copied = await copyBootstrapFile(userDefaultHome, runtimeHome, file.relativePath);
    if (copied) {
      copiedFiles += 1;
      continue;
    }
    if (file.required) {
      throw new Error(`missing required bootstrap file: ${file.relativePath}`);
    }
  }

  if (writableRuntimeHome.requireAnyBootstrapFile && copiedFiles === 0) {
    throw new Error(`no bootstrap config files found in ${userDefaultHome}`);
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
