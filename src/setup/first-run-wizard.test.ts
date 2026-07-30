import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isFirstRun,
  loadConfig,
  saveConfig,
  createConfigDir,
  initConfigFile,
  configureLLMProvider,
  runFirstRunWizard,
  _resetSharedRl,
  type VectaHubConfig,
  type LLMProviderConfig,
} from './first-run-wizard.js';
import type { StepResult } from './priority-installer.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

const wizardDeps = {
  environment: {
    exists: (path: string) => existsSync(path),
    ensureDir: (path: string) => mkdirSync(path, { recursive: true }),
    readFile: (path: string) => readFileSync(path, 'utf-8'),
    writeFile: (path: string, content: string) => writeFileSync(path, content, 'utf-8'),
    getPath: (...segments: string[]) => join('/mock-home/.vectahub', ...segments),
    getEnv: (_name: string) => undefined,
  },
  logger: {
    error: vi.fn(),
  },
  output: {
    log: vi.fn(),
  },
};

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock readline module
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn(),
  })),
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
  createConsoleLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('first-run-wizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetSharedRl();
    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createConfigDir', () => {
    it('should create ~/.vectahub directory successfully', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdirSync).mockReturnValue(undefined as unknown as string);

      const result = await createConfigDir(wizardDeps);

      expect(result.success).toBe(true);
      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.vectahub'),
        { recursive: true },
      );
    });

    it('should return success when directory already exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await createConfigDir(wizardDeps);

      expect(result.success).toBe(true);
      expect(mkdirSync).not.toHaveBeenCalled();
    });

    it('should fail gracefully on permission error', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(mkdirSync).mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const result = await createConfigDir(wizardDeps);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('permission denied');
    });
  });

  describe('initConfigFile', () => {
    it('should create new config file when none exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await initConfigFile(wizardDeps);

      expect(result.success).toBe(true);
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('config.yaml'),
        expect.any(String),
        'utf-8',
      );
    });

    it('should return success without overwriting when config already exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await initConfigFile(wizardDeps);

      expect(result.success).toBe(true);
      expect(writeFileSync).not.toHaveBeenCalled();
    });

    it('should fail gracefully on write error', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(writeFileSync).mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      const result = await initConfigFile(wizardDeps);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('no space left');
    });
  });

  describe('configureLLMProvider', () => {
    it('should be exported as a function', () => {
      expect(typeof configureLLMProvider).toBe('function');
    });

    it('should return a Promise<StepResult>', async () => {
      // configureLLMProvider is interactive (requires readline),
      // so we just verify its return type signature
      const result = configureLLMProvider(wizardDeps);
      expect(result).toBeInstanceOf(Promise);
      // Don't await — it would hang waiting for readline input
    });

    it('should return success:true when user chooses option 5 (skip LLM)', async () => {
      vi.mocked(createInterface).mockReturnValue({
        question: vi.fn((_prompt: string, cb: (a: string) => void) => cb('5')),
        close: vi.fn(),
      } as any);
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await configureLLMProvider(wizardDeps);
      expect(result.success).toBe(true);
    });

    it('should return success:true when user enters invalid option', async () => {
      vi.mocked(createInterface).mockReturnValue({
        question: vi.fn((_prompt: string, cb: (a: string) => void) => cb('99')),
        close: vi.fn(),
      } as any);
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await configureLLMProvider(wizardDeps);
      expect(result.success).toBe(true);
    });

    it('should NOT set first_run_completed when user skips LLM', async () => {
      vi.mocked(createInterface).mockReturnValue({
        question: vi.fn((_prompt: string, cb: (a: string) => void) => cb('5')),
        close: vi.fn(),
      } as any);
      vi.mocked(existsSync).mockReturnValue(false);

      await configureLLMProvider(wizardDeps);
      // saveConfig should NOT be called with first_run_completed = true
      // since the step should not mark installation as complete
      const saveCalls = vi.mocked(writeFileSync).mock.calls;
      const savedContent = saveCalls.find((c) =>
        typeof c[1] === 'string' && c[1].includes('first_run_completed'),
      );
      // Should not have saved config with first_run_completed in this step
      expect(savedContent).toBeUndefined();
    });
  });

  describe('runFirstRunWizard backward compatibility', () => {
    it('should still be exported as an async function returning boolean', () => {
      expect(typeof runFirstRunWizard).toBe('function');
    });

    it('should return a Promise', () => {
      // Just verify the return is a Promise; don't await (interactive)
      const result = runFirstRunWizard(wizardDeps);
      expect(result).toBeInstanceOf(Promise);
    });

    it('should set first_run_completed=true after all steps succeed', async () => {
      let configExists = false;
      vi.mocked(existsSync).mockImplementation(() => configExists);
      vi.mocked(writeFileSync).mockImplementation(() => { configExists = true; });
      vi.mocked(readFileSync).mockReturnValue('version: 1\nfirst_run_completed: false');
      vi.mocked(mkdirSync).mockReturnValue(undefined as unknown as string);

      // Configure LLM: choose option 5 (skip)
      vi.mocked(createInterface).mockReturnValue({
        question: vi.fn((_prompt: string, cb: (a: string) => void) => cb('5')),
        close: vi.fn(),
      } as any);

      const result = await runFirstRunWizard(wizardDeps);

      // runFirstRunWizard should set first_run_completed=true itself
      const saveCalls = vi.mocked(writeFileSync).mock.calls;
      const hasCorrectSave = saveCalls.some(call => {
        const content = call[1] as string;
        return content.includes('first_run_completed: true');
      });
      expect(hasCorrectSave).toBe(true);

      // Return false because LLM was not actually configured
      expect(result).toBe(false);
    });
  });

  describe('existing exports preserved', () => {
    it('should export isFirstRun as a function', () => {
      expect(typeof isFirstRun).toBe('function');
    });

    it('should export loadConfig as a function', () => {
      expect(typeof loadConfig).toBe('function');
    });

    it('should export saveConfig as a function', () => {
      expect(typeof saveConfig).toBe('function');
    });

    it('should export VectaHubConfig type', () => {
      // Compile-time check: if this compiles, type is exported
      const config: VectaHubConfig = {
        version: 1,
        first_run_completed: false,
        ai_providers: {
          vectahub_llm: {
            provider: '',
            enabled: false,
          },
        },
        external_cli: {},
        priority: [],
      };
      expect(config.version).toBe(1);
    });

    it('should export LLMProviderConfig type', () => {
      const provider: LLMProviderConfig = {
        provider: 'openai',
        enabled: true,
      };
      expect(provider.provider).toBe('openai');
    });
  });
});
