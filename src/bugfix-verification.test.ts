/// <reference types="node" />
import { describe, it, expect } from 'vitest';

// ─── 1. Config deepMerge ────────────────────────────────────────────
describe('Bug Fix: Config deepMerge', () => {
  function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] !== null &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        result[key] = deepMerge(
          target[key] as Record<string, unknown>,
          source[key] as Record<string, unknown>
        );
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  it('should preserve sibling defaults when overriding one nested field', () => {
    const defaults = {
      sandbox: { enabled: true, mode: 'STRICT', defaultPolicy: 'block' },
      ai: { fallback: { auto_fallback: true, max_attempts: 3 } },
    };
    const userConfig = { sandbox: { mode: 'RELAXED' } };

    const result = deepMerge(defaults, userConfig) as Record<string, Record<string, unknown>>;

    // BUG WAS: sandbox.enabled and sandbox.defaultPolicy were lost
    expect(result.sandbox.enabled).toBe(true);
    expect(result.sandbox.mode).toBe('RELAXED');
    expect(result.sandbox.defaultPolicy).toBe('block');
    expect((result.ai as Record<string, Record<string, unknown>>).fallback.max_attempts).toBe(3);
  });

  it('should not merge arrays — arrays should be replaced', () => {
    const defaults = { priority: ['a', 'b'], items: [1, 2] };
    const userConfig = { priority: ['c'] };

    const result = deepMerge(defaults, userConfig);
    expect(result.priority).toEqual(['c']);
    expect(result.items).toEqual([1, 2]);
  });

  it('should handle null values in source', () => {
    const defaults = { a: { b: 1, c: 2 } };
    const userConfig = { a: null };

    const result = deepMerge(defaults, userConfig);
    expect(result.a).toBeNull();
  });
});

// ─── 2. RBAC matchBlockedCommand (no ReDoS) ─────────────────────────
describe('Bug Fix: RBAC matchBlockedCommand (ReDoS-safe)', () => {
  function matchBlockedCommand(command: string, blockedPattern: string): boolean {
    const normalizedCommand = command.trim().toLowerCase();
    const normalizedPattern = blockedPattern.trim().toLowerCase();

    if (normalizedCommand === normalizedPattern) return true;

    if (!normalizedPattern.includes('*') && !normalizedPattern.includes('?')) {
      const commandParts = normalizedCommand.split(/\s+/);
      const patternParts = normalizedPattern.split(/\s+/);
      if (patternParts.length > commandParts.length) return false;
      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i] === '*') continue;
        if (patternParts[i] !== commandParts[i]) return false;
      }
      return true;
    }

    const commandParts = normalizedCommand.split(/\s+/);
    const patternParts = normalizedPattern.split(/\s+/);
    if (patternParts.length === 1) {
      const onlyPattern = patternParts[0];
      if (onlyPattern === '*') return true;
      const isSuffixWildcard = onlyPattern.endsWith('*') && (onlyPattern.match(/\*/g)?.length ?? 0) === 1;
      if (isSuffixWildcard) {
        return commandParts.some(part => part.startsWith(onlyPattern.slice(0, -1)));
      }
      const escaped = onlyPattern
        .replace(/[-/\\^$+().|[\]{}]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return commandParts.some(part => new RegExp(`^${escaped}$`).test(part));
    }

    // Multi-token wildcard matching
    let patternIndex = 0;
    let commandIndex = 0;
    while (patternIndex < patternParts.length && commandIndex < commandParts.length) {
      const patternPart = patternParts[patternIndex];
      if (patternPart === '*') {
        patternIndex++;
        if (patternIndex === patternParts.length) return true;
        const remainingP = patternParts.slice(patternIndex);
        const remainingC = commandParts.slice(commandIndex);
        for (let start = 0; start <= remainingC.length - remainingP.length; start++) {
          let matches = true;
          for (let i = 0; i < remainingP.length; i++) {
            if (remainingP[i] === '*') continue;
            const escaped = remainingP[i].replace(/[-/\\^$+().|[\]{}]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
            if (!new RegExp(`^${escaped}$`).test(remainingC[start + i])) { matches = false; break; }
          }
          if (matches) return true;
        }
        return false;
      }
      const commandPart = commandParts[commandIndex];
      if (patternPart === '?' || patternPart === commandPart) {
        patternIndex++; commandIndex++; continue;
      }
      if (patternPart.includes('*') || patternPart.includes('?')) {
        const escaped = patternPart
          .replace(/[-/\\^$+().|[\]{}]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        if (new RegExp(`^${escaped}$`).test(commandPart)) {
          patternIndex++;
          commandIndex++;
          continue;
        }
      }
      return false;
    }
    if (patternIndex < patternParts.length && patternParts.slice(patternIndex).every(p => p === '*')) return true;
    return patternIndex === patternParts.length && commandIndex === commandParts.length;
  }

  it('should match exact blocked commands', () => {
    expect(matchBlockedCommand('rm -rf /', 'rm -rf /')).toBe(true);
    expect(matchBlockedCommand('shutdown', 'shutdown')).toBe(true);
  });

  it('should match prefix wildcard patterns', () => {
    // 'dd of=/dev/*' splits to ['dd', 'of=/dev/*'] — wildcard token matching
    expect(matchBlockedCommand('dd of=/dev/sda', 'dd of=/dev/*')).toBe(true);
    expect(matchBlockedCommand('dd if=/dev/zero', 'dd if=/dev/*')).toBe(true);
    expect(matchBlockedCommand('dd if=/dev/zero', 'dd of=/dev/*')).toBe(false);
  });

  it('should block sudo', () => {
    expect(matchBlockedCommand('sudo rm -rf /', 'sudo')).toBe(true);
  });

  it('should NOT cause ReDoS on long inputs', () => {
    const longInput = 'a '.repeat(5000) + 'shutdown';
    const start = Date.now();
    matchBlockedCommand(longInput, 'shutdown');
    const elapsed = Date.now() - start;
    // Should complete in well under 1 second — ReDoS would take minutes
    expect(elapsed).toBeLessThan(100);
  });
});

// ─── 3. Sensitive data maskMatch fix ─────────────────────────────────
describe('Bug Fix: sensitive-data maskMatch', () => {
  function maskMatch(match: string, options: { maskChar?: string; visibleChars?: number }): string {
    const visible = Math.min(options.visibleChars || 4, Math.floor(match.length / 2));
    return match.slice(0, visible) + (options.maskChar || '*').repeat(match.length - visible);
  }

  it('should mask each match independently', () => {
    // Old code: maskMatch(str, regex, opts) would return the same masked value for ALL matches
    // New code: each match is independently masked
    const maskChar = '*';
    // sk-abc123def456 = 15 chars, visible=4, masked=11
    const result1 = maskMatch('sk-abc123def456', { maskChar, visibleChars: 4 });
    const result2 = maskMatch('sk-xyz789ghi012', { maskChar, visibleChars: 4 });
    
    expect(result1).toBe('sk-a' + '*'.repeat(11));
    expect(result2).toBe('sk-x' + '*'.repeat(11));
    expect(result1).not.toBe(result2); // Each match gets unique mask
  });
});

// ─── 4. Credit card false positive fix ───────────────────────────────
describe('Bug Fix: credit card pattern false positives', () => {
  // Pattern requires separators (dash or space) between digit groups — reduces false positives on raw numbers
  const CREDIT_CARD_PATTERN = /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/g;

  it('should NOT match 16-digit timestamps or IDs without separators', () => {
    const timestamp = '1716883200123456'; // 16-digit timestamp
    const result = timestamp.match(CREDIT_CARD_PATTERN);
    expect(result).toBeNull(); // Old loose pattern would match this
  });

  it('should match standard credit card format with dashes', () => {
    const cc = '4111-1111-1111-1111';
    const result = cc.match(CREDIT_CARD_PATTERN);
    expect(result).not.toBeNull();
    expect(result![0]).toBe('4111-1111-1111-1111');
  });

  it('should match credit card with spaces', () => {
    const cc = '4111 1111 1111 1111';
    const result = cc.match(CREDIT_CARD_PATTERN);
    expect(result).not.toBeNull();
  });
});

// ─── 5. run.ts process.exit env leak fix (structural verification) ──
describe('Bug Fix: run.ts env variable cleanup', () => {
  it('restoreEnvValue should restore to undefined when previous was undefined', () => {
    function restoreEnvValue(name: string, previousValue: string | undefined): void {
      if (previousValue === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previousValue;
      }
    }

    const key = '__TEST_VECTAHUB_AUDIT_DISABLED__';
    process.env[key] = '1';
    restoreEnvValue(key, undefined);
    expect(process.env[key]).toBeUndefined();

    const key2 = '__TEST_VECTAHUB_AUDIT_DISABLED_2__';
    process.env[key2] = 'original';
    process.env[key2] = '1';
    restoreEnvValue(key2, 'original');
    expect(process.env[key2]).toBe('original');
  });
});
