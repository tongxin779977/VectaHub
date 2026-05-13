import { Command } from 'commander';
import { existsSync, mkdirSync, rmSync, statSync, readdirSync, copyFileSync, writeFileSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { platform } from 'os';
import { execSync } from 'child_process';
import { getVectaHubPath } from '../utils/paths.js';
import { getLogger } from '../utils/logger.js';
import { createRecordManager } from '../execution/record-manager.js';

const logger = getLogger('export');

const VECTAHUB_DIR = getVectaHubPath();

interface ExportOptions {
  output: string;
  includeSecrets: boolean;
  workflows: boolean;
  executions: boolean;
  config: boolean;
  sessions: boolean;
}

interface ImportOptions {
  input: string;
  overwrite: boolean;
  dryRun: boolean;
}

function copyDirRecursive(src: string, dest: string): void {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function getExportManifest(): Record<string, string[]> {
  const manifest: Record<string, string[]> = {
    config: [],
    workflows: [],
    executions: [],
    sessions: [],
  };
  
  const configFile = join(VECTAHUB_DIR, 'config.yaml');
  if (existsSync(configFile)) {
    manifest.config.push('config.yaml');
  }
  
  const workflowsDir = join(VECTAHUB_DIR, 'workflows');
  if (existsSync(workflowsDir)) {
    const files = readdirSync(workflowsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.json'));
    manifest.workflows = files;
  }
  
  const executionsDir = join(VECTAHUB_DIR, 'executions');
  if (existsSync(executionsDir)) {
    const files = readdirSync(executionsDir).filter(f => f.endsWith('.json'));
    manifest.executions = files;
  }
  
  const sessionsDir = join(VECTAHUB_DIR, 'sessions');
  if (existsSync(sessionsDir)) {
    const files = readdirSync(sessionsDir);
    manifest.sessions = files;
  }
  
  return manifest;
}

async function createExportArchive(options: ExportOptions): Promise<void> {
  const outputDir = options.output || process.cwd();
  const exportDir = join(outputDir, `vectahub-export-${Date.now()}`);
  
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  if (existsSync(exportDir)) {
    rmSync(exportDir, { recursive: true });
  }
  mkdirSync(exportDir, { recursive: true });

  const dataDir = join(exportDir, 'data');
  mkdirSync(dataDir, { recursive: true });

  try {
    const manifest: Record<string, string[]> = {};
    let totalFiles = 0;

    if (options.config) {
      const configFile = join(VECTAHUB_DIR, 'config.yaml');
      if (existsSync(configFile)) {
        let content = readFileSync(configFile, 'utf-8');
        if (!options.includeSecrets) {
          content = redactSecrets(content);
        }
        writeFileSync(join(dataDir, 'config.yaml'), content);
        manifest['config'] = ['config.yaml'];
        totalFiles++;
      }
    }

    if (options.workflows) {
      const srcDir = join(VECTAHUB_DIR, 'workflows');
      if (existsSync(srcDir)) {
        const destDir = join(dataDir, 'workflows');
        mkdirSync(destDir, { recursive: true });
        copyDirRecursive(srcDir, destDir);
        const files = readdirSync(destDir).filter(f => f.endsWith('.yaml') || f.endsWith('.json'));
        manifest['workflows'] = files;
        totalFiles += files.length;
      }
    }

    if (options.executions) {
      const srcDir = join(VECTAHUB_DIR, 'executions');
      if (existsSync(srcDir)) {
        const destDir = join(dataDir, 'executions');
        mkdirSync(destDir, { recursive: true });
        copyDirRecursive(srcDir, destDir);
        const files = readdirSync(destDir).filter(f => f.endsWith('.json'));
        manifest['executions'] = files;
        totalFiles += files.length;
      }
    }

    if (options.sessions) {
      const srcDir = join(VECTAHUB_DIR, 'sessions');
      if (existsSync(srcDir)) {
        const destDir = join(dataDir, 'sessions');
        mkdirSync(destDir, { recursive: true });
        copyDirRecursive(srcDir, destDir);
        const files = readdirSync(destDir);
        manifest['sessions'] = files;
        totalFiles += files.length;
      }
    }

    if (totalFiles === 0) {
      logger.warn('没有可导出的数据');
      rmSync(exportDir, { recursive: true });
      return;
    }

    writeFileSync(
      join(dataDir, 'manifest.json'),
      JSON.stringify({
        version: '1.0.0',
        exportDate: new Date().toISOString(),
        includeSecrets: options.includeSecrets,
        manifest,
      }, null, 2)
    );

    const tarPath = join(outputDir, `vectahub-export-${Date.now()}.tar.gz`);
    
    logger.info(`正在导出 ${totalFiles} 个文件...`);
    
    if (platform() === 'win32') {
      logger.warn('Windows平台暂不支持自动打包');
      logger.info(`✅ 数据已导出到目录: ${exportDir}`);
      return;
    }

    try {
      execSync(`tar -czf "${tarPath}" -C "${exportDir}" .`, { stdio: 'pipe' });
      rmSync(exportDir, { recursive: true });
      
      const stats = statSync(tarPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      logger.info(`✅ 导出完成: ${tarPath} (${sizeMB} MB)`);
    } catch {
      logger.warn('打包失败，数据保留在目录中');
      logger.info(`✅ 数据已导出到目录: ${exportDir}`);
    }
  } catch (error) {
    logger.error(`导出失败: ${(error as Error).message}`);
    if (existsSync(exportDir)) {
      rmSync(exportDir, { recursive: true });
    }
    throw error;
  }
}

function redactSecrets(content: string): string {
  const patterns = [
    /(apiKey\s*:\s*['"]?)[^'"\n]+(['"]?)/gi,
    /(api_key\s*:\s*['"]?)[^'"\n]+(['"]?)/gi,
    /(OPENAI_API_KEY\s*:\s*['"]?)[^'"\n]+(['"]?)/gi,
    /(ANTHROPIC_API_KEY\s*:\s*['"]?)[^'"\n]+(['"]?)/gi,
    /(GEMINI_API_KEY\s*:\s*['"]?)[^'"\n]+(['"]?)/gi,
  ];
  
  let result = content;
  for (const pattern of patterns) {
    result = result.replace(pattern, '$1*****REDACTED*****$2');
  }
  return result;
}

async function importFromArchive(options: ImportOptions): Promise<void> {
  const inputPath = options.input;
  
  if (!existsSync(inputPath)) {
    logger.error(`文件不存在: ${inputPath}`);
    process.exit(1);
  }

  const stats = statSync(inputPath);
  const isDir = stats.isDirectory();
  
  if (options.dryRun) {
    logger.info('🔍 干运行模式 - 将导入以下内容:');
    if (isDir) {
      const manifestFile = join(inputPath, 'manifest.json');
      if (existsSync(manifestFile)) {
        const manifest = JSON.parse(readFileSync(manifestFile, 'utf-8'));
        logger.info(`导出日期: ${manifest.exportDate}`);
        logger.info(`包含密钥: ${manifest.includeSecrets}`);
        for (const [category, files] of Object.entries(manifest.manifest)) {
          if ((files as string[]).length > 0) {
            logger.info(`  ${category}: ${(files as string[]).length} 个文件`);
          }
        }
      } else {
        logger.info(`源目录: ${inputPath}`);
      }
    } else {
      logger.info(`源文件: ${inputPath}`);
    }
    logger.info(`目标目录: ${VECTAHUB_DIR}`);
    logger.info('使用 --no-dry-run 执行实际导入');
    return;
  }

  if (options.overwrite) {
    logger.warn('覆盖模式: 现有数据将被替换');
  } else {
    logger.info('合并模式: 现有数据将保留');
  }

  let sourceDir = inputPath;
  const tempExtractDir = join(VECTAHUB_DIR, '.import-temp');
  
  try {
    if (!isDir && inputPath.endsWith('.tar.gz')) {
      mkdirSync(tempExtractDir, { recursive: true });
      execSync(`tar -xzf "${inputPath}" -C "${tempExtractDir}"`, { stdio: 'pipe' });
      sourceDir = tempExtractDir;
    }

    const manifestFile = join(sourceDir, 'manifest.json');
    if (existsSync(manifestFile)) {
      const manifest = JSON.parse(readFileSync(manifestFile, 'utf-8'));
      logger.info(`导入日期: ${manifest.exportDate}`);
    }

    const dataDir = existsSync(join(sourceDir, 'data')) ? join(sourceDir, 'data') : sourceDir;

    const configFile = join(dataDir, 'config.yaml');
    if (existsSync(configFile)) {
      const destFile = join(VECTAHUB_DIR, 'config.yaml');
      if (options.overwrite || !existsSync(destFile)) {
        copyFileSync(configFile, destFile);
        logger.info('  ✅ config.yaml');
      } else {
        logger.info('  ⏭️  config.yaml (已存在，跳过)');
      }
    }

    for (const subdir of ['workflows', 'executions', 'sessions']) {
      const srcDir = join(dataDir, subdir);
      if (existsSync(srcDir)) {
        const destDir = join(VECTAHUB_DIR, subdir);
        if (options.overwrite && existsSync(destDir)) {
          rmSync(destDir, { recursive: true });
        }
        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true });
        }
        copyDirRecursive(srcDir, destDir);
        const count = readdirSync(destDir).length;
        logger.info(`  ✅ ${subdir}/ (${count} 个文件)`);
      }
    }

    logger.info('✅ 导入完成');
  } finally {
    if (existsSync(tempExtractDir)) {
      rmSync(tempExtractDir, { recursive: true });
    }
  }
}

export const exportCmd = new Command('export')
  .description('导出 VectaHub 数据')
  .option('-o, --output <dir>', '输出目录', process.cwd())
  .option('--include-secrets', '包含敏感信息（API密钥）', false)
  .option('--no-workflows', '不导出工作流')
  .option('--no-executions', '不导出执行记录')
  .option('--no-config', '不导出配置')
  .option('--no-sessions', '不导出会话数据')
  .option('--format <format>', '输出格式: json|csv (仅执行记录)', 'json')
  .option('--status <status>', '过滤执行状态')
  .option('--limit <number>', '限制导出数量', '100')
  .action(async (options) => {
    if (options.format === 'csv' || options.status || options.limit !== '100') {
      await exportExecutionsAsData(options);
      return;
    }

    const exportOptions: ExportOptions = {
      output: options.output,
      includeSecrets: options.includeSecrets,
      workflows: options.workflows !== false,
      executions: options.executions !== false,
      config: options.config !== false,
      sessions: options.sessions !== false,
    };

    try {
      await createExportArchive(exportOptions);
    } catch (error) {
      process.exit(1);
    }
  });

async function exportExecutionsAsData(options: { output: string; status?: string; limit: string; format: string }): Promise<void> {
  const recordManager = createRecordManager();
  const limit = parseInt(options.limit, 10) || 100;
  const records = await recordManager.getRecent(limit);

  let filtered = records;
  if (options.status) {
    filtered = records.filter(r => r.status === options.status!.toUpperCase());
  }

  const outputDir = options.output || process.cwd();

  if (options.format === 'csv') {
    const csvPath = join(outputDir, `executions-${Date.now()}.csv`);
    const headers = 'executionId,workflowId,workflowName,status,startedAt,duration,stepCount,error\n';
    const rows = filtered.map(r => {
      const safeName = `"${(r.workflowName || '').replace(/"/g, '""')}"`;
      const safeError = `"${(r.error || '').replace(/"/g, '""')}"`;
      return `${r.executionId},${r.workflowId},${safeName},${r.status},${r.startedAt},${r.duration || ''},${r.steps.length},${safeError}`;
    }).join('\n');
    writeFileSync(csvPath, headers + rows, 'utf-8');
    logger.info(`✅ 导出 CSV: ${csvPath} (${filtered.length} 条记录)`);
  } else {
    const jsonPath = join(outputDir, `executions-${Date.now()}.json`);
    writeFileSync(jsonPath, JSON.stringify(filtered, null, 2), 'utf-8');
    logger.info(`✅ 导出 JSON: ${jsonPath} (${filtered.length} 条记录)`);
  }
}

export const importCmd = new Command('import')
  .description('导入 VectaHub 数据')
  .argument('<file>', '导入文件或目录路径')
  .option('--overwrite', '覆盖现有数据')
  .option('--dry-run', '仅显示将导入的内容')
  .action(async (file: string, options) => {
    const importOptions: ImportOptions = {
      input: file,
      overwrite: options.overwrite || false,
      dryRun: options.dryRun || false,
    };

    try {
      await importFromArchive(importOptions);
    } catch (error) {
      process.exit(1);
    }
  });
