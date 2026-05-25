import { INTENT_TEMPLATES } from './templates/index.js';
import type { LLMTool, LLMToolCall } from './llm.js';
import { getAgentRegistry } from '../agent-runtime/registry.js';
import type { Step } from '../types/index.js';
import type { ToolInfo } from './types/command.js';
import type { CommandDiscovery } from './discovery/command-discovery.js';
import { createIntentStepMapper, type IntentStepMapping } from './intent-step-mapping.js';

const LLM_SAFE_TOOLS = new Set(['git', 'npm', 'node', 'yarn', 'npx', 'echo', 'ls']);
const LLM_RESTRICTED_TOOLS = new Set(['curl', 'docker', 'rm', 'sudo', 'wget']);
const CLI_CACHE_TTL_MS = 5 * 60 * 1000;

function parseArgs(args: unknown): string[] {
  if (Array.isArray(args)) {
    return args.map(String);
  }

  if (typeof args !== 'string' || args.trim() === '') {
    return [];
  }

  const result: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < args.length; i++) {
    const char = args[i];

    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuote) {
      inQuote = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuote) {
      if (current.trim()) {
        result.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

export const EXTRA_INTENT_MAPPINGS: Record<string, IntentStepMapping> = {
  doctor: {
    type: 'exec',
    cli: 'vectahub',
    args: ['doctor'],
  },
  self_healing: {
    type: 'exec',
    cli: 'vectahub',
    args: ['self-heal'],
  },
  file_find: {
    type: 'exec',
    cli: 'ls',
    args: ['{{glob}}'],
    required: ['glob'],
  },
  file_read: {
    type: 'exec',
    cli: 'cat',
    args: ['{{file}}'],
    required: ['file'],
  },
  workflow_generate: {
    type: 'exec',
    cli: 'vectahub',
    args: ['workflow', 'generate', '{{description}}'],
    required: ['description'],
  },
  workflow_run: {
    type: 'exec',
    cli: 'vectahub',
    args: ['workflow', 'run', '{{workflowId}}'],
    required: ['workflowId'],
  },
  file_edit: {
    type: 'exec',
    cli: 'cat',
    args: ['{{file}}'],
    required: ['file'],
  },
  ci_diagnose: {
    type: 'exec',
    cli: 'vectahub',
    args: ['ci', 'diagnose'],
  },
  ci_rerun: {
    type: 'exec',
    cli: 'vectahub',
    args: ['ci', 'rerun', '{{pipelineId}}'],
    required: ['pipelineId'],
  },
  tool_discover: {
    type: 'exec',
    cli: 'vectahub',
    args: ['tools', 'list'],
  },
  session_list: {
    type: 'exec',
    cli: 'vectahub',
    args: ['session', 'list'],
  },
  session_inspect: {
    type: 'exec',
    cli: 'vectahub',
    args: ['session', 'inspect', '{{sessionId}}'],
    required: ['sessionId'],
  },
  QUERY_INFO: {
    type: 'exec',
    cli: 'vectahub',
    args: ['info', '{{topic}}'],
    required: ['topic'],
  },
  vscode_diagnostic: {
    type: 'exec',
    cli: 'vectahub',
    args: ['vscode', 'diagnostic', '--json'],
  },
  self_healing_run: {
    type: 'exec',
    cli: 'vectahub',
    args: ['self-heal', 'run'],
  },
  git_push: {
    type: 'exec',
    cli: 'git',
    args: ['push', '{{remote}}', '{{branch}}'],
    required: ['remote', 'branch'],
  },
  git_pull: {
    type: 'exec',
    cli: 'git',
    args: ['pull', '{{remote}}', '{{branch}}'],
    required: ['remote', 'branch'],
  },
  tool_run: {
    type: 'exec',
    cli: 'vectahub',
    args: ['tool', 'run', '{{toolName}}'],
    required: ['toolName'],
  },
};

const defaultIntentStepMapper = createIntentStepMapper(EXTRA_INTENT_MAPPINGS);

interface CLIToolCache {
  tools: LLMTool[];
  lastRefreshed: Date;
  ttlMs: number;
}

let cliToolCache: CLIToolCache | null = null;

export function buildToolsFromTemplates(): LLMTool[] {
  return INTENT_TEMPLATES.map(template => {
    const toolName = template.name ?? template.intent;
    const toolDescription = template.description ?? template.examples.join('; ');

    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    if (template.params) {
      for (const param of template.params) {
        properties[param.name] = {
          type: 'string',
          description: param.description,
        };
        if (param.required) {
          required.push(param.name);
        }
      }
    }

    if (template.requiredParams) {
      for (const rp of template.requiredParams) {
        if (!required.includes(rp)) {
          required.push(rp);
        }
      }
    }

    return {
      type: 'function' as const,
      function: {
        name: toolName,
        description: toolDescription,
        parameters: {
          type: 'object',
          properties,
          required,
        },
      },
    };
  });
}

export function convertToolInfoToLLMTools(info: ToolInfo): LLMTool[] {
  if (!LLM_SAFE_TOOLS.has(info.name)) return [];

  const tools: LLMTool[] = [];

  tools.push({
    type: 'function',
    function: {
      name: `cli_${info.name}`,
      description: `Run ${info.name} CLI tool (v${info.version})`,
      parameters: {
        type: 'object',
        properties: {
          subcommand: {
            type: 'string',
            description: `Subcommand to run (e.g. ${info.commands.slice(0, 3).map(c => c.name).join(', ')})`,
          },
          args: {
            type: 'string',
            description: 'Additional arguments',
          },
        },
        required: [],
      },
    },
  });

  for (const cmd of info.commands.slice(0, 10)) {
    tools.push({
      type: 'function',
      function: {
        name: `cli_${info.name}_${cmd.name}`,
        description: cmd.description || `Run ${info.name} ${cmd.name}`,
        parameters: {
          type: 'object',
          properties: {
            args: {
              type: 'string',
              description: `Arguments for ${info.name} ${cmd.name}`,
            },
          },
          required: [],
        },
      },
    });
  }

  return tools;
}

export async function refreshCLITools(discovery: CommandDiscovery): Promise<LLMTool[]> {
  const allowedTools = [...LLM_SAFE_TOOLS];
  const toolInfos = await discovery.scanTools(allowedTools);
  const tools = toolInfos.flatMap(info => convertToolInfoToLLMTools(info));
  cliToolCache = {
    tools,
    lastRefreshed: new Date(),
    ttlMs: CLI_CACHE_TTL_MS,
  };
  return tools;
}

export function getDiscoveredCLITools(): LLMTool[] {
  if (!cliToolCache) return [];
  const age = Date.now() - cliToolCache.lastRefreshed.getTime();
  if (age > cliToolCache.ttlMs) return [];
  return cliToolCache.tools;
}

export function buildAgentToolsFromRegistry(): LLMTool[] {
  let registry;
  try {
    registry = getAgentRegistry();
  } catch {
    return [];
  }
  if (!registry) return [];
  const descriptors = registry.getAllDescriptors();
  return descriptors.map(desc => {
    const habitsDesc = desc.usageHabits ? ` 使用习惯/偏好：${desc.usageHabits}` : '';
    const description = `${desc.description || `调用 ${desc.displayName} 来执行对应的任务。`}${habitsDesc}`;
    return {
      type: 'function' as const,
      function: {
        name: `run_agent_${desc.id}`,
        description,
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: `传递给 ${desc.displayName} 的具体任务开发指示与上下文`,
            },
            files: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: `本次任务中 ${desc.displayName} 需要读取或修改的工程文件相对路径列表 (若该 Agent 习惯接收文件)`,
            },
          },
          required: ['prompt'],
        },
      },
    };
  });
}

export function buildAllTools(domains?: string[]): LLMTool[] {
  if (domains !== undefined && domains.length === 0) {
    return [];
  }

  const intentTools = buildToolsFromTemplates();
  const cliTools = getDiscoveredCLITools();
  const agentTools = buildAgentToolsFromRegistry();

  const allTools = [...intentTools, ...cliTools, ...agentTools];

  if (domains && domains.length > 0) {
    return allTools.filter(tool => {
      const name = tool.function.name.toLowerCase();
      return domains.some(domain => {
        const d = domain.toLowerCase();
        return name.includes(d) || name.startsWith('run_agent_');
      });
    });
  }

  return allTools;
}

export function convertToolCallToSteps(toolCall: LLMToolCall): { intent: string; params: Record<string, unknown>; steps: Step[] } {
  const intentName = toolCall.function.name;

  let params: Record<string, unknown>;
  try {
    params = JSON.parse(toolCall.function.arguments);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid JSON in tool call arguments for "${intentName}": ${errorMessage}`,
      { cause: error }
    );
  }

  if (intentName.startsWith('run_agent_')) {
    const agentId = intentName.replace('run_agent_', '');
    const prompt = String(params.prompt || '');
    const files = Array.isArray(params.files) ? params.files.map(String) : [];

    const registry = getAgentRegistry();
    const descriptor = registry.getAgentDescriptor(agentId);
    const adapter = registry.getAgentAdapter(agentId);

    if (!descriptor || !adapter) {
      throw new Error(`Unknown agent: "${agentId}"`);
    }

    const rendered = adapter.render({
      descriptor,
      workspaceRoot: process.cwd(),
      taskPrompt: prompt,
      mode: 'run',
      outputMode: 'text',
    });

    const finalArgs = [...rendered.args, ...files];

    return {
      intent: intentName,
      params,
      steps: [{
        id: `step_run_agent_${agentId}`,
        type: 'exec' as const,
        cli: rendered.command,
        args: finalArgs,
      }],
    };
  }

  if (intentName.startsWith('cli_')) {
    const parts = intentName.replace('cli_', '').split('_');
    const toolName = parts[0];

    if (LLM_RESTRICTED_TOOLS.has(toolName)) {
      throw new Error(`Restricted CLI tool "${toolName}" is not allowed`);
    }

    if (!LLM_SAFE_TOOLS.has(toolName)) {
      throw new Error(`Unknown CLI tool "${toolName}" is not in the allowed list`);
    }

    const subcommandArgs = parts.length > 1
      ? parts.slice(1).filter(Boolean)
      : parseArgs(params.subcommand);
    const args = parseArgs(params.args);

    return {
      intent: intentName,
      params,
      steps: [{
        id: 'step_1',
        type: 'exec' as const,
        cli: toolName,
        args: [...subcommandArgs, ...args],
      }],
    };
  }

  const step = defaultIntentStepMapper.toStep(intentName, params);
  return {
    intent: intentName,
    params,
    steps: [step],
  };
}
