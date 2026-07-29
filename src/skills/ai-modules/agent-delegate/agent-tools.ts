import type { AgentToolDefinition } from './types.js';

export const BUILTIN_AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: 'execute_command',
    description: 'Execute a shell command',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
      },
      required: ['command'],
    },
    requiresSecurityCheck: true,
  },
  {
    name: 'read_file',
    description: 'Read file contents from disk',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The file path to read' },
      },
      required: ['path'],
    },
    requiresSecurityCheck: false,
  },
  {
    name: 'write_file',
    description: 'Write content to a file on disk',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The file path to write' },
        content: { type: 'string', description: 'The content to write' },
      },
      required: ['path', 'content'],
    },
    requiresSecurityCheck: true,
  },
  {
    name: 'search_files',
    description: 'Search for patterns in code files',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'The regex pattern to search for' },
        directory: { type: 'string', description: 'The directory to search in' },
      },
      required: ['pattern'],
    },
    requiresSecurityCheck: false,
  },
];

export function agentToolsToLLMTools(
  tools: AgentToolDefinition[],
): { type: 'function'; function: { name: string; description: string; parameters: object } }[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
