import { describe, it, expect } from 'vitest';
import { normalizeAndValidatePath } from './path-security.js';

describe('normalizeAndValidatePath', () => {
  it('should allow valid path within allowed roots', () => {
    const result = normalizeAndValidatePath('/Users/test/project/file.txt', ['/Users/test/project']);
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('/Users/test/project/file.txt');
  });

  it('should normalize path traversal attempts', () => {
    const result = normalizeAndValidatePath('/Users/test/project/../other/file.txt', ['/Users/test']);
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('/Users/test/other/file.txt');
  });

  it('should reject paths outside allowed roots', () => {
    const result = normalizeAndValidatePath('/etc/passwd', ['/Users/test/project']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('outside allowed directories');
  });

  it('should reject blocked paths', () => {
    const result = normalizeAndValidatePath('/etc/hosts', ['/Users/test', '/etc']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('blocked directory');
  });

  it('should normalize paths correctly', () => {
    const result = normalizeAndValidatePath('/Users/test/project/subdir/../file.txt', ['/Users/test/project']);
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('/Users/test/project/file.txt');
  });
});
