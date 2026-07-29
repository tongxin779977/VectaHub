import { promises as fs } from 'fs';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';

function getWorkflowsDir(environment: IEnvironmentService): string {
  return environment.getPath('workflows');
}

function getTemplatesDir(environment: IEnvironmentService): string {
  return environment.getPath('templates');
}

export async function getWorkflowNames(environment: IEnvironmentService): Promise<string[]> {
  const workflowsDir = getWorkflowsDir(environment);
  try {
    await fs.access(workflowsDir);
    const files = await fs.readdir(workflowsDir);
    return files
      .filter(file => file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json'))
      .map(file => file.replace(/\.(yaml|yml|json)$/, ''));
  } catch {
    return [];
  }
}

export async function getTemplateNames(environment: IEnvironmentService): Promise<string[]> {
  const templatesDir = getTemplatesDir(environment);
  try {
    await fs.access(templatesDir);
    const files = await fs.readdir(templatesDir);
    return files
      .filter(file => file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json'))
      .map(file => file.replace(/\.(yaml|yml|json)$/, ''));
  } catch {
    return [];
  }
}

export async function getConfigNames(): Promise<string[]> {
  return ['show', 'reset', 'tools'];
}

export async function getShellTypes(): Promise<string[]> {
  return ['bash', 'zsh', 'fish'];
}

export async function completeWorkflowNames(environment: IEnvironmentService): Promise<string[]> {
  return getWorkflowNames(environment);
}

export async function completeTemplateNames(environment: IEnvironmentService): Promise<string[]> {
  return getTemplateNames(environment);
}

export async function completeConfigCommands(): Promise<string[]> {
  return getConfigNames();
}

export async function completeShellTypes(): Promise<string[]> {
  return getShellTypes();
}
