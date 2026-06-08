import { describe, it, expect } from 'vitest';
import { validateNLRequestEnvelope, NLRequestEnvelopeSchema } from './nl-request-validator.js';
import { buildNLRequestEnvelope } from './input-normalizer.js';

describe('NLRequestEnvelopeSchema', () => {
  it('accepts a valid envelope built by buildNLRequestEnvelope', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'run',
      mode: 'dry-run',
      dryRun: true,
      json: true,
      cwd: '/test/path',
      userInput: 'test input',
    });

    const result = NLRequestEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
  });

  it('rejects envelope with wrong schemaVersion', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'run',
      mode: 'dry-run',
      dryRun: true,
      json: true,
      cwd: '/test/path',
      userInput: 'test input',
    });

    const result = NLRequestEnvelopeSchema.safeParse({
      ...envelope,
      schemaVersion: '2.0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects envelope with missing required fields', () => {
    const result = NLRequestEnvelopeSchema.safeParse({
      schemaVersion: '1.0',
      requestId: 'test-id',
      // missing source, mode, dryRun, json, cwd, userInput
    });
    expect(result.success).toBe(false);
  });

  it('rejects envelope with invalid source', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'run',
      mode: 'dry-run',
      dryRun: true,
      json: true,
      cwd: '/test/path',
      userInput: 'test input',
    });

    const result = NLRequestEnvelopeSchema.safeParse({
      ...envelope,
      source: 'invalid_source',
    });
    expect(result.success).toBe(false);
  });

  it('rejects envelope with invalid mode', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'run',
      mode: 'dry-run',
      dryRun: true,
      json: true,
      cwd: '/test/path',
      userInput: 'test input',
    });

    const result = NLRequestEnvelopeSchema.safeParse({
      ...envelope,
      mode: 'invalid_mode',
    });
    expect(result.success).toBe(false);
  });

  it('rejects envelope with empty requestId', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'run',
      mode: 'dry-run',
      dryRun: true,
      json: true,
      cwd: '/test/path',
      userInput: 'test input',
    });

    const result = NLRequestEnvelopeSchema.safeParse({
      ...envelope,
      requestId: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects envelope with empty cwd', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'run',
      mode: 'dry-run',
      dryRun: true,
      json: true,
      cwd: '/test/path',
      userInput: 'test input',
    });

    const result = NLRequestEnvelopeSchema.safeParse({
      ...envelope,
      cwd: '',
    });
    expect(result.success).toBe(false);
  });

  it('accepts envelope with optional fields', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'chat',
      mode: 'execute',
      dryRun: false,
      json: false,
      cwd: '/workspace',
      userInput: 'deploy to production',
      language: 'en',
      sessionId: 'session-123',
      contextId: 'context-456',
    });

    const result = NLRequestEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
  });
});

describe('validateNLRequestEnvelope', () => {
  it('returns valid for a well-formed envelope', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'run',
      mode: 'dry-run',
      dryRun: true,
      json: true,
      cwd: '/test/path',
      userInput: 'test input',
    });

    const result = validateNLRequestEnvelope(envelope);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.envelope).toBeDefined();
    expect(result.envelope!.schemaVersion).toBe('1.0');
    expect(result.envelope!.source).toBe('run');
  });

  it('returns invalid for missing required fields', () => {
    const result = validateNLRequestEnvelope({
      schemaVersion: '1.0',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.envelope).toBeUndefined();
  });

  it('returns invalid with mode/dryRun mismatch (dry-run mode but dryRun=false)', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'run',
      mode: 'dry-run',
      dryRun: true,
      json: true,
      cwd: '/test/path',
      userInput: 'test input',
    });

    const result = validateNLRequestEnvelope({
      ...envelope,
      mode: 'dry-run',
      dryRun: false,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'mode_dry_run_mismatch')).toBe(true);
  });

  it('returns invalid with mode/dryRun mismatch (execute mode but dryRun=true)', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'run',
      mode: 'execute',
      dryRun: false,
      json: true,
      cwd: '/test/path',
      userInput: 'test input',
    });

    const result = validateNLRequestEnvelope({
      ...envelope,
      mode: 'execute',
      dryRun: true,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'mode_execute_mismatch')).toBe(true);
  });

  it('allows empty userInput for manual source', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'manual',
      mode: 'execute',
      dryRun: false,
      json: false,
      cwd: '/test/path',
      userInput: '',
    });

    const result = validateNLRequestEnvelope({
      ...envelope,
      source: 'manual',
    });
    expect(result.valid).toBe(true);
  });

  it('returns invalid for empty userInput with non-manual source', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'run',
      mode: 'dry-run',
      dryRun: true,
      json: true,
      cwd: '/test/path',
      userInput: '',
    });

    const result = validateNLRequestEnvelope(envelope);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'empty_user_input')).toBe(true);
  });

  it('returns invalid for whitespace-only userInput with non-manual source', () => {
    const envelope = buildNLRequestEnvelope({
      source: 'run',
      mode: 'dry-run',
      dryRun: true,
      json: true,
      cwd: '/test/path',
      userInput: '   ',
    });

    const result = validateNLRequestEnvelope({
      ...envelope,
      userInput: '   ',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'empty_user_input')).toBe(true);
  });

  it('includes path information in validation errors', () => {
    const result = validateNLRequestEnvelope({
      schemaVersion: '1.0',
    });

    expect(result.valid).toBe(false);
    for (const error of result.errors) {
      expect(error.path).toBeDefined();
      expect(Array.isArray(error.path)).toBe(true);
      expect(error.code).toBeDefined();
      expect(error.message).toBeDefined();
    }
  });

  it('validates all source types', () => {
    for (const source of ['run', 'chat', 'document', 'manual'] as const) {
      const envelope = buildNLRequestEnvelope({
        source,
        mode: 'execute',
        dryRun: false,
        json: false,
        cwd: '/test/path',
        userInput: source === 'manual' ? '' : 'test input',
      });

      const result = validateNLRequestEnvelope(envelope);
      expect(result.valid).toBe(true);
    }
  });
});
