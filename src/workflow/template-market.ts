import { join, basename } from 'path';
import { homedir } from 'os';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import { type WorkflowTemplate, listTemplates } from './template.js';

export interface TemplateSource {
  id: string;
  name: string;
  url: string;
  type: 'git' | 'github' | 'local';
  branch?: string;
  path?: string;
  lastUpdate?: Date;
}

export interface TemplateMetadata {
  sourceId: string;
  template: WorkflowTemplate;
  localPath: string;
}

const SOURCES_FILE = join(homedir(), '.vectahub', 'sources.json');
const CACHE_DIR = join(homedir(), '.vectahub', 'template-cache');

export async function getSources(): Promise<TemplateSource[]> {
  try {
    const content = await fs.readFile(SOURCES_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return getDefaultSources();
  }
}

function getDefaultSources(): TemplateSource[] {
  return [
    {
      id: 'official',
      name: '官方模板仓库',
      url: 'https://github.com/vectahub/templates.git',
      type: 'git',
      branch: 'main',
    },
  ];
}

export async function addSource(source: Omit<TemplateSource, 'id' | 'lastUpdate'>): Promise<void> {
  const sources = await getSources();
  const newSource: TemplateSource = {
    ...source,
    id: source.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    lastUpdate: new Date(),
  };
  
  const existingIndex = sources.findIndex(s => s.id === newSource.id);
  if (existingIndex >= 0) {
    sources[existingIndex] = newSource;
  } else {
    sources.push(newSource);
  }
  
  await fs.writeFile(SOURCES_FILE, JSON.stringify(sources, null, 2), 'utf-8');
}

export async function removeSource(sourceId: string): Promise<void> {
  const sources = await getSources();
  const filtered = sources.filter(s => s.id !== sourceId);
  await fs.writeFile(SOURCES_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
}

export async function updateSource(sourceId: string): Promise<void> {
  const sources = await getSources();
  const source = sources.find(s => s.id === sourceId);
  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }
  
  await pullSource(source);
  source.lastUpdate = new Date();
  await fs.writeFile(SOURCES_FILE, JSON.stringify(sources, null, 2), 'utf-8');
}

export async function updateAllSources(): Promise<void> {
  const sources = await getSources();
  for (const source of sources) {
    try {
      await pullSource(source);
      source.lastUpdate = new Date();
    } catch (error) {
      console.warn(`Failed to update source ${source.name}: ${(error as Error).message}`);
    }
  }
  await fs.writeFile(SOURCES_FILE, JSON.stringify(sources, null, 2), 'utf-8');
}

async function cloneSource(source: TemplateSource): Promise<string> {
  const targetDir = join(CACHE_DIR, source.id);
  await fs.mkdir(CACHE_DIR, { recursive: true });
  
  if (source.type === 'git' || source.type === 'github') {
    return new Promise((resolve, reject) => {
      const args = ['clone', source.url, targetDir];
      if (source.branch) {
        args.push('--branch', source.branch);
      }
      
      const child = spawn('git', args, { stdio: 'pipe' });
      
      let errorOutput = '';
      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve(targetDir);
        } else {
          reject(new Error(`Git clone failed: ${errorOutput}`));
        }
      });
    });
  }
  
  throw new Error(`Unsupported source type: ${source.type}`);
}

async function pullSource(source: TemplateSource): Promise<void> {
  const targetDir = join(CACHE_DIR, source.id);
  
  try {
    await fs.access(targetDir);
  } catch {
    await cloneSource(source);
    return;
  }
  
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['pull'], { 
      cwd: targetDir, 
      stdio: 'pipe' 
    });
    
    let errorOutput = '';
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Git pull failed: ${errorOutput}`));
      }
    });
  });
}

export async function searchTemplates(
  keyword?: string,
  category?: string,
  tag?: string
): Promise<TemplateMetadata[]> {
  const sources = await getSources();
  const results: TemplateMetadata[] = [];
  
  for (const source of sources) {
    try {
      await pullSource(source);
      const sourceDir = join(CACHE_DIR, source.id, source.path || '');
      const templates = listTemplates(sourceDir, category, tag);
      
      for (const template of templates) {
        if (keyword) {
          const lowerKeyword = keyword.toLowerCase();
          if (
            !template.name.toLowerCase().includes(lowerKeyword) &&
            !template.description.toLowerCase().includes(lowerKeyword) &&
            !template.tags.some(t => t.toLowerCase().includes(lowerKeyword))
          ) {
            continue;
          }
        }
        
        results.push({
          sourceId: source.id,
          template,
          localPath: join(sourceDir, `${template.name}.yaml`),
        });
      }
    } catch (error) {
      console.warn(`Failed to load templates from ${source.name}: ${(error as Error).message}`);
    }
  }
  
  return results;
}

export async function installTemplate(metadata: TemplateMetadata, targetDir?: string): Promise<string> {
  const target = targetDir || join(homedir(), '.vectahub', 'templates');
  await fs.mkdir(target, { recursive: true });
  
  const destPath = join(target, `${metadata.template.name}.yaml`);
  await fs.copyFile(metadata.localPath, destPath);
  
  return destPath;
}

export async function installTemplateByName(name: string, targetDir?: string): Promise<string> {
  const templates = await searchTemplates(name);
  const match = templates.find(t => t.template.name === name);
  
  if (!match) {
    throw new Error(`Template "${name}" not found in any source`);
  }
  
  return installTemplate(match, targetDir);
}
