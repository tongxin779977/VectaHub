export type ArtifactType =
  | 'research_notes'
  | 'doc_draft'
  | 'implementation_plan'
  | 'patch_summary'
  | 'test_report'
  | 'review_findings'
  | 'recovery_plan'
  | 'other';

export interface ArtifactReference {
  artifactId: string;
  type: ArtifactType;
  producerExecutionId: string;
  producerTaskId: string;
  title: string;
  summary: string;
  contentHash: string;
  createdAt: string;
  storagePath: string;
  metadata: Record<string, string>;
}

export interface ArtifactRefLink {
  artifactId: string;
  refType: 'input' | 'output';
  producerStepId?: string;
  consumerStepId?: string;
}

export interface ArtifactHandover {
  handoverId: string;
  planId?: string;
  draftId?: string;
  executionId?: string;
  artifactRefs: ArtifactRefLink[];
  createdAt: string;
}

export interface ArtifactStorageConfig {
  basePath: string;
  maxArtifactSizeBytes: number;
  allowedContentTypes: string[];
  forbiddenPatterns: string[];
}
