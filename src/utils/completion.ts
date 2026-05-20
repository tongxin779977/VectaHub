import { promises as fs } from 'fs';
import { getVectaHubPath } from './paths.js';

function getWorkflowsDir(): string {
  return getVectaHubPath('workflows');
}

function getTemplatesDir(): string {
  return getVectaHubPath('templates');
}

export async function getWorkflowNames(): Promise<string[]> {
  const workflowsDir = getWorkflowsDir();
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

export async function getTemplateNames(): Promise<string[]> {
  const templatesDir = getTemplatesDir();
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

export async function completeWorkflowNames(): Promise<string[]> {
  return getWorkflowNames();
}

export async function completeTemplateNames(): Promise<string[]> {
  return getTemplateNames();
}

export async function completeConfigCommands(): Promise<string[]> {
  return getConfigNames();
}

export async function completeShellTypes(): Promise<string[]> {
  return getShellTypes();
}
