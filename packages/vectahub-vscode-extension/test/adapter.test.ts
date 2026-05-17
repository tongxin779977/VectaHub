import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    activeTextEditor: undefined,
  },
  workspace: {
    workspaceFolders: [],
    getWorkspaceFolder: vi.fn(),
  },
}));

vi.mock('../src/config/settings.js', () => ({
  getCliPath: vi.fn(() => 'vectahub'),
}));

vi.mock('../src/extension.js', () => ({
  getGlobalCliPath: vi.fn(() => undefined),
}));

vi.mock('../src/ui/output.js', () => ({
  logToOutput: vi.fn(),
}));

import { parseCliJsonOutput } from '../src/cli/adapter.js';
import { resolveRunTaskExecutionSemantics, resolveRunTaskFailureKind } from '../src/commands/runTaskResultSemantics.js';

describe('parseCliJsonOutput', () => {
  it('parses clean JSON output', () => {
    const result = parseCliJsonOutput<{ ok: boolean }>('{"ok":true}');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.ok).toBe(true);
    }
  });

  it('extracts JSON when stdout contains surrounding text', () => {
    const result = parseCliJsonOutput<{ ok: boolean; output: string }>(
      'warning before\n{"ok":true,"output":"hello"}\nlog after'
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.output).toBe('hello');
    }
  });

  it('skips non-JSON bracketed log prefixes before valid JSON', () => {
    const result = parseCliJsonOutput<{ ok: boolean }>('[batch] running\n{"ok":true}');

    expect(result.ok).toBe(true);
  });

  it('parses JSON code blocks', () => {
    const result = parseCliJsonOutput<{ ok: boolean }>('```json\n{"ok":true}\n```');

    expect(result.ok).toBe(true);
  });

  it('returns a parse error for invalid output', () => {
    const result = parseCliJsonOutput('not json');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBeTruthy();
    }
  });
});

describe('run-task diagnostics compatibility', () => {
  it('should preserve diagnostics field from CLI JSON', () => {
    const result = parseCliJsonOutput<{ ok: boolean; output: string; diagnostics?: { failureKind?: string } }>(
      '{"ok":true,"output":"clean summary","diagnostics":{"failureKind":"timeout"}}'
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.output).toBe('clean summary');
      expect(result.data.diagnostics?.failureKind).toBe('timeout');
    }
  });

  it('should keep failure semantics parsing unchanged when diagnostics exists', () => {
    const semantics = resolveRunTaskExecutionSemantics({
      ok: false,
      data: {
        diagnostics: {
          failureKind: 'timeout',
          unclosedExecution: true,
          gitChanges: { changedFiles: ['src/a.ts'] },
          verification: undefined,
        },
      },
    });
    const failureKind = resolveRunTaskFailureKind({
      data: {
        diagnostics: {
          failureKind: 'timeout',
        },
      },
    });

    expect(semantics.unclosedExecution).toBe(true);
    expect(failureKind).toBe('timeout');
  });

  it('should keep fallback compatibility for legacy top-level fields', () => {
    const semantics = resolveRunTaskExecutionSemantics({
      ok: false,
      data: {
        unclosedExecution: true,
        gitChanges: { changedFiles: ['src/a.ts'] },
      },
    });
    const failureKind = resolveRunTaskFailureKind({
      data: {
        failureKind: 'timeout',
      },
    });

    expect(semantics.unclosedExecution).toBe(true);
    expect(failureKind).toBe('timeout');
  });
});
