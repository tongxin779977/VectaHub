import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import pino from 'pino';
import { createEnvironmentService } from '../environment/index.js';
import { AuditEventType } from './index.js';
import { AuditService } from './service.js';
import { InfrastructureContext } from '../context.js';

describe('AuditService failure modes', () => {
  let testHome: string;

  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), 'vectahub-audit-service-'));
  });

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  function sabotageAuditDir(): void {
    const auditDir = join(testHome, 'logs', 'audit');
    rmSync(auditDir, { recursive: true, force: true });
    writeFileSync(auditDir, 'not-a-directory', 'utf-8');
  }

  function createAuditEvent() {
    return {
      event: AuditEventType.CLI_COMMAND,
      timestamp: new Date('2026-05-20T10:00:00.000Z').toISOString(),
      sessionId: 'test-session',
      module: 'cli',
      action: 'test-command',
      success: true,
    };
  }

  it('fail-open mode isolates audit write failures', () => {
    const environment = createEnvironmentService(testHome);
    const onError = vi.fn();
    const service = new AuditService(environment, {
      sessionId: 'test-session',
      failureMode: 'fail-open',
      onError,
    });

    sabotageAuditDir();

    expect(() => service.getLogger().write(createAuditEvent())).not.toThrow();
    expect(service.getFailureMode()).toBe('fail-open');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('fail-closed mode rethrows audit write failures', () => {
    const environment = createEnvironmentService(testHome);
    const service = new AuditService(environment, {
      sessionId: 'test-session',
      failureMode: 'fail-closed',
    });

    sabotageAuditDir();

    expect(() => service.getLogger().write(createAuditEvent())).toThrow();
    expect(service.getFailureMode()).toBe('fail-closed');
  });
});

describe('InfrastructureContext audit onError log level', () => {
  let testHome: string;

  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), 'vectahub-audit-ctx-'));
  });

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  it('should log audit write failures at WARN level, not ERROR', () => {
    const environment = createEnvironmentService(testHome);
    const warnSpy = vi.fn();
    const errorSpy = vi.fn();

    const mockLogger = {
      getLogger: () => pino({ level: 'silent' }),
    } as any;

    // Override getLogger to return a logger with spied methods
    const auditLogger = pino({ level: 'debug' });
    const originalWarn = auditLogger.warn.bind(auditLogger);
    const originalError = auditLogger.error.bind(auditLogger);
    auditLogger.warn = Object.assign((...args: any[]) => {
      warnSpy(...args);
      return originalWarn(...args);
    }, { level: originalWarn.level });
    auditLogger.error = Object.assign((...args: any[]) => {
      errorSpy(...args);
      return originalError(...args);
    }, { level: originalError.level });

    mockLogger.getLogger = () => auditLogger;

    const ctx = new InfrastructureContext({
      environment,
      logger: mockLogger,
    });

    // Sabotage audit dir to trigger write failure
    const auditDir = join(testHome, 'logs', 'audit');
    rmSync(auditDir, { recursive: true, force: true });
    mkdirSync(join(testHome, 'logs'), { recursive: true });
    writeFileSync(auditDir, 'not-a-directory', 'utf-8');

    // Trigger audit write
    ctx.audit.getLogger().write({
      event: AuditEventType.CLI_COMMAND,
      timestamp: new Date().toISOString(),
      sessionId: 'test-session',
      module: 'cli',
      action: 'test-command',
      success: true,
    });

    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
