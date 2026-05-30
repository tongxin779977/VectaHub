import type { WorkflowDraft } from '../types/workflow-draft.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import type pino from 'pino';

export interface DraftStorageOptions {
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

async function ensureDir(dir: string, environment: IEnvironmentService): Promise<void> {
  await environment.mkdirAsync(dir, { recursive: true });
}

export function createDraftStorage(options: DraftStorageOptions) {
  const { environment } = options;
  const storageDir = options.storageDir || environment.getHomePath();
  const draftsDir = environment.joinPath(storageDir, 'drafts');

  async function saveDraft(draft: WorkflowDraft): Promise<void> {
    await ensureDir(draftsDir, environment);
    const filePath = environment.joinPath(draftsDir, `${draft.draftId}.json`);
    
    // 确保没有敏感信息
    const redactedDraft = redactDraft(draft);
    environment.writeFile(filePath, JSON.stringify(redactedDraft, null, 2));
  }

  function redactDraft(draft: WorkflowDraft): WorkflowDraft {
    // 深拷贝并脱敏
    const redacted: WorkflowDraft = JSON.parse(JSON.stringify(draft));
    
    // 确保没有敏感信息在持久化中
    // 目前 WorkflowDraft 设计上就不包含 secrets，所以这里保持原样
    // 如果未来有需要，可以在这里添加脱敏逻辑
    
    return redacted;
  }

  function restoreDraftFromData(data: Record<string, unknown>): WorkflowDraft {
    return data as unknown as WorkflowDraft;
  }

  async function getDraft(draftId: string): Promise<WorkflowDraft | undefined> {
    const filePath = environment.joinPath(draftsDir, `${draftId}.json`);
    try {
      const data = parseJsonObject(await environment.readFileAsync(filePath), filePath);
      return restoreDraftFromData(data);
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async function listDrafts(): Promise<WorkflowDraft[]> {
    try {
      const files = environment.readDir(draftsDir);
      const drafts = await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(async f => {
            const filePath = environment.joinPath(draftsDir, f);
            const data = parseJsonObject(await environment.readFileAsync(filePath), filePath);
            return restoreDraftFromData(data);
          })
      );
      return drafts.sort((a, b) => 
        new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime()
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  async function listDraftsByPlanId(planId: string): Promise<WorkflowDraft[]> {
    const allDrafts = await listDrafts();
    return allDrafts.filter(d => d.planId === planId);
  }

  async function deleteDraft(draftId: string): Promise<void> {
    const filePath = environment.joinPath(draftsDir, `${draftId}.json`);
    try {
      environment.rm(filePath);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  async function updateDraft(draftId: string, update: Partial<WorkflowDraft>): Promise<WorkflowDraft | undefined> {
    const existing = await getDraft(draftId);
    if (!existing) {
      return undefined;
    }

    const updated = {
      ...existing,
      ...update,
      // 确保关键字段不被意外覆盖
      draftId: existing.draftId,
      planId: existing.planId,
      schemaVersion: existing.schemaVersion,
    };

    await saveDraft(updated);
    return updated;
  }

  return {
    saveDraft,
    getDraft,
    listDrafts,
    listDraftsByPlanId,
    deleteDraft,
    updateDraft,
  };
}
