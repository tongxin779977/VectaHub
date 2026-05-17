import { describe, it, expect } from 'vitest';
import { convertToolCallToSteps, buildToolsFromTemplates } from './tool-calling.js';
import type { LLMToolCall } from './llm.js';

describe('buildToolsFromTemplates', () => {
  it('should return non-empty array', () => {
    const tools = buildToolsFromTemplates();
    expect(tools.length).toBeGreaterThan(0);
  });

  it('should include git_commit tool', () => {
    const tools = buildToolsFromTemplates();
    const gitCommit = tools.find(t => t.function.name === 'git_commit');
    expect(gitCommit).toBeDefined();
    expect(gitCommit!.function.description).toBeTruthy();
  });

  it('should include all 21 intent tools from templates', () => {
    const tools = buildToolsFromTemplates();
    const names = tools.map(t => t.function.name);
    expect(names).toContain('workflow_generate');
    expect(names).toContain('workflow_run');
    expect(names).toContain('doctor');
    expect(names).toContain('self_healing');
    expect(names).toContain('file_find');
    expect(names).toContain('file_read');
    expect(names).toContain('file_edit');
    expect(names).toContain('git_push');
    expect(names).toContain('git_pull');
    expect(names).toContain('git_commit');
    expect(names).toContain('git_merge');
    expect(names).toContain('git_branch');
    expect(names).toContain('ci_diagnose');
    expect(names).toContain('ci_rerun');
    expect(names).toContain('tool_discover');
    expect(names).toContain('tool_run');
    expect(names).toContain('session_list');
    expect(names).toContain('session_inspect');
    expect(names).toContain('QUERY_INFO');
    expect(names).toContain('vscode_diagnostic');
    expect(names).toContain('self_healing_run');
    expect(tools).toHaveLength(21);
  });

  it('should have valid JSON schema for each tool', () => {
    const tools = buildToolsFromTemplates();
    for (const tool of tools) {
      expect(tool.type).toBe('function');
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters).toBeDefined();
      expect(tool.function.parameters.type).toBe('object');
      expect(tool.function.parameters.properties).toBeDefined();
    }
  });

  it('should include required params in schema for git_push', () => {
    const tools = buildToolsFromTemplates();
    const gitPush = tools.find(t => t.function.name === 'git_push');
    expect(gitPush).toBeDefined();
    expect(gitPush!.function.parameters.required).toContain('remote');
    expect(gitPush!.function.parameters.required).toContain('branch');
  });
});

describe('convertToolCallToSteps', () => {
  describe('cli_ prefix tools', () => {
    it('should handle args as array', () => {
      const toolCall: LLMToolCall = {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'cli_git',
          arguments: JSON.stringify({ args: ['commit', '-m', 'fix: bug fix'] }),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].args).toEqual(['commit', '-m', 'fix: bug fix']);
    });

    it('should preserve quoted arguments in string args', () => {
      const toolCall: LLMToolCall = {
        id: 'call_2',
        type: 'function',
        function: {
          name: 'cli_git',
          arguments: JSON.stringify({ args: 'commit -m "fix: bug fix"' }),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].args).toEqual(['commit', '-m', 'fix: bug fix']);
    });

    it('should handle single quoted arguments', () => {
      const toolCall: LLMToolCall = {
        id: 'call_3',
        type: 'function',
        function: {
          name: 'cli_git',
          arguments: JSON.stringify({ args: "commit -m 'fix: bug fix'" }),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].args).toEqual(['commit', '-m', 'fix: bug fix']);
    });

    it('should handle mixed quotes and spaces', () => {
      const toolCall: LLMToolCall = {
        id: 'call_4',
        type: 'function',
        function: {
          name: 'cli_npm',
          arguments: JSON.stringify({ args: 'run build -- --option "value with spaces"' }),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].args).toEqual(['run', 'build', '--', '--option', 'value with spaces']);
    });

    it('should handle empty args', () => {
      const toolCall: LLMToolCall = {
        id: 'call_5',
        type: 'function',
        function: {
          name: 'cli_git',
          arguments: JSON.stringify({}),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].args).toEqual([]);
    });

    it('should handle args with subcommand', () => {
      const toolCall: LLMToolCall = {
        id: 'call_6',
        type: 'function',
        function: {
          name: 'cli_git_commit',
          arguments: JSON.stringify({ args: '-m "fix: bug fix"' }),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].cli).toBe('git');
      expect(result.steps[0].args).toEqual(['commit', '-m', 'fix: bug fix']);
    });

    it('should handle subcommand from params', () => {
      const toolCall: LLMToolCall = {
        id: 'call_6_1',
        type: 'function',
        function: {
          name: 'cli_git',
          arguments: JSON.stringify({ subcommand: 'checkout', args: '-b feature/x' }),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].cli).toBe('git');
      expect(result.steps[0].args).toEqual(['checkout', '-b', 'feature/x']);
    });

    it('should throw for restricted CLI tool', () => {
      const toolCall: LLMToolCall = {
        id: 'call_restricted',
        type: 'function',
        function: {
          name: 'cli_sudo',
          arguments: JSON.stringify({ subcommand: 'rm', args: '-rf /' }),
        },
      };

      expect(() => convertToolCallToSteps(toolCall)).toThrow('Restricted CLI tool "sudo" is not allowed');
    });

    it('should throw for unknown CLI tool not in safe list', () => {
      const toolCall: LLMToolCall = {
        id: 'call_unknown_cli',
        type: 'function',
        function: {
          name: 'cli_malicious',
          arguments: JSON.stringify({ subcommand: 'hack' }),
        },
      };

      expect(() => convertToolCallToSteps(toolCall)).toThrow('not in the allowed list');
    });
  });

  describe('intent templates via IntentStepMapper', () => {
    it('should generate correct step for git_commit', () => {
      const toolCall: LLMToolCall = {
        id: 'call_7',
        type: 'function',
        function: {
          name: 'git_commit',
          arguments: JSON.stringify({ message: 'fix: bug fix' }),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].cli).toBe('git');
      expect(result.steps[0].args).toContain('-m');
      expect(result.steps[0].args).toContain('fix: bug fix');
    });

    it('should generate correct step for doctor', () => {
      const toolCall: LLMToolCall = {
        id: 'call_doctor',
        type: 'function',
        function: {
          name: 'doctor',
          arguments: JSON.stringify({}),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].cli).toBe('vectahub');
      expect(result.steps[0].args).toEqual(['doctor']);
    });

    it('should generate correct step for self_healing', () => {
      const toolCall: LLMToolCall = {
        id: 'call_heal',
        type: 'function',
        function: {
          name: 'self_healing',
          arguments: JSON.stringify({}),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].cli).toBe('vectahub');
      expect(result.steps[0].args).toEqual(['self-heal']);
    });

    it('should generate correct step for file_find with glob', () => {
      const toolCall: LLMToolCall = {
        id: 'call_find',
        type: 'function',
        function: {
          name: 'file_find',
          arguments: JSON.stringify({ glob: '*.ts' }),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].cli).toBe('ls');
      expect(result.steps[0].args).toEqual(['*.ts']);
    });

    it('should generate correct step for git_push', () => {
      const toolCall: LLMToolCall = {
        id: 'call_push',
        type: 'function',
        function: {
          name: 'git_push',
          arguments: JSON.stringify({ remote: 'origin', branch: 'main' }),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].cli).toBe('git');
      expect(result.steps[0].args).toEqual(['push', 'origin', 'main']);
    });

    it('should generate correct step for workflow_generate', () => {
      const toolCall: LLMToolCall = {
        id: 'call_wf_gen',
        type: 'function',
        function: {
          name: 'workflow_generate',
          arguments: JSON.stringify({ description: 'deploy pipeline' }),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].cli).toBe('vectahub');
      expect(result.steps[0].args).toEqual(['workflow', 'generate', 'deploy pipeline']);
    });

    it('should throw for workflow_generate missing required param', () => {
      const toolCall: LLMToolCall = {
        id: 'call_wf_gen_no_desc',
        type: 'function',
        function: {
          name: 'workflow_generate',
          arguments: JSON.stringify({}),
        },
      };

      expect(() => convertToolCallToSteps(toolCall)).toThrow('Missing required parameters: description');
    });

    it('should generate correct step for workflow_run', () => {
      const toolCall: LLMToolCall = {
        id: 'call_wf_run',
        type: 'function',
        function: {
          name: 'workflow_run',
          arguments: JSON.stringify({ workflowId: 'wf-123' }),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].cli).toBe('vectahub');
      expect(result.steps[0].args).toEqual(['workflow', 'run', 'wf-123']);
    });

    it('should generate correct step for file_edit', () => {
      const toolCall: LLMToolCall = {
        id: 'call_file_edit',
        type: 'function',
        function: {
          name: 'file_edit',
          arguments: JSON.stringify({ file: '/tmp/newfile.ts' }),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].cli).toBe('cat');
      expect(result.steps[0].args).toEqual(['/tmp/newfile.ts']);
    });

    it('should generate correct step for ci_diagnose', () => {
      const toolCall: LLMToolCall = {
        id: 'call_ci_diag',
        type: 'function',
        function: {
          name: 'ci_diagnose',
          arguments: JSON.stringify({}),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].cli).toBe('vectahub');
      expect(result.steps[0].args).toEqual(['ci', 'diagnose']);
    });

    it('should generate correct step for ci_rerun', () => {
      const toolCall: LLMToolCall = {
        id: 'call_ci_rerun',
        type: 'function',
        function: {
          name: 'ci_rerun',
          arguments: JSON.stringify({ pipelineId: 'pipe-42' }),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].cli).toBe('vectahub');
      expect(result.steps[0].args).toEqual(['ci', 'rerun', 'pipe-42']);
    });

    it('should generate correct step for tool_discover', () => {
      const toolCall: LLMToolCall = {
        id: 'call_tool_disc',
        type: 'function',
        function: {
          name: 'tool_discover',
          arguments: JSON.stringify({}),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].cli).toBe('vectahub');
      expect(result.steps[0].args).toEqual(['tools', 'list']);
    });

    it('should generate correct step for session_list', () => {
      const toolCall: LLMToolCall = {
        id: 'call_sess_list',
        type: 'function',
        function: {
          name: 'session_list',
          arguments: JSON.stringify({}),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].cli).toBe('vectahub');
      expect(result.steps[0].args).toEqual(['session', 'list']);
    });

    it('should generate correct step for session_inspect', () => {
      const toolCall: LLMToolCall = {
        id: 'call_sess_inspect',
        type: 'function',
        function: {
          name: 'session_inspect',
          arguments: JSON.stringify({ sessionId: 'sess-99' }),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].cli).toBe('vectahub');
      expect(result.steps[0].args).toEqual(['session', 'inspect', 'sess-99']);
    });

    it('should generate correct step for QUERY_INFO', () => {
      const toolCall: LLMToolCall = {
        id: 'call_query_info',
        type: 'function',
        function: {
          name: 'QUERY_INFO',
          arguments: JSON.stringify({ topic: 'architecture' }),
        },
      };

      const result = convertToolCallToSteps(toolCall);
      expect(result.steps[0].cli).toBe('vectahub');
      expect(result.steps[0].args).toEqual(['info', 'architecture']);
    });

    it('should throw for unknown intent not in mapper', () => {
      const toolCall: LLMToolCall = {
        id: 'call_unknown',
        type: 'function',
        function: {
          name: 'nonexistent_intent',
          arguments: JSON.stringify({}),
        },
      };

      expect(() => convertToolCallToSteps(toolCall)).toThrow('Unknown intent');
    });
  });

  describe('error handling', () => {
    it('should throw for invalid JSON arguments', () => {
      const toolCall: LLMToolCall = {
        id: 'call_bad_json',
        type: 'function',
        function: {
          name: 'git_commit',
          arguments: 'not valid json {{{',
        },
      };

      expect(() => convertToolCallToSteps(toolCall)).toThrow('Invalid JSON in tool call arguments');
    });

    it('should throw for invalid JSON on cli_ tool', () => {
      const toolCall: LLMToolCall = {
        id: 'call_bad_json_cli',
        type: 'function',
        function: {
          name: 'cli_npm',
          arguments: '{broken',
        },
      };

      expect(() => convertToolCallToSteps(toolCall)).toThrow('Invalid JSON in tool call arguments');
    });
  });
});
