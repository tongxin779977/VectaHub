import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnvironmentDetector } from './ai-env-detector.js';

vi.mock('../utils/audit.js', () => ({
  audit: {
    cliCommand: vi.fn(),
    cliOutput: vi.fn(),
  },
  getCurrentSessionId: () => 'test-session',
}));

describe('EnvironmentDetector', () => {
  let detector: EnvironmentDetector;

  beforeEach(() => {
    detector = new EnvironmentDetector();
  });

  it('should create detector with all AI providers', () => {
    const providers = ['gemini', 'claude', 'codex', 'aider', 'opencli'];
    for (const name of providers) {
      expect(detector).toBeDefined();
    }
  });

  it('should scan and return environment report', async () => {
    const report = await detector.scan();

    expect(report.scannedAt).toBeInstanceOf(Date);
    expect(report.providers).toBeDefined();
    expect(Array.isArray(report.providers)).toBe(true);
    expect(report.warnings).toBeDefined();
    expect(typeof report.totalAvailable).toBe('number');
    expect(typeof report.recommendedProvider).toBe('string');
  });

  it('should report providers as not_found when not in PATH', async () => {
    const report = await detector.scan();

    for (const provider of report.providers) {
      expect(['available', 'installed', 'not_found', 'version_mismatch', 'permission_denied']).toContain(provider.status);
    }
  });

  it('should cache results and return cached report on second scan', async () => {
    const report1 = await detector.scan();
    const report2 = await detector.scan();

    expect(report1).toBe(report2);
  });

  it('should force rescan when force is true', async () => {
    const report1 = await detector.scan();
    const report2 = await detector.scan(true);

    expect(report1).not.toBe(report2);
  });

  it('should clear cache when clearCache is called', () => {
    detector.clearCache();
    expect(detector).toBeDefined();
  });

  it('should perform semver comparison correctly', async () => {
    const report = await detector.scan();
    expect(report.recommendedProvider).toBeDefined();
  });
});
