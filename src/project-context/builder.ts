import { join } from 'node:path';
import type {
  ProjectContextPack,
  PackageManager,
  SecurityMode,
  GitInfo,
  WorkflowInfo,
  AgentRuntimeSummary,
  CapabilitySummary,
  RecentFailure,
} from '../types/project-context.js';
import type { IEnvironmentService, IConfigService } from '../infrastructure/interfaces/index.js';
import { getAgentRegistry } from '../agent-runtime/registry.js';

export interface ProjectContextBuilderDeps {
  environment: IEnvironmentService;
  config?: IConfigService;
}

export class ProjectContextBuilder {
  private readonly deps: ProjectContextBuilderDeps;

  constructor(deps: ProjectContextBuilderDeps) {
    this.deps = deps;
  }

  async build(): Promise<ProjectContextPack> {
    const cwd = this.deps.environment.getCwd();

    return {
      schemaVersion: '1.0',
      cwd,
      packageManager: await this.detectPackageManager(cwd),
      packageScripts: await this.readPackageScripts(cwd),
      git: await this.collectGitInfo(cwd),
      workflows: await this.listWorkflows(),
      agents: this.collectAgentInfo(),
      capabilities: this.collectCapabilityInfo(),
      securityMode: this.detectSecurityMode(),
      recentFailures: await this.collectRecentFailures(),
    };
  }

  private async detectPackageManager(cwd: string): Promise<PackageManager> {
    const lockFiles = [
      { file: 'package-lock.json', manager: 'npm' as const },
      { file: 'yarn.lock', manager: 'yarn' as const },
      { file: 'pnpm-lock.yaml', manager: 'pnpm' as const },
      { file: 'bun.lockb', manager: 'bun' as const },
    ];

    for (const { file, manager } of lockFiles) {
      const filePath = join(cwd, file);
      if (this.deps.environment.exists(filePath)) {
        return manager;
      }
    }

    const packageJsonPath = join(cwd, 'package.json');
    if (this.deps.environment.exists(packageJsonPath)) {
      return 'unknown';
    }

    return 'unknown';
  }

  private async readPackageScripts(cwd: string): Promise<Array<{ name: string; command: string }>> {
    const packageJsonPath = join(cwd, 'package.json');

    if (!this.deps.environment.exists(packageJsonPath)) {
      return [];
    }

    try {
      const content = await this.deps.environment.readFileAsync(packageJsonPath);
      const packageJson = JSON.parse(content) as { scripts?: Record<string, string> };

      if (!packageJson.scripts || typeof packageJson.scripts !== 'object') {
        return [];
      }

      return Object.entries(packageJson.scripts).map(([name, command]) => ({
        name,
        command: typeof command === 'string' ? command : String(command),
      }));
    } catch {
      return [];
    }
  }

  private async collectGitInfo(cwd: string): Promise<GitInfo | undefined> {
    try {
      const gitInfo: GitInfo = {};

      const gitDir = join(cwd, '.git');
      if (!this.deps.environment.exists(gitDir)) {
        return undefined;
      }

      try {
        const { stdout: branch } = await this.deps.environment.exec('git branch --show-current', { cwd });
        gitInfo.branch = branch.trim();
      } catch {
        // Ignore error
      }

      try {
        const { stdout: status } = await this.deps.environment.exec('git status --porcelain', { cwd });
        gitInfo.hasUncommittedChanges = status.trim().length > 0;
      } catch {
        // Ignore error
      }

      try {
        const { stdout: log } = await this.deps.environment.exec(
          'git log -1 --pretty=format:"%h - %s"',
          { cwd }
        );
        gitInfo.summary = log.trim();
      } catch {
        // Ignore error
      }

      if (Object.keys(gitInfo).length === 0) {
        return undefined;
      }

      return gitInfo;
    } catch {
      return undefined;
    }
  }

  private async listWorkflows(): Promise<WorkflowInfo[]> {
    try {
      const cwd = this.deps.environment.getCwd();
      const workflowsDir = join(cwd, '.vectahub', 'workflows');

      if (!this.deps.environment.exists(workflowsDir)) {
        return [];
      }

      const files = this.deps.environment.readDir(workflowsDir);
      const workflowFiles = files.filter(
        (f) => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json')
      );

      const workflows: WorkflowInfo[] = [];

      for (const file of workflowFiles) {
        try {
          const filePath = join(workflowsDir, file);
          const content = await this.deps.environment.readFileAsync(filePath);
          const parsed = JSON.parse(content) as { id?: string; name?: string };

          const id = parsed.id || file.replace(/\.(yaml|yml|json)$/, '');
          const name = parsed.name || id;

          workflows.push({
            id,
            name,
            source: 'file',
          });
        } catch {
          // Ignore parse error
        }
      }

      return workflows;
    } catch {
      return [];
    }
  }

  private collectAgentInfo(): AgentRuntimeSummary[] {
    try {
      const registry = getAgentRegistry();
      const descriptors = registry.getAllDescriptors();

      return descriptors.map((descriptor) => ({
        id: descriptor.id,
        displayName: descriptor.displayName,
        currentStatus: 'installed' as const,
      }));
    } catch {
      return [];
    }
  }

  private collectCapabilityInfo(): CapabilitySummary[] {
    try {
      const knownCapabilities: CapabilitySummary[] = [
        {
          id: 'git-workflow',
          title: 'Git Workflow',
          inputKinds: ['git', 'repository'],
          outputKinds: ['action', 'report'],
          sideEffects: ['write', 'command'],
          requiresConfirmation: true,
          verificationRequired: true,
          currentStatus: 'current',
        },
        {
          id: 'package-script',
          title: 'Package Script Runner',
          inputKinds: ['npm', 'yarn', 'pnpm', 'script'],
          outputKinds: ['output', 'status'],
          sideEffects: ['command'],
          requiresConfirmation: true,
          verificationRequired: true,
          currentStatus: 'current',
        },
        {
          id: 'github-actions-repair',
          title: 'GitHub Actions Repair',
          inputKinds: ['ci', 'github-actions', 'workflow'],
          outputKinds: ['repair', 'suggestion'],
          sideEffects: ['write'],
          requiresConfirmation: true,
          verificationRequired: true,
          currentStatus: 'current',
        },
      ];

      return knownCapabilities;
    } catch {
      return [];
    }
  }

  private detectSecurityMode(): SecurityMode {
    return 'strict';
  }

  private async collectRecentFailures(): Promise<RecentFailure[]> {
    return [];
  }
}

export function createProjectContextBuilder(deps: ProjectContextBuilderDeps): ProjectContextBuilder {
  return new ProjectContextBuilder(deps);
}
