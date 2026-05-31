import type {
  ArtifactReference,
  ArtifactType,
  ArtifactHandover,
  ArtifactStorageConfig,
} from '../types/artifact.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import type pino from 'pino';
import { createHash } from 'crypto';
import { redactString } from '../utils/sensitive-data.js';

export interface ArtifactStorageOptions {
  storageDir?: string;
  environment: IEnvironmentService;
  logger: pino.Logger;
}

const DEFAULT_CONFIG: ArtifactStorageConfig = {
  basePath: 'artifacts',
  maxArtifactSizeBytes: 10 * 1024 * 1024,
  allowedContentTypes: ['text/plain', 'application/json', 'text/markdown'],
  forbiddenPatterns: [
    'password',
    'secret',
    'token',
    'api[_-]?key',
    'private[_-]?key',
  ],
};

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

function generateArtifactId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `art_${timestamp}_${random}`;
}

function generateHandoverId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `hand_${timestamp}_${random}`;
}

function computeContentHash(content: string | Buffer): string {
  const hash = createHash('sha256');
  hash.update(content);
  return hash.digest('hex');
}

function containsForbiddenPatterns(content: string, patterns: string[]): boolean {
  return patterns.some(pattern => {
    try {
      const regex = new RegExp(pattern, 'gi');
      return regex.test(content);
    } catch {
      return content.toLowerCase().includes(pattern.toLowerCase());
    }
  });
}

function redactContent(content: string, forbiddenPatterns: string[]): string {
  let redacted = redactString(content);
  forbiddenPatterns.forEach(pattern => {
    try {
      const regex = new RegExp(pattern, 'gi');
      redacted = redacted.replace(regex, '[REDACTED]');
    } catch {
      // 简单的字符串替换作为后备
      const lowerContent = redacted.toLowerCase();
      const lowerPattern = pattern.toLowerCase();
      let index = lowerContent.indexOf(lowerPattern);
      while (index !== -1) {
        redacted = redacted.substring(0, index) + '[REDACTED]' + redacted.substring(index + pattern.length);
        index = redacted.toLowerCase().indexOf(lowerPattern, index + '[REDACTED]'.length);
      }
    }
  });
  return redacted;
}

async function ensureDir(dir: string, environment: IEnvironmentService): Promise<void> {
  await environment.mkdirAsync(dir, { recursive: true });
}

export function createArtifactStorage(options: ArtifactStorageOptions) {
  const { environment, logger } = options;
  const storageDir = options.storageDir || environment.getHomePath();
  const artifactsDir = environment.joinPath(storageDir, 'artifacts');
  const artifactsDataDir = environment.joinPath(artifactsDir, 'data');
  const artifactsMetaDir = environment.joinPath(artifactsDir, 'meta');
  const config = DEFAULT_CONFIG;

  async function createArtifact(
    type: ArtifactType,
    producerExecutionId: string,
    producerTaskId: string,
    title: string,
    summary: string,
    content: string | Buffer,
    metadata: Record<string, string> = {},
  ): Promise<ArtifactReference> {
    await ensureDir(artifactsDataDir, environment);
    await ensureDir(artifactsMetaDir, environment);

    const artifactId = generateArtifactId();
    const contentHash = computeContentHash(content);
    const contentStr = typeof content === 'string' ? content : content.toString('utf-8');

    if (contentStr.length > config.maxArtifactSizeBytes) {
      throw new Error(`Artifact size exceeds maximum allowed size (${config.maxArtifactSizeBytes} bytes)`);
    }

    if (containsForbiddenPatterns(contentStr, config.forbiddenPatterns)) {
      logger.warn('Artifact contains forbidden patterns, will redact');
    }

    const redactedContent = redactContent(contentStr, config.forbiddenPatterns);
    const storagePath = environment.joinPath(artifactsDataDir, `${artifactId}`);
    environment.writeFile(storagePath, redactedContent);

    const artifact: ArtifactReference = {
      artifactId,
      type,
      producerExecutionId,
      producerTaskId,
      title: redactString(title),
      summary: redactString(summary),
      contentHash,
      createdAt: new Date().toISOString(),
      storagePath,
      metadata,
    };

    await saveArtifactMeta(artifact);
    return artifact;
  }

  async function saveArtifactMeta(artifact: ArtifactReference): Promise<void> {
    const metaPath = environment.joinPath(artifactsMetaDir, `${artifact.artifactId}.json`);
    environment.writeFile(metaPath, JSON.stringify(artifact, null, 2));
  }

  async function getArtifact(artifactId: string): Promise<ArtifactReference | undefined> {
    const metaPath = environment.joinPath(artifactsMetaDir, `${artifactId}.json`);
    try {
      const content = environment.readFile(metaPath);
      return JSON.parse(content) as ArtifactReference;
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async function getArtifactContent(artifactId: string): Promise<string | undefined> {
    const artifact = await getArtifact(artifactId);
    if (!artifact) {
      return undefined;
    }
    try {
      return environment.readFile(artifact.storagePath);
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async function listArtifacts(): Promise<ArtifactReference[]> {
    try {
      const files = environment.readDir(artifactsMetaDir);
      const artifacts = files
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const metaPath = environment.joinPath(artifactsMetaDir, f);
          const content = environment.readFile(metaPath);
          return JSON.parse(content) as ArtifactReference;
        });
      return artifacts.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  async function listArtifactsByExecution(executionId: string): Promise<ArtifactReference[]> {
    const allArtifacts = await listArtifacts();
    return allArtifacts.filter(a => a.producerExecutionId === executionId);
  }

  async function listArtifactsByTask(executionId: string, taskId: string): Promise<ArtifactReference[]> {
    const allArtifacts = await listArtifacts();
    return allArtifacts.filter(a => 
      a.producerExecutionId === executionId && a.producerTaskId === taskId
    );
  }

  async function deleteArtifact(artifactId: string): Promise<void> {
    const artifact = await getArtifact(artifactId);
    if (!artifact) {
      return;
    }

    try {
      environment.rm(artifact.storagePath);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }

    const metaPath = environment.joinPath(artifactsMetaDir, `${artifactId}.json`);
    try {
      environment.rm(metaPath);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  async function createHandover(
    planId?: string,
    draftId?: string,
    executionId?: string,
  ): Promise<ArtifactHandover> {
    const handover: ArtifactHandover = {
      handoverId: generateHandoverId(),
      planId,
      draftId,
      executionId,
      artifactRefs: [],
      createdAt: new Date().toISOString(),
    };

    const handoverPath = environment.joinPath(artifactsDir, `handover_${handover.handoverId}.json`);
    await ensureDir(artifactsDir, environment);
    environment.writeFile(handoverPath, JSON.stringify(handover, null, 2));
    return handover;
  }

  async function getHandover(handoverId: string): Promise<ArtifactHandover | undefined> {
    const handoverPath = environment.joinPath(artifactsDir, `handover_${handoverId}.json`);
    try {
      const content = environment.readFile(handoverPath);
      return JSON.parse(content) as ArtifactHandover;
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async function addArtifactToHandover(
    handoverId: string,
    artifactId: string,
    refType: 'input' | 'output',
    producerStepId?: string,
    consumerStepId?: string,
  ): Promise<ArtifactHandover | undefined> {
    const handover = await getHandover(handoverId);
    if (!handover) {
      return undefined;
    }

    const exists = handover.artifactRefs.some(ref => 
      ref.artifactId === artifactId && ref.refType === refType
    );
    if (!exists) {
      handover.artifactRefs.push({
        artifactId,
        refType,
        producerStepId,
        consumerStepId,
      });
      const handoverPath = environment.joinPath(artifactsDir, `handover_${handoverId}.json`);
      environment.writeFile(handoverPath, JSON.stringify(handover, null, 2));
    }
    return handover;
  }

  function validateArtifact(artifact: ArtifactReference): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!artifact.artifactId) {
      issues.push('Artifact ID is required');
    }
    if (!artifact.producerExecutionId) {
      issues.push('Producer execution ID is required');
    }
    if (!artifact.producerTaskId) {
      issues.push('Producer task ID is required');
    }
    if (!artifact.title) {
      issues.push('Title is required');
    }
    if (!artifact.summary) {
      issues.push('Summary is required');
    }
    if (!artifact.contentHash) {
      issues.push('Content hash is required');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  return {
    createArtifact,
    getArtifact,
    getArtifactContent,
    listArtifacts,
    listArtifactsByExecution,
    listArtifactsByTask,
    deleteArtifact,
    createHandover,
    getHandover,
    addArtifactToHandover,
    validateArtifact,
  };
}
