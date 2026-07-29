import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { writeTraceSpan } from './writer.js';
import type { TraceSpanRecord } from './types.js';
import { SpanKind } from './types.js';

const TMP_DIR = join(import.meta.dirname, '__writer_test_tmp__');

describe('trace writer', () => {
  beforeEach(async () => {
    await mkdir(TMP_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TMP_DIR, { recursive: true, force: true });
  });

  const writerDeps = {
    resolveGlobalPath: (...segments: string[]) => join(TMP_DIR, ...segments),
  };

  it('should preserve traceId and spanId without redaction', async () => {
    const record: TraceSpanRecord = {
      traceId: 'tr_1778657109751_8y5jbd',
      spanId: 'sp_1778657109751_8y5jbd',
      name: 'test.span',
      kind: SpanKind.INTERNAL,
      source: 'cli',
      status: 'completed',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationMs: 100,
      attributes: {
        command: 'OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012',
      },
    };

    await writeTraceSpan(record, writerDeps);

    // Read the written file
    const datePart = new Date(record.endTime).toISOString().slice(0, 10);
    const filePath = join(TMP_DIR, 'logs', 'traces', `${datePart}.jsonl`);
    const content = await readFile(filePath, 'utf8');
    const written = JSON.parse(content.trim());

    // traceId and spanId must be preserved intact
    expect(written.traceId).toBe('tr_1778657109751_8y5jbd');
    expect(written.spanId).toBe('sp_1778657109751_8y5jbd');
    // Sensitive data in attributes must still be redacted
    expect(written.attributes.command).not.toContain('sk-proj-abc123def456ghi789jkl012');
    expect(written.attributes.command).toContain('[REDACTED]');
  });

  it('should preserve parentSpanId without redaction', async () => {
    const record: TraceSpanRecord = {
      traceId: 'tr_1778657109751_8y5jbd',
      spanId: 'sp_1778657109751_8y5jbd',
      parentSpanId: 'sp_1778657109750_parent1',
      name: 'child.span',
      kind: SpanKind.INTERNAL,
      source: 'cli',
      status: 'completed',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationMs: 50,
    };

    await writeTraceSpan(record, writerDeps);

    const datePart = new Date(record.endTime).toISOString().slice(0, 10);
    const filePath = join(TMP_DIR, 'logs', 'traces', `${datePart}.jsonl`);
    const content = await readFile(filePath, 'utf8');
    const written = JSON.parse(content.trim());

    expect(written.parentSpanId).toBe('sp_1778657109750_parent1');
  });
});
