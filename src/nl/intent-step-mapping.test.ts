import { describe, it, expect, beforeEach } from 'vitest';
import { createIntentStepMapper } from './intent-step-mapping.js';
import type { IntentStepMapper } from './intent-step-mapping.js';

describe('IntentStepMapper', () => {
  let mapper: IntentStepMapper;

  beforeEach(() => {
    mapper = createIntentStepMapper();
  });

  describe('git_commit', () => {
    it('should generate correct step with message', () => {
      const step = mapper.toStep('git_commit', { message: 'fix bug' });
      expect(step.type).toBe('exec');
      expect(step.cli).toBe('git');
      expect(step.args).toEqual(['commit', '-m', 'fix bug']);
    });

    it('should throw when message is missing', () => {
      expect(() => mapper.toStep('git_commit', {})).toThrow('Missing required parameters: message');
    });
  });

  describe('git_push', () => {
    it('should generate correct step with remote and branch', () => {
      const step = mapper.toStep('git_push', { remote: 'origin', branch: 'main' });
      expect(step.type).toBe('exec');
      expect(step.cli).toBe('git');
      expect(step.args).toEqual(['push', 'origin', 'main']);
    });

    it('should throw when remote is missing', () => {
      expect(() => mapper.toStep('git_push', { branch: 'main' })).toThrow('Missing required parameters: remote');
    });

    it('should throw when branch is missing', () => {
      expect(() => mapper.toStep('git_push', { remote: 'origin' })).toThrow('Missing required parameters: branch');
    });

    it('should throw when both are missing', () => {
      expect(() => mapper.toStep('git_push', {})).toThrow('Missing required parameters: remote, branch');
    });
  });

  describe('git_pull', () => {
    it('should generate correct step', () => {
      const step = mapper.toStep('git_pull', { remote: 'origin', branch: 'develop' });
      expect(step.cli).toBe('git');
      expect(step.args).toEqual(['pull', 'origin', 'develop']);
    });
  });

  describe('git_branch', () => {
    it('should generate correct step', () => {
      const step = mapper.toStep('git_branch', { branch: 'feature/new' });
      expect(step.cli).toBe('git');
      expect(step.args).toEqual(['branch', 'feature/new']);
    });

    it('should throw when branch is missing', () => {
      expect(() => mapper.toStep('git_branch', {})).toThrow('Missing required parameters: branch');
    });
  });

  describe('git_merge', () => {
    it('should generate correct step', () => {
      const step = mapper.toStep('git_merge', { branch: 'feature/auth' });
      expect(step.cli).toBe('git');
      expect(step.args).toEqual(['merge', 'feature/auth']);
    });

    it('should throw when branch is missing', () => {
      expect(() => mapper.toStep('git_merge', {})).toThrow('Missing required parameters: branch');
    });
  });

  describe('tool_run', () => {
    it('should generate correct step with toolName and args', () => {
      const step = mapper.toStep('tool_run', { toolName: 'npm', args: 'test --coverage' });
      expect(step.cli).toBe('npm');
      expect(step.args).toEqual(['test --coverage']);
    });

    it('should throw when toolName is missing', () => {
      expect(() => mapper.toStep('tool_run', { args: 'test' })).toThrow('Missing required parameters: toolName');
    });

    // BUG-2 [implementation gap]: Conversion 层做基础 allowlist 过滤，完整安全校验（危险命令检测、沙箱隔离）由 Execution 层统一执行。
    it('currently rejects unauthorized CLI at conversion layer (basic allowlist)', () => {
      expect(() => mapper.toStep('tool_run', { toolName: 'malicious' })).toThrow('CLI "malicious" is not in the allowed list');
    });
  });

  describe('unknown intent', () => {
    it('should throw for unknown intent', () => {
      expect(() => mapper.toStep('unknown_intent', {})).toThrow('Unknown intent: "unknown_intent". No mapping found.');
    });

    // BUG-2 [implementation gap]: 未知 intent 拒绝在 Conversion 层执行；命令级安全拦截由 Execution 层负责。
    it('currently rejects unknown intent at conversion layer (no CLI fallback)', () => {
      expect(() => mapper.toStep('rm -rf /', {})).toThrow('Unknown intent');
    });
  });

  describe('parameter template rendering', () => {
    it('should keep message with spaces as single arg element', () => {
      const step = mapper.toStep('git_commit', { message: 'fix: resolve login bug' });
      expect(step.args).toEqual(['commit', '-m', 'fix: resolve login bug']);
      expect(step.args).toHaveLength(3);
    });

    it('should keep message with multiple spaces as single arg', () => {
      const step = mapper.toStep('git_commit', { message: 'fix login  bug  properly' });
      expect(step.args).toEqual(['commit', '-m', 'fix login  bug  properly']);
    });

    it('should handle special characters in message', () => {
      const step = mapper.toStep('git_commit', { message: 'feat(auth): add OAuth2 support [JIRA-123]' });
      expect(step.args).toEqual(['commit', '-m', 'feat(auth): add OAuth2 support [JIRA-123]']);
    });
  });

  describe('stepId', () => {
    it('should use provided stepId', () => {
      const step = mapper.toStep('git_commit', { message: 'test' }, 'custom_step_id');
      expect(step.id).toBe('custom_step_id');
    });

    it('should generate default stepId based on intent', () => {
      const step = mapper.toStep('git_commit', { message: 'test' });
      expect(step.id).toBe('step_git_commit');
    });
  });

  describe('hasIntent', () => {
    it('should return true for known intents', () => {
      expect(mapper.hasIntent('git_commit')).toBe(true);
      expect(mapper.hasIntent('git_push')).toBe(true);
      expect(mapper.hasIntent('tool_run')).toBe(true);
    });

    it('should return false for unknown intents', () => {
      expect(mapper.hasIntent('unknown_intent')).toBe(false);
      expect(mapper.hasIntent('rm -rf')).toBe(false);
    });
  });

  describe('getRegisteredIntents', () => {
    it('should return all built-in intents', () => {
      const intents = mapper.getRegisteredIntents();
      expect(intents).toContain('git_commit');
      expect(intents).toContain('git_push');
      expect(intents).toContain('git_pull');
      expect(intents).toContain('git_branch');
      expect(intents).toContain('git_merge');
      expect(intents).toContain('tool_run');
    });
  });

  describe('registerMapping', () => {
    it('should allow registering custom mapping', () => {
      mapper.registerMapping('custom_intent', {
        type: 'exec',
        cli: 'npm',
        args: ['run', '{{script}}'],
        required: ['script'],
      });

      expect(mapper.hasIntent('custom_intent')).toBe(true);
      const step = mapper.toStep('custom_intent', { script: 'build' });
      expect(step.cli).toBe('npm');
      expect(step.args).toEqual(['run', 'build']);
    });

    // BUG-2 [implementation gap]: 注册时做基础 allowlist 校验；运行时危险命令拦截由 Execution 层负责。
    it('currently rejects registering unauthorized CLI (basic allowlist at registration)', () => {
      expect(() => mapper.registerMapping('bad_intent', {
        type: 'exec',
        cli: 'malicious',
        args: ['hack'],
      })).toThrow('CLI "malicious" is not in the allowed list');
    });

    it('should override built-in mapping', () => {
      mapper.registerMapping('git_commit', {
        type: 'exec',
        cli: 'git',
        args: ['commit', '--message', '{{message}}'],
        required: ['message'],
      });

      const step = mapper.toStep('git_commit', { message: 'override' });
      expect(step.args).toEqual(['commit', '--message', 'override']);
    });
  });

  describe('custom mappings in constructor', () => {
    it('should merge custom mappings with built-in', () => {
      const customMapper = createIntentStepMapper({
        deploy: {
          type: 'exec',
          cli: 'npm',
          args: ['run', 'deploy', '--env', '{{env}}'],
          required: ['env'],
        },
      });

      expect(customMapper.hasIntent('git_commit')).toBe(true);
      expect(customMapper.hasIntent('deploy')).toBe(true);

      const step = customMapper.toStep('deploy', { env: 'production' });
      expect(step.cli).toBe('npm');
      expect(step.args).toEqual(['run', 'deploy', '--env', 'production']);
    });

    it('should allow overriding built-in via constructor', () => {
      const customMapper = createIntentStepMapper({
        git_commit: {
          type: 'exec',
          cli: 'git',
          args: ['commit', '-a', '-m', '{{message}}'],
          required: ['message'],
        },
      });

      const step = customMapper.toStep('git_commit', { message: 'auto-staged' });
      expect(step.args).toEqual(['commit', '-a', '-m', 'auto-staged']);
    });
  });

  describe('CLI allowlist', () => {
    it('should allow git', () => {
      expect(() => mapper.toStep('git_commit', { message: 'test' })).not.toThrow();
    });

    it('should allow npm via tool_run', () => {
      expect(() => mapper.toStep('tool_run', { toolName: 'npm' })).not.toThrow();
    });

    // BUG-2 [implementation gap]: Conversion 层 allowlist 仅做基础过滤，`rm` 等危险命令的语义检测由 Execution 层 sandbox/detector 负责。
    it('currently blocks rm at conversion layer (basic allowlist, full detection in Execution layer)', () => {
      expect(() => mapper.toStep('tool_run', { toolName: 'rm' })).toThrow('not in the allowed list');
    });

    // BUG-2 [implementation gap]: 同上，`sudo` 拦截在 Conversion 层仅基于 allowlist，权限管控由 Execution 层 security-protocol 负责。
    it('currently blocks sudo at conversion layer (basic allowlist, permission control in Execution layer)', () => {
      expect(() => mapper.toStep('tool_run', { toolName: 'sudo' })).toThrow('not in the allowed list');
    });
  });

  describe('null params defensive programming', () => {
    it('should handle null params without throwing', () => {
      expect(() => mapper.toStep('git_branch', null as any)).toThrow('Missing required parameters: branch');
    });

    it('should handle undefined params without throwing', () => {
      expect(() => mapper.toStep('git_branch', undefined as any)).toThrow('Missing required parameters: branch');
    });

    it('should treat null params as empty object for intents without required', () => {
      const customMapper = createIntentStepMapper({
        no_params_intent: {
          type: 'exec',
          cli: 'git',
          args: ['status'],
        },
      });
      const step = customMapper.toStep('no_params_intent', null as any);
      expect(step.cli).toBe('git');
      expect(step.args).toEqual(['status']);
    });

    it('should treat undefined params as empty object for intents without required', () => {
      const customMapper = createIntentStepMapper({
        no_params_intent: {
          type: 'exec',
          cli: 'git',
          args: ['status'],
        },
      });
      const step = customMapper.toStep('no_params_intent', undefined as any);
      expect(step.cli).toBe('git');
      expect(step.args).toEqual(['status']);
    });

    it('should throw missing required when null params passed to git_commit', () => {
      expect(() => mapper.toStep('git_commit', null as any)).toThrow('Missing required parameters: message');
    });

    it('should throw missing required when undefined params passed to git_push', () => {
      expect(() => mapper.toStep('git_push', undefined as any)).toThrow('Missing required parameters: remote, branch');
    });
  });
});
