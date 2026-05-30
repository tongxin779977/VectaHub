import { z } from 'zod';

/**
 * Zod Schema for AI Configuration
 */

// AI Provider Priority Item
const AIProviderPrioritySchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
  priority: z.number().min(0).max(100),
});

// AI Environment Scan
const AIEnvironmentScanSchema = z.object({
  enabled: z.boolean(),
  show_report: z.boolean(),
  scan_interval_ms: z.number().min(0),
});

// AI Fallback
const AIFallbackSchema = z.object({
  auto_fallback: z.boolean(),
  prompt_before_switch: z.boolean(),
  max_attempts: z.number().min(1),
  timeout_ms: z.number().min(1000),
});

// AI Built-in
const AIBuiltInAISchema = z.object({
  enabled: z.boolean(),
  model: z.string(),
  max_tokens: z.number().min(1),
});

// AI Config
const AIConfigSchema = z.object({
  environment_scan: AIEnvironmentScanSchema,
  fallback: AIFallbackSchema,
  provider_priority: z.array(AIProviderPrioritySchema),
  built_in_ai: AIBuiltInAISchema,
});

// AI Provider Config
const AIProviderConfigSchema = z.object({
  provider: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  entryCommand: z.string().optional(),
  version: z.string().optional(),
  subcommand: z.string().optional(),
  promptTransport: z.enum(['arg', 'stdin', 'file', 'positional']).optional(),
  promptArgName: z.string().optional(),
  workingDirectoryArg: z.string().optional(),
  nonInteractiveFlags: z.array(z.string()).optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  max_tokens: z.number().min(1).optional(),
  temperature: z.number().optional(),
  timeout_ms: z.number().min(1000).optional(),
  enabled: z.boolean(),
  priority: z.number().min(0).max(100).optional(),
  registeredAt: z.string().optional(),
  lastChecked: z.string().optional(),
});

// External CLI Config
const ExternalCLIConfigSchema = z.object({
  enabled: z.boolean(),
  has_permission: z.boolean(),
});

// CLI Tools Config
const CLIToolsConfigSchema = z.object({
  version: z.string(),
  registeredTools: z.array(z.string()),
  templates: z.object({
    enabled: z.array(z.string()),
  }),
});

// AI Module Config
const AIModuleConfigSchema = z.object({
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()).optional(),
});

// Sandbox Config
const SandboxConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['STRICT', 'RELAXED', 'CONSENSUS']),
  defaultPolicy: z.enum(['allow', 'block', 'passthrough']),
});

// Storage Config
const StorageConfigSchema = z.object({
  dir: z.string(),
});

// Complete Config Schema
export const ConfigSchema = z.object({
  version: z.number().default(1),
  first_run_completed: z.boolean().default(false),
  sandbox: SandboxConfigSchema,
  ai: AIConfigSchema,
  ai_providers: z.record(z.string(), AIProviderConfigSchema),
  ai_modules: z.record(z.string(), AIModuleConfigSchema),
  external_cli: z.record(z.string(), ExternalCLIConfigSchema),
  cli_tools: CLIToolsConfigSchema,
  storage: StorageConfigSchema,
  priority: z.array(z.string()),
});

// Type inference - 导出所有需要的类型
export type Config = z.infer<typeof ConfigSchema>;
export type AIConfig = Config['ai'];
export type AIProviderConfig = z.infer<typeof AIProviderConfigSchema>;
export type ExternalCLIConfig = z.infer<typeof ExternalCLIConfigSchema>;
export type CLIToolsConfig = z.infer<typeof CLIToolsConfigSchema>;
export type AIModuleConfig = z.infer<typeof AIModuleConfigSchema>;
