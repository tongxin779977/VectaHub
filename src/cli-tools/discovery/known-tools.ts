import type { KnownTool } from './types.js';

export const KNOWN_TOOLS: KnownTool[] = [
  {
    id: 'node', name: 'node', version: '', versionRequirement: '>=18',
    description: 'Node.js JavaScript runtime',
    checkCommand: 'node --version', checkOutputRegex: 'v\\d+\\.\\d+\\.\\d+',
    versionCommands: ['node --version'], confidence: 0.9,
  },
  {
    id: 'npm', name: 'npm', version: '', versionRequirement: '>=8',
    description: 'Node.js package manager',
    checkCommand: 'npm --version', checkOutputRegex: '\\d+\\.\\d+\\.\\d+',
    versionCommands: ['npm --version'], confidence: 0.9,
  },
  {
    id: 'pnpm', name: 'pnpm', version: '', versionRequirement: '>=8',
    description: 'Fast, disk space efficient package manager',
    checkCommand: 'pnpm --version', checkOutputRegex: '\\d+\\.\\d+\\.\\d+',
    versionCommands: ['pnpm --version'], confidence: 0.9,
  },
  {
    id: 'yarn', name: 'yarn', version: '', versionRequirement: '>=1',
    description: 'Fast and reliable dependency management',
    checkCommand: 'yarn --version', checkOutputRegex: '\\d+\\.\\d+\\.\\d+',
    versionCommands: ['yarn --version'], confidence: 0.9,
  },
  {
    id: 'bun', name: 'bun', version: '', versionRequirement: '>=1',
    description: 'All-in-one JavaScript runtime and toolkit',
    checkCommand: 'bun --version', checkOutputRegex: '\\d+\\.\\d+\\.\\d+',
    versionCommands: ['bun --version'], confidence: 0.9,
  },
  {
    id: 'python', name: 'python', version: '', versionRequirement: '>=3',
    description: 'Python programming language interpreter',
    checkCommand: 'python --version', checkOutputRegex: 'Python \\d+\\.\\d+\\.\\d+',
    versionCommands: ['python --version'], confidence: 0.9,
  },
  {
    id: 'pip', name: 'pip', version: '', versionRequirement: '>=20',
    description: 'Python package installer',
    checkCommand: 'pip --version', checkOutputRegex: 'pip \\d+\\.\\d+',
    versionCommands: ['pip --version'], confidence: 0.9,
  },
  {
    id: 'java', name: 'java', version: '', versionRequirement: '>=11',
    description: 'Java runtime and development kit',
    checkCommand: 'java -version', checkOutputRegex: 'java version "\\d+\\.\\d+\\.\\d+"',
    versionCommands: ['java -version'], confidence: 0.9,
  },
  {
    id: 'go', name: 'go', version: '', versionRequirement: '>=1.18',
    description: 'Go programming language compiler',
    checkCommand: 'go version', checkOutputRegex: 'go version go\\d+\\.\\d+',
    versionCommands: ['go version'], confidence: 0.9,
  },
  {
    id: 'rust', name: 'rust', version: '', versionRequirement: '>=1.60',
    description: 'Rust programming language compiler',
    checkCommand: 'rustc --version', checkOutputRegex: 'rustc \\d+\\.\\d+\\.\\d+',
    versionCommands: ['rustc --version'], confidence: 0.9,
  },
];

export function findToolProfile(name: string): KnownTool | undefined {
  return KNOWN_TOOLS.find(tool => tool.name === name || tool.id === name);
}

export function getKnownTool(name: string): KnownTool | undefined {
  return findToolProfile(name);
}

export function getAllKnownTools(): KnownTool[] {
  return KNOWN_TOOLS;
}
