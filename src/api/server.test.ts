import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAPIServer } from './server.js';
import type { Server } from 'http';

describe('API Server', () => {
  let server: Server;
  let port: number;

  beforeEach(async () => {
    port = 3000 + Math.floor(Math.random() * 1000);
    server = createAPIServer(port);
    await new Promise<void>((resolve) => server.listen(port, resolve));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function apiFetch(path: string, method = 'GET', body?: Record<string, unknown>): Promise<unknown> {
    const url = `http://localhost:${port}${path}`;
    const opts: RequestInit = { method };
    if (body) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    return res.json();
  }

  it('health endpoint returns ok', async () => {
    const result = await apiFetch('/health') as { success: boolean; data: { status: string } };
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('ok');
  });

  it('workflows endpoint returns empty list', async () => {
    const result = await apiFetch('/api/workflows') as { success: boolean; data: unknown[] };
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('returns 404 for unknown routes', async () => {
    const result = await apiFetch('/api/unknown') as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not found');
  });

  it('ai-delegate returns error when LLM not configured', async () => {
    const result = await apiFetch('/api/ai-delegate', 'POST', { input: 'test' }) as { success: boolean };
    expect(result.success).toBe(false);
  });
});
