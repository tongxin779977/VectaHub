import { describe, expect, it } from 'vitest';
import { resolveRecoveryInstructionHash } from '../src/commands/recoverDocTaskHash.js';

describe('resolveRecoveryInstructionHash', () => {
  it('恢复记录优先使用 currentHash', () => {
    expect(resolveRecoveryInstructionHash({
      currentHash: 'current-hash',
      latestInstructionHash: 'latest-hash',
    })).toBe('current-hash');
  });

  it('currentHash 不可用时继承 latestRecord.instructionHash', () => {
    expect(resolveRecoveryInstructionHash({
      currentHash: undefined,
      latestInstructionHash: 'latest-hash',
    })).toBe('latest-hash');
  });
});
