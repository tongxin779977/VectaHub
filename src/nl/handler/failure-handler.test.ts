import { describe, expect, it, vi } from 'vitest';

describe('failure-handler module loading', () => {
  it('does not resolve default context during module import', async () => {
    vi.resetModules();

    const getDefaultContext = vi.fn(() => {
      throw new Error('should not resolve default context during import');
    });

    vi.doMock('../../infrastructure/context.js', () => ({
      getDefaultContext,
    }));

    await expect(import('./failure-handler.js')).resolves.toBeDefined();
    expect(getDefaultContext).not.toHaveBeenCalled();
  });
});
