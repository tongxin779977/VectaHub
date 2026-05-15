import { describe, expect, it } from 'vitest';
import { classifyDocTaskFailure, mapRunStatusToDisplayStatus } from '../src/project/docTaskState.js';

describe('doc task state machine pure functions', () => {
  it('classifies INVALID_JSON as json_protocol', () => {
    const result = classifyDocTaskFailure({ errorCode: 'INVALID_JSON' });
    expect(result).toEqual({ kind: 'json_protocol', status: 'failed_json_protocol' });
  });

  it('classifies CANCELLED as cancelled', () => {
    const result = classifyDocTaskFailure({ errorCode: 'CANCELLED' });
    expect(result).toEqual({ kind: 'cancelled', status: 'cancelled' });
  });

  it('classifies timeout message as timeout', () => {
    const result = classifyDocTaskFailure({ errorMessage: 'request timed out after 60s' });
    expect(result).toEqual({ kind: 'timeout', status: 'failed_timeout' });
  });

  it('classifies AGENT_SYSTEM_ERROR as system_internal', () => {
    const result = classifyDocTaskFailure({ errorCode: 'AGENT_SYSTEM_ERROR' });
    expect(result).toEqual({ kind: 'system_internal', status: 'failed_system_internal' });
  });

  it('classifies AGENT_CONFIG_ERROR as config', () => {
    const result = classifyDocTaskFailure({ errorCode: 'AGENT_CONFIG_ERROR' });
    expect(result).toEqual({ kind: 'config', status: 'failed_config' });
  });

  it('classifies llm not configured as config', () => {
    const result = classifyDocTaskFailure({ errorMessage: 'LLM not configured' });
    expect(result).toEqual({ kind: 'config', status: 'failed_config' });
  });

  it('classifies agent not found as config', () => {
    const result = classifyDocTaskFailure({ errorMessage: 'agent not found: vectahub-agent' });
    expect(result).toEqual({ kind: 'config', status: 'failed_config' });
  });

  it('classifies conflict marker as conflict', () => {
    const result = classifyDocTaskFailure({ output: '<<<<<<< HEAD\nfoo\n=======\nbar\n>>>>>>> main' });
    expect(result).toEqual({ kind: 'conflict', status: 'failed_conflict' });
  });

  it('classifies unknown non-ok as agent', () => {
    const result = classifyDocTaskFailure({ ok: false, errorMessage: 'exit with unknown reason' });
    expect(result).toEqual({ kind: 'agent', status: 'failed_agent' });
  });

  it('maps success and changed run status to display status', () => {
    expect(mapRunStatusToDisplayStatus('success')).toBe('success');
    expect(mapRunStatusToDisplayStatus('changed')).toBe('changed');
  });
});
