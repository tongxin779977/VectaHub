import type { SandboxMode, CommandDetection } from '../types/index.js';
import type { DefaultPolicy } from '../command-rules/types.js';

export type { SandboxMode };

/** @see SandboxConfig */
export interface SandboxConfig {
  root: string;
  workspace: string;
  tempDir: string;
  cacheDir: string;
  mode: SandboxMode;
  maxMemoryMB: number;
  timeoutMs: number;
  allowedEnvVars: string[];
  namespaceIsolation: boolean;
  defaultPolicy?: DefaultPolicy;
  protectedDirs?: string[];
}

/** @see ExecOptions */
export interface ExecOptions {
  mode?: SandboxMode;
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  sessionId?: string;
  onConfirm?: () => Promise<boolean>;
  confirmationPrompt?: string;
  useNamespace?: boolean;
  networkIsolation?: boolean;
}

/** @see ExecResult */
export interface ExecResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  mode: SandboxMode;
  sandboxed: boolean;
  command: string;
  detection?: CommandDetection;
  namespaceUsed?: boolean;
}

export type IsolationStrategy = 'sandbox-exec' | 'unshare' | 'bubblewrap' | 'directory';

export interface CommandSignature {
  signature: string;
  algorithm: string;
  timestamp: number;
}

export interface SignatureValidation {
  valid: boolean;
  message: string;
}

export interface SudoStatus {
  hasSudo: boolean;
  bwrapAllowed: boolean;
  unshareAllowed: boolean;
  message?: string;
}

export interface ExecutableVerification {
  verified: boolean;
  hash?: string;
  message: string;
}

export interface SudoConfigResult {
  success: boolean;
  message: string;
}

// ─── Resource Tracker Types ───

/** 资源类型标识 */
export type ResourceType = 'file_handle' | 'child_process' | 'temp_file' | 'temp_dir' | 'stream' | 'timer';

/** 资源状态 */
export type ResourceStatus = 'active' | 'released' | 'leaked';

/** 单个被追踪资源的记录 */
export interface ResourceRecord {
  id: string;
  type: ResourceType;
  description: string;
  createdAt: number;
  releasedAt?: number;
  status: ResourceStatus;
  metadata?: Record<string, unknown>;
}

/** 资源泄漏检测报告 */
export interface LeakReport {
  leakedResources: ResourceRecord[];
  totalTracked: number;
  totalReleased: number;
  totalLeaked: number;
  generatedAt: number;
}

/** 资源追踪器公共接口 */
export interface ResourceTracker {
  track(type: ResourceType, description: string, metadata?: Record<string, unknown>): string;
  release(id: string): boolean;
  getActiveResources(): ResourceRecord[];
  detectLeaks(maxAgeMs?: number): LeakReport;
  cleanup(): number;
  getStats(): ResourceTrackerStats;
}

/** 资源追踪统计信息 */
export interface ResourceTrackerStats {
  totalTracked: number;
  active: number;
  released: number;
  leaked: number;
  byType: Record<ResourceType, number>;
}

// ─── Config Validation Types ───

/** 验证严重级别 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/** 单条验证结果 */
export interface ValidationIssue {
  field: string;
  message: string;
  severity: ValidationSeverity;
  value?: unknown;
  expected?: string;
}

/** 配置验证结果 */
export interface ConfigValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  validatedAt: number;
}

/** 配置验证规则定义 */
export interface ConfigValidationRule {
  field: string;
  validate: (value: unknown, config: SandboxConfig) => ValidationIssue | null;
}

/** 配置验证器公共接口 */
export interface ConfigValidator {
  validate(config: Partial<SandboxConfig>): ConfigValidationResult;
  addRule(rule: ConfigValidationRule): void;
  removeRule(field: string): void;
  getRules(): ConfigValidationRule[];
}

// ─── Lifecycle Types ───

/** 生命周期阶段 */
export type LifecyclePhase = 'init' | 'beforeExec' | 'afterExec' | 'onError' | 'onCleanup' | 'destroy';

/** 生命周期事件上下文 */
export interface LifecycleContext {
  phase: LifecyclePhase;
  sessionId: string;
  command?: string;
  args?: string[];
  options?: ExecOptions;
  result?: ExecResult;
  error?: Error;
  timestamp: number;
  metadata: Record<string, unknown>;
}

/** 生命周期钩子函数类型 */
export type LifecycleHook = (context: LifecycleContext) => void | Promise<void>;

/** 生命周期钩子注册信息 */
export interface LifecycleHookRegistration {
  id: string;
  phase: LifecyclePhase;
  hook: LifecycleHook;
  priority: number;
  once: boolean;
}

/** 生命周期管理器公共接口 */
export interface LifecycleManager {
  on(phase: LifecyclePhase, hook: LifecycleHook, priority?: number): string;
  once(phase: LifecyclePhase, hook: LifecycleHook, priority?: number): string;
  off(id: string): boolean;
  emit(phase: LifecyclePhase, context: Omit<LifecycleContext, 'phase' | 'timestamp'>): Promise<void>;
  clear(): void;
  getHooks(phase: LifecyclePhase): LifecycleHookRegistration[];
}

// ─── Validation Rule Engine Types ───

/** 验证规则严重级别 */
export type RuleSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** 验证规则动作 */
export type RuleAction = 'block' | 'warn' | 'log' | 'allow';

/** 单条验证规则 */
export interface ValidationRule {
  id: string;
  name: string;
  description: string;
  severity: RuleSeverity;
  action: RuleAction;
  condition: (input: string, context?: Record<string, unknown>) => boolean;
  enabled: boolean;
}

/** 规则评估结果 */
export interface RuleEvaluationResult {
  matched: boolean;
  rule?: ValidationRule;
  action: RuleAction;
  message: string;
  matchedAt: number;
}

/** 规则引擎评估汇总 */
export interface RuleEngineResult {
  blocked: boolean;
  results: RuleEvaluationResult[];
  finalAction: RuleAction;
  evaluatedAt: number;
}

/** 验证规则引擎公共接口 */
export interface ValidationRuleEngine {
  addRule(rule: ValidationRule): void;
  removeRule(id: string): boolean;
  enableRule(id: string): boolean;
  disableRule(id: string): boolean;
  evaluate(input: string, context?: Record<string, unknown>): RuleEngineResult;
  getRules(): ValidationRule[];
  clearRules(): void;
}

// ─── Sandbox Pool Types ───

/** 沙箱池配置 */
export interface SandboxPoolConfig {
  minSize: number;
  maxSize: number;
  idleTimeoutMs: number;
  maxReuseCount: number;
  warmupEnabled: boolean;
}

/** 池中沙箱实例的状态 */
export type PooledSandboxStatus = 'idle' | 'active' | 'draining' | 'disposed';

/** 池化沙箱实例记录 */
export interface PooledSandboxEntry {
  id: string;
  status: PooledSandboxStatus;
  createdAt: number;
  lastUsedAt: number;
  reuseCount: number;
  currentSessionId?: string;
}

/** 沙箱池统计信息 */
export interface SandboxPoolStats {
  total: number;
  idle: number;
  active: number;
  waiting: number;
  totalAcquired: number;
  totalReleased: number;
  totalCreated: number;
  totalDestroyed: number;
  averageReuseCount: number;
}

/** 沙箱池公共接口 */
export interface SandboxPool {
  acquire(sessionId: string): Promise<PooledSandboxEntry>;
  release(id: string): void;
  drain(): Promise<void>;
  resize(minSize: number, maxSize: number): void;
  getStats(): SandboxPoolStats;
  getEntries(): PooledSandboxEntry[];
  destroy(): Promise<void>;
}

// ─── Monitor Alert Types ───

/** 告警级别 */
export type AlertSeverity = 'critical' | 'warning' | 'info';

/** 告警规则条件 */
export interface AlertCondition {
  metric: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  threshold: number;
  durationMs?: number;
}

/** 告警规则 */
export interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  condition: AlertCondition;
  enabled: boolean;
  cooldownMs: number;
  action?: (alert: AlertEvent) => void | Promise<void>;
}

/** 告警事件 */
export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  message: string;
  metric: string;
  currentValue: number;
  threshold: number;
  triggeredAt: number;
  resolvedAt?: number;
}

/** 监控指标快照 */
export interface MetricSnapshot {
  memoryUsageMB: number;
  memoryPercentage: number;
  activeResources: number;
  activeSandboxes: number;
  timestamp: number;
}

/** 监控告警器公共接口 */
export interface MonitorAlertManager {
  addRule(rule: AlertRule): void;
  removeRule(id: string): boolean;
  enableRule(id: string): boolean;
  disableRule(id: string): boolean;
  evaluate(metrics: MetricSnapshot): AlertEvent[];
  getActiveAlerts(): AlertEvent[];
  resolveAlert(alertId: string): boolean;
  getRules(): AlertRule[];
  clearAlerts(): void;
}
