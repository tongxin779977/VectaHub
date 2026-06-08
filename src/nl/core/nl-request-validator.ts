import { z } from 'zod';
import type { NLRequestEnvelope } from '../../types/nl.js';

const NormalizedInputEntitiesSchema = z.object({
  githubActionRunIds: z.array(z.string()).optional(),
  githubActionUrls: z.array(z.string()).optional(),
  filePaths: z.array(z.string()).optional(),
  commitShas: z.array(z.string()).optional(),
  packageScripts: z.array(z.string()).optional(),
});

const NormalizedInputSchema = z.object({
  rawText: z.string(),
  cleanText: z.string(),
  tokens: z.array(z.string()),
  normalizedTerms: z.array(z.string()),
  entities: NormalizedInputEntitiesSchema,
});

export const NLRequestEnvelopeSchema = z.object({
  schemaVersion: z.literal('1.0'),
  requestId: z.string().min(1, 'requestId cannot be empty'),
  source: z.enum(['run', 'chat', 'document', 'manual']),
  mode: z.enum(['dry-run', 'execute']),
  dryRun: z.boolean(),
  json: z.boolean(),
  language: z.string().optional(),
  cwd: z.string().min(1, 'cwd cannot be empty'),
  userInput: z.string(),
  normalizedInput: NormalizedInputSchema.optional(),
  sessionId: z.string().optional(),
  contextId: z.string().optional(),
  metadata: z.object({
    createdAt: z.string(),
  }),
});

export interface NLRequestValidationError {
  code: string;
  message: string;
  path: string[];
}

export interface NLRequestValidationResult {
  valid: boolean;
  errors: NLRequestValidationError[];
  envelope?: NLRequestEnvelope;
}

function validateUserInputNotEmpty(envelope: NLRequestEnvelope): NLRequestValidationError[] {
  const errors: NLRequestValidationError[] = [];
  if (envelope.source !== 'manual' && envelope.userInput.trim().length === 0) {
    errors.push({
      code: 'empty_user_input',
      message: 'userInput cannot be empty for non-manual sources',
      path: ['userInput'],
    });
  }
  return errors;
}

function validateModeConsistency(envelope: NLRequestEnvelope): NLRequestValidationError[] {
  const errors: NLRequestValidationError[] = [];
  if (envelope.mode === 'dry-run' && !envelope.dryRun) {
    errors.push({
      code: 'mode_dry_run_mismatch',
      message: 'mode is "dry-run" but dryRun flag is false',
      path: ['dryRun'],
    });
  }
  if (envelope.mode === 'execute' && envelope.dryRun) {
    errors.push({
      code: 'mode_execute_mismatch',
      message: 'mode is "execute" but dryRun flag is true',
      path: ['dryRun'],
    });
  }
  return errors;
}

export function validateNLRequestEnvelope(input: unknown): NLRequestValidationResult {
  const schemaResult = NLRequestEnvelopeSchema.safeParse(input);

  if (!schemaResult.success) {
    const errors: NLRequestValidationError[] = schemaResult.error.issues.map(issue => ({
      code: issue.code,
      message: issue.message,
      path: issue.path.map(String),
    }));
    return { valid: false, errors };
  }

  const envelope = schemaResult.data as NLRequestEnvelope;
  const businessErrors: NLRequestValidationError[] = [
    ...validateUserInputNotEmpty(envelope),
    ...validateModeConsistency(envelope),
  ];

  if (businessErrors.length > 0) {
    return { valid: false, errors: businessErrors };
  }

  return { valid: true, errors: [], envelope };
}
