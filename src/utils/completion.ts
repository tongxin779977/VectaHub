import { homedir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';

const WORKFLOWS_DIR = join(homedir(), '.vectahub', 'workflows');
const TEMPLATES_DIR = join(homedir(), '.vectahub', 'templates');

export async function getWorkflowNames(): Promise<string[]> {
  try {
    await fs.access(WORKFLOWS_DIR);
    const files = await fs.readdir(WORKFLOWS_DIR);
    return files
      .filter(file => file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json'))
      .map(file => file.replace(/\.(yaml|yml|json)$/, ''));
  } catch {
    return [];
  }
}

export async function getTemplateNames(): Promise<string[]> {
  try {
    await fs.access(TEMPLATES_DIR);
    const files = await fs.readdir(TEMPLATES_DIR);
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
