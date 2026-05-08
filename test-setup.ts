import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';

const originalVectaHubHome = process.env.VECTAHUB_HOME;
const testRoot = mkdtempSync(join(tmpdir(), 'vectahub-test-'));

if (!process.env.VECTAHUB_HOME) {
  process.env.VECTAHUB_HOME = join(testRoot, '.vectahub');
}

afterAll(() => {
  if (originalVectaHubHome === undefined) {
    delete process.env.VECTAHUB_HOME;
  } else {
    process.env.VECTAHUB_HOME = originalVectaHubHome;
  }
  rmSync(testRoot, { recursive: true, force: true });
});
