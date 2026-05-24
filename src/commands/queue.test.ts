import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resetDefaultContext } from '../infrastructure/context.js';
import { createQueueCmd } from './queue.js';
import { MockLoggerService } from '../infrastructure/testing/mock-services.js';
import { createEnvironmentService } from '../infrastructure/environment/index.js';
import type { InfrastructureContext } from '../infrastructure/context.js';

describe('queue command', () => {
  let oldHome: string | undefined;
  let tempHome: string;
  let context: InfrastructureContext;
  let queueCmd: ReturnType<typeof createQueueCmd>;

  beforeEach(() => {
    oldHome = process.env.VECTAHUB_HOME;
    tempHome = mkdtempSync(join(tmpdir(), 'vectahub-queue-cmd-'));
    process.env.VECTAHUB_HOME = tempHome;
    resetDefaultContext();
    const environment = createEnvironmentService(tempHome);
    context = {
      environment,
      logger: new MockLoggerService(),
    } as unknown as InfrastructureContext;
    queueCmd = createQueueCmd(context);
  });

  afterEach(() => {
    if (oldHome === undefined) {
      delete process.env.VECTAHUB_HOME;
    } else {
      process.env.VECTAHUB_HOME = oldHome;
    }
    rmSync(tempHome, { recursive: true, force: true });
    resetDefaultContext();
  });

  it('fails with contextual error when queue file is malformed', async () => {
    writeFileSync(join(tempHome, 'diagnostic-queue.json'), '{bad json', 'utf-8');

    await expect(queueCmd.parseAsync(['list', '--json'], { from: 'user' })).rejects.toThrow(
      'Failed to list diagnostic queue'
    );
  });

  it('fails with contextual error when removing from a malformed queue', async () => {
    writeFileSync(join(tempHome, 'diagnostic-queue.json'), '{bad json', 'utf-8');

    await expect(queueCmd.parseAsync(['remove', 'task-1', '--json'], { from: 'user' })).rejects.toThrow(
      'Failed to remove diagnostic queue'
    );
  });
});
