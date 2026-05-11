import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ToolCacheManager, createToolCacheManager } from './cache-manager.js';

describe('ToolCacheManager', () => {
  let tempDir: string;
  let manager: ToolCacheManager;

  beforeEach(() => {
    tempDir = join(tmpdir(), `cache-manager-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    manager = createToolCacheManager(tempDir);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('cacheHelp / getCachedHelp', () => {
    it('should cache and retrieve help output', () => {
      manager.cacheHelp('aider', 'Usage: aider [options]', ['codegen'], '0.80.0');

      const cached = manager.getCachedHelp('aider');
      expect(cached).not.toBeNull();
      expect(cached?.toolName).toBe('aider');
      expect(cached?.helpOutput).toBe('Usage: aider [options]');
      expect(cached?.capabilities).toEqual(['codegen']);
      expect(cached?.version).toBe('0.80.0');
      expect(cached?.discoveredAt).toBeDefined();
    });

    it('should return null for non-existent tool', () => {
      expect(manager.getCachedHelp('nonexistent')).toBeNull();
    });

    it('should truncate help output exceeding max length', () => {
      const longHelp = 'x'.repeat(10000);
      manager.cacheHelp('tool-with-long-help', longHelp);

      const cached = manager.getCachedHelp('tool-with-long-help');
      expect(cached?.helpOutput.length).toBeLessThan(10000);
      expect(cached?.helpOutput).toContain('truncated');
    });

    it('should overwrite existing cache entry', () => {
      manager.cacheHelp('aider', 'old help');
      manager.cacheHelp('aider', 'new help');

      const cached = manager.getCachedHelp('aider');
      expect(cached?.helpOutput).toBe('new help');
    });
  });

  describe('listCached', () => {
    it('should list all cached tool names', () => {
      manager.cacheHelp('aider', 'help1');
      manager.cacheHelp('claude', 'help2');

      const cached = manager.listCached();
      expect(cached).toContain('aider');
      expect(cached).toContain('claude');
      expect(cached.length).toBe(2);
    });

    it('should return empty array when no cache exists', () => {
      const emptyManager = createToolCacheManager(join(tempDir, 'empty'));
      expect(emptyManager.listCached()).toEqual([]);
    });
  });

  describe('invalidate', () => {
    it('should remove cached entry', () => {
      manager.cacheHelp('aider', 'help');
      expect(manager.getCachedHelp('aider')).not.toBeNull();

      manager.invalidate('aider');
      expect(manager.getCachedHelp('aider')).toBeNull();
    });

    it('should not throw when invalidating non-existent tool', () => {
      expect(() => manager.invalidate('nonexistent')).not.toThrow();
    });
  });

  describe('cache file format', () => {
    it('should write valid JSON to disk', () => {
      manager.cacheHelp('aider', 'Usage: aider', ['codegen'], '1.0.0');

      const filePath = join(tempDir, 'aider.help.json');
      expect(existsSync(filePath)).toBe(true);

      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.toolName).toBe('aider');
      expect(parsed.version).toBe('1.0.0');
    });
  });
});
