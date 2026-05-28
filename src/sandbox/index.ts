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

export { createResourceTracker } from './resource-tracker.js';
export type {
  ResourceType,
  ResourceRecord,
  LeakReport,
  ResourceTracker,
  ResourceTrackerStats,
} from './types.js';

export { createConfigValidator } from './config.js';
export type {
  ValidationSeverity,
  ValidationIssue,
  ConfigValidationResult,
  ConfigValidationRule,
  ConfigValidator,
} from './types.js';

export { createLifecycleManager } from './lifecycle.js';
export type {
  LifecyclePhase,
  LifecycleContext,
  LifecycleHook,
  LifecycleHookRegistration,
  LifecycleManager,
} from './types.js';

export { createValidationRuleEngine } from './validator.js';
export type {
  RuleSeverity,
  RuleAction,
  ValidationRule,
  RuleEvaluationResult,
  RuleEngineResult,
  ValidationRuleEngine,
} from './types.js';

export { createSandboxPool } from './pool-manager.js';
export type {
  SandboxPoolConfig,
  PooledSandboxStatus,
  PooledSandboxEntry,
  SandboxPoolStats,
  SandboxPool,
} from './types.js';

export { createMonitorAlertManager } from './alert-monitor.js';
export type {
  AlertSeverity,
  AlertCondition,
  AlertRule,
  AlertEvent,
  MetricSnapshot,
  MonitorAlertManager,
} from './types.js';

export { MemoryMonitor } from './memory-monitor.js';
