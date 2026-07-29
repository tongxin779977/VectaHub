import { createServer } from 'http';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { createAPIServer } from './server.js';
import { createNoopAuditHelper, createAuditHelper } from '../infrastructure/audit/index.js';
import { createEnvironmentService } from '../infrastructure/environment/index.js';
import type { Server } from 'http';
import type { TestContext } from 'vitest';

type SkippableTestContext = TestContext & { skip: (message?: string) => never };

describe('API Server', () => {
  const host = '127.0.0.1';
  const originalVectaHubHome = process.env.VECTAHUB_HOME;
  let server: Server;
  let port: number;
  let canBindLoopback = true;
  let skipReason = '';
  let vectahubHome: string;

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
    if (vectahubHome && existsSync(vectahubHome)) {
      rmSync(vectahubHome, { recursive: true, force: true });
    }
    vectahubHome = '';
    if (originalVectaHubHome === undefined) {
      delete process.env.VECTAHUB_HOME;
    } else {
      process.env.VECTAHUB_HOME = originalVectaHubHome;
    }
  });

  async function startServer(ctx: TestContext): Promise<void> {
    if (!canBindLoopback) {
      (ctx as SkippableTestContext).skip(
        `Skipping API server test: cannot bind ${host} (${skipReason})`
      );
    }

    vectahubHome = mkdtempSync(join(tmpdir(), 'vectahub-api-test-'));
    process.env.VECTAHUB_HOME = vectahubHome;

    server = await createAPIServer(3000, {
      audit: createNoopAuditHelper(),
      auditLogger: {
        getSessionId: () => 'test-session',
        query: () => [],
      },
      environment: createEnvironmentService(vectahubHome),
    });
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

  it('POST /api/workflows with invalid JSON returns 400', async (ctx) => {
    await startServer(ctx);
    const url = `http://${host}:${port}/api/workflows`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json !!!',
    });
    expect(res.status).toBe(400);
    const result = await res.json() as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid JSON');
  });

  it('POST /api/ai-delegate with invalid JSON returns 503 (endpoint disabled)', async (ctx) => {
    await startServer(ctx);
    const url = `http://${host}:${port}/api/ai-delegate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json at all',
    });
    expect(res.status).toBe(503);
  });

  it('POST /api/workflows with valid JSON does not regress', async (ctx) => {
    await startServer(ctx);
    // LLM is mocked as unavailable, so workflow will get NEEDS_CLARIFICATION
    const result = await apiFetch('/api/workflows', 'POST', { input: 'test input' }) as { success: boolean; data: { status: string } };
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('NEEDS_CLARIFICATION');
  });

  it('POST /api/workflows with oversized body returns 413', async (ctx) => {
    await startServer(ctx);
    const url = `http://${host}:${port}/api/workflows`;
    // 构造一个超过 1MB 的 JSON body
    const bigPayload = JSON.stringify({ data: 'x'.repeat(1024 * 1024) });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bigPayload,
    });
    expect(res.status).toBe(413);
    const result = await res.json() as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain('too large');
  });

  it('POST /api/workflows propagates sessionId into workflow audit events', async (ctx) => {
    const auditEvents: Array<{ action: string; sessionId: string }> = [];
    await startServer(ctx);
    await new Promise<void>((resolve) => server.close(() => resolve()));

    server = await createAPIServer(3000, {
      audit: createAuditHelper({
        write(event) {
          auditEvents.push({
            action: event.action,
            sessionId: event.sessionId,
          });
        },
      }),
      auditLogger: {
        getSessionId: () => 'api-session-123',
        query: () => [],
      },
      environment: createEnvironmentService(vectahubHome),
    });

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

    const workflowFile = join(vectahubHome, 'api-workflow.json');
    writeFileSync(workflowFile, JSON.stringify({
      id: 'wf_api_session',
      name: 'api-session-workflow',
      mode: 'relaxed',
      steps: [
        {
          id: 'branch',
          type: 'if',
          condition: 'false',
          body: [
            { id: 'noop', type: 'exec', cli: 'echo', args: ['never'] },
          ],
        },
      ],
      createdAt: new Date().toISOString(),
    }), 'utf-8');

    const result = await apiFetch('/api/workflows', 'POST', { workflowFile }) as { success: boolean; data: { status: string } };

    expect(result.success).toBe(true);
    expect(result.data.status).toBe('COMPLETED');
    expect(
      auditEvents.some(event => event.action === 'start' && event.sessionId === 'api-session-123')
    ).toBe(true);
    expect(
      auditEvents.some(event => event.action === 'end' && event.sessionId === 'api-session-123')
    ).toBe(true);
  });
});
