import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { getVectaHubHome } from './paths.js';
import { resetDefaultContext } from '../infrastructure/context.js';

const originalVectaHubHome = process.env.VECTAHUB_HOME;

function restoreEnvVar(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe('getVectaHubHome', () => {
  beforeEach(() => {
    resetDefaultContext();
  });

  afterEach(() => {
    restoreEnvVar('VECTAHUB_HOME', originalVectaHubHome);
    resetDefaultContext();
  });

  it('falls back to default home when VECTAHUB_HOME is the string undefined', () => {
    process.env.VECTAHUB_HOME = 'undefined';
    resetDefaultContext();

    expect(getVectaHubHome()).toBe(join(homedir(), '.vectahub'));
  });

  it('falls back to default home when VECTAHUB_HOME is blank', () => {
    process.env.VECTAHUB_HOME = '   ';
    resetDefaultContext();

    expect(getVectaHubHome()).toBe(join(homedir(), '.vectahub'));
  });

  it('falls back to default home when VECTAHUB_HOME is the string null', () => {
    process.env.VECTAHUB_HOME = 'null';
    resetDefaultContext();

    expect(getVectaHubHome()).toBe(join(homedir(), '.vectahub'));
  });

  it('uses explicit VECTAHUB_HOME when provided', () => {
    process.env.VECTAHUB_HOME = '/tmp/vectahub-test-home';
    resetDefaultContext();

    expect(getVectaHubHome()).toBe('/tmp/vectahub-test-home');
  });
});
