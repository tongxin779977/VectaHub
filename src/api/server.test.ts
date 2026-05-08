import { createServer } from 'http';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { createAPIServer } from './server.js';
import type { Server } from 'http';
import type { TestContext } from 'vitest';

type SkippableTestContext = TestContext & { skip: (message?: string) => never };

vi.mock('../nl/llm.js', async () => {
  const actual = await vi.importActual('../nl/llm.js');
  return {
    ...actual,
    isLLMAvailable: vi.fn(() => false),
    createLLMConfig: vi.fn(() => null),
  };
});

describe('API Server', () => {
  const host = '127.0.0.1';
  let server: Server;
  let port: number;
  let canBindLoopback = true;
  let skipReason = '';

  beforeAll(async () => {
    const probe = createServer();
    const result = await new Promise<{ ok: boolean; reason?: string }>((resolve) => {
      probe.once('error', (error: NodeJS.ErrnoException) => {
        resolve({ ok: false, reason: `${error.code || 'UNKNOWN'}: ${error.message}` });
      });
      probe.listen(0, host, () => {
        probe.close(() => resolve({ ok: true }));
      });
    });

    canBindLoopback = result.ok;
    skipReason = result.reason || '';
  });

  afterEach(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  async function startServer(ctx: TestContext): Promise<void> {
    if (!canBindLoopback) {
      (ctx as SkippableTestContext).skip(
        `Skipping API server test: cannot bind ${host} (${skipReason})`
      );
    }

    server = createAPIServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, host, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          port = address.port;
          resolve();
          return;
        }
        reject(new Error('Could not determine API server port'));
      });
    });
  }

  async function apiFetch(path: string, method = 'GET', body?: Record<string, unknown>): Promise<unknown> {
    const url = `http://${host}:${port}${path}`;
    const opts: RequestInit = { method };
    if (body) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    return res.json();
  }

  it('health endpoint returns ok', async (ctx) => {
    await startServer(ctx);
    const result = await apiFetch('/health') as { success: boolean; data: { status: string } };
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('ok');
  });

  it('workflows endpoint returns empty list', async (ctx) => {
    await startServer(ctx);
    const result = await apiFetch('/api/workflows') as { success: boolean; data: unknown[] };
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('returns 404 for unknown routes', async (ctx) => {
    await startServer(ctx);
    const result = await apiFetch('/api/unknown') as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not found');
  });

  it('ai-delegate returns error when LLM not configured', async (ctx) => {
    await startServer(ctx);
    const result = await apiFetch('/api/ai-delegate', 'POST', { input: 'test' }) as { success: boolean };
    expect(result.success).toBe(false);
  });
});
