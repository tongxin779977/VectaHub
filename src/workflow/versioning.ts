import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';

function getExtName(filepath: string): string {
  const match = filepath.match(/\.([^./\\]+)$/);
  return match ? '.' + match[1] : '';
}

export interface WorkflowVersion {
  version: number;
  workflowId: string;
  message: string;
  createdAt: Date;
}

function getVersionsDir(environment: IEnvironmentService, baseDir: string, workflowId: string): string {
  return environment.joinPath(baseDir, workflowId, 'versions');
}

function getVersionDir(environment: IEnvironmentService, baseDir: string, workflowId: string, version: number): string {
  return environment.joinPath(getVersionsDir(environment, baseDir, workflowId), String(version));
}

function getNextVersion(environment: IEnvironmentService, baseDir: string, workflowId: string): number {
  const versionsDir = getVersionsDir(environment, baseDir, workflowId);
  if (!environment.exists(versionsDir)) return 1;
  const entries = environment.readDir(versionsDir)
    .filter(e => environment.exists(environment.joinPath(versionsDir, e, 'meta.json')))
    .map(Number)
    .filter(n => !isNaN(n));
  return entries.length === 0 ? 1 : Math.max(...entries) + 1;
}

export function saveVersion(
  environment: IEnvironmentService,
  baseDir: string,
  workflowId: string,
  yamlContent: string,
  message: string
): WorkflowVersion {
  const version = getNextVersion(environment, baseDir, workflowId);
  const vDir = getVersionDir(environment, baseDir, workflowId, version);
  environment.ensureDir(vDir);

  environment.writeFile(environment.joinPath(vDir, 'workflow.yaml'), yamlContent);
  environment.writeFile(
    environment.joinPath(vDir, 'meta.json'),
    JSON.stringify({ version, workflowId, message, createdAt: new Date().toISOString() })
  );

  return { version, workflowId, message, createdAt: new Date() };
}

export function listVersions(environment: IEnvironmentService, baseDir: string, workflowId: string): WorkflowVersion[] {
  const versionsDir = getVersionsDir(environment, baseDir, workflowId);
  if (!environment.exists(versionsDir)) return [];

  const entries = environment.readDir(versionsDir)
    .filter(e => environment.exists(environment.joinPath(versionsDir, e, 'meta.json')))
    .map(Number)
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);

  return entries.map(v => {
    const meta = JSON.parse(environment.readFile(environment.joinPath(getVersionDir(environment, baseDir, workflowId, v), 'meta.json')));
    return {
      version: meta.version,
      workflowId: meta.workflowId,
      message: meta.message,
      createdAt: new Date(meta.createdAt),
    };
  });
}

export function rollbackVersion(environment: IEnvironmentService, baseDir: string, workflowId: string, version: number): string {
  const versionsDir = getVersionsDir(environment, baseDir, workflowId);
  if (!environment.exists(versionsDir)) {
    throw new Error(`No versions found for workflow ${workflowId}`);
  }

  let targetVersion = version;
  if (targetVersion === 0) {
    const entries = environment.readDir(versionsDir)
      .filter(e => environment.exists(environment.joinPath(versionsDir, e, 'meta.json')))
      .map(Number)
      .filter(n => !isNaN(n));
    targetVersion = Math.max(...entries);
  }

  const yamlPath = environment.joinPath(getVersionDir(environment, baseDir, workflowId, targetVersion), 'workflow.yaml');
  if (!environment.exists(yamlPath)) {
    throw new Error(`Version ${targetVersion} not found for workflow ${workflowId}`);
  }

  return environment.readFile(yamlPath);
}
