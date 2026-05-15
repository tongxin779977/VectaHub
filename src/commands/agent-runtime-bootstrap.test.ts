import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAgentDescriptorById } from './agent-cli-adapter.js';
import { bootstrapAgentRuntime } from './agent-runtime-bootstrap.js';

const originalVectaHubHome = process.env.VECTAHUB_HOME;
const originalCodexHome = process.env.CODEX_HOME;

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function seedCodexUserHome(rootDir: string, input?: { configText?: string; withAuth?: boolean }): string {
  const codexHome = join(rootDir, 'user-codex-home');
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(join(codexHome, 'config.toml'), input?.configText || 'model_provider = "right_code"\nmodel = "r1"\n');
  if (input?.withAuth !== false) {
    writeFileSync(join(codexHome, 'auth.json'), JSON.stringify({ token: 'secret-token' }));
  }
  return codexHome;
}

afterEach(() => {
  if (originalVectaHubHome === undefined) {
    delete process.env.VECTAHUB_HOME;
  } else {
    process.env.VECTAHUB_HOME = originalVectaHubHome;
  }
  if (originalCodexHome === undefined) {
    delete process.env.CODEX_HOME;
  } else {
    process.env.CODEX_HOME = originalCodexHome;
  }
});

describe('bootstrapAgentRuntime', () => {
  it('should copy minimal codex config files into isolated runtime home', async () => {
    const tempVectaHubHome = makeTempDir('vectahub-home-');
    const tempConfigRoot = makeTempDir('codex-home-');
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);

    try {
      const descriptor = getAgentDescriptorById('codex');
      const result = await bootstrapAgentRuntime({
        descriptor: descriptor!,
        workspaceRoot: '/workspace/project-a',
      });

      expect(result.envPatch?.CODEX_HOME).toContain('agent-homes/codex');
      expect(readFileSync(join(result.envPatch!.CODEX_HOME, 'config.toml'), 'utf8')).toContain('model_provider = "right_code"');
      expect(JSON.parse(readFileSync(join(result.envPatch!.CODEX_HOME, 'auth.json'), 'utf8'))).toEqual({ token: 'secret-token' });
    } finally {
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempConfigRoot, { recursive: true, force: true });
    }
  });

  it('should remove stale bootstrap files when they no longer exist in the user default home', async () => {
    const tempVectaHubHome = makeTempDir('vectahub-home-');
    const tempConfigRoot = makeTempDir('codex-home-');
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    const userHome = seedCodexUserHome(tempConfigRoot);
    process.env.CODEX_HOME = userHome;

    try {
      const descriptor = getAgentDescriptorById('codex');
      const first = await bootstrapAgentRuntime({
        descriptor: descriptor!,
        workspaceRoot: '/workspace/project-b',
      });
      expect(existsSync(join(first.envPatch!.CODEX_HOME, 'auth.json'))).toBe(true);

      unlinkSync(join(userHome, 'auth.json'));
      writeFileSync(join(userHome, 'config.toml'), 'model_provider = "right_code"\nmodel = "r2"\n');

      const second = await bootstrapAgentRuntime({
        descriptor: descriptor!,
        workspaceRoot: '/workspace/project-b',
      });

      expect(existsSync(join(second.envPatch!.CODEX_HOME, 'auth.json'))).toBe(false);
      expect(readFileSync(join(second.envPatch!.CODEX_HOME, 'config.toml'), 'utf8')).toContain('model = "r2"');
    } finally {
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempConfigRoot, { recursive: true, force: true });
    }
  });
});
