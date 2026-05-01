import { describe, it, expect, beforeEach } from 'vitest';
import { createDetector } from './detector.js';
import { setTestMode } from '../security-protocol/manager.js';

describe('Detector', () => {
  beforeEach(() => {
    setTestMode(true);
  });

  const detector = createDetector();

  describe('getDangerLevel', () => {
    it('should return critical for sudo commands', () => {
      const result = detector.getDangerLevel('sudo rm -rf /');
      expect(result.level).toBe('critical');
    });

    it('should return critical for chmod 777', () => {
      const result = detector.getDangerLevel('chmod 777 /etc');
      expect(result.level).toBe('critical');
    });

    it('should return critical for rm -rf root', () => {
      const result = detector.getDangerLevel('rm -rf /');
      expect(result.level).toBe('critical');
    });

    it('should return high for etc file overwrite', () => {
      const result = detector.getDangerLevel('echo test > /etc/passwd');
      expect(result.level).toBe('high');
    });

    it('should return high for mount --bind', () => {
      const result = detector.getDangerLevel('mount --bind /dev/sda /mnt');
      expect(result.level).toBe('high');
    });

    it('should return medium for dev file overwrite', () => {
      const result = detector.getDangerLevel('echo test > /dev/sda');
      expect(result.level).toBe('medium');
    });

    it('should return medium for pipe commands', () => {
      const result = detector.getDangerLevel('ls | grep test');
      expect(result.level).toBe('medium');
    });

    it('should return low for npm install -g', () => {
      const result = detector.getDangerLevel('npm install -g typescript');
      expect(result.level).toBe('low');
    });

    it('should return low for rm -rf node_modules', () => {
      const result = detector.getDangerLevel('rm -rf node_modules');
      expect(result.level).toBe('low');
    });

    it('should return none for safe commands', () => {
      const result1 = detector.getDangerLevel('ls -la');
      expect(result1.level).toBe('none');
      const result2 = detector.getDangerLevel('echo hello');
      expect(result2.level).toBe('none');
      const result3 = detector.getDangerLevel('cat package.json');
      expect(result3.level).toBe('none');
    });
  });

  describe('isDangerous', () => {
    it('should return true for dangerous commands', () => {
      expect(detector.isDangerous('sudo rm -rf /')).toBe(true);
      expect(detector.isDangerous('chmod 777 /')).toBe(true);
    });

    it('should return false for safe commands', () => {
      expect(detector.isDangerous('ls')).toBe(false);
      expect(detector.isDangerous('echo hello')).toBe(false);
    });
  });

  describe('detect', () => {
    it('should return isDangerous false for safe commands', () => {
      const result = detector.detect('ls -la');
      expect(result.isDangerous).toBe(false);
    });

    it('should return detection info for dangerous commands', () => {
      const result = detector.detect('sudo rm -rf /');
      expect(result.isDangerous).toBe(true);
      expect(result.level).toBe('critical');
      expect(result.reason).toBe('Detects sudo commands for privilege escalation');
    });

    it('should return detection with category for etc overwrite', () => {
      const result = detector.detect('echo test > /etc/passwd');
      expect(result.isDangerous).toBe(true);
      expect(result.level).toBe('high');
      expect(result.category).toBe('FS');
    });

    it('should return detection with category for network commands', () => {
      const result = detector.detect('iptables -F');
      expect(result.isDangerous).toBe(true);
      expect(result.level).toBe('high');
      expect(result.category).toBe('NETWORK');
    });

    it('should return detection with category for resource commands', () => {
      const result = detector.detect('rm -rf node_modules');
      expect(result.isDangerous).toBe(true);
      expect(result.level).toBe('low');
      expect(result.category).toBe('FS');
    });
  });
});