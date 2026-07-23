import { describe, test, expect } from 'vitest';
import { mapStopReason, mapChangedFiles, hasImplementedChanges, buildSummary, mapToRunTaskResult } from './acp-result-mapper.js';
import type { AcpPromptResult, AcpToolCallEvent } from './acp-types.js';

function makeToolCall(overrides: Partial<AcpToolCallEvent> = {}): AcpToolCallEvent {
  return {
    toolCallId: 'tc_1',
    title: 'Read file',
    kind: 'read',
    status: 'completed',
    content: [],
    locations: [],
    ...overrides,
  };
}

function makeResult(overrides: Partial<AcpPromptResult> = {}): AcpPromptResult {
  return {
    stopReason: 'end_turn',
    agentName: 'test-agent',
    agentVersion: '1.0.0',
    message: 'Task completed.',
    toolCalls: [],
    planEntries: [],
    events: [],
    ...overrides,
  };
}

describe('mapStopReason', () => {
  test('returns success for end_turn', () => {
    const result = mapStopReason('end_turn');
    expect(result.success).toBe(true);
    expect(result.failureKind).toBeUndefined();
  });

  test('returns failure for max_tokens', () => {
    const result = mapStopReason('max_tokens');
    expect(result.success).toBe(false);
    expect(result.failureKind).toBe('max_tokens');
    expect(result.errorMessage).toContain('token limit');
  });

  test('returns failure for refusal', () => {
    const result = mapStopReason('refusal');
    expect(result.success).toBe(false);
    expect(result.failureKind).toBe('refusal');
  });

  test('returns failure for cancelled', () => {
    const result = mapStopReason('cancelled');
    expect(result.success).toBe(false);
    expect(result.failureKind).toBe('cancelled');
  });
});

describe('mapChangedFiles', () => {
  test('extracts paths from edit tool calls with diff content', () => {
    const toolCalls = [
      makeToolCall({
        kind: 'edit',
        content: [{ type: 'diff', diff: { path: '/src/a.ts', newText: 'new' } }],
      }),
      makeToolCall({
        kind: 'edit',
        content: [{ type: 'diff', diff: { path: '/src/b.ts', newText: 'new' } }],
      }),
    ];
    const files = mapChangedFiles(toolCalls);
    expect(files).toEqual(['/src/a.ts', '/src/b.ts']);
  });

  test('extracts paths from tool call locations', () => {
    const toolCalls = [
      makeToolCall({
        kind: 'edit',
        content: [],
        locations: [{ path: '/src/c.ts', line: 10 }],
      }),
    ];
    const files = mapChangedFiles(toolCalls);
    expect(files).toEqual(['/src/c.ts']);
  });

  test('deduplicates paths', () => {
    const toolCalls = [
      makeToolCall({
        kind: 'edit',
        content: [{ type: 'diff', diff: { path: '/src/a.ts', newText: 'new' } }],
        locations: [{ path: '/src/a.ts', line: 1 }],
      }),
    ];
    const files = mapChangedFiles(toolCalls);
    expect(files).toEqual(['/src/a.ts']);
  });

  test('ignores read-only tool calls', () => {
    const toolCalls = [
      makeToolCall({ kind: 'read' }),
      makeToolCall({ kind: 'search' }),
    ];
    const files = mapChangedFiles(toolCalls);
    expect(files).toEqual([]);
  });

  test('ignores incomplete tool calls', () => {
    const toolCalls = [
      makeToolCall({ kind: 'edit', status: 'failed' }),
    ];
    const files = mapChangedFiles(toolCalls);
    expect(files).toEqual([]);
  });
});

describe('hasImplementedChanges', () => {
  test('returns true when completed edit tool calls exist', () => {
    const result = makeResult({
      toolCalls: [makeToolCall({ kind: 'edit', status: 'completed' })],
    });
    expect(hasImplementedChanges(result)).toBe(true);
  });

  test('returns false when only read tool calls exist', () => {
    const result = makeResult({
      toolCalls: [makeToolCall({ kind: 'read', status: 'completed' })],
    });
    expect(hasImplementedChanges(result)).toBe(false);
  });

  test('returns false when edit tool calls failed', () => {
    const result = makeResult({
      toolCalls: [makeToolCall({ kind: 'edit', status: 'failed' })],
    });
    expect(hasImplementedChanges(result)).toBe(false);
  });

  test('returns false when no tool calls', () => {
    const result = makeResult();
    expect(hasImplementedChanges(result)).toBe(false);
  });
});

describe('buildSummary', () => {
  test('includes message text', () => {
    const result = makeResult({ message: 'Hello world' });
    expect(buildSummary(result)).toContain('Hello world');
  });

  test('includes tool call summary', () => {
    const result = makeResult({
      toolCalls: [makeToolCall({ title: 'Edit foo.ts' })],
    });
    expect(buildSummary(result)).toContain('Edit foo.ts');
    expect(buildSummary(result)).toContain('[read]');
  });

  test('includes plan entries', () => {
    const result = makeResult({
      planEntries: [{ content: 'Step 1', priority: 'high', status: 'completed' }],
    });
    expect(buildSummary(result)).toContain('Step 1');
    expect(buildSummary(result)).toContain('[completed]');
  });

  test('includes usage info', () => {
    const result = makeResult({
      usage: { usedTokens: 500, maxContextTokens: 8000 },
    });
    expect(buildSummary(result)).toContain('500/8000');
  });

  test('returns fallback for empty result', () => {
    const result = makeResult({ message: '', toolCalls: [], planEntries: [] });
    expect(buildSummary(result)).toBe('No output');
  });
});

describe('mapToRunTaskResult', () => {
  test('maps successful end_turn result', () => {
    const result = makeResult({
      stopReason: 'end_turn',
      toolCalls: [makeToolCall({
        kind: 'edit',
        status: 'completed',
        content: [{ type: 'diff', diff: { path: '/src/a.ts', newText: 'new' } }],
      })],
    });
    const mapped = mapToRunTaskResult(result);
    expect(mapped.success).toBe(true);
    expect(mapped.stopReason).toBe('end_turn');
    expect(mapped.implemented).toBe(true);
    expect(mapped.changedFiles).toEqual(['/src/a.ts']);
    expect(mapped.toolCallCount).toBe(1);
  });

  test('maps failed refusal result', () => {
    const result = makeResult({ stopReason: 'refusal' });
    const mapped = mapToRunTaskResult(result);
    expect(mapped.success).toBe(false);
    expect(mapped.failureKind).toBe('refusal');
    expect(mapped.errorMessage).toContain('refused');
  });
});
