import { describe, expect, it } from 'vitest';
import { classifyDocTaskFailure } from './docTaskState.js';

describe('classifyDocTaskFailure', () => {
  it('should classify timeout by explicit error code', () => {
    const classified = classifyDocTaskFailure({
      ok: false,
      exitCode: null as unknown as number,
      errorCode: 'TIMEOUT',
      errorMessage: 'CLI timeout after 660000ms',
    });

    expect(classified.kind).toBe('timeout');
    expect(classified.status).toBe('failed_timeout');
  });

  it('should classify cancelled separately from timeout', () => {
    const classified = classifyDocTaskFailure({
      ok: false,
      errorCode: 'CANCELLED',
      errorMessage: 'Command was cancelled by user',
    });

    expect(classified.kind).toBe('cancelled');
    expect(classified.status).toBe('cancelled');
  });
});
