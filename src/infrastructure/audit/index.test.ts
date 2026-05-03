import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initAuditLogger, AuditEventType } from './index.js';

describe('audit infrastructure', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'vectahub-audit-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('initAuditLogger creates logger', () => {
    const logger = initAuditLogger('test-session', testDir);
    expect(logger).toBeDefined();
    expect(typeof logger.write).toBe('function');
    expect(typeof logger.query).toBe('function');
    expect(typeof logger.export).toBe('function');
    expect(logger.getSessionId()).toBe('test-session');
  });

  it('write creates audit file on disk', () => {
    const logger = initAuditLogger('test-session', testDir);
    logger.write({
      event: AuditEventType.WORKFLOW_START,
      timestamp: new Date('2026-05-01T10:00:00Z').toISOString(),
      sessionId: 'test-session',
      module: 'engine',
      action: 'workflow.start',
      success: true,
      metadata: { workflowId: 'wf-1' }
    });

    const files = readdirSync(testDir);
    expect(files.some((f: string) => f.endsWith('.jsonl'))).toBe(true);
  });

  it('query returns matching entries', () => {
    const logger = initAuditLogger('test-session', testDir);
    logger.write({
      event: AuditEventType.WORKFLOW_START,
      timestamp: new Date('2026-05-01T10:00:00Z').toISOString(),
      sessionId: 'test-session',
      module: 'engine',
      action: 'workflow.start',
      success: true
    });
    logger.write({
      event: AuditEventType.WORKFLOW_STEP,
      timestamp: new Date('2026-05-01T10:00:01Z').toISOString(),
      sessionId: 'test-session',
      module: 'executor',
      action: 'step.execute',
      success: true
    });

    const results = logger.query({ module: 'engine' });
    expect(results).toHaveLength(1);
    expect(results[0].module).toBe('engine');
  });

  it('query supports limit', () => {
    const logger = initAuditLogger('test-session', testDir);
    for (let i = 0; i < 5; i++) {
      logger.write({
        event: AuditEventType.CLI_COMMAND,
        timestamp: new Date(`2026-05-01T10:00:0${i}.000Z`).toISOString(),
        sessionId: 'test-session',
        module: 'cli',
        action: `action.${i}`,
        success: true
      });
    }

    const results = logger.query({ limit: 3 });
    expect(results).toHaveLength(3);
  });

  it('export generates JSON string', () => {
    const logger = initAuditLogger('test-session', testDir);
    logger.write({
      event: AuditEventType.CLI_COMMAND,
      timestamp: new Date('2026-05-01T10:00:00Z').toISOString(),
      sessionId: 'test-session',
      module: 'cli',
      action: 'test',
      success: true
    });

    const json = logger.export('json');
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });

  it('export generates CSV string', () => {
    const logger = initAuditLogger('test-session', testDir);
    logger.write({
      event: AuditEventType.CLI_COMMAND,
      timestamp: new Date('2026-05-01T10:00:00Z').toISOString(),
      sessionId: 'test-session',
      module: 'cli',
      action: 'test',
      success: true
    });

    const csv = logger.export('csv');
    expect(typeof csv).toBe('string');
    expect(csv).toContain('timestamp');
    expect(csv).toContain('module');
    expect(csv).toContain('action');
  });
});
