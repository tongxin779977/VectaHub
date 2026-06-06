import type { NLFeedbackRecord, FeedbackAppliedTo, FeedbackSource, FeedbackOutcome } from '../types/feedback.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import type pino from 'pino';
import { redactString } from '../utils/sensitive-data.js';
import * as crypto from 'crypto';

export interface FeedbackStorageOptions {
  storageDir?: string;
  environment: IEnvironmentService;
  logger: pino.Logger;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function isNotFoundError(error: unknown): boolean {
  if (isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
    return true;
  }
  if (typeof error === 'object' && error !== null && 'cause' in error) {
    return isNotFoundError((error as { cause: unknown }).cause);
  }
  if (error instanceof Error && (
    error.message.includes('File not found') ||
    error.message.includes('ENOENT')
  )) {
    return true;
  }
  return false;
}

function parseJsonObject(content: string, source: string): Record<string, unknown> {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON from ${source}: ${message}`, { cause: error });
  }
}

function ensureDir(dir: string, environment: IEnvironmentService): void {
  environment.ensureDir(dir);
}

function generateFeedbackId(): string {
  return `fb-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

function hashInput(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 32);
}

export function createFeedbackRecord(
  source: FeedbackSource,
  input: string,
  plannerDecision: string,
  outcome: FeedbackOutcome,
  appliedTo: FeedbackAppliedTo,
  evidence?: { traceId?: string; executionId?: string; testCaseId?: string },
  capability?: string
): NLFeedbackRecord {
  return {
    feedbackId: generateFeedbackId(),
    source,
    inputHash: hashInput(input),
    capability,
    plannerDecision,
    outcome,
    evidence: evidence || {},
    appliedTo,
    createdAt: new Date().toISOString(),
  };
}

export function createFeedbackStorage(options: FeedbackStorageOptions) {
  const { environment, logger } = options;
  const storageDir = options.storageDir || environment.getHomePath();
  const feedbackDir = environment.joinPath(storageDir, 'feedback');

  async function saveFeedback(record: NLFeedbackRecord): Promise<void> {
    ensureDir(feedbackDir, environment);
    const filePath = environment.joinPath(feedbackDir, `${record.feedbackId}.json`);

    // 确保没有敏感信息
    const redactedRecord = redactFeedback(record);
    environment.writeFile(filePath, JSON.stringify(redactedRecord, null, 2));
    logger.debug({ feedbackId: record.feedbackId }, 'Feedback record saved');
  }

  function redactFeedback(record: NLFeedbackRecord): NLFeedbackRecord {
    const redacted: NLFeedbackRecord = JSON.parse(JSON.stringify(record));

    if (redacted.plannerDecision) {
      redacted.plannerDecision = redactString(redacted.plannerDecision);
    }

    return redacted;
  }

  function restoreFeedbackFromData(data: Record<string, unknown>): NLFeedbackRecord {
    return data as unknown as NLFeedbackRecord;
  }

  async function getFeedback(feedbackId: string): Promise<NLFeedbackRecord | undefined> {
    const filePath = environment.joinPath(feedbackDir, `${feedbackId}.json`);
    try {
      const data = parseJsonObject(await environment.readFileAsync(filePath), filePath);
      return restoreFeedbackFromData(data);
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async function listFeedback(limit?: number): Promise<NLFeedbackRecord[]> {
    try {
      const files = environment.readDir(feedbackDir);
      const feedbacks = await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(async f => {
            const filePath = environment.joinPath(feedbackDir, f);
            const data = parseJsonObject(await environment.readFileAsync(filePath), filePath);
            return restoreFeedbackFromData(data);
          })
      );
      const sorted = feedbacks.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return limit ? sorted.slice(0, limit) : sorted;
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  async function listFeedbackByAppliedTo(appliedTo: FeedbackAppliedTo, limit?: number): Promise<NLFeedbackRecord[]> {
    const allFeedback = await listFeedback();
    const filtered = allFeedback.filter(f => f.appliedTo === appliedTo);
    return limit ? filtered.slice(0, limit) : filtered;
  }

  async function listFeedbackBySource(source: FeedbackSource, limit?: number): Promise<NLFeedbackRecord[]> {
    const allFeedback = await listFeedback();
    const filtered = allFeedback.filter(f => f.source === source);
    return limit ? filtered.slice(0, limit) : filtered;
  }

  async function exportReplayCandidates(appliedTo?: FeedbackAppliedTo, limit: number = 100): Promise<Array<{
    feedbackId: string;
    source: FeedbackSource;
    inputHash: string;
    outcome: FeedbackOutcome;
    appliedTo: FeedbackAppliedTo;
  }>> {
    let feedbacks = await listFeedback(limit);
    if (appliedTo) {
      feedbacks = feedbacks.filter(f => f.appliedTo === appliedTo);
    }
    return feedbacks.map(f => ({
      feedbackId: f.feedbackId,
      source: f.source,
      inputHash: f.inputHash,
      outcome: f.outcome,
      appliedTo: f.appliedTo,
    }));
  }

  async function deleteFeedback(feedbackId: string): Promise<void> {
    const filePath = environment.joinPath(feedbackDir, `${feedbackId}.json`);
    try {
      environment.rm(filePath);
      logger.debug({ feedbackId }, 'Feedback record deleted');
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  return {
    saveFeedback,
    getFeedback,
    listFeedback,
    listFeedbackByAppliedTo,
    listFeedbackBySource,
    exportReplayCandidates,
    deleteFeedback,
    createFeedbackRecord,
  };
}
