import { describe, it, expect, vi } from 'vitest';
import { createLLMOrchestrator } from '../src/nl/llm-orchestrator.js';
import { createPromptManager } from '../src/nl/prompt-manager.js';
import { createSessionManager } from '../src/nl/session-manager.js';
import type { LLMConfig } from '../src/nl/llm.js';

const ITERATIONS = 10;

const BENCH_CONFIG: LLMConfig = {
  provider: 'openai',
  model: 'bench-simulated',
  apiKey: 'bench-no-real-call',
  baseUrl: 'https://api.openai.com/v1',
};

interface Scenario {
  label: string;
  input: string;
  promptId: string;
  mockDelayMs: number;
  mockUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  mockIntent: string;
  mockConfidence: number;
}

const SCENARIOS: Scenario[] = [
  {
    label: 'S1: Simple git commit',
    input: 'git commit -m "fix typo"',
    promptId: 'git-workflow-v1',
    mockDelayMs: 30,
    mockUsage: { promptTokens: 120, completionTokens: 45, totalTokens: 165 },
    mockIntent: 'GIT_COMMIT',
    mockConfidence: 0.95,
  },
  {
    label: 'S2: NPM dependency install',
    input: 'install lodash as a production dependency',
    promptId: 'npm-script-v1',
    mockDelayMs: 50,
    mockUsage: { promptTokens: 180, completionTokens: 80, totalTokens: 260 },
    mockIntent: 'NPM_INSTALL',
    mockConfidence: 0.88,
  },
  {
    label: 'S3: Workflow YAML generation',
    input: 'create a workflow that fetches HackerNews top stories, filters by score > 100, and saves URLs to a file',
    promptId: 'workflow-yaml-v1',
    mockDelayMs: 100,
    mockUsage: { promptTokens: 350, completionTokens: 250, totalTokens: 600 },
    mockIntent: 'WORKFLOW_GENERATE',
    mockConfidence: 0.82,
  },
  {
    label: 'S4: Multi-step CI/CD pipeline',
    input: 'set up CI/CD: run tests, build project, deploy to AWS S3 if on main branch, invalidate CloudFront cache',
    promptId: 'workflow-yaml-v1',
    mockDelayMs: 180,
    mockUsage: { promptTokens: 520, completionTokens: 420, totalTokens: 940 },
    mockIntent: 'WORKFLOW_GENERATE',
    mockConfidence: 0.75,
  },
  {
    label: 'S5: Ambiguous intent resolution',
    input: 'fix the bug',
    promptId: 'intent-parser-v1',
    mockDelayMs: 60,
    mockUsage: { promptTokens: 200, completionTokens: 60, totalTokens: 260 },
    mockIntent: 'UNKNOWN',
    mockConfidence: 0.35,
  },
];

interface ScenarioResult {
  label: string;
  latencies: number[];
  promptTokens: number[];
  completionTokens: number[];
  totalTokens: number[];
  contextTokens: number[];
}

const collectedResults: ScenarioResult[] = [];

function pctl(sorted: number[], p: number): number {
  const i = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, i)];
}

function summarize(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { avg, min: s[0], max: s[s.length - 1], p50: pctl(s, 50), p95: pctl(s, 95) };
}

describe('LLM Performance Benchmark – Phase 7', () => {
  for (const sc of SCENARIOS) {
    it(`${sc.label} (${ITERATIONS} runs)`, async () => {
      const result: ScenarioResult = {
        label: sc.label,
        latencies: [],
        promptTokens: [],
        completionTokens: [],
        totalTokens: [],
        contextTokens: [],
      };

      for (let i = 0; i < ITERATIONS; i++) {
        const pm = createPromptManager();
        const sm = createSessionManager();

        const mockClient = {
          complete: vi.fn().mockImplementation(async () => {
            await new Promise(r => setTimeout(r, sc.mockDelayMs));
            return {
              intent: sc.mockIntent,
              confidence: sc.mockConfidence,
              params: {},
              workflow: { name: 'bench', steps: [] },
              usage: sc.mockUsage,
            };
          }),
        };

        const orch = createLLMOrchestrator({
          promptManager: pm,
          sessionManager: sm,
          llmConfig: BENCH_CONFIG,
          llmClient: mockClient as any,
        });

        const res = await orch.ask({
          input: sc.input,
          sessionId: `bench-${sc.label}-${i}`,
          promptId: sc.promptId,
        });

        result.latencies.push(res.latencyMs);

        if (res.tokenUsage) {
          result.promptTokens.push(res.tokenUsage.promptTokens);
          result.completionTokens.push(res.tokenUsage.completionTokens);
          result.totalTokens.push(res.tokenUsage.totalTokens);
        }

        const trace = orch.getTrace(res.traceId);
        if (trace?.contextStructure) {
          result.contextTokens.push(trace.contextStructure.totalTokens);
        }

        sm.shutdown();
      }

      collectedResults.push(result);

      const ls = summarize(result.latencies);
      const ts = summarize(result.totalTokens);
      const cs = summarize(result.contextTokens);

      console.log(`\n📊 ${sc.label}`);
      console.log(`  Latency     avg=${ls.avg.toFixed(0)}ms  p50=${ls.p50.toFixed(0)}ms  p95=${ls.p95.toFixed(0)}ms  min=${ls.min.toFixed(0)}ms  max=${ls.max.toFixed(0)}ms`);
      console.log(`  Prompt Tok  avg=${summarize(result.promptTokens).avg.toFixed(0)}`);
      console.log(`  Compl  Tok  avg=${summarize(result.completionTokens).avg.toFixed(0)}`);
      console.log(`  Total  Tok  avg=${ts.avg.toFixed(0)}`);
      console.log(`  Ctx    Tok  avg=${cs.avg.toFixed(0)}`);

      expect(result.latencies).toHaveLength(ITERATIONS);
      expect(result.totalTokens.length).toBeGreaterThan(0);
    });
  }

  describe('Prompt Pipeline Overhead', () => {
    it('measure buildSystemPrompt throughput (500 calls)', () => {
      const pm = createPromptManager();
      const rounds = 500;

      const start = performance.now();
      for (let i = 0; i < rounds; i++) {
        pm.buildSystemPrompt('intent-parser-v1', { userInput: 'test input' });
      }
      const elapsed = performance.now() - start;

      console.log(`\n⚙️  Prompt Building Overhead`);
      console.log(`  ${rounds} calls in ${elapsed.toFixed(1)}ms → avg ${(elapsed / rounds).toFixed(3)}ms/call`);

      expect(elapsed).toBeGreaterThan(0);
    });

    it('measure buildContextAwarePrompt throughput (500 calls)', () => {
      const sm = createSessionManager();
      sm.getOrCreateSession('overhead-bench');
      sm.addUserMessage('overhead-bench', 'hello world');
      sm.addAssistantMessage('overhead-bench', 'hi there, how can I help?');

      const rounds = 500;
      const start = performance.now();
      for (let i = 0; i < rounds; i++) {
        sm.buildContextAwarePrompt('base prompt content', 'overhead-bench');
      }
      const elapsed = performance.now() - start;

      console.log(`\n⚙️  Context Building Overhead`);
      console.log(`  ${rounds} calls in ${elapsed.toFixed(1)}ms → avg ${(elapsed / rounds).toFixed(3)}ms/call`);

      sm.shutdown();
      expect(elapsed).toBeGreaterThan(0);
    });

    it('measure repeated same-input prompt consistency (cache candidate)', () => {
      const pm = createPromptManager();
      const input = 'git commit -m "test"';
      const rounds = 100;

      const results: string[] = [];
      const start = performance.now();
      for (let i = 0; i < rounds; i++) {
        results.push(pm.buildSystemPrompt('git-workflow-v1', { userInput: input }));
      }
      const elapsed = performance.now() - start;

      const uniqueResults = new Set(results);
      console.log(`\n⚙️  Same-Input Prompt Rebuild`);
      console.log(`  ${rounds} calls in ${elapsed.toFixed(1)}ms → avg ${(elapsed / rounds).toFixed(3)}ms/call`);
      console.log(`  Unique outputs: ${uniqueResults.size} (1 = fully deterministic, cache candidate)`);

      expect(uniqueResults.size).toBe(1);
      expect(elapsed).toBeGreaterThan(0);
    });
  });

  describe('Summary Report', () => {
    it('print consolidated performance report', () => {
      if (collectedResults.length === 0) return;

      const sep = '=' .repeat(80);
      const dash = '-'.repeat(80);

      console.log(`\n${sep}`);
      console.log(`  Phase 7 LLM Performance Baseline Report`);
      console.log(`  Date: ${new Date().toISOString().split('T')[0]}`);
      console.log(sep);
      console.log(
        `${'Scenario'.padEnd(35)} ${'Avg Lat'.padStart(10)} ${'P95 Lat'.padStart(10)} ${'Avg Prompt'.padStart(11)} ${'Avg Compl'.padStart(10)} ${'Avg Total'.padStart(10)} ${'Avg Ctx'.padStart(8)}`
      );
      console.log(dash);

      for (const r of collectedResults) {
        const ls = summarize(r.latencies);
        const pt = summarize(r.promptTokens);
        const ct = summarize(r.completionTokens);
        const tt = summarize(r.totalTokens);
        const cx = summarize(r.contextTokens);
        console.log(
          `${r.label.padEnd(35)} ${(ls.avg.toFixed(0) + 'ms').padStart(10)} ${(ls.p95.toFixed(0) + 'ms').padStart(10)} ${pt.avg.toFixed(0).padStart(11)} ${ct.avg.toFixed(0).padStart(10)} ${tt.avg.toFixed(0).padStart(10)} ${cx.avg.toFixed(0).padStart(8)}`
        );
      }

      console.log(sep);
      console.log(`  Iterations per scenario: ${ITERATIONS}`);
      console.log(`  LLM response: mocked with simulated delays per complexity`);
      console.log(`  Pipeline: real PromptManager + SessionManager + LLMOrchestrator TraceCollector`);
      console.log(sep);

      expect(collectedResults.length).toBe(SCENARIOS.length);
    });
  });
});
