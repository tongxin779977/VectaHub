import { Command } from 'commander';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { getLogger } from '../utils/logger.js';
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

const logger = getLogger('templates');

function getTemplatesDir(): string {
  if (process.env.VECTAHUB_TEMPLATES_DIR) {
    return process.env.VECTAHUB_TEMPLATES_DIR;
  }

  try {
    const config = loadConfig();
    if (config.templates?.directory) {
      return config.templates.directory;
    }
  } catch {
    // 配置文件读取失败，使用默认路径
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = join(__filename, '..');
  return join(__dirname, '..', '..', '..', 'templates');
}

const BUILTIN_TEMPLATES_DIR = getTemplatesDir();

function formatTemplateTable(templates: WorkflowTemplate[]): void {
  if (templates.length === 0) {
    logger.info('  (no templates found)');
    return;
  }
  console.log(`  ${'Name'.padEnd(22)} ${'Category'.padEnd(12)} ${'Tags'.padEnd(20)} Description`);
  console.log(`  ${'─'.repeat(22)} ${'─'.repeat(12)} ${'─'.repeat(20)} ${'─'.repeat(30)}`);
  for (const t of templates) {
    const tags = t.tags.join(', ');
    const params = t.parameters ? t.parameters.length : 0;
    console.log(
      `  ${t.name.padEnd(22)} ${t.category.padEnd(12)} ${tags.padEnd(20)} ${t.description}` +
      (params > 0 ? ` (${params} params)` : '')
    );
  }
}

function collectParams(value: string, previous: Record<string, string>): Record<string, string> {
  const [key, ...rest] = value.split('=');
  return { ...previous, [key]: rest.join('=') };
}

function formatMarketTemplateTable(templates: TemplateMetadata[]): void {
  if (templates.length === 0) {
    logger.info('  (no templates found)');
    return;
  }
  console.log(`  ${'Source'.padEnd(12)} ${'Name'.padEnd(22)} ${'Category'.padEnd(12)} ${'Tags'.padEnd(20)} Description`);
  console.log(`  ${'─'.repeat(12)} ${'─'.repeat(22)} ${'─'.repeat(12)} ${'─'.repeat(20)} ${'─'.repeat(30)}`);
  for (const t of templates) {
    const tags = t.template.tags.join(', ');
    const params = t.template.parameters ? t.template.parameters.length : 0;
    console.log(
      `  ${t.sourceId.padEnd(12)} ${t.template.name.padEnd(22)} ${t.template.category.padEnd(12)} ${tags.padEnd(20)} ${t.template.description}` +
      (params > 0 ? ` (${params} params)` : '')
    );
  }
}

function formatSourcesTable(sources: TemplateSource[]): void {
  if (sources.length === 0) {
    logger.info('  (no sources configured)');
    return;
  }
  console.log(`  ${'ID'.padEnd(15)} ${'Name'.padEnd(20)} ${'URL'.padEnd(40)} ${'Type'.padEnd(10)} ${'Last Update'}`);
  console.log(`  ${'─'.repeat(15)} ${'─'.repeat(20)} ${'─'.repeat(40)} ${'─'.repeat(10)} ${'─'.repeat(20)}`);
  for (const s of sources) {
    const lastUpdate = s.lastUpdate ? new Date(s.lastUpdate).toLocaleDateString() : 'Never';
    console.log(
      `  ${s.id.padEnd(15)} ${s.name.padEnd(20)} ${s.url.padEnd(40)} ${s.type.padEnd(10)} ${lastUpdate}`
    );
  }
}

export const templatesCmd = new Command('templates')
  .description('Manage workflow templates')
  .command('list')
  .description('List available workflow templates')
  .option('-c, --category <category>', 'Filter by category')
  .option('-t, --tag <tag>', 'Filter by tag')
  .action((options: { category?: string; tag?: string }) => {
    const templates = listTemplates(BUILTIN_TEMPLATES_DIR, options.category, options.tag);
    logger.info('\nAvailable workflow templates:\n');
    formatTemplateTable(templates);
    console.log(`\nTotal: ${templates.length} template(s)`);
    logger.info('\nUsage: vectahub templates use <name> [--param key=value]');
  })
  .command('search')
  .description('Search templates in remote marketplaces')
  .argument('[keyword]', 'Search keyword')
  .option('-c, --category <category>', 'Filter by category')
  .option('-t, --tag <tag>', 'Filter by tag')
  .action(async (keyword: string, options: { category?: string; tag?: string }) => {
    logger.info(`\n搜索模板: ${keyword || '全部'}`);
    logger.info('正在连接模板仓库...\n');
    
    try {
      const templates = await searchMarketTemplates(keyword, options.category, options.tag);
      formatMarketTemplateTable(templates);
      console.log(`\n找到 ${templates.length} 个模板`);
      logger.info('\n使用 `vectahub templates install <name>` 安装模板');
    } catch (error) {
      logger.error(`搜索失败: ${(error as Error).message}`);
      process.exit(1);
    }
  })
  .command('install')
  .description('Install a template from marketplace')
  .argument('<name>', 'Template name')
  .option('-o, --output <dir>', 'Output directory')
  .action(async (name: string, options: { output?: string }) => {
    logger.info(`\n安装模板: ${name}`);
    
    try {
      const path = await installTemplateByName(name, options.output);
      logger.info(`\n✅ 模板安装成功`);
      console.log(`  路径: ${path}`);
      logger.info(`\n使用: vectahub templates use ${name}`);
    } catch (error) {
      logger.error(`安装失败: ${(error as Error).message}`);
      process.exit(1);
    }
  })
  .command('sources')
  .description('Manage template sources')
  .command('list')
  .description('List configured template sources')
  .action(async () => {
    const sources = await getSources();
    logger.info('\n配置的模板源:\n');
    formatSourcesTable(sources);
  })
  .command('add')
  .description('Add a template source')
  .argument('<name>', 'Source name')
  .argument('<url>', 'Git repository URL')
  .option('-b, --branch <branch>', 'Git branch', 'main')
  .option('-p, --path <path>', 'Path within repository')
  .action(async (name: string, url: string, options: { branch?: string; path?: string }) => {
    try {
      await addSource({
        name,
        url,
        type: url.includes('github.com') ? 'github' : 'git',
        branch: options.branch,
        path: options.path,
      });
      logger.info(`\n✅ 模板源添加成功: ${name}`);
    } catch (error) {
      logger.error(`添加失败: ${(error as Error).message}`);
      process.exit(1);
    }
  })
  .command('remove')
  .description('Remove a template source')
  .argument('<id>', 'Source ID')
  .action(async (id: string) => {
    try {
      await removeSource(id);
      logger.info(`\n✅ 模板源已移除: ${id}`);
    } catch (error) {
      logger.error(`移除失败: ${(error as Error).message}`);
      process.exit(1);
    }
  })
  .command('update')
  .description('Update a template source')
  .argument('[id]', 'Source ID (or all if not specified)')
  .action(async (id?: string) => {
    try {
      if (id) {
        await updateSource(id);
        logger.info(`\n✅ 模板源已更新: ${id}`);
      } else {
        await updateAllSources();
        logger.info('\n✅ 所有模板源已更新');
      }
    } catch (error) {
      logger.error(`更新失败: ${(error as Error).message}`);
      process.exit(1);
    }
  });

export const templatesSaveCmd = new Command('save')
  .description('Save current workflow as a template')
  .argument('<workflow-id>', 'Workflow ID to save as template')
  .option('-n, --name <name>', 'Template name')
  .option('-d, --description <desc>', 'Template description')
  .option('-c, --category <category>', 'Template category', 'general')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .action(async (workflowId: string, options: { name?: string; description?: string; category?: string; tags?: string }) => {
    const storage = createStorage();
    const workflow = await storage.getWorkflow(workflowId);

    if (!workflow) {
      logger.error(`Workflow "${workflowId}" not found`);
      process.exit(1);
    }

    const templateName = options.name || workflow.name;
    const description = options.description || workflow.name;
    const category = options.category || 'general';
    const tags = options.tags ? options.tags.split(',').map(t => t.trim()) : [category];

    const YAML = await import('yaml');
    const { writeFileSync } = await import('fs');
    const { join } = await import('path');

    const templatesDir = BUILTIN_TEMPLATES_DIR;

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

    const outputPath = join(templatesDir, `${templateName}.yaml`);
    writeFileSync(outputPath, YAML.default.stringify(templateYAML), 'utf-8');

    logger.info(`Template saved: ${templateName}`);
    console.log(`  Name: ${templateName}`);
    console.log(`  Category: ${category}`);
    console.log(`  Path: ${outputPath}`);
  });

export const templatesUseCmd = new Command('use')
  .description('Instantiate a template and save as a workflow')
  .argument('<name>', 'Template name')
  .option('-p, --param <key=value>', 'Template parameter (repeatable)', collectParams, {})
  .option('-o, --output <file>', 'Output YAML file path')
  .option('-s, --save', 'Save to workflow library')
  .action(async (name: string, options: { param: Record<string, string>; output?: string; save?: boolean }) => {
    const templates = listTemplates(BUILTIN_TEMPLATES_DIR);
    const tmpl = templates.find(t => t.name === name);
    if (!tmpl) {
      logger.error(`Template "${name}" not found. Use "vectahub templates list" to see available templates.`);
      process.exit(1);
    }

    try {
      const path = join(BUILTIN_TEMPLATES_DIR, `${name}.yaml`);
      const workflow = instantiateTemplate(path, options.param);

      logger.info(`Instantiated template: ${tmpl.name}`);
      console.log(`  Name: ${workflow.name}`);
      console.log(`  Steps: ${workflow.steps.length}`);
      console.log(`  Parameters: ${Object.keys(options.param).length}`);

      if (options.save) {
        const storage = createStorage();
        await storage.saveWorkflow(workflow);
        logger.info(`Workflow saved to library: ${workflow.id}`);
      }

      if (options.output) {
        const { writeFileSync } = await import('fs');
        const YAML = await import('yaml');
        writeFileSync(options.output, YAML.default.stringify({
          name: workflow.name,
          description: tmpl.description,
          mode: workflow.mode,
          steps: workflow.steps,
        }), 'utf-8');
        logger.info(`YAML saved to: ${options.output}`);
      }

      if (!options.save && !options.output) {
        logger.info('Use --save to save to library, or --output <file> to save as YAML');
      }
    } catch (error) {
      logger.error(`Failed to instantiate template: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
