import { Command } from 'commander';
import { format } from 'node:util';
import { fileURLToPath } from 'url';
import { createStorage } from '../workflow/storage.js';
import { listTemplates, instantiateTemplate, type WorkflowTemplate } from '../workflow/template.js';
import { loadConfig } from '../setup/first-run-wizard.js';
import {
  getSources,
  addSource,
  removeSource,
  updateSource,
  updateAllSources,
  searchTemplates as searchMarketTemplates,
  installTemplateByName,
  type TemplateSource,
  type TemplateMetadata,
} from '../workflow/template-market.js';
import { type InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';
import type pino from 'pino';

interface TemplatesCommandOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
}

function createTemplatesCommandOutput(): TemplatesCommandOutput {
  const formatMessage = (message?: unknown, optionalParams: unknown[] = []): string => {
    if (message === undefined && optionalParams.length === 0) {
      return '';
    }
    return format(message, ...optionalParams);
  };

  return {
    log(message?: unknown, ...optionalParams: unknown[]): void {
      process.stdout.write(`${formatMessage(message, optionalParams)}\n`);
    },
  };
}

function getTemplatesDir(context: InfrastructureContext): string {
  const firstRunWizardDeps = { environment: context.environment };
  const envDir = context.environment.getEnv('VECTAHUB_TEMPLATES_DIR');
  if (envDir) {
    return envDir;
  }

  try {
    const config = loadConfig(firstRunWizardDeps);
    if (config.templates?.directory) {
      return config.templates.directory;
    }
  } catch {
    // 配置文件读取失败，使用默认路径
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = context.environment.getPath(__filename, '..');
  return context.environment.getPath(__dirname, '..', '..', '..', 'templates');
}

function formatTemplateTable(templates: WorkflowTemplate[], logger: pino.Logger, output: TemplatesCommandOutput): void {
  if (templates.length === 0) {
    logger.info('  (no templates found)');
    return;
  }
  output.log(`  ${'Name'.padEnd(22)} ${'Category'.padEnd(12)} ${'Tags'.padEnd(20)} Description`);
  output.log(`  ${'─'.repeat(22)} ${'─'.repeat(12)} ${'─'.repeat(20)} ${'─'.repeat(30)}`);
  for (const t of templates) {
    const tags = t.tags.join(', ');
    const params = t.parameters ? t.parameters.length : 0;
    output.log(
      `  ${t.name.padEnd(22)} ${t.category.padEnd(12)} ${tags.padEnd(20)} ${t.description}` +
      (params > 0 ? ` (${params} params)` : '')
    );
  }
}

function collectParams(value: string, previous: Record<string, string>): Record<string, string> {
  const [key, ...rest] = value.split('=');
  return { ...previous, [key]: rest.join('=') };
}

function formatMarketTemplateTable(templates: TemplateMetadata[], logger: pino.Logger, output: TemplatesCommandOutput): void {
  if (templates.length === 0) {
    logger.info('  (no templates found)');
    return;
  }
  output.log(`  ${'Source'.padEnd(12)} ${'Name'.padEnd(22)} ${'Category'.padEnd(12)} ${'Tags'.padEnd(20)} Description`);
  output.log(`  ${'─'.repeat(12)} ${'─'.repeat(22)} ${'─'.repeat(12)} ${'─'.repeat(20)} ${'─'.repeat(30)}`);
  for (const t of templates) {
    const tags = t.template.tags.join(', ');
    const params = t.template.parameters ? t.template.parameters.length : 0;
    output.log(
      `  ${t.sourceId.padEnd(12)} ${t.template.name.padEnd(22)} ${t.template.category.padEnd(12)} ${tags.padEnd(20)} ${t.template.description}` +
      (params > 0 ? ` (${params} params)` : '')
    );
  }
}

function formatSourcesTable(sources: TemplateSource[], logger: pino.Logger, output: TemplatesCommandOutput): void {
  if (sources.length === 0) {
    logger.info('  (no sources configured)');
    return;
  }
  output.log(`  ${'ID'.padEnd(15)} ${'Name'.padEnd(20)} ${'URL'.padEnd(40)} ${'Type'.padEnd(10)} ${'Last Update'}`);
  output.log(`  ${'─'.repeat(15)} ${'─'.repeat(20)} ${'─'.repeat(40)} ${'─'.repeat(10)} ${'─'.repeat(20)}`);
  for (const s of sources) {
    const lastUpdate = s.lastUpdate ? new Date(s.lastUpdate).toLocaleDateString() : 'Never';
    output.log(
      `  ${s.id.padEnd(15)} ${s.name.padEnd(20)} ${s.url.padEnd(40)} ${s.type.padEnd(10)} ${lastUpdate}`
    );
  }
}

/**
 * 创建模板命令
 * @param context - 基础设施上下文
 * @returns Commander 命令实例
 */
export function createTemplatesCmd(context: InfrastructureContext): Command {
  const logger = context.logger.getLogger('templates');
  const output = createTemplatesCommandOutput();
  const builtinTemplatesDir = getTemplatesDir(context);

  const templatesCmd = new Command('templates')
    .description('Manage workflow templates');

  templatesCmd
    .command('list')
    .description('List available workflow templates')
    .option('-c, --category <category>', 'Filter by category')
    .option('-t, --tag <tag>', 'Filter by tag')
    .action((options: { category?: string; tag?: string }) => {
      const templates = listTemplates(context.environment, builtinTemplatesDir, options.category, options.tag);
      logger.info('\nAvailable workflow templates:\n');
      formatTemplateTable(templates, logger, output);
      output.log(`\nTotal: ${templates.length} template(s)`);
      logger.info('\nUsage: vectahub templates use <name> [--param key=value]');
    });

  templatesCmd
    .command('search')
    .description('Search templates in remote marketplaces')
    .argument('[keyword]', 'Search keyword')
    .option('-c, --category <category>', 'Filter by category')
    .option('-t, --tag <tag>', 'Filter by tag')
    .action(async (keyword: string, options: { category?: string; tag?: string }) => {
      logger.info(`\n搜索模板: ${keyword || '全部'}`);
      logger.info('正在连接模板仓库...\n');

      try {
        const templates = await searchMarketTemplates(context.environment, keyword, options.category, options.tag);
        formatMarketTemplateTable(templates, logger, output);
        output.log(`\n找到 ${templates.length} 个模板`);
        logger.info('\n使用 `vectahub templates install <name>` 安装模板');
      } catch (error) {
        logger.error(`搜索失败: ${(error as Error).message}`);
        throw new VectaHubError(`搜索失败: ${(error as Error).message}`, ErrorType.RUNTIME, error);
      }
    });

  templatesCmd
    .command('install')
    .description('Install a template from marketplace')
    .argument('<name>', 'Template name')
    .option('-o, --output <dir>', 'Output directory')
    .action(async (name: string, options: { output?: string }) => {
      logger.info(`\n安装模板: ${name}`);

      try {
        const path = await installTemplateByName(context.environment, name, options.output);
        logger.info(`\n✅ 模板安装成功`);
        output.log(`  路径: ${path}`);
        logger.info(`\n使用: vectahub templates use ${name}`);
      } catch (error) {
        logger.error(`安装失败: ${(error as Error).message}`);
        throw new VectaHubError(`安装失败: ${(error as Error).message}`, ErrorType.RUNTIME, error);
      }
    });

  const sourcesCmd = templatesCmd
    .command('sources')
    .description('Manage template sources');

  sourcesCmd
    .command('list')
    .description('List configured template sources')
    .action(async () => {
      const sources = await getSources(context.environment);
      logger.info('\n配置的模板源:\n');
      formatSourcesTable(sources, logger, output);
    });

  sourcesCmd
    .command('add')
    .description('Add a template source')
    .argument('<name>', 'Source name')
    .argument('<url>', 'Git repository URL')
    .option('-b, --branch <branch>', 'Git branch', 'main')
    .option('-p, --path <path>', 'Path within repository')
    .action(async (name: string, url: string, options: { branch?: string; path?: string }) => {
      try {
        await addSource(context.environment, {
          name,
          url,
          type: url.includes('github.com') ? 'github' : 'git',
          branch: options.branch,
          path: options.path,
        });
        logger.info(`\n✅ 模板源添加成功: ${name}`);
      } catch (error) {
        logger.error(`添加失败: ${(error as Error).message}`);
        throw new VectaHubError(`添加失败: ${(error as Error).message}`, ErrorType.RUNTIME, error);
      }
    });

  sourcesCmd
    .command('remove')
    .description('Remove a template source')
    .argument('<id>', 'Source ID')
    .action(async (id: string) => {
      try {
        await removeSource(context.environment, id);
        logger.info(`\n✅ 模板源已移除: ${id}`);
      } catch (error) {
        logger.error(`移除失败: ${(error as Error).message}`);
        throw new VectaHubError(`移除失败: ${(error as Error).message}`, ErrorType.RUNTIME, error);
      }
    });

  sourcesCmd
    .command('update')
    .description('Update a template source')
    .argument('[id]', 'Source ID (or all if not specified)')
    .action(async (id?: string) => {
      try {
        if (id) {
          await updateSource(context.environment, id);
          logger.info(`\n✅ 模板源已更新: ${id}`);
        } else {
          await updateAllSources(context.environment);
          logger.info('\n✅ 所有模板源已更新');
        }
      } catch (error) {
        logger.error(`更新失败: ${(error as Error).message}`);
        throw new VectaHubError(`更新失败: ${(error as Error).message}`, ErrorType.RUNTIME, error);
      }
    });

  const templatesSaveCmd = new Command('save')
    .description('Save current workflow as a template')
    .argument('<workflow-id>', 'Workflow ID to save as template')
    .option('-n, --name <name>', 'Template name')
    .option('-d, --description <desc>', 'Template description')
    .option('-c, --category <category>', 'Template category', 'general')
    .option('-t, --tags <tags>', 'Comma-separated tags')
    .action(async (workflowId: string, options: { name?: string; description?: string; category?: string; tags?: string }) => {
      const storage = createStorage({ environment: context.environment, logger: context.logger.getLogger('storage') });
      const workflow = await storage.getWorkflow(workflowId);

      if (!workflow) {
        const errorMessage = `Workflow "${workflowId}" not found`;
        logger.error(errorMessage);
        throw new VectaHubError(errorMessage, ErrorType.RUNTIME);
      }

      const templateName = options.name || workflow.name;
      const description = options.description || workflow.name;
      const category = options.category || 'general';
      const tags = options.tags ? options.tags.split(',').map(t => t.trim()) : [category];

      const YAML = await import('yaml');

      const templateYAML = {
        name: templateName,
        description: description,
        category: category,
        tags: tags,
        parameters: [],
        workflow: {
          name: workflow.name,
          mode: workflow.mode,
          steps: workflow.steps,
        },
      };

      const outputPath = context.environment.getPath(builtinTemplatesDir, `${templateName}.yaml`);
      context.environment.writeFile(outputPath, YAML.default.stringify(templateYAML));

      logger.info(`Template saved: ${templateName}`);
      output.log(`  Name: ${templateName}`);
      output.log(`  Category: ${category}`);
      output.log(`  Path: ${outputPath}`);
    });

  const templatesUseCmd = new Command('use')
    .description('Instantiate a template and save as a workflow')
    .argument('<name>', 'Template name')
    .option('-p, --param <key=value>', 'Template parameter (repeatable)', collectParams, {})
    .option('-o, --output <file>', 'Output YAML file path')
    .option('-s, --save', 'Save to workflow library')
    .action(async (name: string, options: { param: Record<string, string>; output?: string; save?: boolean }) => {
      const templates = listTemplates(context.environment, builtinTemplatesDir);
      const tmpl = templates.find(t => t.name === name);
      if (!tmpl) {
        const errorMessage = `Template "${name}" not found. Use "vectahub templates list" to see available templates.`;
        logger.error(errorMessage);
        throw new VectaHubError(errorMessage, ErrorType.RUNTIME);
      }

      try {
        const path = context.environment.getPath(builtinTemplatesDir, `${name}.yaml`);
        const workflow = instantiateTemplate(context.environment, path, options.param);

        logger.info(`Instantiated template: ${tmpl.name}`);
        output.log(`  Name: ${workflow.name}`);
        output.log(`  Steps: ${workflow.steps.length}`);
        output.log(`  Parameters: ${Object.keys(options.param).length}`);

        if (options.save) {
          const storage = createStorage({ environment: context.environment, logger: context.logger.getLogger('storage') });
          await storage.saveWorkflow(workflow);
          logger.info(`Workflow saved to library: ${workflow.id}`);
        }

        if (options.output) {
          const YAML = await import('yaml');
          context.environment.writeFile(options.output, YAML.default.stringify({
            name: workflow.name,
            description: tmpl.description,
            mode: workflow.mode,
            steps: workflow.steps,
          }));
          logger.info(`YAML saved to: ${options.output}`);
        }

        if (!options.save && !options.output) {
          logger.info('Use --save to save to library, or --output <file> to save as YAML');
        }
      } catch (error: unknown) {
        const errorMessage = `Failed to instantiate template: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMessage);
        throw new VectaHubError(errorMessage, ErrorType.RUNTIME, error);
      }
    });

  templatesCmd.addCommand(templatesUseCmd);
  templatesCmd.addCommand(templatesSaveCmd);

  return templatesCmd;
}
