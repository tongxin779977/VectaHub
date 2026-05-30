import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectContextBuilder, createProjectContextBuilder } from './builder.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';

describe('ProjectContextBuilder', () => {
  let mockEnvironment: Partial<IEnvironmentService>;

  beforeEach(() => {
    mockEnvironment = {
      getCwd: () => '/test/project',
      exists: vi.fn().mockReturnValue(false),
      readFileAsync: vi.fn(),
      exec: vi.fn(),
      getHomePath: () => '/test/home',
      joinPath: (...segments: string[]) => segments.join('/'),
      readDir: vi.fn().mockReturnValue([]),
    };
  });

  describe('createProjectContextBuilder', () => {
    it('should create a ProjectContextBuilder instance', () => {
      const builder = createProjectContextBuilder({
        environment: mockEnvironment as IEnvironmentService,
      });

      expect(builder).toBeInstanceOf(ProjectContextBuilder);
    });
  });

  describe('build', () => {
    it('should build a complete ProjectContextPack with default values', async () => {
      const builder = createProjectContextBuilder({
        environment: mockEnvironment as IEnvironmentService,
      });

      const context = await builder.build();

      expect(context.schemaVersion).toBe('1.0');
      expect(context.cwd).toBe('/test/project');
      expect(context.packageManager).toBe('unknown');
      expect(context.packageScripts).toEqual([]);
      expect(context.workflows).toEqual([]);
      expect(context.agents).toEqual([]);
      expect(context.capabilities).toHaveLength(3);
      expect(context.securityMode).toBe('strict');
      expect(context.recentFailures).toEqual([]);
    });

    it('should detect npm package manager when package-lock.json exists', async () => {
      mockEnvironment.exists = vi.fn((path: string) => {
        return path === '/test/project/package-lock.json';
      });

      const builder = createProjectContextBuilder({
        environment: mockEnvironment as IEnvironmentService,
      });

      const context = await builder.build();

      expect(context.packageManager).toBe('npm');
    });

    it('should detect yarn package manager when yarn.lock exists', async () => {
      mockEnvironment.exists = vi.fn((path: string) => {
        return path === '/test/project/yarn.lock';
      });

      const builder = createProjectContextBuilder({
        environment: mockEnvironment as IEnvironmentService,
      });

      const context = await builder.build();

      expect(context.packageManager).toBe('yarn');
    });

    it('should read package scripts from package.json', async () => {
      mockEnvironment.exists = vi.fn((path: string) => {
        return path === '/test/project/package.json';
      });

      mockEnvironment.readFileAsync = vi.fn().mockResolvedValue(
        JSON.stringify({
          scripts: {
            test: 'vitest',
            build: 'tsc',
          },
        })
      );

      const builder = createProjectContextBuilder({
        environment: mockEnvironment as IEnvironmentService,
      });

      const context = await builder.build();

      expect(context.packageScripts).toEqual([
        { name: 'test', command: 'vitest' },
        { name: 'build', command: 'tsc' },
      ]);
    });

    it('should handle missing package.json gracefully', async () => {
      mockEnvironment.exists = vi.fn().mockReturnValue(false);

      const builder = createProjectContextBuilder({
        environment: mockEnvironment as IEnvironmentService,
      });

      const context = await builder.build();

      expect(context.packageScripts).toEqual([]);
    });

    it('should collect git information when in git repository', async () => {
      mockEnvironment.exists = vi.fn((path: string) => {
        return path === '/test/project/.git';
      });

      mockEnvironment.exec = vi.fn().mockResolvedValue({
        stdout: 'main\n',
        stderr: '',
      });

      const builder = createProjectContextBuilder({
        environment: mockEnvironment as IEnvironmentService,
      });

      const context = await builder.build();

      expect(context.git).toBeDefined();
    });

    it('should return undefined git info when not in git repository', async () => {
      mockEnvironment.exists = vi.fn().mockReturnValue(false);

      const builder = createProjectContextBuilder({
        environment: mockEnvironment as IEnvironmentService,
      });

      const context = await builder.build();

      expect(context.git).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle errors during git info collection', async () => {
      mockEnvironment.exists = vi.fn((path: string) => {
        return path === '/test/project/.git';
      });

      mockEnvironment.exec = vi.fn().mockRejectedValue(new Error('Git command failed'));

      const builder = createProjectContextBuilder({
        environment: mockEnvironment as IEnvironmentService,
      });

      const context = await builder.build();

      expect(context).toBeDefined();
    });

    it('should handle invalid package.json gracefully', async () => {
      mockEnvironment.exists = vi.fn((path: string) => {
        return path === '/test/project/package.json';
      });

      mockEnvironment.readFileAsync = vi.fn().mockResolvedValue('invalid json');

      const builder = createProjectContextBuilder({
        environment: mockEnvironment as IEnvironmentService,
      });

      const context = await builder.build();

      expect(context.packageScripts).toEqual([]);
    });
  });
});
