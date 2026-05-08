import { createInterface } from 'readline';
import { createConsoleLogger } from '../utils/logger.js';
import { createIntelligentDiagnosisModule } from '../skills/ai-modules/intelligent-diagnosis/diagnoser.js';
import { createLLMConfig, LLMClient } from '../nl/llm.js';
import { contextManager } from '../workflow/context-manager.js';
import { createWorkflowEngine } from '../workflow/engine.js';
import type { ExecutionRecord, Workflow, Step, StepRecord } from '../types/index.js';

const logger = createConsoleLogger('self-healing');

export async function runSelfHealingLoop(
  result: ExecutionRecord,
  workflow: Workflow,
  llmConfig: any
): Promise<boolean> {
  if (result.status !== 'FAILED') return true;

  const failedStepRecord = result.steps.find((s: StepRecord) => s.status === 'FAILED');
  if (!failedStepRecord) return false;

  logger.info(`\n🔍 正在分析失败原因: ${failedStepRecord.stepId}...`);

  const llmClient = new LLMClient(llmConfig);
  // Extend LLMClient with a raw completion for diagnosis
  const diagnosisModule = createIntelligentDiagnosisModule({
    llmClient: {
      complete: async (system, user) => {
        // We use a simplified version for diagnosis that returns raw JSON
        const response = await (llmClient as any).callOpenAICompatible(user, system);
        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
      }
    }
  });

  const diagnosisResult = await diagnosisModule.execute({
    stepId: failedStepRecord.stepId,
    error: failedStepRecord.error || 'Unknown error',
    stderr: failedStepRecord.error, // Assuming error contains some useful info or captured stderr
    context: contextManager.exportContext(result.executionId)
  }, { sessionId: 'diagnosis' });

  if (!diagnosisResult.success || !diagnosisResult.data) {
    logger.error('❌ 诊断失败，无法自动修复。');
    return false;
  }

  const diagnosis = diagnosisResult.data;
  logger.info(`\n💡 根因分析: ${diagnosis.rootCause}`);
  logger.info(`📂 类别: ${diagnosis.category}`);
  
  if (diagnosis.fixSuggestions.length === 0) {
    logger.info('💡 LLM 没有给出具体的修复建议。');
    return false;
  }

  logger.info('\n🛠️  建议方案:');
  diagnosis.fixSuggestions.forEach((s, i) => {
    logger.info(`  [${i + 1}] ${s.description}`);
    if (s.command) logger.info(`      命令: ${s.command}`);
  });
  logger.info(`  [${diagnosis.fixSuggestions.length + 1}] 手动处理 / 跳过`);

  const answer = await promptUser(`\n请选择修复方案 [1-${diagnosis.fixSuggestions.length + 1}]: `);
  const choice = parseInt(answer.trim(), 10);

  if (isNaN(choice) || choice < 1 || choice > diagnosis.fixSuggestions.length) {
    logger.info('⏭️  跳过自动修复。');
    return false;
  }

  const suggestion = diagnosis.fixSuggestions[choice - 1];
  if (suggestion.command) {
    logger.info(`\n🚀 正在尝试修复: ${suggestion.command}`);
    
    // Create a temporary workflow for the fix
    const engine = createWorkflowEngine();
    const fixStep: Step = {
      id: `fix_${Date.now()}`,
      type: 'exec',
      cli: suggestion.command.split(' ')[0],
      args: suggestion.command.split(' ').slice(1)
    };
    
    const fixWorkflow = await engine.createWorkflow(`fix_${failedStepRecord.stepId}`, [fixStep]);
    const fixResult = await engine.execute(fixWorkflow, { mode: 'relaxed' });

    if (fixResult.status === 'COMPLETED') {
      logger.info('✅ 修复命令执行成功！');
      const retry = await promptUser('是否重新执行原工作流? (y/n): ');
      if (retry.toLowerCase() === 'y') {
        return true; // Signal to run.ts to retry
      }
    } else {
      logger.error('❌ 修复失败。');
    }
  } else {
    logger.info(`💡 请按照建议进行手动操作: ${suggestion.description}`);
  }

  return false;
}

function promptUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer);
    });
  });
}
