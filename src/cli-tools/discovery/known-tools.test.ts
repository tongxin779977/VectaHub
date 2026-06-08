import { describe, it, expect } from 'vitest';
import { KNOWN_TOOLS, getAllKnownTools, getKnownTool } from './known-tools.js';

describe('KNOWN_TOOLS', () => {
  it('every tool should have a non-empty description', () => {
    for (const tool of KNOWN_TOOLS) {
      expect(tool.description, `tool "${tool.name}" should have a description`).toBeTruthy();
      expect(typeof tool.description, `tool "${tool.name}" description should be a string`).toBe('string');
    }
  });

  it('getAllKnownTools returns all tools with descriptions', () => {
    const tools = getAllKnownTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
    }
  });

  it('getKnownTool returns tool with description', () => {
    const node = getKnownTool('node');
    expect(node).toBeDefined();
    expect(node!.description).toBe('Node.js JavaScript runtime');

    const npm = getKnownTool('npm');
    expect(npm).toBeDefined();
    expect(npm!.description).toBe('Node.js package manager');
  });
});
