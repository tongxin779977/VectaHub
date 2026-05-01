import { describe, it, expect } from 'vitest';
import { createDetector } from './detector.js';

describe('Detector', () => {
  const detector = createDetector();

  describe('getDangerLevel', () => {
    it('should return critical for sudo commands', () => {
      expect(detector.getDangerLevel('sudo rm -rf /')).toBe('critical');
    });

    it('should return critical for chmod 777', () => {
      expect(detector.getDangerLevel('chmod 777 /etc')).toBe('critical');
    });

    it('should return critical for rm -rf root', () => {
      expect(detector.getDangerLevel('rm -rf /')).toBe('critical');
    });

    it('should return high for etc file overwrite', () => {
      expect(detector.getDangerLevel('echo test > /etc/passwd')).toBe('high');
    });

    it('should return high for mount --bind', () => {
      expect(detector.getDangerLevel('mount --bind /dev/sda /mnt')).toBe('high');
    });

    it('should return medium for dev file overwrite', () => {
      expect(detector.getDangerLevel('echo test > /dev/sda')).toBe('medium');
    });

    it('should return medium for pipe commands', () => {
      expect(detector.getDangerLevel('ls | grep test')).toBe('medium');
    });

    it('should return low for npm install -g', () => {
      expect(detector.getDangerLevel('npm install -g typescript')).toBe('low');
    });

    it('should return low for rm -rf node_modules', () => {
      expect(detector.getDangerLevel('rm -rf node_modules')).toBe('low');
    });

    it('should return none for safe commands', () => {
      expect(detector.getDangerLevel('ls -la')).toBe('none');
      expect(detector.getDangerLevel('echo hello')).toBe('none');
      expect(detector.getDangerLevel('cat package.json')).toBe('none');
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
      expect(result.reason).toBe('Critical system modification');
    });

    it('should return appropriate reason for different levels', () => {
      expect(detector.detect('echo test > /etc/passwd').reason).toBe(
        'High-risk system file modification'
      );
      expect(detector.detect('echo test > /dev/sda').reason).toBe(
        'Medium-risk device/file manipulation'
      );
      expect(detector.detect('rm -rf node_modules').reason).toBe(
        'Low-risk potentially destructive command'
      );
    });
  });
});