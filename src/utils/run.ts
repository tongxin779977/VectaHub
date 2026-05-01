import { Command } from 'commander';
import { createLogger } from './logger.js';
import { createNLParser } from '../nl/parser.js';
import { createWorkflowEngine } from '../workflow/engine.js';
import { createStorage } from '../workflow/storage.js';
import { resolveIntentWithAI } from '../nl/ai-intent-resolver.js';
import { reviewAndEditCommands } from './command-editor.js';
import { isFirstRun, runFirstRunWizard } from '../setup/first-run-wizard.js';
import { scanCLITools, updateCLIToolConfig } from '../setup/cli-scanner.js';
import { createEntityExtractor } from '../nl/entity-extractor.js';
import type { Workflow, ParseResult } from '../types/index.js';

const HIGH_CONFIDENCE_THRESHOLD = 0.7;
const LOW_CONFIDENCE_THRESHOLD = 0.01;

const logger = createLogger('run');

export const runCmd = new Command('run')
  .description('Run a workflow from natural language')
  .argument('<intent...>', 'Natural language description')
  .option('-m, --mode <mode>', 'Execution mode (strict|relaxed|consensus)')
  .option('-s, --save', 'Save workflow after execution')
  .option('-y, --yes', 'Skip confirmation')
  .option('--no-edit', 'Skip command review')
  .action(async (intent: string[], options: any) => {
    const text = intent.join(' ');
    logger.info(`Parsing intent: "${text}"`);

    try {
      // 首次启动引导
      if (isFirstRun()) {
        const configured = await runFirstRunWizard();
        if (configured) {
          await scanCLITools();
          updateCLIToolConfig([]);
        }
      }

      const parser = createNLParser();
      const extractor = createEntityExtractor();
      const parseResult = parser.parse(text);

      logger.debug(`Rule-based match: ${parseResult.intent} (confidence: ${parseResult.confidence.toFixed(2)})`);

      // 检查是否有检测到CLI工具
      const entities = extractor.extract(text);
      const hasCLITool = entities.some(e => e.type === 'CLI_TOOL');
      const hasHighConfidence = parseResult.confidence >= HIGH_CONFIDENCE_THRESHOLD;
      const hasConfidence = parseResult.confidence >= LOW_CONFIDENCE_THRESHOLD;

      let taskListResult: ParseResult;

      // 逻辑：当没有使用其他CLI工具的时候，置信度高优先使用意图匹配，失败立马转到llm兜底
      if (!hasCLITool && hasHighConfidence) {
        logger.info(`🎯 Using rule-based parsing (high confidence: ${parseResult.confidence.toFixed(2)}, no CLI tool detected)`);
        taskListResult = parser.parseToTaskList(text);
        if (taskListResult.status === 'SUCCESS' && taskListResult.taskList) {
          logger.info(`✅ Rule-based parsing succeeded (${taskListResult.taskList.tasks.length} tasks)`);
        } else {
          logger.warn('⚠️  Rule parsing failed, immediately falling back to AI...');
          taskListResult = await tryAIFallback(text);
        }
      } else if (hasConfidence) {
        logger.info(`🔍 Trying rule-based parsing first (confidence: ${parseResult.confidence.toFixed(2)}, ${hasCLITool ? 'CLI tool detected' : 'low confidence'})`);
        taskListResult = parser.parseToTaskList(text);
        if (taskListResult.status === 'SUCCESS' && taskListResult.taskList) {
          logger.info(`✅ Rule-based parsing succeeded (${taskListResult.taskList.tasks.length} tasks)`);
        } else {
          logger.warn('⚠️  Rule parsing failed, falling back to AI...');
          taskListResult = await tryAIFallback(text);
        }
      } else {
        logger.warn('⚠️  Low confidence, directly falling back to AI...');
        taskListResult = await tryAIFallback(text);
      }

      if (taskListResult.status !== 'SUCCESS' || !taskListResult.taskList) {
        logger.error('❌ 无法解析意图，请尝试更明确的输入！');
        if (taskListResult.candidates?.length) {
          logger.info('💡 可能的意图：' + taskListResult.candidates.map(c => c.intent).join(', '));
        } else {
          logger.info('\n📋 可用的意图示例：');
          logger.info('  - "查找当前目录下的文件"');
          logger.info('  - "显示磁盘使用情况"');
          logger.info('  - "构建项目"');
          logger.info('  - "运行测试"');
          logger.info('  - "查看 git 状态"');
        }
        process.exit(1);
      }

      // 对话后命令编辑（除非指定 --no-edit）
      if (options.edit !== false && taskListResult.taskList.tasks.length > 0) {
        try {
          taskListResult.taskList = await reviewAndEditCommands(taskListResult.taskList);
        } catch (error) {
          if (error instanceof Error && error.message === 'User cancelled') {
            logger.info('⏭️  用户取消执行');
            process.exit(0);
          }
          throw error;
        }
      }

      const workflowEngine = createWorkflowEngine();
      await workflowEngine.loadWorkflows();
      const storage = createStorage();

      const steps: Array<{ id: string; type: 'exec'; cli: string; args: string[] }> = [];
      let stepIndex = 1;

      for (const task of taskListResult.taskList.tasks) {
        const commands = task.commands.length > 0 ? task.commands : [{ cli: 'echo', args: [] }];
        for (const cmd of commands) {
          steps.push({
            id: `step_${stepIndex}`,
            type: 'exec' as const,
            cli: cmd.cli,
            args: (cmd.args || []).filter((arg): arg is string => arg !== undefined && arg !== ''),
          });
          stepIndex++;
        }
      }

      const workflow = await workflowEngine.createWorkflow(
        `intent_${Date.now()}`,
        steps
      );

      logger.info(`Created workflow with ${steps.length} steps`);

      if (options.save) {
        await storage.saveWorkflow(workflow);
        logger.info('Workflow saved');
      }

      logger.info('Executing workflow...');
      const mode = options.mode || 'relaxed';
      const result = await workflowEngine.execute(workflow, { mode: mode as any });

    logger.info(`\nExecution ${result.status}`);
    logger.info(`Duration: ${result.duration}ms`);

    if (result.steps.length > 0) {
      logger.info('\n📊 Step Results:');
      for (const step of result.steps) {
        if (step.output && step.output.length > 0) {
          logger.info(`\n📤 Step ${step.stepId} Output:`);
          for (const output of step.output) {
            logger.info(output.trim());
          }
        }
        if (step.error) {
          logger.error(`\n❌ Step ${step.stepId} Error: ${step.error}`);
        }
      }
    }

    if (result.status === 'COMPLETED') {
      logger.info('\n✅ Workflow completed successfully');
    } else if (result.status === 'FAILED') {
      logger.error('\n❌ Workflow failed');
      const lastFailedStep = result.steps[result.steps.length - 1];
      if (lastFailedStep?.error) {
        logger.error(`Error: ${lastFailedStep.error}`);
      }
      process.exit(1);
    }
    } catch (error) {
      logger.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      logger.debug(error instanceof Error ? error.stack : String(error));
      process.exit(1);
    }
  });

async function tryAIFallback(input: string): Promise<ParseResult> {
  logger.info('🤖 尝试使用 AI 解析意图...');
  const aiResult = await resolveIntentWithAI(input);
  
  if (aiResult.success && aiResult.parseResult) {
    logger.info('✅ AI 解析成功');
    return aiResult.parseResult;
  }
  
  // 更安静地回退，不显示警告
  logger.debug(`AI 不可用，回退到规则解析`);
  return {
    status: 'NEEDS_CLARIFICATION',
    confidenceLevel: 'UNCERTAIN',
    originalInput: input,
    candidates: [],
  };
}
