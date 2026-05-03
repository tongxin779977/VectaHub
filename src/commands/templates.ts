import { Command } from 'commander';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { createConsoleLogger } from '../utils/logger.js';
import { createStorage } from '../workflow/storage.js';
import { listTemplates, instantiateTemplate, type WorkflowTemplate } from '../workflow/template.js';

const logger = createConsoleLogger('templates');
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const BUILTIN_TEMPLATES_DIR = join(__dirname, '..', '..', '..', 'templates');

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
    const { fileURLToPath } = await import('url');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = join(__filename, '..');
    const templatesDir = join(__dirname, '..', '..', '..', 'templates');

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
