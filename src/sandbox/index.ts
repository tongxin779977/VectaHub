export type { Detector } from './detector.js';
export { createDetector } from './detector.js';

export type { Sandbox } from './sandbox.js';
export { createSandbox, SandboxManager, createSandboxManager } from './sandbox.js';

export { createSemanticDetector } from './semantic-detector.js';
export type { SemanticDetector, SemanticDetectionResult, ThreatType } from './semantic-detector.js';

export type { SandboxOptions as WorktreeSandboxOptions, SandboxContext as WorktreeSandboxContext } from './worktree-manager.js';
export { createSandbox as createWorktreeSandbox, teardownSandbox as teardownWorktreeSandbox } from './worktree-manager.js';

// Export new modules
export type {
  IsolationStrategy,
  CommandSignature,
  SignatureValidation,
  ExecutableVerification,
  SudoStatus,
  SudoConfigResult,
  SandboxConfig,
  ExecOptions,
  ExecResult,
} from './types.js';
export {
  executeWithSandboxExec,
  executeWithUnshare,
  executeWithBubblewrap,
  executeInDirectory,
} from './isolation-strategies.js';
export {
  signCommand,
  validateCommandSignature,
  verifyCommandExecutable,
  resolveCommandPath,
  computeFileHash,
} from './command-security.js';
export { checkSudoStatus, setupSudoers } from './sudo-checker.js';
