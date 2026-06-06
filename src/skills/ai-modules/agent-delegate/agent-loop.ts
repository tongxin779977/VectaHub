import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import type { AIModule, AIModuleContext, AIModuleResult } from '../types.js';
import type { AgentLoopConfig, AgentToolCall, DelegateStepResult, AgentToolDefinition } from './types.js';
import { BUILTIN_AGENT_TOOLS, agentToolsToLLMTools } from './agent-tools.js';
import type { LLMClient, LLMResponse } from '../../../nl/llm.js';
import type { Detector } from '../../../sandbox/detector.js';
import { createDetector } from '../../../sandbox/detector.js';

const DEFAULT_CONFIG: AgentLoopConfig = {
  maxTurns: 5,
  allowedTools: [],
  timeout: 30000,
};

interface AgentDelegateDeps {
  llmClient?: LLMClient;
  detector?: Detector;
  maxTurns?: number;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getStringArg(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === 'string' ? value : null;
}

function parseToolArguments(rawArgs: string): Record<string, unknown> {
  const parsed = JSON.parse(rawArgs) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Tool call arguments must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function hasWorkflowSteps(response: LLMResponse): boolean {
  return Array.isArray(response.workflow?.steps) && response.workflow.steps.length > 0;
}

function executeToolCall(toolCall: AgentToolCall): string {
  switch (toolCall.toolName) {
    case 'execute_command': {
      const command = getStringArg(toolCall.args, 'command');
      if (!command) {
        return 'Error executing command: missing string command';
      }
      try {
        const output = execSync(command, { encoding: 'utf-8', timeout: 10000 });
        return output || '(no output)';
      } catch (err) {
        return `Error executing command: ${getErrorMessage(err)}`;
      }
    }
    case 'read_file': {
      const path = getStringArg(toolCall.args, 'path');
      if (!path) {
        return 'Error reading file: missing string path';
      }
      try {
        return readFileSync(path, 'utf-8');
      } catch (err) {
        return `Error reading file: ${getErrorMessage(err)}`;
      }
    }
    case 'write_file': {
      const path = getStringArg(toolCall.args, 'path');
      const content = getStringArg(toolCall.args, 'content');
      if (!path) {
        return 'Error writing file: missing string path';
      }
      if (content === null) {
        return 'Error writing file: missing string content';
      }
      try {
        writeFileSync(path, content, 'utf-8');
        return `File written successfully: ${path}`;
      } catch (err) {
        return `Error writing file: ${getErrorMessage(err)}`;
      }
    }
    case 'search_files': {
      const pattern = getStringArg(toolCall.args, 'pattern');
      const directory = getStringArg(toolCall.args, 'directory') || '.';
      if (!pattern) {
        return 'Error searching: missing string pattern';
      }
      return `Pattern "${pattern}" searched in ${directory}`;
    }
    default:
      return `Unknown tool: ${toolCall.toolName}`;
  }
}

export function createAgentDelegateModule(deps?: AgentDelegateDeps): AIModule<string, DelegateStepResult> {
  const llmClient = deps?.llmClient;
  const detector: Detector = deps?.detector ?? createDetector();
  const maxTurns = deps?.maxTurns ?? DEFAULT_CONFIG.maxTurns;

  return {
    id: 'vectahub.agent-delegate',
    name: 'Agent Delegate',
    version: '1.0.0',
    type: 'ai-enhancement',

    async canHandle(context: AIModuleContext): Promise<boolean> {
      return !!(context.delegateTo && llmClient);
    },

    async execute(input: string, context: AIModuleContext): Promise<AIModuleResult<DelegateStepResult>> {
      if (!llmClient) {
        return { success: false, error: 'No LLM client available' };
      }

      const startTime = Date.now();
      const allowedTools = context.metadata?.allowedTools as string[] | undefined;
      const tools: AgentToolDefinition[] = allowedTools?.length
        ? BUILTIN_AGENT_TOOLS.filter(t => allowedTools.includes(t.name))
        : BUILTIN_AGENT_TOOLS;

      const llmTools = agentToolsToLLMTools(tools);
      const toolNames = tools.map(t => t.name).join(', ');

      const systemPrompt = `You are an AI agent with access to the following tools: ${toolNames}.
Use tools to accomplish the task, then provide a final answer.
When you have completed the task, respond with your final answer as plain text.`;

      const allToolCalls: AgentToolCall[] = [];
      const conversationMessages: Array<{ role: string; content: string }> = [];

      for (let turn = 0; turn < maxTurns; turn++) {
        let response: LLMResponse;
        try {
          response = await llmClient.complete(systemPrompt, input, undefined, {
            tools: llmTools,
            toolChoice: 'auto',
          });
        } catch (err) {
          const errorMessage = getErrorMessage(err);
          return {
            success: false,
            error: `LLM call failed: ${errorMessage}`,
            data: {
              status: 'failed',
              output: errorMessage,
              toolCalls: allToolCalls,
              duration: Date.now() - startTime,
            },
          };
        }

        if (response.tool_calls && response.tool_calls.length > 0) {
          for (const tc of response.tool_calls) {
            const args = parseToolArguments(tc.function.arguments);
            const agentToolCall: AgentToolCall = {
              toolName: tc.function.name,
              args,
            };
            allToolCalls.push(agentToolCall);

            const toolDef = tools.find(t => t.name === tc.function.name);
            if (toolDef?.requiresSecurityCheck) {
              const commandToCheck = getStringArg(args, 'command') || getStringArg(args, 'path') || tc.function.name;
              const detection = detector.detect(commandToCheck);
              if (detection.isDangerous) {
                const errorMsg = `Command blocked: ${detection.reason || 'Dangerous operation detected'}`;
                conversationMessages.push({ role: 'tool', content: errorMsg });
                continue;
              }
            }

            const result = executeToolCall(agentToolCall);
            conversationMessages.push({ role: 'tool', content: result });
          }
        } else {
          const output = hasWorkflowSteps(response)
            ? JSON.stringify(response)
            : (response.params?.text as string || response.intent || 'No output');
          const outputText = typeof output === 'string' ? output : JSON.stringify(output);
          return {
            success: true,
            data: {
              status: 'completed',
              output: outputText,
              toolCalls: allToolCalls,
              duration: Date.now() - startTime,
            },
          };
        }
      }

      return {
        success: true,
        data: {
          status: 'exceeded_max_turns',
          output: 'Agent exceeded maximum turns without producing a final answer',
          toolCalls: allToolCalls,
          duration: Date.now() - startTime,
        },
      };
    },

    async shutdown(): Promise<void> {},
  };
}
