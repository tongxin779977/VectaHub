import { describe, it, expect, beforeEach } from 'vitest';
import { createArtifactStorage } from './artifact-storage.js';
import { MockEnvironmentService } from '../infrastructure/testing/mock-services.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('Artifact Storage', () => {
  let environment: MockEnvironmentService;

  beforeEach(() => {
    environment = new MockEnvironmentService();
  });

  it('should create and retrieve an artifact', async () => {
    const storage = createArtifactStorage({ environment, logger });
    const artifact = await storage.createArtifact(
      'doc_draft',
      'exec-123',
      'task-456',
      'Test Document',
      'This is a summary',
      'Artifact content here'
    );

    expect(artifact.artifactId).toBeDefined();
    expect(artifact.type).toBe('doc_draft');
    expect(artifact.producerExecutionId).toBe('exec-123');
    expect(artifact.producerTaskId).toBe('task-456');

    const retrieved = await storage.getArtifact(artifact.artifactId);
    expect(retrieved).toEqual(artifact);
  });

  it('should retrieve artifact content', async () => {
    const storage = createArtifactStorage({ environment, logger });
    const artifact = await storage.createArtifact(
      'doc_draft',
      'exec-123',
      'task-456',
      'Test Document',
      'This is a summary',
      'Secret password: 12345'
    );

    const content = await storage.getArtifactContent(artifact.artifactId);
    expect(content).toBeDefined();
    expect(content).toContain('[REDACTED]');
    expect(content).not.toContain('password');
  });

  it('should return undefined for non-existent artifact', async () => {
    const storage = createArtifactStorage({ environment, logger });
    const retrieved = await storage.getArtifact('non-existent');
    expect(retrieved).toBeUndefined();
  });

  it('should list all artifacts in order', async () => {
    const storage = createArtifactStorage({ environment, logger });

    const artifact1 = await storage.createArtifact(
      'doc_draft',
      'exec-1',
      'task-1',
      'Doc 1',
      'Summary 1',
      'Content 1'
    );

    // 添加一个小延迟，确保时间戳不同
    await new Promise(resolve => setTimeout(resolve, 10));

    const artifact2 = await storage.createArtifact(
      'doc_draft',
      'exec-1',
      'task-2',
      'Doc 2',
      'Summary 2',
      'Content 2'
    );

    const artifacts = await storage.listArtifacts();
    expect(artifacts.length).toBe(2);
    
    // 验证是按时间倒序排列
    const time1 = new Date(artifact1.createdAt).getTime();
    const time2 = new Date(artifact2.createdAt).getTime();
    const listTime1 = new Date(artifacts[0].createdAt).getTime();
    const listTime2 = new Date(artifacts[1].createdAt).getTime();
    
    expect(listTime1).toBeGreaterThan(listTime2);
    expect(time2).toBeGreaterThan(time1);
  });

  it('should list artifacts by execution ID', async () => {
    const storage = createArtifactStorage({ environment, logger });

    await storage.createArtifact(
      'doc_draft',
      'exec-1',
      'task-1',
      'Doc 1',
      'Summary 1',
      'Content 1'
    );

    await storage.createArtifact(
      'doc_draft',
      'exec-2',
      'task-2',
      'Doc 2',
      'Summary 2',
      'Content 2'
    );

    const artifacts = await storage.listArtifactsByExecution('exec-1');
    expect(artifacts.length).toBe(1);
    expect(artifacts[0].producerExecutionId).toBe('exec-1');
  });

  it('should list artifacts by task ID', async () => {
    const storage = createArtifactStorage({ environment, logger });

    await storage.createArtifact(
      'doc_draft',
      'exec-1',
      'task-1',
      'Doc 1',
      'Summary 1',
      'Content 1'
    );

    await storage.createArtifact(
      'doc_draft',
      'exec-1',
      'task-2',
      'Doc 2',
      'Summary 2',
      'Content 2'
    );

    const artifacts = await storage.listArtifactsByTask('exec-1', 'task-1');
    expect(artifacts.length).toBe(1);
    expect(artifacts[0].producerTaskId).toBe('task-1');
  });

  it('should delete an artifact', async () => {
    const storage = createArtifactStorage({ environment, logger });
    const artifact = await storage.createArtifact(
      'doc_draft',
      'exec-123',
      'task-456',
      'Test Document',
      'This is a summary',
      'Artifact content here'
    );

    expect(await storage.getArtifact(artifact.artifactId)).toBeDefined();
    await storage.deleteArtifact(artifact.artifactId);
    expect(await storage.getArtifact(artifact.artifactId)).toBeUndefined();
  });

  it('should create and manage handover', async () => {
    const storage = createArtifactStorage({ environment, logger });

    const handover = await storage.createHandover('plan-1', 'draft-1', 'exec-1');
    expect(handover.handoverId).toBeDefined();
    expect(handover.artifactRefs).toEqual([]);

    const artifact = await storage.createArtifact(
      'doc_draft',
      'exec-1',
      'task-1',
      'Doc 1',
      'Summary 1',
      'Content 1'
    );

    const updatedHandover = await storage.addArtifactToHandover(
      handover.handoverId,
      artifact.artifactId,
      'output',
      'step-1'
    );

    expect(updatedHandover).toBeDefined();
    expect(updatedHandover?.artifactRefs.length).toBe(1);
    expect(updatedHandover?.artifactRefs[0].artifactId).toBe(artifact.artifactId);

    const retrievedHandover = await storage.getHandover(handover.handoverId);
    expect(retrievedHandover).toEqual(updatedHandover);
  });

  it('should validate artifacts correctly', async () => {
    const storage = createArtifactStorage({ environment, logger });

    const artifact = await storage.createArtifact(
      'doc_draft',
      'exec-123',
      'task-456',
      'Test Document',
      'This is a summary',
      'Artifact content here'
    );

    const validation = storage.validateArtifact(artifact);
    expect(validation.valid).toBe(true);
    expect(validation.issues.length).toBe(0);

    const invalidArtifact = { ...artifact, artifactId: '' };
    const invalidValidation = storage.validateArtifact(invalidArtifact);
    expect(invalidValidation.valid).toBe(false);
    expect(invalidValidation.issues.length).toBeGreaterThan(0);
  });

  it('should redact sensitive content', async () => {
    const storage = createArtifactStorage({ environment, logger });
    const artifact = await storage.createArtifact(
      'doc_draft',
      'exec-123',
      'task-456',
      'Test Document',
      'This is a summary',
      'api_key: secret-123, password: mypassword, token: abc123'
    );

    const content = await storage.getArtifactContent(artifact.artifactId);
    expect(content).toContain('[REDACTED]');
    expect(content).not.toContain('password');
    expect(content).not.toContain('secret');
    expect(content).not.toContain('token');
    expect(content).not.toContain('api_key');
  });
});
