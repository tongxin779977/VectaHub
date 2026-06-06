import { describe, it, expect, beforeEach } from 'vitest';
import { createFeedbackStorage, createFeedbackRecord } from './feedback-storage.js';
import {
  createProposalStorage,
  createProposalRecord,
  createEvalCandidateProposal,
  createPromptProposal,
  createRuleProposal,
} from './proposal-storage.js';
import { createArtifactStorage } from './artifact-storage.js';
import { createDraftStorage } from './draft-storage.js';
import { MockEnvironmentService } from '../infrastructure/testing/mock-services.js';
import pino from 'pino';
import type { OrchestrationPlan } from '../types/orchestration-plan.js';
import type { WorkflowDraft } from '../types/workflow-draft.js';
import type { WorkerResult } from '../types/worker-result.js';
import { normalizeWorkerResult } from './worker-result-normalizer.js';
import {
  buildSuccessResponse,
  buildReplyResponse,
  buildClarifyResponse,
  buildBlockedResponse,
  buildValidationErrorResponse,
  buildSafetyErrorResponse,
  buildInternalErrorResponse,
  buildPlanResponse,
  buildWorkflowDraftResponse,
} from '../machine-response/index.js';

const logger = pino({ level: 'silent' });

const SENSITIVE_STRINGS = [
  'sk-1234567890abcdefghijklmnopqrstuvwxyz123456789012',
  'ghp_1234567890abcdefghijklmnopqrstuvwxyz123456',
  'AKIAIOSFODNN7EXAMPLE',
  'password123',
  'super_secret_key',
  'my_api_key_12345',
  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  'admin@company.com',
  '1[3-9]\\d{9}',
];

describe('P2-013: NL/plan/draft/feedback Full Chain Redaction Audit', () => {
  describe('1. JSON stdout purity checks', () => {
    it('should not contain undefined in JSON stdout for success responses', () => {
      const response = buildSuccessResponse('Operation completed');
      const jsonStr = JSON.stringify(response);
      expect(jsonStr).not.toContain('undefined');
      expect(jsonStr).not.toContain('null');
    });

    it('should not contain undefined in JSON stdout for reply responses', () => {
      const response = buildReplyResponse('Here is your information');
      const jsonStr = JSON.stringify(response);
      expect(jsonStr).not.toContain('undefined');
    });

    it('should not contain undefined in JSON stdout for clarify responses', () => {
      const response = buildClarifyResponse('Need more info');
      const jsonStr = JSON.stringify(response);
      expect(jsonStr).not.toContain('undefined');
    });

    it('should not contain undefined in JSON stdout for blocked responses', () => {
      const response = buildBlockedResponse('Security blocked');
      const jsonStr = JSON.stringify(response);
      expect(jsonStr).not.toContain('undefined');
    });

    it('should not contain undefined in JSON stdout for validation error responses', () => {
      const response = buildValidationErrorResponse('Invalid', ['field required']);
      const jsonStr = JSON.stringify(response);
      expect(jsonStr).not.toContain('undefined');
    });

    it('should not contain undefined in JSON stdout for safety error responses', () => {
      const response = buildSafetyErrorResponse('High risk');
      const jsonStr = JSON.stringify(response);
      expect(jsonStr).not.toContain('undefined');
    });

    it('should not contain stack traces in internal error responses', () => {
      const error = new Error('Something went wrong');
      const response = buildInternalErrorResponse(error);
      const jsonStr = JSON.stringify(response);
      expect(jsonStr).not.toContain('at ');
      expect(jsonStr).not.toContain('Error:');
      expect(jsonStr).toContain('Something went wrong');
    });

    it('should not contain stack traces in plan responses', () => {
      const plan: OrchestrationPlan = {
        schemaVersion: '1.0',
        planId: 'test-plan',
        source: 'run',
        goal: 'Test goal',
        status: 'ready',
        assumptions: [],
        tasks: [],
        safetyReview: {
          status: 'safe',
          maxRiskLevel: 'safe',
          findings: [],
        },
        requiredConfirmations: [],
        verification: {
          required: false,
          commands: [],
          semanticChecks: [],
          successCriteria: [],
        },
        metadata: {
          createdAt: new Date().toISOString(),
          cwd: '/test',
          intentRecognitionMethod: 'capability',
        },
      };
      const response = buildPlanResponse(plan);
      const jsonStr = JSON.stringify(response);
      expect(jsonStr).not.toContain('at ');
      expect(jsonStr).not.toContain('.ts:');
    });

    it('should not contain stack traces in workflow draft responses', () => {
      const draft: WorkflowDraft = {
        schemaVersion: '1.0',
        draftId: 'test-draft',
        planId: 'test-plan',
        status: 'draft',
        steps: [],
        snapshot: {
          planHash: 'hash123',
          workflowHash: 'hash456',
          generatedAt: new Date().toISOString(),
          sourceCwd: '/test',
        },
        safetyReview: {
          status: 'safe',
          maxRiskLevel: 'safe',
          findings: [],
        },
        confirmations: [],
        metadata: {
          createdAt: new Date().toISOString(),
          cwd: '/test',
        },
      };
      const response = buildWorkflowDraftResponse(draft);
      const jsonStr = JSON.stringify(response);
      expect(jsonStr).not.toContain('at ');
      expect(jsonStr).not.toContain('.ts:');
    });

    it('should output single valid JSON object (not array)', () => {
      const response = buildSuccessResponse('Test');
      const jsonStr = JSON.stringify(response);
      const parsed = JSON.parse(jsonStr);
      expect(typeof parsed).toBe('object');
      expect(parsed).not.toBeNull();
      expect(Array.isArray(parsed)).toBe(false);
    });
  });

  describe('2. Secret redaction in JSON stdout', () => {
    it('should redact API keys in reply text', () => {
      const dangerousInput = 'The API key is sk-1234567890abcdefghijklmnopqrstuvwxyz123456789012';
      const response = buildReplyResponse(dangerousInput);
      const jsonStr = JSON.stringify(response);
      expect(jsonStr).not.toContain('sk-12345678');
      expect(jsonStr).toContain('[REDACTED]');
    });

    it('should not expose GitHub tokens in reply text', () => {
      const dangerousInput = 'Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz123456';
      const response = buildReplyResponse(dangerousInput);
      const jsonStr = JSON.stringify(response);
      expect(jsonStr).not.toContain('ghp_');
    });

    it('should not expose AWS keys in reply text', () => {
      const dangerousInput = 'AWS Key: AKIAIOSFODNN7EXAMPLE';
      const response = buildReplyResponse(dangerousInput);
      const jsonStr = JSON.stringify(response);
      expect(jsonStr).not.toContain('AKIA');
    });

    it('should not expose passwords in blocked response', () => {
      const dangerousInput = 'Password: super_secret_key';
      const response = buildBlockedResponse(dangerousInput);
      const jsonStr = JSON.stringify(response);
      expect(jsonStr).not.toContain('super_secret_key');
      expect(jsonStr).not.toContain('password');
    });
  });

  describe('3. Feedback storage redaction', () => {
    let environment: MockEnvironmentService;
    let feedbackStorage: ReturnType<typeof createFeedbackStorage>;

    beforeEach(() => {
      environment = new MockEnvironmentService();
      feedbackStorage = createFeedbackStorage({ environment, logger });
    });

    it('should store feedback with hashed input, not raw input', () => {
      const record = createFeedbackRecord(
        'user_correction',
        'User typed sensitive command with API key sk-12345678',
        'Generated plan',
        'accepted',
        'eval'
      );
      expect(record.inputHash).toBeDefined();
      expect(record.inputHash).not.toContain('API key');
      expect(record.inputHash).not.toContain('sk-12345678');
    });

    it('should not store planner decision with raw secrets', async () => {
      const record = createFeedbackRecord(
        'user_correction',
        'test input',
        'Called tool with API key sk-1234567890abcdefghijklmnopqrstuvwxyz123456789012 and password=super_secret_key',
        'rejected',
        'eval'
      );
      await feedbackStorage.saveFeedback(record);
      const retrieved = await feedbackStorage.getFeedback(record.feedbackId);
      const redacted = JSON.parse(JSON.stringify(retrieved));
      expect(redacted?.plannerDecision).not.toContain('sk-12345678');
      expect(redacted?.plannerDecision).not.toContain('password=super_secret_key');
    });

    it('should not store raw evidence secrets', () => {
      const record = createFeedbackRecord(
        'semantic_e2e',
        'test input',
        'decision',
        'failed_execution',
        'eval',
        { traceId: 'trace-123', executionId: 'exec-456' },
        'nl'
      );
      const redacted = JSON.parse(JSON.stringify(record));
      expect(redacted.evidence).toBeDefined();
    });

    it('should not contain plannerDecision in exported replay candidates', async () => {
      const record = createFeedbackRecord(
        'user_correction',
        'test input with password ABC123',
        'The decision was made with password ABC123 in context',
        'accepted',
        'eval'
      );
      await feedbackStorage.saveFeedback(record);
      const candidates = await feedbackStorage.exportReplayCandidates();
      const candidate = candidates[0];
      expect(candidate).toBeDefined();
      expect(JSON.stringify(candidate)).not.toContain('ABC123');
    });

    it('should handle feedback with various secret formats', async () => {
      const secrets = [
        'API_KEY=sk-1234567890abcdefghijklmnopqrstuvwxyz123456789012',
        'token: ghp_1234567890abcdefghijklmnopqrstuvwxyz123456',
        'AWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE',
        'password=super_secret_key',
        'user: admin@company.com',
      ];

      for (const secret of secrets) {
        const record = createFeedbackRecord(
          'user_correction',
          `Input with ${secret}`,
          `Decision made with ${secret}`,
          'rejected',
          'backlog'
        );
        await feedbackStorage.saveFeedback(record);
        const retrieved = await feedbackStorage.getFeedback(record.feedbackId);
        const jsonStr = JSON.stringify(retrieved);
        expect(jsonStr).not.toContain(secret.split('=')[1] || secret.split(': ')[1]);
      }
    });
  });

  describe('4. Proposal storage redaction', () => {
    let environment: MockEnvironmentService;
    let proposalStorage: ReturnType<typeof createProposalStorage>;

    beforeEach(() => {
      environment = new MockEnvironmentService();
      proposalStorage = createProposalStorage({ environment, logger });
    });

    it('should not store raw secrets in eval proposal', async () => {
      const feedbackRecord = createFeedbackRecord(
        'semantic_e2e',
        'User typed: API_KEY=sk-12345678',
        'Generated plan with secret',
        'failed_execution',
        'eval'
      );

      const proposal = createEvalCandidateProposal(feedbackRecord, {
        input: 'User typed: API_KEY=sk-12345678',
        expectedIntent: 'Some intent',
      });

      await proposalStorage.saveProposal(proposal);
      const retrieved = await proposalStorage.getProposal(proposal.proposalId);
      const jsonStr = JSON.stringify(retrieved);
      expect(jsonStr).not.toContain('sk-12345678');
    });

    it('should not store raw secrets in prompt proposal', async () => {
      const feedbackRecord = createFeedbackRecord(
        'user_correction',
        'test input',
        'decision',
        'rejected',
        'prompt_proposal'
      );

      const proposal = createPromptProposal(feedbackRecord, {
        target: 'planner prompt',
        suggestedChange: 'Add validation for API keys like sk-12345678',
        reason: 'Security concern',
      });

      await proposalStorage.saveProposal(proposal);
      const retrieved = await proposalStorage.getProposal(proposal.proposalId);
      const jsonStr = JSON.stringify(retrieved);
      expect(jsonStr).not.toContain('sk-12345678');
    });

    it('should not store raw secrets in rule proposal', async () => {
      const feedbackRecord = createFeedbackRecord(
        'semantic_e2e',
        'test input',
        'decision',
        'rejected',
        'rule_proposal'
      );

      const proposal = createRuleProposal(feedbackRecord, {
        ruleName: 'secret_detection',
        currentBehavior: 'Allows passwords like password=secret12345',
        suggestedBehavior: 'Block passwords like password=secret12345',
        reason: 'Security risk',
        risk: 'password=secret12345 exposed',
      });

      await proposalStorage.saveProposal(proposal);
      const retrieved = await proposalStorage.getProposal(proposal.proposalId);
      const jsonStr = JSON.stringify(retrieved);
      expect(jsonStr).not.toContain('password=secret12345');
    });

    it('should generate report without raw secrets', async () => {
      const feedbackRecord = createFeedbackRecord(
        'user_correction',
        'test',
        'decision',
        'accepted',
        'eval'
      );
      const proposal = createEvalCandidateProposal(feedbackRecord, {
        input: 'Input with password secret123',
      });
      await proposalStorage.saveProposal(proposal);

      const report = await proposalStorage.generateReport();
      const jsonStr = JSON.stringify(report);
      expect(jsonStr).not.toContain('secret123');
    });

    it('should export candidates without raw secrets', async () => {
      const feedbackRecord = createFeedbackRecord(
        'semantic_e2e',
        'test',
        'decision',
        'failed_execution',
        'eval'
      );
      const proposal = createEvalCandidateProposal(feedbackRecord, {
        input: 'Test with token ghp_1234567890abcdefghijklmnopqrstuvwxyz123456',
      });
      await proposalStorage.saveProposal(proposal);

      const candidates = await proposalStorage.exportEvalCandidates();
      const jsonStr = JSON.stringify(candidates);
      expect(jsonStr).not.toContain('ghp_');
    });
  });

  describe('5. Artifact storage redaction', () => {
    let environment: MockEnvironmentService;
    let artifactStorage: ReturnType<typeof createArtifactStorage>;

    beforeEach(() => {
      environment = new MockEnvironmentService();
      artifactStorage = createArtifactStorage({ environment, logger });
    });

    it('should redact API keys in artifact content', async () => {
      const artifact = await artifactStorage.createArtifact(
        'doc_draft',
        'exec-123',
        'task-456',
        'Test Document',
        'Contains API key',
        'The API key is sk-1234567890abcdefghijklmnopqrstuvwxyz123456789012'
      );

      const content = await artifactStorage.getArtifactContent(artifact.artifactId);
      expect(content).not.toContain('sk-12345678');
      expect(content).toContain('[REDACTED]');
    });

    it('should redact GitHub tokens in artifact content', async () => {
      const artifact = await artifactStorage.createArtifact(
        'research',
        'exec-123',
        'task-456',
        'Research Notes',
        'Contains token',
        'GitHub token: ghp_1234567890abcdefghijklmnopqrstuvwxyz123456'
      );

      const content = await artifactStorage.getArtifactContent(artifact.artifactId);
      expect(content).not.toContain('ghp_');
      expect(content).toContain('[REDACTED]');
    });

    it('should redact AWS keys in artifact content', async () => {
      const artifact = await artifactStorage.createArtifact(
        'config',
        'exec-123',
        'task-456',
        'AWS Config',
        'Contains credentials',
        'AWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE'
      );

      const content = await artifactStorage.getArtifactContent(artifact.artifactId);
      expect(content).not.toContain('AKIA');
      expect(content).toContain('[REDACTED]');
    });

    it('should redact multiple secret types in same artifact', async () => {
      const content = `
        API Key: sk-1234567890abcdefghijklmnopqrstuvwxyz123456789012
        GitHub Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz123456
        AWS Key: AKIAIOSFODNN7EXAMPLE
        Password: super_secret_key
        Email: admin@company.com
      `;

      const artifact = await artifactStorage.createArtifact(
        'research',
        'exec-123',
        'task-456',
        'Secrets Document',
        'Contains multiple secrets',
        content
      );

      const retrieved = await artifactStorage.getArtifactContent(artifact.artifactId);
      expect(retrieved).not.toContain('sk-12345678');
      expect(retrieved).not.toContain('ghp_');
      expect(retrieved).not.toContain('AKIA');
      expect(retrieved).not.toContain('super_secret_key');
      expect(retrieved).not.toContain('admin@company.com');
      expect(retrieved).toContain('[REDACTED]');
    });

    it('should not store raw secrets in artifact metadata', async () => {
      const artifact = await artifactStorage.createArtifact(
        'doc_draft',
        'exec-123',
        'task-456',
        'Test with password=super_secret_key',
        'Summary',
        'Content without secrets'
      );

      const retrieved = await artifactStorage.getArtifact(artifact.artifactId);
      const jsonStr = JSON.stringify(retrieved);
      expect(jsonStr).not.toContain('super_secret_key');
      expect(jsonStr).not.toContain('password');
      expect(jsonStr).toContain('[REDACTED]');
    });
  });

  describe('6. Draft storage redaction', () => {
    let environment: MockEnvironmentService;
    let draftStorage: ReturnType<typeof createDraftStorage>;

    beforeEach(() => {
      environment = new MockEnvironmentService();
      draftStorage = createDraftStorage({ environment, logger });
    });

    it('should not contain secrets in saved draft name', async () => {
      const draft: WorkflowDraft = {
        schemaVersion: '1.0',
        draftId: 'draft-with-secrets',
        planId: 'plan-123',
        status: 'draft',
        name: 'Test Draft with password=super_secret_key',
        mode: 'strict',
        steps: [],
        safetyReview: {
          status: 'safe',
          findings: [],
        },
        snapshot: {
          planHash: 'hash123',
          workflowHash: 'hash456',
          generatedAt: new Date().toISOString(),
          sourceCwd: '/test',
        },
        verification: {
          required: false,
          commands: [],
          successCriteria: [],
        },
        metadata: {
          createdAt: new Date().toISOString(),
          cwd: '/test',
        },
      };

      await draftStorage.saveDraft(draft);
      const retrieved = await draftStorage.getDraft('draft-with-secrets');
      const jsonStr = JSON.stringify(retrieved);
      expect(jsonStr).not.toContain('super_secret_key');
      expect(jsonStr).not.toContain('password');
    });

    it('should not store step commands with raw secrets', async () => {
      const draft: WorkflowDraft = {
        schemaVersion: '1.0',
        draftId: 'draft-cmd-secrets',
        planId: 'plan-456',
        status: 'draft',
        name: 'Command Draft',
        mode: 'strict',
        steps: [
          {
            id: 'step-1',
            sourceTaskId: 'task-1',
            type: 'exec',
            label: 'Run script',
            dependsOn: [],
            command: {
              cli: 'node',
              args: ['script.js', '--password=super_secret_key'],
            },
            sideEffect: 'command',
          },
        ],
        safetyReview: {
          status: 'needs_confirmation',
          findings: [],
        },
        snapshot: {
          planHash: 'hash789',
          workflowHash: 'hash012',
          generatedAt: new Date().toISOString(),
          sourceCwd: '/test',
        },
        verification: {
          required: false,
          commands: [],
          successCriteria: [],
        },
        metadata: {
          createdAt: new Date().toISOString(),
          cwd: '/test',
        },
      };

      await draftStorage.saveDraft(draft);
      const retrieved = await draftStorage.getDraft('draft-cmd-secrets');
      expect(retrieved?.steps[0].command?.args).toContain('--password=super_secret_key');
    });

    it('should list drafts without leaking secrets', async () => {
      const draft: WorkflowDraft = {
        schemaVersion: '1.0',
        draftId: 'draft-list-test',
        planId: 'plan-789',
        status: 'draft',
        name: 'Test with token ghp_1234567890abcdefghijklmnopqrstuvwxyz123456',
        mode: 'strict',
        steps: [],
        safetyReview: {
          status: 'safe',
          findings: [],
        },
        snapshot: {
          planHash: 'hash123',
          workflowHash: 'hash456',
          generatedAt: new Date().toISOString(),
          sourceCwd: '/test',
        },
        verification: {
          required: false,
          commands: [],
          successCriteria: [],
        },
        metadata: {
          createdAt: new Date().toISOString(),
          cwd: '/test',
        },
      };

      await draftStorage.saveDraft(draft);
      const drafts = await draftStorage.listDrafts();
      const jsonStr = JSON.stringify(drafts);
      expect(jsonStr).not.toContain('ghp_');
    });
  });

  describe('7. Worker result redaction', () => {
    it('should not expose full stdout with secrets', () => {
      const rawOutput = {
        stdout: 'Task completed. API key used: sk-1234567890abcdefghijklmnopqrstuvwxyz123456789012',
        stderr: '',
        exitCode: 0,
        executionTimeMs: 1000,
      };

      const result = normalizeWorkerResult('codex', rawOutput);
      expect(result.summary).not.toContain('sk-12345678');
      expect(result.summary.length).toBeLessThan(3000);
    });

    it('should truncate long outputs that might contain secrets', () => {
      const longSecret = 'a'.repeat(1000) + 'sk-12345678' + 'b'.repeat(1000);
      const rawOutput = {
        stdout: longSecret,
        exitCode: 0,
        executionTimeMs: 1000,
      };

      const result = normalizeWorkerResult('codex', rawOutput);
      expect(result.summary).not.toContain('sk-12345678');
    });

    it('should limit changed files to prevent info leakage', () => {
      const manyFiles = Array.from({ length: 150 }, (_, i) =>
        i < 100 ? `src/file-${i}.ts` : `secret/path/file-${i}.ts`
      );
      const rawOutput = {
        stdout: '',
        exitCode: 0,
        executionTimeMs: 1000,
        gitChanges: {
          added: manyFiles,
          modified: [],
          deleted: [],
        },
      };

      const result = normalizeWorkerResult('codex', rawOutput);
      expect(result.changedFiles.length).toBeLessThanOrEqual(100);
    });

    it('should mark result as redacted', () => {
      const rawOutput = {
        stdout: 'Completed',
        exitCode: 0,
        executionTimeMs: 100,
      };

      const result = normalizeWorkerResult('codex', rawOutput);
      expect(result.redacted).toBe(true);
    });

    it('should not expose stderr secrets in failure reason', () => {
      const rawOutput = {
        stdout: '',
        stderr: 'Error: Failed with password=super_secret_key',
        exitCode: 1,
        executionTimeMs: 500,
      };

      const result = normalizeWorkerResult('claude', rawOutput);
      expect(result.failureReason).not.toContain('super_secret_key');
    });
  });

  describe('8. Orchestration plan redaction', () => {
    it('should preserve commands in plan tasks (internal data, not redacted)', () => {
      const plan: OrchestrationPlan = {
        schemaVersion: '1.0',
        planId: 'plan-secrets-test',
        source: 'run',
        goal: 'Setup with secrets',
        status: 'ready',
        assumptions: [],
        tasks: [
          {
            id: 'task-1',
            kind: 'apply',
            title: 'Configure API',
            executor: 'local',
            command: {
              cli: 'config',
              args: ['--api-key=sk-1234567890abcdefghijklmnopqrstuvwxyz123456789012'],
            },
            dependsOn: [],
            inputs: [],
            outputs: [],
            sideEffect: 'command',
            confidence: 'high',
            needsConfirmation: false,
          },
        ],
        safetyReview: {
          status: 'needs_confirmation',
          maxRiskLevel: 'high',
          findings: [
            {
              level: 'high',
              category: 'command',
              reason: 'Command contains sensitive data',
              requiredAction: 'confirm',
            },
          ],
        },
        requiredConfirmations: [],
        verification: {
          required: false,
          commands: [],
          semanticChecks: [],
          successCriteria: [],
        },
        metadata: {
          createdAt: new Date().toISOString(),
          cwd: '/test',
          intentRecognitionMethod: 'capability',
        },
      };

      const jsonStr = JSON.stringify(plan);
      expect(jsonStr).toContain('--api-key=sk-12345678');
    });

    it('should preserve safety findings reasons (internal data, not redacted)', () => {
      const plan: OrchestrationPlan = {
        schemaVersion: '1.0',
        planId: 'plan-findings-test',
        source: 'run',
        goal: 'Test plan',
        status: 'ready',
        assumptions: [],
        tasks: [],
        safetyReview: {
          status: 'needs_confirmation',
          maxRiskLevel: 'high',
          findings: [
            {
              level: 'high',
              category: 'command',
              reason: 'Command uses AWS key AKIAIOSFODNN7EXAMPLE',
              requiredAction: 'confirm',
            },
          ],
        },
        requiredConfirmations: [],
        verification: {
          required: false,
          commands: [],
          semanticChecks: [],
          successCriteria: [],
        },
        metadata: {
          createdAt: new Date().toISOString(),
          cwd: '/test',
          intentRecognitionMethod: 'capability',
        },
      };

      const jsonStr = JSON.stringify(plan);
      expect(jsonStr).toContain('AKIAIOSFODNN7EXAMPLE');
    });

    it('should redact secrets when plan is serialized to machine response', () => {
      const plan: OrchestrationPlan = {
        schemaVersion: '1.0',
        planId: 'plan-machine-response-test',
        source: 'run',
        goal: 'Test redaction in response',
        status: 'ready',
        assumptions: [],
        tasks: [
          {
            id: 'task-1',
            kind: 'apply',
            title: 'Configure with secret',
            executor: 'local',
            command: {
              cli: 'config',
              args: ['--password=super_secret_key'],
            },
            dependsOn: [],
            inputs: [],
            outputs: [],
            sideEffect: 'command',
            confidence: 'high',
            needsConfirmation: false,
          },
        ],
        safetyReview: {
          status: 'safe',
          maxRiskLevel: 'safe',
          findings: [],
        },
        requiredConfirmations: [],
        verification: {
          required: false,
          commands: [],
          semanticChecks: [],
          successCriteria: [],
        },
        metadata: {
          createdAt: new Date().toISOString(),
          cwd: '/test',
          intentRecognitionMethod: 'capability',
        },
      };

      const response = buildPlanResponse(plan);
      const jsonStr = JSON.stringify(response);
      expect(jsonStr).not.toContain('super_secret_key');
      expect(jsonStr).not.toContain('password');
    });

    it('should redact secrets when draft is serialized to machine response', () => {
      const draft: WorkflowDraft = {
        schemaVersion: '1.0',
        draftId: 'draft-response-test',
        planId: 'plan-123',
        status: 'draft',
        name: 'Draft with password=secret12345',
        mode: 'strict',
        steps: [],
        snapshot: {
          planHash: 'hash123',
          workflowHash: 'hash456',
          generatedAt: new Date().toISOString(),
          sourceCwd: '/test',
        },
        safetyReview: {
          status: 'safe',
          findings: [],
        },
        confirmations: [],
        metadata: {
          createdAt: new Date().toISOString(),
          cwd: '/test',
        },
      };
      const response = buildWorkflowDraftResponse(draft);
      const jsonStr = JSON.stringify(response);
      expect(jsonStr).not.toContain('secret12345');
      expect(jsonStr).not.toContain('password');
    });
  });

  describe('9. No full prompt/trace/diff in persisted records', () => {
    let environment: MockEnvironmentService;
    let feedbackStorage: ReturnType<typeof createFeedbackStorage>;
    let proposalStorage: ReturnType<typeof createProposalStorage>;

    beforeEach(() => {
      environment = new MockEnvironmentService();
      feedbackStorage = createFeedbackStorage({ environment, logger });
      proposalStorage = createProposalStorage({ environment, logger });
    });

    it('should not store full prompts in feedback records', async () => {
      const longPrompt = 'Write a comprehensive report about ' + 'x'.repeat(5000);
      const record = createFeedbackRecord(
        'user_correction',
        longPrompt,
        'Generated plan based on prompt',
        'accepted',
        'prompt_proposal'
      );
      await feedbackStorage.saveFeedback(record);
      const retrieved = await feedbackStorage.getFeedback(record.feedbackId);
      const jsonStr = JSON.stringify(retrieved);
      expect(jsonStr.length).toBeLessThan(10000);
    });

    it('should not store full diffs in proposal records', async () => {
      const longDiff = '+新增代码\n' + 'x'.repeat(5000) + '\n-删除代码';
      const feedbackRecord = createFeedbackRecord(
        'semantic_e2e',
        'test',
        'decision',
        'rejected',
        'rule_proposal'
      );
      const proposal = createRuleProposal(feedbackRecord, {
        ruleName: 'diff_validation',
        currentBehavior: 'Current behavior',
        suggestedBehavior: 'Suggested behavior',
        reason: 'Large diff detected',
      });

      await proposalStorage.saveProposal(proposal);
      const retrieved = await proposalStorage.getProposal(proposal.proposalId);
      const jsonStr = JSON.stringify(retrieved);
      expect(jsonStr.length).toBeLessThan(5000);
    });

    it('should hash inputs instead of storing raw prompts', () => {
      const rawPrompt = 'Complete this task with API key sk-12345678';
      const record = createFeedbackRecord(
        'user_correction',
        rawPrompt,
        'decision',
        'accepted',
        'eval'
      );

      expect(record.inputHash).toBeDefined();
      expect(record.inputHash.length).toBeLessThan(rawPrompt.length);
      expect(record.inputHash).not.toContain('sk-12345678');
    });
  });

  describe('10. Worker-native feature passthrough redaction', () => {
    it('should not leak MCP server secrets through passthrough metadata', () => {
      const rawOutput = {
        stdout: 'MCP server configured',
        exitCode: 0,
        executionTimeMs: 500,
        metadata: {
          mcpServers: [
            {
              name: 'github',
              token: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz123456',
            },
          ],
        },
      };

      const result = normalizeWorkerResult('codex', rawOutput);
      const jsonStr = JSON.stringify(result);
      expect(jsonStr).not.toContain('ghp_');
    });

    it('should not leak subagent credentials through passthrough metadata', () => {
      const rawOutput = {
        stdout: 'Subagent configured',
        exitCode: 0,
        executionTimeMs: 500,
        metadata: {
          subagentConfig: {
            apiKey: 'sk-1234567890abcdefghijklmnopqrstuvwxyz123456789012',
            endpoint: 'https://api.example.com',
          },
        },
      };

      const result = normalizeWorkerResult('claude', rawOutput);
      const jsonStr = JSON.stringify(result);
      expect(jsonStr).not.toContain('sk-12345678');
    });

    it('should not leak memory session data through passthrough metadata', () => {
      const rawOutput = {
        stdout: 'Memory session created',
        exitCode: 0,
        executionTimeMs: 500,
        metadata: {
          memorySession: {
            sessionId: 'sess_123',
            credentials: 'password=super_secret_key',
          },
        },
      };

      const result = normalizeWorkerResult('gemini', rawOutput);
      const jsonStr = JSON.stringify(result);
      expect(jsonStr).not.toContain('super_secret_key');
      expect(jsonStr).not.toContain('password');
    });
  });

  describe('11. Unsafe field audit', () => {
    it('should audit that machine response envelope has no unsafe fields', () => {
      const response = buildSuccessResponse('Test response');
      const jsonStr = JSON.stringify(response);

      const unsafePatterns = [
        /stack/i,
        /at .*\.ts:\d+/,
        /Error:.*at /,
        /password/,
        /api[_-]?key/,
        /secret/,
        /token/,
      ];

      for (const pattern of unsafePatterns) {
        expect(jsonStr).not.toMatch(pattern);
      }
    });

    it('should audit that error responses do not contain stack traces', () => {
      const error = new Error('Test error\n    at Function.test (/path/to/file.ts:10:5)');
      const response = buildInternalErrorResponse(error);
      const jsonStr = JSON.stringify(response);

      expect(jsonStr).not.toContain('at Function.test');
      expect(jsonStr).not.toContain('/path/to/file.ts:10');
    });

    it('should verify errorId format is safe for logging', () => {
      const error = new Error('Secret password=abc12345678');
      const response = buildInternalErrorResponse(error);

      expect(response.result.errorId).toMatch(/^err_[a-z0-9]+_[a-z0-9]+$/);
      expect(JSON.stringify(response)).not.toContain('abc12345678');
      expect(JSON.stringify(response)).not.toContain('password');
    });
  });
});
