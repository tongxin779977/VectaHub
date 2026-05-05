export interface AgentLoopConfig {
  maxTurns: number;
  allowedTools: string[];
  timeout: number;
}

export interface AgentToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

export type AgentStepType = 'thinking' | 'tool_call' | 'final_answer';

export interface AgentStep {
  type: AgentStepType;
  content: string;
  toolCall?: AgentToolCall;
}

export interface DelegateStepResult {
  status: 'completed' | 'failed' | 'exceeded_max_turns';
  output: string;
  toolCalls: AgentToolCall[];
  duration: number;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresSecurityCheck: boolean;
}
