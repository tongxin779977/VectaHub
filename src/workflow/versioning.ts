import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

export interface WorkflowVersion {
  version: number;
  workflowId: string;
  message: string;
  createdAt: Date;
}

function getVersionsDir(baseDir: string, workflowId: string): string {
  return join(baseDir, workflowId, 'versions');
}

function getVersionDir(baseDir: string, workflowId: string, version: number): string {
  return join(getVersionsDir(baseDir, workflowId), String(version));
}

function getNextVersion(baseDir: string, workflowId: string): number {
  const versionsDir = getVersionsDir(baseDir, workflowId);
  if (!existsSync(versionsDir)) return 1;
  const entries = readdirSync(versionsDir)
    .filter(e => existsSync(join(versionsDir, e, 'meta.json')))
    .map(Number)
    .filter(n => !isNaN(n));
  return entries.length === 0 ? 1 : Math.max(...entries) + 1;
}

export function saveVersion(
  baseDir: string,
  workflowId: string,
  yamlContent: string,
  message: string
): WorkflowVersion {
  const version = getNextVersion(baseDir, workflowId);
  const vDir = getVersionDir(baseDir, workflowId, version);
  mkdirSync(vDir, { recursive: true });

  writeFileSync(join(vDir, 'workflow.yaml'), yamlContent, 'utf-8');
  writeFileSync(
    join(vDir, 'meta.json'),
    JSON.stringify({ version, workflowId, message, createdAt: new Date().toISOString() }),
    'utf-8'
  );

  return { version, workflowId, message, createdAt: new Date() };
}

export function listVersions(baseDir: string, workflowId: string): WorkflowVersion[] {
  const versionsDir = getVersionsDir(baseDir, workflowId);
  if (!existsSync(versionsDir)) return [];

  const entries = readdirSync(versionsDir)
    .filter(e => existsSync(join(versionsDir, e, 'meta.json')))
    .map(Number)
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);

  return entries.map(v => {
    const meta = JSON.parse(readFileSync(join(getVersionDir(baseDir, workflowId, v), 'meta.json'), 'utf-8'));
    return {
      version: meta.version,
      workflowId: meta.workflowId,
      message: meta.message,
      createdAt: new Date(meta.createdAt),
    };
  });
}

export function rollbackVersion(baseDir: string, workflowId: string, version: number): string {
  const versionsDir = getVersionsDir(baseDir, workflowId);
  if (!existsSync(versionsDir)) {
    throw new Error(`No versions found for workflow ${workflowId}`);
  }

  let targetVersion = version;
  if (targetVersion === 0) {
    const entries = readdirSync(versionsDir)
      .filter(e => existsSync(join(versionsDir, e, 'meta.json')))
      .map(Number)
      .filter(n => !isNaN(n));
    targetVersion = Math.max(...entries);
  }

  const yamlPath = join(getVersionDir(baseDir, workflowId, targetVersion), 'workflow.yaml');
  if (!existsSync(yamlPath)) {
    throw new Error(`Version ${targetVersion} not found for workflow ${workflowId}`);
  }

  return readFileSync(yamlPath, 'utf-8');
}
