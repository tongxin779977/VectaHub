export * from './types.js';
export * from './registry.js';
export { gitTool } from './tools/git.js';
export { npmTool } from './tools/npm.js';

// Command Rules Engine (Section 12)
export * from './command-rules/index.js';

// Tool Discovery (Section 11)
export * from './discovery/index.js';
import { ToolScanner } from './discovery/scanner.js';

let toolScanner: ToolScanner | null = null;

export function getToolScanner(): ToolScanner {
  if (!toolScanner) {
    toolScanner = new ToolScanner();
  }
  return toolScanner;
}

// Tool Registration (Section 10)
export * from './registration/index.js';
