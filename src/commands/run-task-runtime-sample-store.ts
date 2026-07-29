import { join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { AgentRuntimeSample, AgentRuntimeProfileKey, TaskComplexityLevel } from './run-task-runtime-estimator.js';

const MAX_SAMPLES_PER_AGENT = 100;

export interface RuntimeSampleStoreDeps {
  resolvePath: (...segments: string[]) => string;
  ensureDir: (path: string) => Promise<void>;
  readFile: (path: string, encoding: 'utf8') => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
}

export interface RuntimeSampleStore {
  /**
   * 追加记录一个运行时样本
   */
  append(sample: AgentRuntimeSample): Promise<void>;
  /**
   * 加载符合 profile 的最近样本
   */
  load(profileKey: AgentRuntimeProfileKey): Promise<AgentRuntimeSample[]>;
}

export function createRuntimeSampleStore(deps?: Partial<RuntimeSampleStoreDeps>): RuntimeSampleStore {
  const resolvePath = deps?.resolvePath;
  if (!resolvePath) {
    throw new Error('resolvePath is required');
  }
  const resolvePathFn: (...segments: string[]) => string = resolvePath;
  const ensureDir = deps?.ensureDir ?? ((path: string) => mkdir(path, { recursive: true }));
  const readFileImpl = deps?.readFile ?? readFile;
  const writeFileImpl = deps?.writeFile ?? writeFile;

  function getSampleFilePath(profileKey: AgentRuntimeProfileKey): string {
    return resolvePathFn(profileKey.workspaceHash, `${profileKey.agentId}.jsonl`);
  }

  async function load(profileKey: AgentRuntimeProfileKey): Promise<AgentRuntimeSample[]> {
    const filePath = getSampleFilePath(profileKey);
    try {
      const content = await readFileImpl(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      return lines
        .map(line => JSON.parse(line) as AgentRuntimeSample)
        .slice(0, MAX_SAMPLES_PER_AGENT);
    } catch {
      return [];
    }
  }

  async function append(sample: AgentRuntimeSample): Promise<void> {
    const filePath = getSampleFilePath(sample.profileKey);
    const dir = join(filePath, '..');
    await ensureDir(dir);

    const existing = await load(sample.profileKey);
    const all = [sample, ...existing].slice(0, MAX_SAMPLES_PER_AGENT);
    const content = all.map(s => JSON.stringify(s)).join('\n') + '\n';
    await writeFileImpl(filePath, content);
  }

  return { append, load };
}

/**
 * 创建运行时样本记录的工厂函数
 */
export function createRuntimeSample(
  profileKey: AgentRuntimeProfileKey,
  taskShapeHash: string,
  complexity: TaskComplexityLevel,
  score: number,
  actualDurationMs: number,
  success: boolean,
  options: {
    failureKind?: string;
    completionSignal?: string;
  } = {}
): AgentRuntimeSample {
  return {
    profileKey,
    taskShapeHash,
    complexity,
    score,
    actualDurationMs,
    success,
    failureKind: options.failureKind,
    completionSignal: options.completionSignal,
    recordedAt: new Date().toISOString(),
  };
}
