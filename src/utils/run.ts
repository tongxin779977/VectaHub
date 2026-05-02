import { Command } from 'commander';
import { createConsoleLogger } from './logger.js';
import { createNLParser } from '../nl/parser.js';
import { createWorkflowEngine } from '../workflow/engine.js';
import { createStorage } from '../workflow/storage.js';
import { reviewAndEditCommands } from './command-editor.js';
import { isFirstRun, runFirstRunWizard } from '../setup/first-run-wizard.js';
import { scanCLITools, updateCLIToolConfig } from '../setup/cli-scanner.js';
import { createLLMConfig, createLLMEnhancedParser, type LLMResponse } from '../nl/llm.js';
import type { Workflow, ParseResult, Step, Task, TaskList, TaskType } from '../types/index.js';

import path from 'node:path';

const HIGH_CONFIDENCE_THRESHOLD = 0.7;

function getConfidenceLevelText(confidence: number): 'HIGH' | 'MEDIUM' | 'LOW' | 'UNCERTAIN' {
  if (confidence >= 0.9) return 'HIGH';
  if (confidence >= 0.7) return 'MEDIUM';
  if (confidence >= 0.5) return 'LOW';
  return 'UNCERTAIN';
}

function mapIntentToTaskType(intent: string): TaskType {
  switch (intent) {
    case 'FILE_FIND':
    case 'QUERY_INFO':
    case 'SYSTEM_INFO':
      return 'QUERY_EXEC';
    case 'GIT_WORKFLOW':
      return 'GIT_OPERATION';
    case 'INSTALL_PACKAGE':
      return 'PACKAGE_INSTALL';
    case 'RUN_SCRIPT':
      return 'BUILD_VERIFY';
    case 'CREATE_FILE':
      return 'CODE_CREATE';
    default:
      return 'DEBUG_EXEC';
  }
}

function convertLLMResultToTaskList(llmResult: LLMResponse, originalInput: string): ParseResult {
  const tasks: Task[] = llmResult.workflow.steps.map((step, index) => ({
    id: `task_${index + 1}`,
    type: mapIntentToTaskType(llmResult.intent),
    description: `${step.cli} ${(step.args || []).join(' ')}`,
    status: 'PENDING',
    commands: step.cli ? [{ cli: step.cli, args: step.args || [] }] : [{ cli: 'echo', args: [step.type || 'unknown'] }],
    dependencies: [],
  }));

  const confidenceLevel = getConfidenceLevelText(llmResult.confidence);

  const taskList: TaskList = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    originalInput,
    intent: llmResult.intent as any,
    confidence: llmResult.confidence,
    entities: {} as any,
    tasks,
    warnings: [],
  };

  return {
    status: 'SUCCESS',
    taskList,
    confidenceLevel,
    originalInput,
  };
}

const logger = createConsoleLogger('run');

export const runCmd = new Command('run')
  .description('Run a workflow from natural language or file')
  .argument('[intent...]', 'Natural language description')
  .option('-f, --file <file>', 'Run workflow from YAML/JSON file')
  .option('-m, --mode <mode>', 'Execution mode (strict|relaxed|consensus)')
  .option('-s, --save', 'Save workflow after execution')
  .option('-y, --yes', 'Skip confirmation')
  .option('--no-edit', 'Skip command review')
  .action(async (intent: string[], options: any) => {
    try {
      if (isFirstRun()) {
        const configured = await runFirstRunWizard();
        if (configured) {
          await scanCLITools();
          updateCLIToolConfig([]);
        }
      }

      let workflow: Workflow | null = null;

      if (options.file) {
        const filepath = path.resolve(options.file);
        logger.info(`从文件加载工作流: ${filepath}`);
        const storage = createStorage();
        workflow = await storage.loadWorkflowFromFile(filepath);
        
        if (!workflow) {
          logger.error(`❌ 无法加载工作流文件: ${filepath}`);
          process.exit(1);
        }
        
        logger.info(`✅ 工作流加载成功: ${workflow.name}`);
      } else if (intent.length > 0) {
        const text = intent.join(' ');
        logger.info(`解析意图: "${text}"`);

        const llmConfig = createLLMConfig();
        let taskListResult: ParseResult;

        if (llmConfig) {
          logger.info('使用 LLM 解析意图');
          try {
            const llmParser = createLLMEnhancedParser(llmConfig);
            const llmResult = await llmParser.parse(text);

            if (llmResult.confidence >= 0.7 && llmResult.workflow?.steps?.length > 0) {
              taskListResult = convertLLMResultToTaskList(llmResult, text);
            } else {
              logger.warn(`LLM 解析置信度低 (${llmResult.confidence})，降级为关键词匹配`);
              taskListResult = createNLParser().parseToTaskList(text);
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.warn(`LLM 解析失败 (${errorMsg})，降级为关键词匹配`);
            taskListResult = createNLParser().parseToTaskList(text);
          }
        } else {
          logger.info('LLM 未配置，使用关键词匹配');
          taskListResult = createNLParser().parseToTaskList(text);
        }

        if (taskListResult.status !== 'SUCCESS' || !taskListResult.taskList) {
          logger.error('❌ 无法解析意图，请尝试更明确的输入！');
          if (taskListResult.candidates?.length) {
            logger.info('💡 可能的意图: ' + taskListResult.candidates.map(c => c.intent).join(', '));
          } else {
            logger.info('\n📋 可用的意图示例:');
            logger.info('  - "查找当前目录下的文件"');
            logger.info('  - "显示磁盘使用情况"');
            logger.info('  - "构建项目"');
            logger.info('  - "运行测试"');
            logger.info('  - "查看 git 状态"');
          }
          process.exit(1);
        }

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

        const steps: Array<Step> = [];
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

        workflow = await workflowEngine.createWorkflow(
          `intent_${Date.now()}`,
          steps
        );

        logger.info(`创建工作流，包含 ${steps.length} 个步骤`);

        if (options.save) {
          await storage.saveWorkflow(workflow);
          logger.info('工作流已保存');
        }
      } else {
        logger.error('❌ 请提供自然语言描述或使用 --file 选项指定工作流文件');
        process.exit(1);
      }

      const workflowEngine = createWorkflowEngine();
      await workflowEngine.loadWorkflows();
      const storage = createStorage();

      logger.info('执行工作流...');
      const mode = options.mode || 'relaxed';
      const result = await workflowEngine.execute(workflow, { mode: mode as any });

      logger.info(`\n执行${result.status === 'COMPLETED' ? '✅ 成功' : '❌ 失败'}`);
      logger.info(`耗时: ${result.duration}ms`);

      if (result.steps.length > 0) {
        logger.info('\n📊 步骤结果:');
        for (const step of result.steps) {
          logger.info(`  ${step.stepId}: ${step.status}`);
          if (step.output && step.output.length > 0) {
            logger.info(`  输出:`);
            for (const line of step.output) {
              logger.info(`    ${String(line).trim()}`);
            }
          }
          if (step.error) {
            logger.error(`  错误: ${step.error}`);
          }
        }
      }

      if (result.status === 'FAILED') {
        process.exit(1);
      }
    } catch (error) {
      logger.error(`错误: ${error instanceof Error ? error.message : '未知错误'}`);
      logger.debug(error instanceof Error ? error.stack : String(error));
      process.exit(1);
    }
  });
