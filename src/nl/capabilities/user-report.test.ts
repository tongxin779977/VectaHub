import { describe, it, expect } from 'vitest';
import {
  generateUserReport,
  formatUserReportText,
  formatDryRunText,
  formatExecutionResultText,
  formatJsonReport
} from './user-report.js';
import type { ExecutionPlan } from './types.js';

const mockPlan: ExecutionPlan = {
  id: 'test-plan-123',
  label: 'Test Plan',
  capabilityId: 'test-capability',
  goal: {
    action: 'test',
    target: 'test',
    domains: [],
    needsClarification: false,
    evidence: {},
    successCriteria: [],
    originalInput: 'test'
  },
  steps: [
    {
      id: 'step-1',
      label: 'Test Step 1',
      type: 'command',
      command: { cli: 'test', args: ['arg1'] },
      internalOutput: false
    },
    {
      id: 'step-2',
      label: 'Test Step 2',
      type: 'command',
      command: { cli: 'test', args: ['arg2'] },
      internalOutput: true
    }
  ],
  userReport: {
    summaryTemplate: 'Test summary',
    nextActions: ['Next action 1', 'Next action 2'],
    verificationSteps: ['Verify step 1', 'Verify step 2']
  }
};

describe('user-report utilities', () => {
  describe('generateUserReport', () => {
    it('应该从执行计划生成用户报告', () => {
      const report = generateUserReport(mockPlan);
      
      expect(report.title).toBe('Test Plan');
      expect(report.phases.length).toBe(2);
      expect(report.summary).toBe('Test summary');
      expect(report.nextActions).toEqual(['Next action 1', 'Next action 2']);
      expect(report.verification).toEqual(['Verify step 1', 'Verify step 2']);
    });
  });

  describe('formatUserReportText', () => {
    it('应该将用户报告格式化为可读文本', () => {
      const report = generateUserReport(mockPlan);
      const text = formatUserReportText(report);
      
      expect(text).toContain('执行计划: Test Plan');
      expect(text).toContain('1. Test Step 1');
      expect(text).toContain('Test summary');
      expect(text).toContain('后续操作:');
      expect(text).toContain('Next action 1');
      expect(text).toContain('验证步骤:');
      expect(text).toContain('Verify step 1');
    });
  });

  describe('formatDryRunText', () => {
    it('应该生成干运行的文本输出', () => {
      const text = formatDryRunText(mockPlan);
      
      expect(text).toContain('执行计划: Test Plan');
      expect(text).toContain('Dry-run: 未执行任何命令。');
    });
  });

  describe('formatExecutionResultText', () => {
    it('应该格式化带结果的执行输出', () => {
      const stepResults = [
        {
          stepId: 'step-1',
          status: 'COMPLETED',
          output: ['Output line 1', 'Output line 2']
        },
        {
          stepId: 'step-2',
          status: 'COMPLETED'
        }
      ];
      
      const text = formatExecutionResultText(mockPlan, stepResults);
      
      expect(text).toContain('执行结果: Test Plan');
      expect(text).toContain('✓ step-1: COMPLETED');
      expect(text).toContain('Output line 1');
      expect(text).toContain('Output line 2');
      expect(text).not.toContain('step-2'); // internalOutput 应该被跳过
    });

    it('应该显示失败的步骤', () => {
      const stepResults = [
        {
          stepId: 'step-1',
          status: 'FAILED',
          error: 'Error message'
        }
      ];
      
      const text = formatExecutionResultText(mockPlan, stepResults);
      
      expect(text).toContain('✗ step-1: FAILED');
      expect(text).toContain('错误: Error message');
    });
  });

  describe('formatJsonReport', () => {
    it('应该生成 JSON 格式的报告', () => {
      const report = formatJsonReport(mockPlan);
      
      expect(report.plan).toEqual({
        id: 'test-plan-123',
        label: 'Test Plan',
        capabilityId: 'test-capability',
        goal: mockPlan.goal,
        steps: [
          {
            id: 'step-1',
            label: 'Test Step 1',
            type: 'command',
            command: { cli: 'test', args: ['arg1'] },
            internalOutput: false
          },
          {
            id: 'step-2',
            label: 'Test Step 2',
            type: 'command',
            command: { cli: 'test', args: ['arg2'] },
            internalOutput: true
          }
        ]
      });
      expect(report.userReport).toEqual(generateUserReport(mockPlan));
    });
  });
});
