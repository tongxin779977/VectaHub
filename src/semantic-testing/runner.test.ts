import { describe, expect, it, vi } from 'vitest';
import { createSemanticTestRunner } from './runner.js';
import { SEMANTIC_TEST_SCENARIOS } from './scenarios.js';

describe('SemanticTestRunner', () => {
  it('should generate a report from scenario results', async () => {
    const runner = createSemanticTestRunner({ projectRoot: '/test/project' });

    vi.spyOn(runner as never, 'runCommand').mockResolvedValue({
      ok: true,
      stdout: JSON.stringify({
        ok: true,
        result: {
          kind: 'plan',
        },
        intent: 'pwd',
        plan: {
          verification: {
            required: false,
          },
        },
        steps: [
          {
            id: 'step-1',
          },
        ],
      }),
      stderr: '',
      exitCode: 0,
    });

    const report = await runner.runAll();

    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.summary.passed).toBeGreaterThan(0);
    expect(report.summary.averageScore).toBeGreaterThan(0);
    expect(report.summary.dimensions?.outputContract).toBeGreaterThan(0);
  });

  it('should render a markdown report with summary sections', () => {
    const runner = createSemanticTestRunner({ projectRoot: '/test/project' });

    const markdown = runner.generateMarkdownReport({
      generatedAt: '2026-06-08T00:00:00.000Z',
      scenarios: [
        {
          id: 'A-001',
          group: 'Direct Safe Commands',
          intent: 'pwd',
          expressions: ['pwd'],
          expectedBehavior: {
            kind: 'plan',
            safety: 'safe',
            intentRecognition: 'exact',
          },
          weight: 1,
        },
      ],
      results: [
        {
          scenarioId: 'A-001',
          expression: 'pwd',
          passed: true,
          score: {
            intentCorrectness: 100,
            planQuality: 100,
            safetyCorrectness: 100,
            outputContract: 100,
            userUsefulness: 100,
            recoveryAwareness: 100,
            total: 100,
          },
          details: {},
          durationMs: 10,
        },
      ],
      summary: {
        total: 1,
        passed: 1,
        failed: 0,
        expectedFail: 0,
        skipped: 0,
        averageScore: 100,
        passRate: 100,
        dimensions: {
          intentCorrectness: 100,
          planQuality: 100,
          safetyCorrectness: 100,
          outputContract: 100,
          userUsefulness: 100,
          recoveryAwareness: 100,
        },
      },
    });

    expect(markdown).toContain('# 语义验收报告');
    expect(markdown).toContain('## 执行摘要');
    expect(markdown).toContain('## 分组统计');
    expect(markdown).toContain('## 结论');
  });

  it('should cover document, delegation, and confirmation scenarios', () => {
    const groups = new Set(SEMANTIC_TEST_SCENARIOS.map((scenario) => scenario.group));

    expect(groups.has('Document Tasks')).toBe(true);
    expect(groups.has('Agent Delegation')).toBe(true);

    const workflowDraftCases = SEMANTIC_TEST_SCENARIOS.filter(
      (scenario) => scenario.expectedBehavior.kind === 'workflow_draft'
    );
    expect(workflowDraftCases.length).toBeGreaterThan(0);

    const confirmationCases = SEMANTIC_TEST_SCENARIOS.filter(
      (scenario) => scenario.expectedBehavior.safety === 'needs_confirm'
    );
    expect(confirmationCases.length).toBeGreaterThan(0);
  });
});
