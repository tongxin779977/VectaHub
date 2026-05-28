import type { Command } from 'commander';
import type { InfrastructureContext } from './infrastructure/context.js';

/** Output handler interface for CLI commands. */
export interface CliOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
  text(message: string): void;
  json(payload: unknown, options?: { space?: number }): void;
  blank(): void;
}

/** Global CLI options parsed from Commander. */
export interface CliGlobalOptions {
  verbose?: boolean;
  debug?: boolean;
  nonInteractive?: boolean;
  json?: boolean;
  dryRun?: boolean;
}

/** Result of a CLI command execution. */
export interface CliCommandResult {
  success: boolean;
  exitCode: number;
  message?: string;
  data?: unknown;
}

/** Metadata for a lazy-loaded command. */
export interface LazyCommandMeta {
  name: string;
  description: string;
  argument?: string;
}

/** Binding for a command factory function. */
export interface SimpleCommandBinding {
  name: string;
  exportName: string;
  isFactory: true;
}

/** Binding for a directly exported command. */
export interface DirectCommandBinding {
  name: string;
  exportName: string;
  isFactory: false;
}

/** Binding for a multi-factory command result. */
export interface MultiFactoryBinding {
  name: string;
  resultKey: string;
}

/** Union of all command binding types. */
export type CommandBinding = SimpleCommandBinding | DirectCommandBinding;

/** Registry entry for a command module. */
export interface CommandRegistryEntry {
  modulePath: string;
  bindings: CommandBinding[];
  needsAgentRuntime?: boolean;
}

/** Registry entry for a multi-factory command module. */
export interface MultiFactoryRegistryEntry {
  modulePath: string;
  multiFactory: string;
  bindings: MultiFactoryBinding[];
  needsAgentRuntime?: boolean;
}

/** Union of all registry entry types. */
export type RegistryEntry = CommandRegistryEntry | MultiFactoryRegistryEntry;

/** Command loader function type. */
export type CommandLoader = (
  commandName: string,
  program: Command,
  ctx: InfrastructureContext,
) => Promise<void>;

/** Error handler function type. */
export type ErrorHandler = (error: unknown) => Promise<never>;

/** Signal handler function type. */
export type SignalHandler = () => Promise<void>;

/** CLI initialization options. */
export interface CliInitOptions {
  /** Whether to skip audit logger initialization. */
  skipAudit?: boolean;
  /** Whether to skip signal handler setup. */
  skipSignals?: boolean;
  /** Whether to skip process listener setup. */
  skipProcessListeners?: boolean;
  /** Custom error handler. */
  errorHandler?: ErrorHandler;
}

/** CLI execution context combining program and infrastructure. */
export interface CliExecutionContext {
  program: Command;
  ctx: InfrastructureContext;
  output: CliOutput;
}

/** Command execution status. */
export type CommandStatus = 'pending' | 'loading' | 'loaded' | 'failed';

/** Command load state tracking. */
export interface CommandLoadState {
  name: string;
  status: CommandStatus;
  error?: string;
  loadedAt?: number;
}

/** CLI module statistics. */
export interface CliModuleStats {
  totalCommands: number;
  loadedCommands: number;
  failedCommands: number;
  pendingCommands: number;
}

/** CLI cache configuration. */
export interface CliCacheConfig {
  /** Maximum number of items to cache. */
  maxSize: number;
  /** Cache TTL in milliseconds. */
  ttlMs: number;
  /** Whether to enable cache statistics. */
  enableStats?: boolean;
}

/** CLI cache statistics. */
export interface CliCacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

/** CLI event types. */
export type CliEventType =
  | 'command:start'
  | 'command:end'
  | 'command:error'
  | 'cache:hit'
  | 'cache:miss'
  | 'config:change'
  | 'plugin:load'
  | 'plugin:unload';

/** CLI event payload. */
export interface CliEvent {
  type: CliEventType;
  timestamp: number;
  data?: unknown;
  error?: Error;
}

/** CLI event listener. */
export type CliEventListener = (event: CliEvent) => void;

/** CLI plugin interface. */
export interface CliPlugin {
  /** Plugin name. */
  name: string;
  /** Plugin version. */
  version: string;
  /** Plugin description. */
  description?: string;
  /** Initialize the plugin. */
  init(ctx: InfrastructureContext): Promise<void>;
  /** Cleanup the plugin. */
  destroy?(): Promise<void>;
  /** Get plugin commands. */
  getCommands?(): Command[];
}

/** CLI plugin registry. */
export interface CliPluginRegistry {
  /** Register a plugin. */
  register(plugin: CliPlugin): void;
  /** Unregister a plugin by name. */
  unregister(name: string): void;
  /** Get a plugin by name. */
  get(name: string): CliPlugin | undefined;
  /** Get all registered plugins. */
  getAll(): CliPlugin[];
  /** Initialize all plugins. */
  initAll(ctx: InfrastructureContext): Promise<void>;
  /** Destroy all plugins. */
  destroyAll(): Promise<void>;
}

/** CLI command configuration. */
export interface CliCommandConfig {
  /** Command name. */
  name: string;
  /** Command description. */
  description: string;
  /** Command arguments. */
  args?: string[];
  /** Command options. */
  options?: CliCommandOption[];
  /** Command aliases. */
  aliases?: string[];
  /** Whether to hide the command from help. */
  hidden?: boolean;
  /** Whether the command requires agent runtime. */
  requiresAgentRuntime?: boolean;
}

/** CLI command option. */
export interface CliCommandOption {
  /** Option flags (e.g., '-v, --verbose'). */
  flags: string;
  /** Option description. */
  description: string;
  /** Default value. */
  defaultValue?: unknown;
  /** Whether the option is required. */
  required?: boolean;
  /** Option choices (for enum-like options). */
  choices?: string[];
}

/** CLI error types. */
export type CliErrorType =
  | 'command_not_found'
  | 'invalid_arguments'
  | 'permission_denied'
  | 'config_error'
  | 'plugin_error'
  | 'network_error'
  | 'timeout'
  | 'unknown';

/** CLI error with additional context. */
export interface CliError extends Error {
  /** Error type. */
  type: CliErrorType;
  /** Error code. */
  code?: string;
  /** Additional error context. */
  context?: Record<string, unknown>;
  /** Whether the error is retryable. */
  retryable?: boolean;
}

/** CLI progress indicator. */
export interface CliProgress {
  /** Current progress value. */
  current: number;
  /** Total progress value. */
  total: number;
  /** Progress message. */
  message?: string;
  /** Progress percentage. */
  percentage: number;
}

/** CLI progress reporter. */
export interface CliProgressReporter {
  /** Start progress reporting. */
  start(total: number, message?: string): void;
  /** Update progress. */
  update(current: number, message?: string): void;
  /** Finish progress reporting. */
  finish(message?: string): void;
  /** Get current progress. */
  getProgress(): CliProgress;
}

/**
 * Type guard to check if an entry uses a multi-factory pattern.
 * @param entry - The registry entry to check.
 * @returns True if the entry is a MultiFactoryRegistryEntry.
 */
export function isMultiFactoryEntry(entry: RegistryEntry): entry is MultiFactoryRegistryEntry {
  return 'multiFactory' in entry;
}

/**
 * Type guard to check if a binding is a simple factory binding.
 * @param binding - The command binding to check.
 * @returns True if the binding is a SimpleCommandBinding.
 */
export function isSimpleCommandBinding(binding: CommandBinding): binding is SimpleCommandBinding {
  return binding.isFactory === true;
}

/**
 * Type guard to check if a binding is a direct command binding.
 * @param binding - The command binding to check.
 * @returns True if the binding is a DirectCommandBinding.
 */
export function isDirectCommandBinding(binding: CommandBinding): binding is DirectCommandBinding {
  return binding.isFactory === false;
}

/**
 * Type guard to check if options contain JSON output flag.
 * @param options - The CLI options to check.
 * @returns True if JSON output is enabled.
 */
export function isJsonOutput(options: CliGlobalOptions): boolean {
  return options.json === true;
}

/**
 * Type guard to check if verbose mode is enabled.
 * @param options - The CLI options to check.
 * @returns True if verbose or debug mode is enabled.
 */
export function isVerboseMode(options: CliGlobalOptions): boolean {
  return options.verbose === true || options.debug === true;
}

/**
 * Type guard to check if an error is a CLI error.
 * @param error - The error to check.
 * @returns True if the error is a CliError.
 */
export function isCliError(error: unknown): error is CliError {
  return (
    error instanceof Error &&
    'type' in error &&
    typeof (error as CliError).type === 'string'
  );
}

/**
 * Type guard to check if a plugin implements the CliPlugin interface.
 * @param plugin - The object to check.
 * @returns True if the object is a CliPlugin.
 */
export function isCliPlugin(plugin: unknown): plugin is CliPlugin {
  return (
    typeof plugin === 'object' &&
    plugin !== null &&
    'name' in plugin &&
    'version' in plugin &&
    'init' in plugin &&
    typeof (plugin as CliPlugin).init === 'function'
  );
}

/**
 * Create a CLI error with additional context.
 * @param message - Error message.
 * @param type - Error type.
 * @param options - Additional error options.
 * @returns A CliError instance.
 */
export function createCliError(
  message: string,
  type: CliErrorType,
  options?: {
    code?: string;
    context?: Record<string, unknown>;
    retryable?: boolean;
    cause?: Error;
  },
): CliError {
  const error = new Error(message, { cause: options?.cause }) as CliError;
  error.type = type;
  error.code = options?.code;
  error.context = options?.context;
  error.retryable = options?.retryable ?? false;
  return error;
}

/**
 * Create a CLI progress reporter.
 * @param onProgress - Optional callback for progress updates.
 * @returns A CliProgressReporter instance.
 */
export function createProgressReporter(
  onProgress?: (progress: CliProgress) => void,
): CliProgressReporter {
  let current = 0;
  let total = 0;
  let message = '';

  return {
    start(totalValue: number, initialMessage?: string) {
      total = totalValue;
      current = 0;
      message = initialMessage ?? '';
      onProgress?.({ current, total, message, percentage: 0 });
    },
    update(currentValue: number, newMessage?: string) {
      current = currentValue;
      if (newMessage !== undefined) {
        message = newMessage;
      }
      const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
      onProgress?.({ current, total, message, percentage });
    },
    finish(completionMessage?: string) {
      current = total;
      if (completionMessage !== undefined) {
        message = completionMessage;
      }
      onProgress?.({ current, total, message, percentage: 100 });
    },
    getProgress() {
      const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
      return { current, total, message, percentage };
    },
  };
}
