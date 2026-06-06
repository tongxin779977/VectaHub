import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { InfrastructureContext, resetDefaultContext, setDefaultContext } from '../context.js';
import { createEnvironmentService } from '../environment/index.js';
import { LoggerService } from '../logger/service.js';
import { createTraceAuditSystem } from './compat-bridge.js';
import { createTraceAuditSystemWithDeps, TraceAuditSystem } from './system.js';

function createTestLogDir(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

describe('TraceAuditSystem dependency contract', () => {
  it('should fail fast when explicit deps are missing', () => {
    const invalidDeps = {
      environment: undefined,
      logger: undefined,
    };

    expect(() => createTraceAuditSystemWithDeps(invalidDeps as never)).toThrow(
      'TraceAuditSystem requires explicit environment and logger dependencies',
    );
  });

  it('should create a system with explicit deps only', async () => {
    const environment = createEnvironmentService();
    const logger = new LoggerService(environment);
    const logDir = createTestLogDir('trace-audit-system');

    const system = createTraceAuditSystemWithDeps({
      environment,
      logger,
    }, {
      logDir,
    });

    expect(system).toBeInstanceOf(TraceAuditSystem);
    await system.destroy();
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  it('should keep legacy createTraceAuditSystem available through compat bridge', async () => {
    resetDefaultContext();
    const environment = createEnvironmentService();
    const logger = new LoggerService(environment);
    const getLoggerSpy = vi.spyOn(logger, 'getLogger');
    const logDir = createTestLogDir('trace-audit-compat');

    const context = new InfrastructureContext({
      environment,
      logger,
    });
    setDefaultContext(context);

    const system = createTraceAuditSystem({
      logDir,
    });

    expect(system).toBeInstanceOf(TraceAuditSystem);
    expect(getLoggerSpy).toHaveBeenCalledWith('trace-audit-system');
    await system.destroy();
    fs.rmSync(logDir, { recursive: true, force: true });
    resetDefaultContext();
  });
});
