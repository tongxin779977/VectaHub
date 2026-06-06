import { type WorkflowTemplate, listTemplates } from './template.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';

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

export interface TemplateMarketDeps {
  logger: Pick<Console, 'warn'>;
}

const silentTemplateMarketLogger: TemplateMarketDeps['logger'] = {
  warn(): void {},
};

function getSourcesFile(environment: IEnvironmentService): string {
  return environment.getPath('sources.json');
}

function getTemplateCacheDir(environment: IEnvironmentService): string {
  return environment.getPath('template-cache');
}

export async function getSources(environment: IEnvironmentService): Promise<TemplateSource[]> {
  const sourcesFile = getSourcesFile(environment);
  try {
    const content = await environment.readFileAsync(sourcesFile);
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

export async function addSource(environment: IEnvironmentService, source: Omit<TemplateSource, 'id' | 'lastUpdate'>): Promise<void> {
  const sourcesFile = getSourcesFile(environment);
  const sources = await getSources(environment);
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
  
  environment.writeFile(sourcesFile, JSON.stringify(sources, null, 2));
}

export async function removeSource(environment: IEnvironmentService, sourceId: string): Promise<void> {
  const sourcesFile = getSourcesFile(environment);
  const sources = await getSources(environment);
  const filtered = sources.filter(s => s.id !== sourceId);
  environment.writeFile(sourcesFile, JSON.stringify(filtered, null, 2));
}

export async function updateSource(environment: IEnvironmentService, sourceId: string): Promise<void> {
  const sourcesFile = getSourcesFile(environment);
  const sources = await getSources(environment);
  const source = sources.find(s => s.id === sourceId);
  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }
  
  await pullSource(environment, source);
  source.lastUpdate = new Date();
  environment.writeFile(sourcesFile, JSON.stringify(sources, null, 2));
}

export async function updateAllSources(
  environment: IEnvironmentService,
  deps: TemplateMarketDeps = { logger: silentTemplateMarketLogger },
): Promise<void> {
  const sourcesFile = getSourcesFile(environment);
  const sources = await getSources(environment);
  for (const source of sources) {
    try {
      await pullSource(environment, source);
      source.lastUpdate = new Date();
    } catch (error) {
      deps.logger.warn(`Failed to update source ${source.name}: ${(error as Error).message}`);
    }
  }
  environment.writeFile(sourcesFile, JSON.stringify(sources, null, 2));
}

async function cloneSource(environment: IEnvironmentService, source: TemplateSource): Promise<string> {
  const cacheDir = getTemplateCacheDir(environment);
  const targetDir = environment.joinPath(cacheDir, source.id);
  await environment.mkdirAsync(cacheDir, { recursive: true });
  
  if (source.type === 'git' || source.type === 'github') {
    return new Promise((resolve, reject) => {
      const args = ['clone', source.url, targetDir];
      if (source.branch) {
        args.push('--branch', source.branch);
      }
      
      const child = environment.spawn('git', args, { stdio: 'pipe' });
      
      let errorOutput = '';
      child.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      
      child.on('close', (code: number) => {
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

async function pullSource(environment: IEnvironmentService, source: TemplateSource): Promise<void> {
  const targetDir = environment.joinPath(getTemplateCacheDir(environment), source.id);
  
  if (!environment.exists(targetDir)) {
    await cloneSource(environment, source);
    return;
  }
  
  return new Promise((resolve, reject) => {
    const child = environment.spawn('git', ['pull'], { 
      cwd: targetDir, 
      stdio: 'pipe' 
    });
    
    let errorOutput = '';
    child.stderr?.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });
    
    child.on('close', (code: number) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Git pull failed: ${errorOutput}`));
      }
    });
  });
}

export async function searchTemplates(
  environment: IEnvironmentService,
  keyword?: string,
  category?: string,
  tag?: string,
  deps: TemplateMarketDeps = { logger: silentTemplateMarketLogger },
): Promise<TemplateMetadata[]> {
  const sources = await getSources(environment);
  const results: TemplateMetadata[] = [];
  
  for (const source of sources) {
    try {
      await pullSource(environment, source);
      const sourceDir = environment.joinPath(getTemplateCacheDir(environment), source.id, source.path || '');
      const templates = listTemplates(environment, sourceDir, category, tag);
      
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
          localPath: environment.joinPath(sourceDir, `${template.name}.yaml`),
        });
      }
    } catch (error) {
      deps.logger.warn(`Failed to load templates from ${source.name}: ${(error as Error).message}`);
    }
  }
  
  return results;
}

export async function installTemplate(environment: IEnvironmentService, metadata: TemplateMetadata, targetDir?: string): Promise<string> {
  const target = targetDir || environment.getPath('templates');
  await environment.mkdirAsync(target, { recursive: true });
  
  const destPath = environment.joinPath(target, `${metadata.template.name}.yaml`);
  environment.copyFile(metadata.localPath, destPath);
  
  return destPath;
}

export async function installTemplateByName(environment: IEnvironmentService, name: string, targetDir?: string): Promise<string> {
  const templates = await searchTemplates(environment, name);
  const match = templates.find(t => t.template.name === name);
  
  if (!match) {
    throw new Error(`Template "${name}" not found in any source`);
  }
  
  return installTemplate(environment, match, targetDir);
}
