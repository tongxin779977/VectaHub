import { describe, expect, it } from 'vitest';
import {
  createChildEnv,
  createRootTraceContext,
  getTraceContextFromEnv,
} from './context.js';

describe('trace context helpers', () => {
  it('createChildEnv should only return trace env patch keys', () => {
    process.env.UNRELATED_TRACE_TEST = 'should-not-leak';

    const childEnv = createChildEnv(
      { traceId: 'tr_test_1', source: 'vscode' },
      'sp_test_parent',
    );

    expect(childEnv).toEqual({
      VECTAHUB_TRACE_ID: 'tr_test_1',
      VECTAHUB_PARENT_SPAN_ID: 'sp_test_parent',
      VECTAHUB_TRACE_SOURCE: 'vscode',
    });
    expect(childEnv.UNRELATED_TRACE_TEST).toBeUndefined();
  });

  it('getTraceContextFromEnv should keep existing semantics', () => {
    expect(getTraceContextFromEnv({})).toBeNull();

    expect(getTraceContextFromEnv({
      VECTAHUB_TRACE_ID: 'tr_a',
      VECTAHUB_PARENT_SPAN_ID: 'sp_a',
      VECTAHUB_TRACE_SOURCE: 'vscode',
    })).toEqual({
      traceId: 'tr_a',
      parentSpanId: 'sp_a',
      source: 'vscode',
    });

    expect(getTraceContextFromEnv({
      VECTAHUB_TRACE_ID: 'tr_b',
      VECTAHUB_PARENT_SPAN_ID: 'sp_b',
      VECTAHUB_TRACE_SOURCE: 'unexpected-source',
    })).toEqual({
      traceId: 'tr_b',
      parentSpanId: 'sp_b',
      source: 'cli',
    });
  });

  it('createRootTraceContext should keep existing semantics', () => {
    const context = createRootTraceContext();
    expect(context.source).toBe('cli');
    expect(context.traceId.startsWith('tr_')).toBe(true);
  });
});
