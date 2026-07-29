import { Command } from 'commander';
import type { InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

/**
 * 创建生成命令
 * @param context - 基础设施上下文
 * @returns Commander 命令实例
 * @throws VectaHubError 如果 LLM 提供商未配置或生成失败
 */
export function createGenerateCmd(context: InfrastructureContext): Command {
  const logger = context.logger.getLogger('generate');

  return new Command('generate')
    .description('使用 LLM 生成 YAML 工作流')
    .argument('<description>', '工作流描述')
    .option('-o, --output <file>', '输出文件路径（默认自动生成）')
    .option('-s, --save', '保存到工作流库')
    .option('-e, --execute', '生成后立即执行')
    .action(async (_description: string, _options: { output?: string; save?: boolean; execute?: boolean }) => {
      const env = context.environment;

      try {
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

        // LLM skill 模块已删除，后续改为 ACP 模式
        throw new VectaHubError('LLM dialog control skill 已移除，待 ACP 模式接入', ErrorType.RUNTIME);

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
