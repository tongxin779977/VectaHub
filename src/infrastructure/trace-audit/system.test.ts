import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEnvironmentService } from '../environment/index.js';
import { LoggerService } from '../logger/service.js';
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

});
