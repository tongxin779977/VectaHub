import { describe, it, expect } from 'vitest';
import { Redactor, createRedactor } from './redactor.js';
import { homedir } from 'node:os';

describe('Redactor', () => {
  describe('redact sensitive key-value patterns', () => {
    it('should redact api_key value in assignment', () => {
      const redactor = new Redactor();
      const input = 'export API_KEY=sk_abc123def456ghi789';
      const result = redactor.redact(input);
      expect(result).not.toContain('sk_abc123def456ghi789');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact token= value', () => {
      const redactor = new Redactor();
      const input = 'token=ghp_abc123def456ghi789jkl012';
      const result = redactor.redact(input);
      expect(result).not.toContain('ghp_abc123def456ghi789jkl012');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact secret= value', () => {
      const redactor = new Redactor();
      const input = 'secret=mysecretvalue12345678';
      const result = redactor.redact(input);
      expect(result).not.toContain('mysecretvalue12345678');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact password= value', () => {
      const redactor = new Redactor();
      const input = 'password=supersecretpassword123';
      const result = redactor.redact(input);
      expect(result).not.toContain('supersecretpassword123');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact authorization header value', () => {
      const redactor = new Redactor();
      const input = 'Authorization=Bearer abc123def456ghi789jkl012mno345';
      const result = redactor.redact(input);
      expect(result).not.toContain('abc123def456ghi789jkl012mno345');
      expect(result).toContain('[REDACTED]');
    });

    it('should handle quoted values', () => {
      const redactor = new Redactor();
      const input = 'api_key="sk_abc123def456ghi789"';
      const result = redactor.redact(input);
      expect(result).not.toContain('sk_abc123def456ghi789');
      expect(result).toContain('[REDACTED]');
    });
  });

  describe('redact known environment secrets', () => {
    it('should redact OPENAI_API_KEY value', () => {
      const redactor = new Redactor();
      const input = 'OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012';
      const result = redactor.redact(input);
      expect(result).not.toContain('sk-proj-abc123def456ghi789jkl012');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact GITHUB_TOKEN value', () => {
      const redactor = new Redactor();
      const input = 'GITHUB_TOKEN=ghp_abc123def456ghi789jkl012';
      const result = redactor.redact(input);
      expect(result).not.toContain('ghp_abc123def456ghi789jkl012');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact AWS_SECRET_ACCESS_KEY value', () => {
      const redactor = new Redactor();
      const input = 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      const result = redactor.redact(input);
      expect(result).not.toContain('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
      expect(result).toContain('[REDACTED]');
    });
  });

  describe('redact Bearer tokens', () => {
    it('should redact Bearer token in header', () => {
      const redactor = new Redactor();
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9eyJzdWIiOiIxMjM0NTY3ODkwIn0';
      const result = redactor.redact(input);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9eyJzdWIiOiIxMjM0NTY3ODkwIn0');
    });
  });

  describe('redact home path', () => {
    it('should redact user home directory path', () => {
      const redactor = new Redactor();
      const home = homedir();
      const input = `Config file at ${home}/.config/app.json`;
      const result = redactor.redact(input);
      expect(result).not.toContain(home);
      expect(result).toContain('[REDACTED]');
    });

    it('should redact home path in multiple occurrences', () => {
      const redactor = new Redactor();
      const home = homedir();
      const input = `${home}/dir1 and ${home}/dir2`;
      const result = redactor.redact(input);
      expect(result).not.toContain(home);
      expect(result.match(/\[REDACTED\]/g)?.length).toBe(2);
    });
  });

  describe('do not redact safe content', () => {
    it('should not modify plain text without secrets', () => {
      const redactor = new Redactor();
      const input = 'npm run typecheck && npm test';
      expect(redactor.redact(input)).toBe(input);
    });

    it('should not modify empty string', () => {
      const redactor = new Redactor();
      expect(redactor.redact('')).toBe('');
    });

    it('should not modify short tokens (less than 8 chars)', () => {
      const redactor = new Redactor();
      const input = 'token=abc';
      expect(redactor.redact(input)).toBe(input);
    });
  });

  describe('custom replacement', () => {
    it('should use custom replacement string', () => {
      const redactor = new Redactor({ replacement: '***HIDDEN***' });
      const input = 'OPENAI_API_KEY=sk-abc123def456ghi789';
      const result = redactor.redact(input);
      expect(result).not.toContain('sk-abc123def456ghi789');
      expect(result).toContain('***HIDDEN***');
    });
  });

  describe('custom patterns', () => {
    it('should use custom patterns when provided', () => {
      const redactor = new Redactor({
        patterns: [/CUSTOM_SECRET_\d+/g],
        replacement: '[CUSTOM_REDACTED]',
      });
      const input = 'value is CUSTOM_SECRET_12345 here';
      const result = redactor.redact(input);
      expect(result).toBe('value is [CUSTOM_REDACTED] here');
    });
  });

  describe('redactObject', () => {
    it('should redact secret values in an object', () => {
      const redactor = new Redactor();
      const input = {
        command: 'npm test',
        output: 'OPENAI_API_KEY=sk-abc123def456ghi789jkl',
        exitCode: 0,
      };
      const result = redactor.redactObject(input);
      expect(result.command).toBe('npm test');
      expect(result.output).not.toContain('sk-abc123def456ghi789jkl');
      expect(result.output).toContain('[REDACTED]');
      expect(result.exitCode).toBe(0);
    });

    it('should redact nested objects', () => {
      const redactor = new Redactor();
      const input = {
        level1: {
          level2: {
            secret: 'api_key=sk-abc123def456ghi789jkl',
          },
        },
      };
      const result = redactor.redactObject(input);
      expect((result.level1 as any).level2.secret).not.toContain('sk-abc123def456ghi789jkl');
      expect((result.level1 as any).level2.secret).toContain('[REDACTED]');
    });

    it('should redact arrays of strings', () => {
      const redactor = new Redactor();
      const input = {
        items: ['GITHUB_TOKEN=ghp_abc123def456ghi789jkl012', 'safe value'],
      };
      const result = redactor.redactObject(input);
      expect(result.items[0]).not.toContain('ghp_abc123def456ghi789jkl012');
      expect(result.items[0]).toContain('[REDACTED]');
      expect(result.items[1]).toBe('safe value');
    });

    it('should preserve non-string primitives', () => {
      const redactor = new Redactor();
      const input = {
        count: 42,
        flag: true,
        nothing: null,
        value: undefined,
      };
      const result = redactor.redactObject(input);
      expect(result.count).toBe(42);
      expect(result.flag).toBe(true);
      expect(result.nothing).toBe(null);
    });

    it('should redact deeply nested trace-like structures', () => {
      const redactor = new Redactor();
      const input = {
        traceId: 'abc-123',
        attributes: {
          command: 'aider --message "test"',
          env: 'OPENAI_API_KEY=sk-proj-abc123def456ghi789',
          home: `${homedir()}/projects/app`,
        },
      };
      const result = redactor.redactObject(input);
      expect(result.traceId).toBe('abc-123');
      expect((result.attributes as any).env).not.toContain('sk-proj-abc123def456ghi789');
      expect((result.attributes as any).env).toContain('[REDACTED]');
      expect((result.attributes as any).home).not.toContain(homedir());
    });
  });

  describe('createRedactor', () => {
    it('should create a Redactor instance with defaults', () => {
      const redactor = createRedactor();
      expect(redactor).toBeInstanceOf(Redactor);
      const result = redactor.redact('OPENAI_API_KEY=sk-abc123def456ghi789jkl');
      expect(result).not.toContain('sk-abc123def456ghi789jkl');
      expect(result).toContain('[REDACTED]');
    });

    it('should create a Redactor with custom config', () => {
      const redactor = createRedactor({ replacement: '[SECRET]' });
      const result = redactor.redact('OPENAI_API_KEY=sk-abc123def456ghi789jkl');
      expect(result).not.toContain('sk-abc123def456ghi789jkl');
      expect(result).toContain('[SECRET]');
    });
  });

  describe('multiple patterns in same string', () => {
    it('should apply all patterns to the same string', () => {
      const redactor = new Redactor();
      const home = homedir();
      const input = `api_key=sk-abc123def456ghi789jkl config at ${home}/app.json`;
      const result = redactor.redact(input);
      expect(result).not.toContain('sk-abc123def456ghi789jkl');
      expect(result).not.toContain(home);
    });
  });

  describe('PII redaction (unified from sensitive-data.ts)', () => {
    it('should redact Chinese mobile phone numbers', () => {
      const redactor = new Redactor();
      const result = redactor.redact('联系我: 13812345678');
      expect(result).not.toContain('13812345678');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact email addresses', () => {
      const redactor = new Redactor();
      const result = redactor.redact('Send to user@example.com for details');
      expect(result).not.toContain('user@example.com');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact Chinese ID card numbers', () => {
      const redactor = new Redactor();
      const result = redactor.redact('身份证: 110101199003071234');
      expect(result).not.toContain('110101199003071234');
    });

    it('should redact credit card numbers', () => {
      const redactor = new Redactor();
      const result = redactor.redact('Card: 4111-1111-1111-1111');
      expect(result).not.toContain('4111-1111-1111-1111');
    });
  });

  describe('JWT redaction (unified)', () => {
    it('should redact JWT tokens', () => {
      const redactor = new Redactor();
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const result = redactor.redact(`Token: ${jwt}`);
      expect(result).not.toContain(jwt);
      expect(result).toContain('[REDACTED]');
    });
  });

  describe('API key patterns (unified from sensitive-data.ts)', () => {
    it('should redact OpenAI sk- keys', () => {
      const redactor = new Redactor();
      const key = 'sk-' + 'a'.repeat(48);
      const result = redactor.redact(`Key: ${key}`);
      expect(result).not.toContain(key);
    });

    it('should redact GitHub PAT ghp_ keys', () => {
      const redactor = new Redactor();
      const key = 'ghp_' + 'a'.repeat(36);
      const result = redactor.redact(`Key: ${key}`);
      expect(result).not.toContain(key);
    });

    it('should redact AWS AKIA keys', () => {
      const redactor = new Redactor();
      const key = 'AKIA' + 'A'.repeat(16);
      const result = redactor.redact(`Key: ${key}`);
      expect(result).not.toContain(key);
    });
  });

  describe('sensitive path redaction (Issue 4)', () => {
    it('should detect .ssh paths', () => {
      const redactor = new Redactor();
      const result = redactor.redact(`File: ${homedir()}/.ssh/config has sensitive data`);
      expect(result).not.toContain('.ssh');
      expect(result).toContain('[REDACTED]');
    });

    it('should detect .env references', () => {
      const redactor = new Redactor();
      const result = redactor.redact('Loaded from /app/.env file with API_KEY=sk-' + 'a'.repeat(48));
      expect(result).not.toContain('.env');
      expect(result).toContain('[REDACTED]');
    });

    it('should detect id_rsa paths', () => {
      const redactor = new Redactor();
      const result = redactor.redact('Key at ~/.ssh/id_rsa was compromised');
      expect(result).not.toContain('id_rsa');
    });

    it('should detect .pem files', () => {
      const redactor = new Redactor();
      const result = redactor.redact('Certificate: /etc/ssl/server.pem');
      expect(result).not.toContain('.pem');
    });
  });

  describe('large input protection (Fix #5)', () => {
    it('should truncate and redact head/tail for inputs over 100KB', { timeout: 15000 }, () => {
      const redactor = new Redactor();
      // Build a 150KB string with a secret at the start and end
      const secret = 'OPENAI_API_KEY=sk-proj-abc123def456ghi789';
      const padding = 'safe text here. '.repeat(5000); // ~85KB per repeat
      const input = `${secret} ${padding}${padding} ${secret}`;
      const result = redactor.redact(input);

      // Should contain truncation marker
      expect(result).toContain('[truncated');
      // Secrets at head and tail should be redacted
      expect(result).not.toContain('sk-proj-abc123def456ghi789');
      expect(result).toContain('[REDACTED]');
    });

    it('should not truncate inputs under 100KB', { timeout: 15000 }, () => {
      const redactor = new Redactor();
      const input = 'OPENAI_API_KEY=sk-abc123def456ghi789 ' + 'y'.repeat(50_000);
      const result = redactor.redact(input);
      expect(result).not.toContain('[truncated');
      expect(result).not.toContain('sk-abc123def456ghi789');
    });

    it('should complete large input redaction quickly', { timeout: 15000 }, () => {
      const redactor = new Redactor();
      const input = 'safe content '.repeat(20_000); // ~260KB
      const start = performance.now();
      redactor.redact(input);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100); // should complete well under 100ms
    });
  });

  describe('skipKeys', () => {
    it('should skip redaction for fields listed in skipKeys', () => {
      const redactor = new Redactor({ skipKeys: ['traceId', 'spanId'] });
      const input = {
        traceId: 'tr_1778657109751_8y5jbd',
        spanId: 'sp_1778657109751_8y5jbd',
        output: 'OPENAI_API_KEY=sk-proj-abc123def456ghi789',
      };
      const result = redactor.redactObject(input);
      expect(result.traceId).toBe('tr_1778657109751_8y5jbd');
      expect(result.spanId).toBe('sp_1778657109751_8y5jbd');
      expect(result.output).not.toContain('sk-proj-abc123def456ghi789');
      expect(result.output).toContain('[REDACTED]');
    });

    it('should still redact skipKeys fields when used as plain string via redact()', () => {
      const redactor = new Redactor({ skipKeys: ['traceId'] });
      // redact() is a string-level API and does not know about keys
      const result = redactor.redact('tr_1778657109751_8y5jbd');
      // The phone pattern still matches in redact() — skipKeys only applies to redactObject
      expect(result).toContain('[REDACTED]');
    });

    it('should not skip redaction for fields not in skipKeys', () => {
      const redactor = new Redactor({ skipKeys: ['traceId'] });
      const input = {
        traceId: 'tr_1778657109751_8y5jbd',
        command: '13812345678',
      };
      const result = redactor.redactObject(input);
      expect(result.traceId).toBe('tr_1778657109751_8y5jbd');
      expect(result.command).not.toContain('13812345678');
    });

    it('should handle empty skipKeys (default behavior)', () => {
      const redactor = new Redactor();
      const input = {
        traceId: 'tr_1778657109751_8y5jbd',
        output: 'OPENAI_API_KEY=sk-proj-abc123def456ghi789',
      };
      const result = redactor.redactObject(input);
      // Without skipKeys, traceId gets redacted by phone pattern
      expect(result.traceId).toContain('[REDACTED]');
      expect(result.output).toContain('[REDACTED]');
    });
  });
});
