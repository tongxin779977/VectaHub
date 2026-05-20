import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ToolCacheManager, createToolCacheManager } from './cache-manager.js';
import { getDefaultContext } from '../../infrastructure/context.js';
describe('ToolCacheManager', () => {
  let tempDir: string;
  let manager: ToolCacheManager;

  beforeEach(() => {
    tempDir = join(tmpdir(), `cache-manager-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    manager = createToolCacheManager({ cacheDir: tempDir, context: getDefaultContext() });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('cacheHelp / getCachedHelp', () => {
    it('should cache and retrieve help output', async () => {
      await manager.cacheHelp('aider', 'Usage: aider [options]', ['codegen'], '0.80.0');

      const cached = await manager.getCachedHelp('aider');
      expect(cached).not.toBeNull();
      expect(cached?.toolName).toBe('aider');
      expect(cached?.helpOutput).toBe('Usage: aider [options]');
      expect(cached?.capabilities).toEqual(['codegen']);
      expect(cached?.version).toBe('0.80.0');
      expect(cached?.discoveredAt).toBeDefined();
    });

    it('should return null for non-existent tool', async () => {
      expect(await manager.getCachedHelp('nonexistent')).toBeNull();
    });

    it('should truncate help output exceeding max length', async () => {
      const longHelp = 'x'.repeat(10000);
      await manager.cacheHelp('tool-with-long-help', longHelp);

      const cached = await manager.getCachedHelp('tool-with-long-help');
      expect(cached?.helpOutput.length).toBeLessThan(10000);
      expect(cached?.helpOutput).toContain('truncated');
    });

    it('should overwrite existing cache entry', async () => {
      await manager.cacheHelp('aider', 'old help');
      await manager.cacheHelp('aider', 'new help');

      const cached = await manager.getCachedHelp('aider');
      expect(cached?.helpOutput).toBe('new help');
    });
  });

  describe('listCached', () => {
    it('should list all cached tool names', async () => {
      await manager.cacheHelp('aider', 'help1');
      await manager.cacheHelp('claude', 'help2');

      const cached = await manager.listCached();
      expect(cached).toContain('aider');
      expect(cached).toContain('claude');
      expect(cached.length).toBe(2);
    });

    it('should return empty array when no cache exists', async () => {
      const emptyManager = createToolCacheManager({ cacheDir: join(tempDir, 'empty'), context: getDefaultContext() });
      expect(await emptyManager.listCached()).toEqual([]);
    });
  });

  describe('invalidate', () => {
    it('should remove cached entry', async () => {
      await manager.cacheHelp('aider', 'help');
      expect(await manager.getCachedHelp('aider')).not.toBeNull();

      await manager.invalidate('aider');
      expect(await manager.getCachedHelp('aider')).toBeNull();
    });

    it('should not throw when invalidating non-existent tool', async () => {
      await expect(manager.invalidate('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('cache file format', () => {
    it('should write valid JSON to disk', async () => {
      await manager.cacheHelp('aider', 'Usage: aider', ['codegen'], '1.0.0');

      const filePath = join(tempDir, 'aider.help.json');
      expect(existsSync(filePath)).toBe(true);

      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.toolName).toBe('aider');
      expect(parsed.version).toBe('1.0.0');
    });
  });
});
