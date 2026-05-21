import { Command } from 'commander';
import { type InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';
import { createRecordManager } from '../execution/record-manager.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import type pino from 'pino';

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

function copyDirRecursive(environment: IEnvironmentService, src: string, dest: string): void {
  const join = (...args: string[]) => environment.joinPath(...args);
  environment.ensureDir(dest);
  const entries = environment.readDirObjects(src);
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(environment, srcPath, destPath);
    } else {
      environment.copyFile(srcPath, destPath);
    }
  }
}

async function createExportArchive(environment: IEnvironmentService, logger: pino.Logger, options: ExportOptions): Promise<void> {
  const join = (...args: string[]) => environment.joinPath(...args);
  const VECTAHUB_DIR = environment.getHomePath();
  const outputDir = options.output || environment.getCwd();
  const exportDir = join(outputDir, `vectahub-export-${Date.now()}`);

  environment.ensureDir(outputDir);

  if (environment.exists(exportDir)) {
    environment.rm(exportDir, { recursive: true });
  }
  environment.ensureDir(exportDir);

  const dataDir = join(exportDir, 'data');
  environment.ensureDir(dataDir);

  try {
    const manifest: Record<string, string[]> = {};
    let totalFiles = 0;

    if (options.config) {
      const configFile = join(VECTAHUB_DIR, 'config.yaml');
      if (environment.exists(configFile)) {
        let content = environment.readFile(configFile);
        if (!options.includeSecrets) {
          content = redactSecrets(content);
        }
        environment.writeFile(join(dataDir, 'config.yaml'), content);
        manifest['config'] = ['config.yaml'];
        totalFiles++;
      }
    }

    if (options.workflows) {
      const srcDir = join(VECTAHUB_DIR, 'workflows');
      if (environment.exists(srcDir)) {
        const destDir = join(dataDir, 'workflows');
        copyDirRecursive(environment, srcDir, destDir);
        const files = environment.readDir(destDir).filter(f => f.endsWith('.yaml') || f.endsWith('.json'));
        manifest['workflows'] = files;
        totalFiles += files.length;
      }
    }

    if (options.executions) {
      const srcDir = join(VECTAHUB_DIR, 'executions');
      if (environment.exists(srcDir)) {
        const destDir = join(dataDir, 'executions');
        copyDirRecursive(environment, srcDir, destDir);
        const files = environment.readDir(destDir).filter(f => f.endsWith('.json'));
        manifest['executions'] = files;
        totalFiles += files.length;
      }
    }

    if (options.sessions) {
      const srcDir = join(VECTAHUB_DIR, 'sessions');
      if (environment.exists(srcDir)) {
        const destDir = join(dataDir, 'sessions');
        copyDirRecursive(environment, srcDir, destDir);
        const files = environment.readDir(destDir);
        manifest['sessions'] = files;
        totalFiles += files.length;
      }
    }

    if (totalFiles === 0) {
      logger.warn('没有可导出的数据');
      environment.rm(exportDir, { recursive: true });
      return;
    }

    environment.writeFile(
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

    if (environment.getPlatform() === 'win32') {
      logger.warn('Windows平台暂不支持自动打包');
      logger.info(`✅ 数据已导出到目录: ${exportDir}`);
      return;
    }

    try {
      await environment.exec(`tar -czf "${tarPath}" -C "${exportDir}" .`);
      environment.rm(exportDir, { recursive: true });

      const stats = environment.stat(tarPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      logger.info(`✅ 导出完成: ${tarPath} (${sizeMB} MB)`);
    } catch {
      logger.warn('打包失败，数据保留在目录中');
      logger.info(`✅ 数据已导出到目录: ${exportDir}`);
    }
  } catch (error) {
    logger.error(`导出失败: ${(error as Error).message}`);
    if (environment.exists(exportDir)) {
      environment.rm(exportDir, { recursive: true });
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

async function importFromArchive(environment: IEnvironmentService, logger: pino.Logger, options: ImportOptions): Promise<void> {
  const join = (...args: string[]) => environment.joinPath(...args);
  const VECTAHUB_DIR = environment.getHomePath();
  const inputPath = options.input;

  if (!environment.exists(inputPath)) {
    logger.error(`文件不存在: ${inputPath}`);
    throw new VectaHubError(`File not found: ${inputPath}`, ErrorType.RUNTIME);
  }

  const stats = environment.stat(inputPath);
  const isDir = stats.isDirectory();

  if (options.dryRun) {
    logger.info('🔍 干运行模式 - 将导入以下内容:');
    if (isDir) {
      const manifestFile = join(inputPath, 'manifest.json');
      if (environment.exists(manifestFile)) {
        const manifest = JSON.parse(environment.readFile(manifestFile));
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
      environment.ensureDir(tempExtractDir);
      await environment.exec(`tar -xzf "${inputPath}" -C "${tempExtractDir}"`);
      sourceDir = tempExtractDir;
    }

    const manifestFile = join(sourceDir, 'manifest.json');
    if (environment.exists(manifestFile)) {
      const manifest = JSON.parse(environment.readFile(manifestFile));
      logger.info(`导入日期: ${manifest.exportDate}`);
    }

    const dataDir = environment.exists(join(sourceDir, 'data')) ? join(sourceDir, 'data') : sourceDir;

    const configFile = join(dataDir, 'config.yaml');
    if (environment.exists(configFile)) {
      const destFile = join(VECTAHUB_DIR, 'config.yaml');
      if (options.overwrite || !environment.exists(destFile)) {
        environment.copyFile(configFile, destFile);
        logger.info('  ✅ config.yaml');
      } else {
        logger.info('  ⏭️  config.yaml (已存在，跳过)');
      }
    }

    for (const subdir of ['workflows', 'executions', 'sessions']) {
      const srcDir = join(dataDir, subdir);
      if (environment.exists(srcDir)) {
        const destDir = join(VECTAHUB_DIR, subdir);
        if (options.overwrite && environment.exists(destDir)) {
          environment.rm(destDir, { recursive: true });
        }
        if (!environment.exists(destDir)) {
          environment.ensureDir(destDir);
        }
        copyDirRecursive(environment, srcDir, destDir);
        const count = environment.readDir(destDir).length;
        logger.info(`  ✅ ${subdir}/ (${count} 个文件)`);
      }
    }

    logger.info('✅ 导入完成');
  } finally {
    if (environment.exists(tempExtractDir)) {
      environment.rm(tempExtractDir, { recursive: true });
    }
  }
}

async function exportExecutionsAsData(environment: IEnvironmentService, logger: pino.Logger, options: { output: string; status?: string; limit: string; format: string }): Promise<void> {
  const join = (...args: string[]) => environment.joinPath(...args);
  const recordManager = createRecordManager();
  const limit = parseInt(options.limit, 10) || 100;
  const records = await recordManager.getRecent(limit);

  let filtered = records;
  if (options.status) {
    filtered = records.filter(r => r.status === options.status!.toUpperCase());
  }

  const outputDir = options.output || environment.getCwd();

  if (options.format === 'csv') {
    const csvPath = join(outputDir, `executions-${Date.now()}.csv`);
    const headers = 'executionId,workflowId,workflowName,status,startedAt,duration,stepCount,error\n';
    const rows = filtered.map(r => {
      const safeName = `"${(r.workflowName || '').replace(/"/g, '""')}"`;
      const safeError = `"${(r.error || '').replace(/"/g, '""')}"`;
      return `${r.executionId},${r.workflowId},${safeName},${r.status},${r.startedAt},${r.duration || ''},${r.steps.length},${safeError}`;
    }).join('\n');
    environment.writeFile(csvPath, headers + rows);
    logger.info(`✅ 导出 CSV: ${csvPath} (${filtered.length} 条记录)`);
  } else {
    const jsonPath = join(outputDir, `executions-${Date.now()}.json`);
    environment.writeFile(jsonPath, JSON.stringify(filtered, null, 2));
    logger.info(`✅ 导出 JSON: ${jsonPath} (${filtered.length} 条记录)`);
  }
}

export function createExportCmd(context: InfrastructureContext): Command {
  const environment = context.environment;
  const logger = context.logger.getLogger('export');

  return new Command('export')
    .description('导出 VectaHub 数据')
    .option('-o, --output <dir>', '输出目录', environment.getCwd())
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
        await exportExecutionsAsData(environment, logger, options);
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
        await createExportArchive(environment, logger, exportOptions);
      } catch (error) {
        throw new VectaHubError(`Export failed: ${(error as Error).message}`, ErrorType.RUNTIME);
      }
    });
}

export function createImportCmd(context: InfrastructureContext): Command {
  const environment = context.environment;
  const logger = context.logger.getLogger('export');

  return new Command('import')
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
        await importFromArchive(environment, logger, importOptions);
      } catch (error) {
        throw new VectaHubError(`Import failed: ${(error as Error).message}`, ErrorType.RUNTIME);
      }
    });
}
