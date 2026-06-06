import { describe, expect, it } from 'vitest';
import { moduleCmd } from './module.js';

describe('module command', () => {
  it('fails closed for known module scaffolding until templates are contract-aligned', async () => {
    await expect(
      moduleCmd.parseAsync(['nl'], { from: 'user' }),
    ).rejects.toThrow('Module scaffolding for "nl" is disabled');
  });

  it('reports available modules for unknown module names', async () => {
    await expect(
      moduleCmd.parseAsync(['unknown-module'], { from: 'user' }),
    ).rejects.toThrow('Available modules:');
  });
});
