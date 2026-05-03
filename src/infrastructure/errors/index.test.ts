import { describe, it, expect } from 'vitest';
import { VectaHubError, ErrorType, classifyError, formatErrorMessage } from './index.js';

describe('VectaHubError', () => {
  it('should create error with message and type', () => {
    const err = new VectaHubError('test error', ErrorType.PERMISSION);
    expect(err.message).toBe('test error');
    expect(err.type).toBe(ErrorType.PERMISSION);
    expect(err.name).toBe('VectaHubError');
  });

  it('should default to UNKNOWN type', () => {
    const err = new VectaHubError('something');
    expect(err.type).toBe(ErrorType.UNKNOWN);
  });

  it('should preserve cause', () => {
    const cause = new Error('root cause');
    const err = new VectaHubError('wrapped', ErrorType.RUNTIME, cause);
    expect(err.cause).toBe(cause);
  });
});

describe('classifyError', () => {
  it('should classify VectaHubError by its type', () => {
    const err = new VectaHubError('config bad', ErrorType.CONFIGURATION);
    const result = classifyError(err);
    expect(result.type).toBe(ErrorType.CONFIGURATION);
    expect(result.message).toBe('config bad');
  });

  it('should detect permission errors', () => {
    const result = classifyError(new Error('Permission denied'));
    expect(result.type).toBe(ErrorType.PERMISSION);
  });

  it('should detect EACCES errors', () => {
    const result = classifyError(new Error('EACCES: access denied'));
    expect(result.type).toBe(ErrorType.PERMISSION);
  });

  it('should detect ENOENT errors', () => {
    const result = classifyError(new Error('ENOENT: no such file'));
    expect(result.type).toBe(ErrorType.FILESYSTEM);
  });

  it('should detect file not found errors', () => {
    const result = classifyError(new Error('File not found'));
    expect(result.type).toBe(ErrorType.FILESYSTEM);
  });

  it('should detect config errors', () => {
    const result = classifyError(new Error('Invalid configuration'));
    expect(result.type).toBe(ErrorType.CONFIGURATION);
  });

  it('should classify other Error as RUNTIME', () => {
    const result = classifyError(new Error('something broke'));
    expect(result.type).toBe(ErrorType.RUNTIME);
  });

  it('should classify non-Error as UNKNOWN', () => {
    const result = classifyError('string error');
    expect(result.type).toBe(ErrorType.UNKNOWN);
    expect(result.message).toBe('string error');
  });

  it('should classify null as UNKNOWN', () => {
    const result = classifyError(null);
    expect(result.type).toBe(ErrorType.UNKNOWN);
  });
});

describe('formatErrorMessage', () => {
  it('should format with context prefix', () => {
    const msg = formatErrorMessage(new Error('bad'), 'RunCommand');
    expect(msg).toContain('[RunCommand]');
    expect(msg).toContain('bad');
  });

  it('should use Chinese type labels', () => {
    const msg = formatErrorMessage(new Error('EACCES denied'));
    expect(msg).toContain('权限错误');
  });

  it('should format config errors with Chinese label', () => {
    const msg = formatErrorMessage(new VectaHubError('bad config', ErrorType.CONFIGURATION));
    expect(msg).toContain('配置错误');
  });

  it('should work without context', () => {
    const msg = formatErrorMessage(new Error('oops'));
    expect(msg).not.toContain('[');
    expect(msg).toContain('oops');
  });
});
