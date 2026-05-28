/**
 * Chat REPL 模块共享类型定义。
 * @module chat/types
 */
import type { ChatConfig } from './config.js';
import type { Workflow } from '../types/index.js';
import type { NLProcessor } from '../nl/core/types.js';
import type { SessionManager } from '../nl/session-manager.js';
import type { LLMConfig } from '../nl/llm.js';
import type { WorkflowEngine } from '../workflow/engine.js';
import type { CommandBridge } from './command-bridge.js';
import type { ParamExtractor } from '../nl/param-extractor.js';
import type { ContextBuilderResult } from './context-builder.js';
import type { CommandExecutor } from '../nl/executor/command-executor.js';
import type { AuditHelper } from '../infrastructure/audit/index.js';
import type pino from 'pino';

export type { UIRenderer } from './ui-renderer.js';

/** 聊天输入类型分类 */
export type ChatInputType = 'nl' | 'shell' | 'slash-command';

/**
 * 经过解析的聊天输入。
 * 由 `CommandManager.parseInput` 产生。
 */
export interface ChatInput {
  /** 输入类型：自然语言 / Shell 命令 / 斜杠命令 */
  type: ChatInputType;
  /** 原始输入文本 */
  raw: string;
  /** 解析后的文本（去掉前缀） */
  parsed: string;
  /** 斜杠命令的参数列表 */
  args?: string[];
}

/** 聊天输出类型分类 */
export type ChatOutputType = 'text' | 'workflow' | 'error' | 'command-result';

/**
 * 结构化的聊天输出。
 * REPL 中所有输出均通过此接口统一传递。
 */
export interface ChatOutput {
  /** 输出类型 */
  type: ChatOutputType;
  /** 输出内容 */
  content: string;
  /** 可选的输出元数据 */
  metadata?: {
    /** 是否要求退出 REPL */
    exit?: boolean;
    /** 工作流执行 ID */
    executionId?: string;
    /** 执行状态 */
    status?: string;
    /** 执行耗时（ms） */
    duration?: number;
    /** Shell 命令退出码 */
    exitCode?: number;
    /** Shell 命令 stderr 输出 */
    stderr?: string;
    /** 匹配到的意图 */
    intent?: string;
    /** 意图匹配置信度 */
    confidence?: number;
    /** NL 处理路径 */
    path?: string;
  };
}

/**
 * 斜杠命令执行上下文。
 * 传递给每个斜杠命令的 handler。
 */
export interface SlashCommandContext {
  /** 当前会话 ID */
  sessionId: string;
  /** 会话管理器（可选） */
  sessionManager?: SessionManager;
  /** 聊天配置 */
  config: ChatConfig;
}

/**
 * 斜杠命令定义。
 */
export interface SlashCommand {
  /** 命令名称（不含 `/` 前缀） */
  name: string;
  /** 命令描述 */
  description: string;
  /** 命令处理器 */
  handler: (args: string[], context: SlashCommandContext) => Promise<string | '__EXIT__' | '__EXECUTE__' | '__STATUS__'>;
}

/**
 * 待执行的工作流及其元信息。
 */
export interface PendingWorkflow {
  /** 工作流实例 */
  workflow: Workflow;
  /** 原始 YAML 文本 */
  yaml: string;
  /** 触发意图 */
  intent?: string;
  /** 意图匹配置信度 */
  confidence?: number;
  /** 创建时间 */
  createdAt: Date;
  /** 提取的参数 */
  params?: Record<string, unknown>;
}

/**
 * REPL 依赖注入接口。
 * 将所有外部依赖显式声明，支持测试时完整替换。
 */
export interface ReplDeps {
  /** NL 处理器 */
  nlProcessor: NLProcessor;
  /** 上下文构建器 */
  contextBuilder: { buildContext(sessionId?: string): Promise<ContextBuilderResult> };
  /** 会话管理器（可选） */
  sessionManager?: SessionManager;
  /** 是否启用 LLM */
  useLLM: boolean;
  /** LLM 配置（可选） */
  llmConfig?: LLMConfig | null;
  /** 审计助手 */
  auditHelper: AuditHelper;
  /** 工作流引擎（可选） */
  workflowEngine?: WorkflowEngine;
  /** 命令执行器（可选） */
  commandExecutor?: CommandExecutor;
  /** 命令桥接器 */
  commandBridge: CommandBridge;
  /** 参数提取器 */
  paramExtractor: ParamExtractor;
  /** 聊天配置 */
  config: ChatConfig;
  /** 日志实例 */
  logger: pino.Logger;
}

/**
 * @deprecated 使用 `ReplDeps` 代替。此别名仅为向后兼容保留。
 */
export type REPLDeps = ReplDeps;

/**
 * REPL 实例接口。
 */
export interface Repl {
  /** 启动 REPL 交互循环 */
  start: () => Promise<void>;
  /** 处理单条输入 */
  processInput: (input: string) => Promise<ChatOutput>;
  /** 获取所有已注册的斜杠命令 */
  getSlashCommands: () => Map<string, SlashCommand>;
}
