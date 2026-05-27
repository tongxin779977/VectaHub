import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CliDetector, getCliDetector, resetCliDetector } from './cli-detector';

describe('CliDetector', () => {
  beforeEach(() => {
    resetCliDetector();
  });
  
  it('should detect a CLI', async () => {
    const execCommand = vi.fn()
      .mockReturnValueOnce('/usr/bin/test-cli')
      .mockReturnValueOnce('test-cli 1.0.0')
      .mockReturnValueOnce('Usage: test-cli [options]');
    
    const detector = new CliDetector({ execCommand });
    const result = await detector.detect('test-cli');
    
    expect(result.found).toBe(true);
    expect(result.path).toBe('/usr/bin/test-cli');
    expect(result.version).toBe('1.0.0');
    expect(result.helpOutput).toBe('Usage: test-cli [options]');
  });
  
  it('should handle CLI not found', async () => {
    const execCommand = vi.fn().mockReturnValue('');
    const detector = new CliDetector({ execCommand });
    const result = await detector.detect('non-existent-cli');
    
    expect(result.found).toBe(false);
    expect(result.error).toBeTruthy();
  });
  
  it('should extract version from various formats', async () => {
    const execCommand = vi.fn()
      .mockReturnValueOnce('/usr/bin/test-cli')
      .mockReturnValueOnce('version 2.3.4')
      .mockReturnValueOnce('help');
    
    const detector = new CliDetector({ execCommand });
    const result = await detector.detect('test-cli');
    
    expect(result.version).toBe('2.3.4');
    
    // Test vX.Y.Z format
    execCommand.mockReset();
    execCommand
      .mockReturnValueOnce('/usr/bin/test-cli')
      .mockReturnValueOnce('v3.4.5');
    const result2 = await detector.detect('test-cli');
    expect(result2.version).toBe('3.4.5');
    
    // Test just X.Y.Z
    execCommand.mockReset();
    execCommand
      .mockReturnValueOnce('/usr/bin/test-cli')
      .mockReturnValueOnce('4.5.6');
    const result3 = await detector.detect('test-cli');
    expect(result3.version).toBe('4.5.6');
  });
  
  it('should use singleton', async () => {
    const detector1 = getCliDetector();
    const detector2 = getCliDetector();
    expect(detector1).toBe(detector2);
  });
  
  it('should use provided dependencies', async () => {
    const execCommand = vi.fn().mockReturnValue('');
    const logger = { warn: vi.fn(), error: vi.fn() };
    
    const detector = getCliDetector({ execCommand, logger });
    await detector.detect('test');
    
    expect(execCommand).toHaveBeenCalled();
  });
});
