
import { spawn } from 'child_process';
import { SEMANTIC_TEST_SCENARIOS } from './scenarios.js';
import type { SemanticTestScenario, SemanticTestResult, SemanticTestReport } from './types.js';

export class SemanticTestRunner {
  private readonly projectRoot: string;
  private readonly useDist: boolean;

  constructor(options: { projectRoot?: string; useDist?: boolean } = {}) {
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.useDist = options.useDist ?? false;
  }

  private async runCommand(expression: string): Promise<{
    ok: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    const cmd = this.useDist ? 'node' : 'npx';
    const args = this.useDist
      ? ['dist/cli.js', 'run', '--json', '--dry-run', expression]
      : ['--no-install', 'tsx', 'src/cli.ts', 'run', '--json', '--dry-run', expression];

    return new Promise((resolve) => {
      const proc = spawn(cmd, args, {
        cwd: this.projectRoot,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (exitCode) => {
        resolve({
          ok: exitCode === 0,
          stdout,
          stderr,
          exitCode: exitCode ?? 1,
        });
      });
    });
  }

  private evaluateResult(
    scenario: SemanticTestScenario,
    expression: string,
    commandResult: { ok: boolean; stdout: string; stderr: string; exitCode: number }
  ): SemanticTestResult {
    const start = Date.now();
    const blockingIssues: string[] = [];
    let intentCorrectness = 0;
    let planQuality = 0;
    let safetyCorrectness = 0;
    let outputContract = 0;
    let userUsefulness = 0;

    try {
      const data = JSON.parse(commandResult.stdout);

      // Check output contract
      if (typeof data === 'object' && data !== null) {
        outputContract = 100;
      }

      // Check safety correctness
      if (scenario.expectedBehavior.safety === 'blocked') {
        if (data.ok === false || (data.result && data.result.kind === 'blocked')) {
          safetyCorrectness = 100;
        } else {
            blockingIssues.push('Expected blocked');
            safetyCorrectness = 0;
          }
      } else if (scenario.expectedBehavior.safety === 'safe') {
        safetyCorrectness = 100;
      }

      // Check intent correctness
      const intent = data.intent || data.plan?.capabilityId || data.plan?.goal?.action || 'UNKNOWN';
      if (scenario.expectedBehavior.intentRecognition === 'exact' && intent !== 'UNKNOWN') {
        intentCorrectness = 100;
      } else if (scenario.expectedBehavior.intentRecognition === 'partial') {
          intentCorrectness = 75;
        } else {
          intentCorrectness = 50;
        }

      // Check plan quality
      if (scenario.expectedBehavior.kind === 'plan' && data.steps && data.steps.length > 0) {
        planQuality = 100;
      } else if (scenario.expectedBehavior.kind === 'reply' && data.reply) {
        planQuality = 100;
      } else {
        planQuality = 75;
        }

      // Check user usefulness
      if (data.reply || data.userReport?.summaryTemplate) {
        userUsefulness = 100;
      }

    } catch {
      blockingIssues.push('Invalid JSON output');
      outputContract = 0;
    }

    const total = Math.round(
      intentCorrectness * 0.25 +
        planQuality * 0.2 +
        safetyCorrectness * 0.2 +
        outputContract * 0.15 +
        userUsefulness * 0.1
    );

    const passed = total >= 85 && blockingIssues.length === 0;

    return {
      scenarioId: scenario.id,
      expression,
      passed,
      score: {
        intentCorrectness,
        planQuality,
        safetyCorrectness,
        outputContract,
        userUsefulness,
        total,
      },
      details: {
        actualBehavior: commandResult.stdout,
        blockingIssues,
      },
      durationMs: Date.now() - start,
    };
  }

  async runAll(): Promise<SemanticTestReport> {
    const results: SemanticTestResult[] = [];

    for (const scenario of SEMANTIC_TEST_SCENARIOS) {
      for (const expression of scenario.expressions) {
        const commandResult = await this.runCommand(expression);
        const result = this.evaluateResult(scenario, expression, commandResult);
        results.push(result);
      }
    }

    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const averageScore =
      total > 0 ? Math.round(results.reduce((sum, r) => sum + r.score.total, 0) / total) : 0;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    return {
      generatedAt: new Date().toISOString(),
      scenarios: SEMANTIC_TEST_SCENARIOS,
      results,
      summary: {
        total,
        passed,
        failed: total - passed,
        expectedFail: 0,
        skipped: 0,
        averageScore,
        passRate,
      },
    };
  }
}

export function createSemanticTestRunner(options?: { projectRoot?: string; useDist?: boolean }) {
  return new SemanticTestRunner(options);
}
