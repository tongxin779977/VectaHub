import { Command } from 'commander';
import { format } from 'node:util';
import { createStorage } from '../workflow/storage.js';
import type { InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';
import { Workflow } from '../types/index.js';
import YAML from 'yaml';
import { createLLMDialogControlSkill } from '../skills/llm-dialog-control/index.js';

interface GenerateCommandOutput {
  log(message?: unknown, ...optionalParams: unknown[]): void;
}

function createGenerateCommandOutput(): GenerateCommandOutput {
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

const YAML_WORKFLOW_SYSTEM_PROMPT = `
你是一个专业的工作流 YAML 生成专家，专门为 VectaHub 平台生成工作流。

## VectaHub 工作流规范：
- 步骤类型：
  - exec：执行本地命令
  - opencli：调用 OpenCLI 工具
  - for_each：循环
  - if：条件判断
  - parallel：并行执行

- opencli 步骤格式：
  id: <step-id>
  type: opencli
  site: <site-name>
  command: <command>
  args: [arg1, arg2, ...]

- exec 步骤格式：
  id: <step-id>
  type: exec
  cli: <command-line>
  args: [arg1, arg2, ...]

- YAML 必须包含：
  name: <workflow-name>
  description: <description>
  steps: [step1, step2, ...]
  mode: <strict|relaxed|consensus>

## 重要规则：
1. 请直接输出 YAML 内容，不要添加任何额外的说明文字或 Markdown 代码块标记！
2. 确保 YAML 格式完全正确，并且可以直接被 VectaHub 执行！
3. 使用 relaxed 作为默认的 mode！
4. 确保步骤逻辑合理、实用！

## 示例 YAML：

name: "查看 HackerNews 热榜并保存"
description: "查看 HackerNews 热榜，提取链接，保存到文件"
mode: relaxed
steps:
  - id: step1
    type: opencli
    site: hackernews
    command: top
    args: ["--limit", "10"]
  - id: step2
    type: exec
    cli: node
    args: ["-e", "console.log(JSON.parse(process.stdin.read()).map(i => i.url).join('\\n'))"]
  - id: step3
    type: exec
    cli: tee
    args: ["hn-top-urls.txt"]

---

现在请根据用户需求生成对应的 YAML 工作流！
`.trim();

export function createGenerateCmd(context: InfrastructureContext): Command {
  const logger = context.logger.getLogger('generate');
  const output = createGenerateCommandOutput();

  return new Command('generate')
    .description('使用 LLM 生成 YAML 工作流')
    .argument('<description>', '工作流描述')
    .option('-o, --output <file>', '输出文件路径（默认自动生成）')
    .option('-s, --save', '保存到工作流库')
    .option('-e, --execute', '生成后立即执行')
    .action(async (description: string, options: { output?: string; save?: boolean; execute?: boolean }) => {
      const env = context.environment;

      try {
        const provider = env.getEnv('VECTAHUB_LLM_PROVIDER') as 'openai' | 'anthropic' | 'ollama' | 'groq' || 'openai';
        const model = env.getEnv('VECTAHUB_LLM_MODEL') || 'gpt-4o-mini';
        const baseUrl = env.getEnv('VECTAHUB_LLM_BASE_URL');

        const hasOpenAI = !!env.getEnv('OPENAI_API_KEY');
        const hasAnthropic = !!env.getEnv('ANTHROPIC_API_KEY');
        const hasOllama = !!env.getEnv('OLLAMA_API_KEY');

        if (!hasOpenAI && !hasAnthropic && !hasOllama) {
          logger.error('LLM 不可用，请先配置环境变量');
          logger.info('   - OpenAI: OPENAI_API_KEY');
          logger.info('   - Anthropic: ANTHROPIC_API_KEY');
          logger.info('   - Ollama: OLLAMA_API_KEY 和 VECTAHUB_LLM_BASE_URL');
          throw new VectaHubError('LLM providers not configured', ErrorType.RUNTIME);
        }

        const skill = createLLMDialogControlSkill({
          provider,
          model,
          baseUrl,
          temperature: 0.3
        });

        logger.info('正在生成工作流...');

        const response = await skill.generateYAML(
          description,
          YAML_WORKFLOW_SYSTEM_PROMPT,
          { maxRetries: 3 }
        );

        if (!response.success) {
          logger.error(`生成失败: ${response.error}`);
          logger.info(`尝试次数: ${response.attemptCount}`);
          throw new VectaHubError(`Generation failed: ${response.error}`, ErrorType.RUNTIME);
        }

        logger.info(`生成成功！(尝试次数: ${response.attemptCount})`);

        let workflow: Workflow;
        try {
          workflow = YAML.parse(response.output) as Workflow;
        } catch (e) {
          logger.error('生成的 YAML 无效');
          output.log('\n' + response.output);
          throw new VectaHubError('Generated YAML is invalid', ErrorType.RUNTIME, e);
        }

        logger.info('生成的工作流:');
        output.log(response.output);

        let outputPath: string;
        if (options.output) {
          outputPath = options.output;
        } else {
          const safeName = workflow.name.replace(/[^a-zA-Z0-9_-]/g, '_');
          outputPath = `./${safeName}.yaml`;
        }

        env.writeFile(outputPath, response.output);
        logger.info(`工作流已保存到: ${outputPath}`);

        if (options.save) {
          const storage = createStorage({ environment: env, logger });
          await storage.saveWorkflow(workflow, 'yaml');
          logger.info('工作流已保存到工作流库');
        }

        if (options.execute) {
          logger.info('正在执行工作流...');
          logger.info('使用命令: vectahub run --file ' + outputPath);
        }

        logger.info('提示: 使用 vectahub run --file ' + outputPath + ' 执行工作流');

      } catch (error) {
        if (error instanceof VectaHubError) {
          throw error;
        }
        logger.error(`生成失败: ${error instanceof Error ? error.message : String(error)}`);
        logger.debug(error instanceof Error ? error.stack : String(error));
        throw new VectaHubError(
          `Generation failed: ${error instanceof Error ? error.message : String(error)}`,
          ErrorType.RUNTIME,
          error
        );
      }
    });
}
