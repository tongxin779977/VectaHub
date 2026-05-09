import { describe, it, expect, vi, beforeEach } from 'vitest';

const execMock = vi.hoisted(() => vi.fn());

vi.mock('../src/config/settings.js', () => ({
  getCliPath: vi.fn(() => 'vectahub'),
}));

vi.mock('child_process', () => ({
  exec: execMock,
}));

import { discoverCli } from '../src/cli/discovery.js';
import { getCliPath } from '../src/config/settings.js';

describe('discoverCli()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCliPath as ReturnType<typeof vi.fn>).mockReturnValue('vectahub');
  });

  it('CLI 存在时返回 {exists: true, version, path}', async () => {
    execMock
      .mockImplementationOnce((_cmd: string, cb: Function) => {
        cb(null, { stdout: '1.2.3\n', stderr: '' });
      })
      .mockImplementationOnce((_cmd: string, cb: Function) => {
        cb(null, { stdout: '/usr/local/bin/vectahub\n', stderr: '' });
      });

    const result = await discoverCli();

    expect(result.exists).toBe(true);
    expect(result.version).toBe('1.2.3');
    expect(result.path).toBe('/usr/local/bin/vectahub');
  });

  it('CLI 不存在时返回 {exists: false, error}', async () => {
    execMock.mockImplementationOnce((_cmd: string, cb: Function) => {
      cb(new Error('command not found'));
    });

    const result = await discoverCli();

    expect(result.exists).toBe(false);
    expect(result.error).toBe('command not found');
  });

  it('version 输出带换行时 trim 干净', async () => {
    execMock
      .mockImplementationOnce((_cmd: string, cb: Function) => {
        cb(null, { stdout: '  2.0.0-beta\n\n', stderr: '' });
      })
      .mockImplementationOnce((_cmd: string, cb: Function) => {
        cb(null, { stdout: '/usr/bin/vectahub\n', stderr: '' });
      });

    const result = await discoverCli();

    expect(result.version).toBe('2.0.0-beta');
  });

  it('CLI 存在但 which 失败时 path 回退到 cliPath 原值', async () => {
    execMock
      .mockImplementationOnce((_cmd: string, cb: Function) => {
        cb(null, { stdout: '1.0.0\n', stderr: '' });
      })
      .mockImplementationOnce((_cmd: string, cb: Function) => {
        cb(new Error('which failed'));
      })
      .mockImplementationOnce((_cmd: string, cb: Function) => {
        cb(new Error('npm root failed'));
      });

    const result = await discoverCli();

    expect(result.exists).toBe(true);
    expect(result.path).toBe('vectahub');
  });
});

describe('findCliAbsolutePath（通过 discoverCli 间接触发）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCliPath as ReturnType<typeof vi.fn>).mockReturnValue('vectahub');
  });

  it('输入含 / 时直接返回原值（绝对路径直返）', async () => {
    (getCliPath as ReturnType<typeof vi.fn>).mockReturnValue('/usr/local/bin/vectahub');

    execMock.mockImplementationOnce((_cmd: string, cb: Function) => {
      cb(null, { stdout: '1.0.0\n', stderr: '' });
    });

    const result = await discoverCli();

    expect(result.exists).toBe(true);
    expect(result.path).toBe('/usr/local/bin/vectahub');
  });

  it('which 解析成功时返回第一行路径', async () => {
    execMock
      .mockImplementationOnce((_cmd: string, cb: Function) => {
        cb(null, { stdout: '1.0.0\n', stderr: '' });
      })
      .mockImplementationOnce((_cmd: string, cb: Function) => {
        cb(null, { stdout: '/home/user/.nvm/versions/node/v20/bin/vectahub\n', stderr: '' });
      });

    const result = await discoverCli();

    expect(result.path).toBe('/home/user/.nvm/versions/node/v20/bin/vectahub');
  });

  it('which 失败时 fallback npm root -g 拼接路径', async () => {
    execMock
      .mockImplementationOnce((_cmd: string, cb: Function) => {
        cb(null, { stdout: '1.0.0\n', stderr: '' });
      })
      .mockImplementationOnce((_cmd: string, cb: Function) => {
        cb(new Error('which failed'));
      })
      .mockImplementationOnce((_cmd: string, cb: Function) => {
        cb(null, { stdout: '/usr/local/lib/node_modules\n', stderr: '' });
      })
      .mockImplementationOnce((_cmd: string, cb: Function) => {
        cb(null, { stdout: '1.0.0\n', stderr: '' });
      });

    const result = await discoverCli();

    expect(result.exists).toBe(true);
    expect(result.path).toContain('.bin');
    expect(result.path).toContain('vectahub');
  });

  it('which 和 npm root 都失败时 path 回退到 cliPath', async () => {
    execMock
      .mockImplementationOnce((_cmd: string, cb: Function) => {
        cb(null, { stdout: '1.0.0\n', stderr: '' });
      })
      .mockImplementationOnce((_cmd: string, cb: Function) => {
        cb(new Error('which failed'));
      })
      .mockImplementationOnce((_cmd: string, cb: Function) => {
        cb(new Error('npm root failed'));
      });

    const result = await discoverCli();

    expect(result.path).toBe('vectahub');
  });
});
