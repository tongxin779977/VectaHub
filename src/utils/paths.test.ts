import { afterEach, describe, expect, it } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { getVectaHubHome } from './paths.js';

const originalVectaHubHome = process.env.VECTAHUB_HOME;

function restoreEnvVar(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe('getVectaHubHome', () => {
  afterEach(() => {
    restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
  });

  it('falls back to default home when VECTAHUB_HOME is the string undefined', () => {
    process.env.VECTAHUB_HOME = 'undefined';

    expect(getVectaHubHome()).toBe(join(homedir(), '.vectahub'));
  });

  it('falls back to default home when VECTAHUB_HOME is blank', () => {
    process.env.VECTAHUB_HOME = '   ';

    expect(getVectaHubHome()).toBe(join(homedir(), '.vectahub'));
  });

  it('uses explicit VECTAHUB_HOME when provided', () => {
    process.env.VECTAHUB_HOME = '/tmp/vectahub-test-home';

    expect(getVectaHubHome()).toBe('/tmp/vectahub-test-home');
  });
});
