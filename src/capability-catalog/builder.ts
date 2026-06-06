import type { CapabilitySummary } from '../types/project-context.js';
import {
  createGitWorkflowCapability,
  createPackageScriptCapability,
  createGitHubActionsRepairCapability,
} from '../nl/capabilities/index.js';
import type { Capability } from '../nl/capabilities/types.js';

export type CapabilityCatalogBuilderDeps = Record<string, never>;

interface CapabilityMetadata {
  id: string;
  title: string;
  inputKinds: string[];
  outputKinds: string[];
  sideEffects: Array<'none' | 'read' | 'write' | 'command' | 'network'>;
  requiresConfirmation: boolean;
  verificationRequired: boolean;
  currentStatus: 'current' | 'partial' | 'target' | 'unsupported';
  creator: () => Capability;
}

const KNOWN_CAPABILITY_METADATA: CapabilityMetadata[] = [
  {
    id: 'git-workflow',
    title: 'Git Workflow',
    inputKinds: ['git', 'repository', 'commit', 'push', 'pull', 'merge', 'branch'],
    outputKinds: ['action', 'report', 'status'],
    sideEffects: ['write', 'command'],
    requiresConfirmation: true,
    verificationRequired: true,
    currentStatus: 'current',
    creator: createGitWorkflowCapability,
  },
  {
    id: 'package-script',
    title: 'Package Script Runner',
    inputKinds: ['npm', 'yarn', 'pnpm', 'script', 'test', 'testing', 'build'],
    outputKinds: ['output', 'status', 'report'],
    sideEffects: ['command'],
    requiresConfirmation: true,
    verificationRequired: true,
    currentStatus: 'current',
    creator: createPackageScriptCapability,
  },
  {
    id: 'github-actions-repair',
    title: 'GitHub Actions Repair',
    inputKinds: ['ci', 'github-actions', 'workflow', 'repair', 'fix'],
    outputKinds: ['repair', 'suggestion', 'report'],
    sideEffects: ['write'],
    requiresConfirmation: true,
    verificationRequired: true,
    currentStatus: 'current',
    creator: createGitHubActionsRepairCapability,
  },
];

export class CapabilityCatalogBuilder {
  private readonly deps: CapabilityCatalogBuilderDeps;

  constructor(deps: CapabilityCatalogBuilderDeps) {
    this.deps = deps;
  }

  build(): CapabilitySummary[] {
    const summaries: CapabilitySummary[] = [];

    for (const metadata of KNOWN_CAPABILITY_METADATA) {
      summaries.push({
        id: metadata.id,
        title: metadata.title,
        inputKinds: metadata.inputKinds,
        outputKinds: metadata.outputKinds,
        sideEffects: metadata.sideEffects,
        requiresConfirmation: metadata.requiresConfirmation,
        verificationRequired: metadata.verificationRequired,
        currentStatus: metadata.currentStatus,
      });
    }

    return summaries;
  }

  getCurrentCapabilities(): Capability[] {
    return KNOWN_CAPABILITY_METADATA.map((meta) => meta.creator());
  }

  getCapabilityById(id: string): CapabilitySummary | undefined {
    return this.build().find((cap) => cap.id === id);
  }
}

export function createCapabilityCatalogBuilder(
  deps: CapabilityCatalogBuilderDeps
): CapabilityCatalogBuilder {
  return new CapabilityCatalogBuilder(deps);
}
