import { access, constants } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createInterface } from 'readline';
import { loadConfig, saveConfig, VectaHubConfig } from './first-run-wizard.js';

const execAsync = promisify(exec);

export interface CLIToolStatus {
  name: string;
  installed: boolean;
  version?: string;
  hasPermission: boolean;
  permissionIssue?: string;
  enabled: boolean;
}

const AI_CLI_TOOLS = [
  { name: 'gemini', command: 'gemini', versionFlag: '--version' },
  { name: 'claude', command: 'claude', versionFlag: '--version' },
  { name: 'codex', command: 'codex', versionFlag: '--version' },
  { name: 'aider', command: 'aider', versionFlag: '--version' },
];

function createFailedStatus(name: string): CLIToolStatus {
  return { name, installed: false, hasPermission: false, enabled: false };
}

export async function scanSingleTool(toolName: string): Promise<CLIToolStatus | null> {
  const toolDef = AI_CLI_TOOLS.find(t => t.name === toolName);
  if (!toolDef) {
    return null;
  }

  try {
    return await checkTool(toolDef);
  } catch {
    return createFailedStatus(toolName);
  }
}

export async function scanCLITools(): Promise<CLIToolStatus[]> {
  console.log('🔍 扫描已安装的 AI CLI 工具...\n');

  const results: CLIToolStatus[] = [];

  for (const tool of AI_CLI_TOOLS) {
    try {
      const status = await scanSingleTool(tool.name);
      if (!status) continue;

      results.push(status);

      if (status.installed) {
        if (status.hasPermission) {
          console.log(`✅ ${tool.name} CLI - 已安装 (${status.version}), 权限正常`);
        } else {
          console.log(`⚠️  ${tool.name} CLI - 已安装，但${status.permissionIssue}`);
          const granted = await askPermission(tool.name);
          status.hasPermission = granted;
          status.permissionIssue = granted ? undefined : status.permissionIssue;
          if (granted) {
            console.log(`✅ 已授权 ${tool.name}`);
          }
        }
      } else {
        console.log(`❌ ${tool.name} CLI - 未安装`);
      }
    } catch (err) {
      console.log(`❌ ${tool.name} CLI - 扫描失败: ${err instanceof Error ? err.message : String(err)}`);
      results.push(createFailedStatus(tool.name));
    }
  }

  const available = results.filter(r => r.installed && r.hasPermission);
  console.log(`\n发现 ${available.length} 个可用的 AI CLI 工具。\n`);

  return results;
}

async function checkTool(tool: { name: string; command: string; versionFlag: string }): Promise<CLIToolStatus> {
  try {
    // Deep audit: Verify the binary exists in PATH
    const { stdout: pathOut } = await execAsync(`which ${tool.command}`);
    if (!pathOut.trim()) {
      return createFailedStatus(tool.name);
    }

    const { stdout } = await execAsync(`${tool.command} ${tool.versionFlag}`);
    const version = stdout.trim().split('\n')[0];

    const hasPermission = await checkPermissions(tool.name);

    return {
      name: tool.name,
      installed: true,
      version,
      hasPermission,
      permissionIssue: hasPermission ? undefined : '需要文件系统访问权限',
      enabled: true,
    };
  } catch {
    return createFailedStatus(tool.name);
  }
}

async function checkPermissions(toolName: string): Promise<boolean> {
  const testDirs = [process.cwd(), process.env.HOME || '~'];

  for (const dir of testDirs) {
    try {
      await access(dir, constants.R_OK | constants.W_OK);
    } catch {
      return false;
    }
  }

  return true;
}

async function askPermission(toolName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`   是否授权 ${toolName}? [Y/n]: `, (answer: string) => {
      rl.close();
      resolve(answer.trim().toLowerCase() !== 'n');
    });
  });
}

export function updateCLIToolConfig(tools: CLIToolStatus[]): void {
  const config = loadConfig();

  for (const tool of tools) {
    config.external_cli[tool.name] = {
      enabled: tool.enabled && tool.hasPermission,
      has_permission: tool.hasPermission,
    };
  }

  saveConfig(config);
}

export function getAvailableExternalCLI(): string[] {
  const config = loadConfig();
  return Object.entries(config.external_cli)
    .filter(([_, v]) => v.enabled && v.has_permission)
    .map(([name, _]) => name);
}
