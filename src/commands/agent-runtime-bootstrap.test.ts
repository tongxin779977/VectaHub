import { afterEach, describe, expect, it, beforeAll } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAgentDescriptorById } from './agent-cli-adapter.js';
import { bootstrapAgentRuntime } from './agent-runtime-bootstrap.js';
import { initializeBuiltInAgents } from '../agent-runtime/factory.js';
import { resetDefaultContext } from '../infrastructure/context.js';

const originalVectaHubHome = process.env.VECTAHUB_HOME;
const originalCodexHome = process.env.CODEX_HOME;
const originalClaudeHome = process.env.CLAUDE_HOME;

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
  if (originalClaudeHome === undefined) {
    delete process.env.CLAUDE_HOME;
  } else {
    process.env.CLAUDE_HOME = originalClaudeHome;
  }
  resetDefaultContext();
});

describe('bootstrapAgentRuntime', () => {
  beforeAll(() => {
    initializeBuiltInAgents();
  });
  it('should copy minimal codex config files into isolated runtime home', async () => {
    const tempVectaHubHome = makeTempDir('vectahub-home-');
    const tempConfigRoot = makeTempDir('codex-home-');
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CODEX_HOME = seedCodexUserHome(tempConfigRoot);
    resetDefaultContext();

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
    resetDefaultContext();

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

  it('should keep inheriting user environment for claude when no bootstrap source exists', async () => {
    const tempVectaHubHome = makeTempDir('vectahub-home-');
    const tempClaudeHome = makeTempDir('claude-home-');
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CLAUDE_HOME = tempClaudeHome;
    resetDefaultContext();

    try {
      const descriptor = getAgentDescriptorById('claude');
      const result = await bootstrapAgentRuntime({
        descriptor: descriptor!,
        workspaceRoot: '/workspace/project-c',
      });

      expect(result.bootstrapApplied).toBe(false);
      expect(result.envPatch).toBeUndefined();
    } finally {
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempClaudeHome, { recursive: true, force: true });
    }
  });

  it('should bootstrap claude runtime home only when minimal bootstrap source exists', async () => {
    const tempVectaHubHome = makeTempDir('vectahub-home-');
    const tempClaudeHome = makeTempDir('claude-home-');
    process.env.VECTAHUB_HOME = tempVectaHubHome;
    process.env.CLAUDE_HOME = tempClaudeHome;
    writeFileSync(join(tempClaudeHome, 'settings.json'), '{"theme":"dark"}');
    resetDefaultContext();

    try {
      const descriptor = getAgentDescriptorById('claude');
      const result = await bootstrapAgentRuntime({
        descriptor: descriptor!,
        workspaceRoot: '/workspace/project-d',
      });

      expect(result.bootstrapApplied).toBe(true);
      expect(result.envPatch?.CLAUDE_HOME).toContain('agent-homes/claude');
      expect(readFileSync(join(result.envPatch!.CLAUDE_HOME, 'settings.json'), 'utf8')).toContain('"theme":"dark"');
    } finally {
      rmSync(tempVectaHubHome, { recursive: true, force: true });
      rmSync(tempClaudeHome, { recursive: true, force: true });
    }
  });
});
