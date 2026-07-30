import { describe, it, expect, beforeEach } from 'vitest';
import { createCommandDiscovery } from './command-discovery.js';

describe('CommandDiscovery', () => {
  let discovery: ReturnType<typeof createCommandDiscovery>;

  beforeEach(() => {
    discovery = createCommandDiscovery();
  });

  it('should scan existing tool', async () => {
    const result = await discovery.scanTool('echo');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('echo');
  });

  it('should return null for non-existing tool', async () => {
    const result = await discovery.scanTool('non-existent-tool-12345');
    expect(result).toBeNull();
  });

  it('should scan multiple tools', async () => {
    const results = await discovery.scanTools(['echo', 'ls']);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every(r => r.name === 'echo' || r.name === 'ls')).toBe(true);
  });
});