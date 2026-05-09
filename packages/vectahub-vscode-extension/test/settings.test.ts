import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: mockGet,
    })),
  },
}));

import {
  getCliPath,
  getAutoDetectCli,
  getExecutionMode,
  getPreviewBeforeRun,
} from '../src/config/settings.js';

describe('getCliPath()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('有配置值时返回配置值', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'cliPath') return '/custom/path/vectahub';
      return undefined;
    });

    expect(getCliPath()).toBe('/custom/path/vectahub');
  });

  it('无配置值时返回默认值 vectahub', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'cliPath') return undefined;
      return undefined;
    });

    expect(getCliPath()).toBe('vectahub');
  });

  it('配置值为空字符串时返回默认值 vectahub', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'cliPath') return '';
      return undefined;
    });

    expect(getCliPath()).toBe('vectahub');
  });
});

describe('getAutoDetectCli()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('默认返回 true', () => {
    mockGet.mockImplementation((_key: string, defaultVal?: boolean) => defaultVal);

    expect(getAutoDetectCli()).toBe(true);
  });

  it('配置为 false 时返回 false', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'autoDetectCli') return false;
      return undefined;
    });

    expect(getAutoDetectCli()).toBe(false);
  });
});

describe('getExecutionMode()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('默认返回 strict', () => {
    mockGet.mockImplementation((_key: string, defaultVal?: string) => defaultVal);

    expect(getExecutionMode()).toBe('strict');
  });

  it('配置为 relaxed 时返回 relaxed', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'executionMode') return 'relaxed';
      return undefined;
    });

    expect(getExecutionMode()).toBe('relaxed');
  });

  it('配置为 consensus 时返回 consensus', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'executionMode') return 'consensus';
      return undefined;
    });

    expect(getExecutionMode()).toBe('consensus');
  });

  it('返回类型限定为 union', () => {
    mockGet.mockImplementation((_key: string, defaultVal?: string) => defaultVal);
    const mode = getExecutionMode();
    expect(['strict', 'relaxed', 'consensus']).toContain(mode);
  });
});

describe('getPreviewBeforeRun()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('默认返回 true', () => {
    mockGet.mockImplementation((_key: string, defaultVal?: boolean) => defaultVal);

    expect(getPreviewBeforeRun()).toBe(true);
  });

  it('配置为 false 时返回 false', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'previewBeforeRun') return false;
      return undefined;
    });

    expect(getPreviewBeforeRun()).toBe(false);
  });
});
