import { describe, expect, it } from 'vitest';
import { persistContractHashFromCliResult, resolveVerificationStatus } from '../src/commands/docTaskStatusHelpers.js';

describe('resolveVerificationStatus', () => {
  it('result.ok=false 且 verification.isSystemError=true => failed_system_internal', () => {
    const resolved = resolveVerificationStatus([], { ok: false, isSystemError: true });
    expect(resolved.status).toBe('failed_system_internal');
    expect(resolved.failureKind).toBe('system_internal');
  });

  it('result.ok=false 且 verification.ok=false 且 isSystemError 缺失 => failed_test', () => {
    const resolved = resolveVerificationStatus([], { ok: false });
    expect(resolved.status).toBe('failed_test');
    expect(resolved.failureKind).toBe('test');
  });
});

describe('persistContractHashFromCliResult', () => {
  it('单任务失败路径应保存 CLI 返回 instructionHash', () => {
    const runRecord: { instructionHash?: string } = {};
    persistContractHashFromCliResult(runRecord, {
      boundaryConfidence: 'medium',
      allowedFiles: [],
      forbiddenFiles: [],
      validationCommands: [],
      executionMode: 'serial',
      docExcerptTruncated: false,
      excerptStrategy: 'none',
      instructionHash: 'hash-single-fail',
    });
    expect(runRecord.instructionHash).toBe('hash-single-fail');
  });

  it('批量路径应保存 CLI 返回 instructionHash', () => {
    const runRecord: { instructionHash?: string } = { instructionHash: 'old-hash' };
    persistContractHashFromCliResult(runRecord, {
      boundaryConfidence: 'medium',
      allowedFiles: [],
      forbiddenFiles: [],
      validationCommands: [],
      executionMode: 'parallel-eligible',
      docExcerptTruncated: false,
      excerptStrategy: 'task-id-window',
      instructionHash: 'hash-batch',
    });
    expect(runRecord.instructionHash).toBe('hash-batch');
  });
});
