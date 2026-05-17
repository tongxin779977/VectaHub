import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager, createContextManager } from './context-manager.js';

describe('ContextManager', () => {
  let manager: ContextManager;

  beforeEach(() => {
    manager = createContextManager();
  });

  describe('context creation', () => {
    it('should create a new context', () => {
      const context = manager.createContext('wf-1', 'exec-1', 'sess-1');
      
      expect(context).toBeDefined();
      expect(context.workflowId).toBe('wf-1');
      expect(context.executionId).toBe('exec-1');
      expect(context.sessionId).toBe('sess-1');
    });

    it('should create context with initial variables', () => {
      const context = manager.createContext('wf-1', 'exec-1', 'sess-1', {
        name: 'test',
        count: 42,
      });
      
      expect(context.variables.get('name')).toBe('test');
      expect(context.variables.get('count')).toBe(42);
    });

    it('should get context by execution id', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      
      const context = manager.getContext('exec-1');
      expect(context).toBeDefined();
      expect(context?.executionId).toBe('exec-1');
    });

    it('should return undefined for non-existent context', () => {
      const context = manager.getContext('non-existent');
      expect(context).toBeUndefined();
    });
  });

  describe('variables', () => {
    it('should set and get variable', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      
      manager.setVariable('exec-1', 'myVar', 'hello');
      
      expect(manager.getVariable('exec-1', 'myVar')).toBe('hello');
    });

    it('should throw error when setting variable on non-existent context', () => {
      expect(() => {
        manager.setVariable('non-existent', 'var', 'value');
      }).toThrow('Context not found');
    });

    it('should return undefined for non-existent variable', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      
      expect(manager.getVariable('exec-1', 'non-existent')).toBeUndefined();
    });
  });

  describe('variable resolution', () => {
    it('should resolve variable in string', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      manager.setVariable('exec-1', 'name', 'world');
      
      const resolved = manager.resolveVariable('exec-1', 'Hello ${name}!');
      
      expect(resolved).toBe('Hello world!');
    });

    it('should keep unresolved variables', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      
      const resolved = manager.resolveVariable('exec-1', 'Hello ${unknown}!');
      
      expect(resolved).toBe('Hello ${unknown}!');
    });

    it('should resolve multiple variables', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      manager.setVariable('exec-1', 'a', 'X');
      manager.setVariable('exec-1', 'b', 'Y');
      
      const resolved = manager.resolveVariable('exec-1', '${a} and ${b}');
      
      expect(resolved).toBe('X and Y');
    });

    it('should resolve args array', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      manager.setVariable('exec-1', 'dir', '/tmp');
      
      const resolved = manager.resolveArgs('exec-1', ['ls', '${dir}']);
      
      expect(resolved).toEqual(['ls', '/tmp']);
    });
  });

  describe('step outputs', () => {
    it('should set and get step output', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      
      manager.setStepOutput('exec-1', 'step-1', 'result', {
        stdout: 'output',
        exitCode: 0,
      });
      
      const output = manager.getStepOutput('exec-1', 'step-1');
      expect(output?.result).toBe('result');
      expect(output?.stdout).toBe('output');
      expect(output?.exitCode).toBe(0);
    });

    it('should return undefined for non-existent step output', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      
      const output = manager.getStepOutput('exec-1', 'non-existent');
      expect(output).toBeUndefined();
    });
  });

  describe('string interpolation', () => {
    it('should interpolate variables', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      manager.setVariable('exec-1', 'name', 'test');
      
      const result = manager.interpolateString('exec-1', 'Hello ${name}');
      
      expect(result).toBe('Hello test');
    });

    it('should interpolate step outputs', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      manager.setStepOutput('exec-1', 'step-1', 'output-result');
      
      const result = manager.interpolateString('exec-1', 'Result: $STEP_OUTPUT[step-1]');
      
      expect(result).toBe('Result: output-result');
    });

    it('should interpolate env variables', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      
      const result = manager.interpolateString('exec-1', 'Home: $ENV[HOME]');
      
      expect(result).toContain('Home:');
    });
  });

  describe('object interpolation', () => {
    it('should interpolate object values', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      manager.setVariable('exec-1', 'name', 'test');
      
      const result = manager.interpolateObject('exec-1', {
        key: '${name}',
        nested: {
          value: '${name}_nested',
        },
      });
      
      expect(result.key).toBe('test');
      expect((result.nested as any).value).toBe('test_nested');
    });

    it('should interpolate array values', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      manager.setVariable('exec-1', 'item', 'file');
      
      const result = manager.interpolateObject('exec-1', {
        args: ['${item}', '${item}_2'],
      });
      
      expect(result.args).toEqual(['file', 'file_2']);
    });
  });

  describe('export/import', () => {
    it('should export context', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1', { name: 'test' });
      manager.setStepOutput('exec-1', 'step-1', 'result');
      
      const exported = manager.exportContext('exec-1');
      
      expect(exported.workflowId).toBe('wf-1');
      expect(exported.executionId).toBe('exec-1');
      expect(exported.variables).toEqual({ name: 'test' });
      expect(exported.stepOutputs).toEqual({ 'step-1': 'result' });
    });

    it('should import context', () => {
      const data = {
        workflowId: 'wf-1',
        executionId: 'exec-1',
        sessionId: 'sess-1',
        variables: { name: 'test' },
        stepOutputs: { 'step-1': 'result' },
        cwd: '/tmp',
        startTime: new Date().toISOString(),
      };
      
      const context = manager.importContext(data);
      
      expect(context.workflowId).toBe('wf-1');
      expect(context.variables.get('name')).toBe('test');
      expect(context.stepOutputs.get('step-1')?.result).toBe('result');
    });
  });

  describe('context management', () => {
    it('should list contexts', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      manager.createContext('wf-2', 'exec-2', 'sess-2');
      
      const contexts = manager.listContexts();
      
      expect(contexts).toContain('exec-1');
      expect(contexts).toContain('exec-2');
    });

    it('should delete context', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      
      manager.deleteContext('exec-1');
      
      expect(manager.getContext('exec-1')).toBeUndefined();
    });

    it('should clear all contexts', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      manager.createContext('wf-2', 'exec-2', 'sess-2');
      
      manager.clear();
      
      expect(manager.listContexts().length).toBe(0);
    });
  });

  describe('toExecutorContext', () => {
    it('should return empty context for non-existent execution', () => {
      const result = manager.toExecutorContext('non-existent');
      expect(result).toEqual({ variables: {}, previousOutputs: {} });
    });

    it('should convert variables to string arrays', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      manager.setVariable('exec-1', 'name', 'test');
      manager.setVariable('exec-1', 'count', 42);
      manager.setVariable('exec-1', 'items', ['a', 'b', 'c']);
      
      const result = manager.toExecutorContext('exec-1');
      
      expect(result.variables['name']).toEqual(['test']);
      expect(result.variables['count']).toEqual(['42']);
      expect(result.variables['items']).toEqual(['a', 'b', 'c']);
    });

    it('should convert step outputs to previousOutputs', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      manager.setStepOutput('exec-1', 'step-1', ['line1', 'line2']);
      manager.setStepOutput('exec-1', 'step-2', 'single-result');
      
      const result = manager.toExecutorContext('exec-1');
      
      expect(result.previousOutputs['step-1']).toEqual(['line1', 'line2']);
      expect(result.previousOutputs['step-2']).toEqual(['single-result']);
    });

    it('should expose both step id and outputVar aliases for step outputs', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      manager.setStepOutput('exec-1', 'step-1', ['payload'], { outputVar: 'artifact' });

      const result = manager.toExecutorContext('exec-1');

      expect(result.previousOutputs['step-1']).toEqual(['payload']);
      expect(result.previousOutputs['artifact']).toEqual(['payload']);
    });

    it('should use stdout for previousOutputs when available', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      manager.setStepOutput('exec-1', 'step-1', 'result', { stdout: 'line1\nline2\nline3' });
      
      const result = manager.toExecutorContext('exec-1');
      
      expect(result.previousOutputs['step-1']).toEqual(['line1', 'line2', 'line3']);
    });

    it('should handle null and undefined values', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      manager.setVariable('exec-1', 'nullVal', null);
      manager.setVariable('exec-1', 'undefinedVal', undefined);
      manager.setStepOutput('exec-1', 'empty-step', null);
      
      const result = manager.toExecutorContext('exec-1');
      
      expect(result.variables['nullVal']).toEqual([]);
      expect(result.variables['undefinedVal']).toEqual([]);
      expect(result.previousOutputs['empty-step']).toEqual([]);
    });
  });

  describe('expression data', () => {
    it('should mirror outputVar aliases in expression steps', () => {
      manager.createContext('wf-1', 'exec-1', 'sess-1');
      manager.setStepOutput('exec-1', 'step-1', ['payload'], { outputVar: 'artifact', exitCode: 0 });

      const expressionData = manager.getExpressionData('exec-1');

      expect(expressionData.steps['step-1']?.output).toEqual(['payload']);
      expect(expressionData.steps['artifact']?.output).toEqual(['payload']);
      expect(expressionData.steps['artifact']?.exitCode).toBe(0);
    });
  });
});
