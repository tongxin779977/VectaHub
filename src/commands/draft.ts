import { Command } from 'commander';
import pino from 'pino';
import { createDraftStorage } from '../orchestration-plan/draft-storage.js';
import { createDraftExecutor } from '../orchestration-plan/draft-executor.js';
import { applyConfirmationToDraft } from '../orchestration-plan/confirmation-handler.js';
import {
  decideOrchestrationRecovery,
  createOrchestrationRecoveryRecord,
  type OrchestrationFailureKind,
} from '../orchestration-plan/index.js';
import type { InfrastructureContext } from '../infrastructure/context.js';
import { createCliOutput } from '../infrastructure/cli-output.js';
import type { WorkflowDraft } from '../types/workflow-draft.js';
import type { ExecutionRecord } from '../types/workflow.js';
import type { OrchestrationVerificationResult } from '../types/verification-result.js';

function formatDraftStatus(status: string): string {
  const statusMap: Record<string, { icon: string; label: string }> = {
    draft: { icon: '📝', label: '草稿' },
    reviewed: { icon: '👁️', label: '已审查' },
    needs_confirmation: { icon: '⚠️', label: '需确认' },
    confirmed: { icon: '✅', label: '已确认' },
    persisted: { icon: '💾', label: '已保存' },
    executing: { icon: '🔄', label: '执行中' },
    completed: { icon: '🎉', label: '已完成' },
    failed: { icon: '❌', label: '失败' },
    cancelled: { icon: '🚫', label: '已取消' },
    recoverable: { icon: '🔧', label: '可恢复' },
    archived: { icon: '📦', label: '已归档' },
  };
  const mapped = statusMap[status] || { icon: '🔶', label: status };
  return `${mapped.icon} ${mapped.label}`;
}

function formatSafetyStatus(status: string): string {
  const statusMap: Record<string, { icon: string; label: string }> = {
    not_reviewed: { icon: '⏳', label: '未审查' },
    safe: { icon: '🟢', label: '安全' },
    needs_confirmation: { icon: '🟠', label: '需确认' },
    blocked: { icon: '🔴', label: '已阻止' },
  };
  const mapped = statusMap[status] || { icon: '⚪', label: status };
  return `${mapped.icon} ${mapped.label}`;
}

function formatRiskLevel(level: string): string {
  const levelMap: Record<string, { icon: string; label: string }> = {
    safe: { icon: '🟢', label: '安全' },
    low: { icon: '🟢', label: '低风险' },
    medium: { icon: '🟡', label: '中风险' },
    high: { icon: '🟠', label: '高风险' },
    critical: { icon: '🔴', label: '严重风险' },
  };
  const mapped = levelMap[level] || { icon: '⚪', label: level };
  return `${mapped.icon} ${mapped.label}`;
}

function formatSideEffect(sideEffect: string): string {
  const effectMap: Record<string, { icon: string; label: string }> = {
    none: { icon: '', label: '' },
    read: { icon: '📖', label: '读' },
    write: { icon: '✏️', label: '写' },
    command: { icon: '⚡', label: '命令' },
    network: { icon: '🌐', label: '网络' },
  };
  return effectMap[sideEffect]?.label || sideEffect;
}

function formatDraftReview(draft: WorkflowDraft, logger: pino.Logger, _output: ReturnType<typeof createCliOutput>): void {
  logger.info('');
  logger.info('='.repeat(60));
  logger.info(`Draft 审查: ${draft.name || draft.draftId}`);
  logger.info('='.repeat(60));
  logger.info('');

  logger.info(`Draft ID:   ${draft.draftId}`);
  logger.info(`Plan ID:    ${draft.planId}`);
  logger.info(`状态:       ${formatDraftStatus(draft.status)}`);
  logger.info(`模式:       ${draft.mode}`);
  logger.info('');

  logger.info('-'.repeat(60));
  logger.info('步骤列表:');
  logger.info('-'.repeat(60));
  for (let i = 0; i < draft.steps.length; i++) {
    const step = draft.steps[i];
    const typeIcon = step.type === 'exec' ? '⚡' : step.type === 'delegate' ? '🤝' : step.type === 'if' ? '❓' : step.type === 'for_each' ? '🔁' : step.type === 'parallel' ? '⏺' : '❓';

    let stepLine = `  ${i + 1}. ${typeIcon} ${step.label || step.id}`;
    const sideEffect = formatSideEffect(step.sideEffect);
    if (sideEffect) {
      stepLine += ` [${sideEffect}]`;
    }
    logger.info(stepLine);

    if (step.type === 'exec' && step.command) {
      logger.info(`      命令: ${step.command.cli} ${(step.command.args || []).join(' ')}`);
    }
    if (step.type === 'delegate' && step.delegate) {
      logger.info(`      委派给: ${step.delegate.to}`);
    }
    if (step.dependsOn.length > 0) {
      logger.info(`      依赖: ${step.dependsOn.join(', ')}`);
    }
  }

  logger.info('');
  logger.info('-'.repeat(60));
  logger.info('安全审查:');
  logger.info('-'.repeat(60));
  logger.info(`  状态: ${formatSafetyStatus(draft.safetyReview.status)}`);

  if (draft.safetyReview.findings.length > 0) {
    logger.info('');
    for (const finding of draft.safetyReview.findings) {
      logger.info(`  ${formatRiskLevel(finding.level)} ${finding.reason}`);
      if (finding.requiredAction !== 'allow') {
        logger.info(`    需要操作: ${finding.requiredAction}`);
      }
    }
  }

  if (draft.confirmation) {
    logger.info('');
    logger.info('-'.repeat(60));
    logger.info('确认记录:');
    logger.info('-'.repeat(60));
    logger.info(`  确认时间: ${draft.confirmation.confirmedAt}`);
    logger.info(`  确认方式: ${draft.confirmation.confirmedBy}`);
    if (draft.confirmation.confirmedTaskIds.length > 0) {
      logger.info(`  已确认: ${draft.confirmation.confirmedTaskIds.join(', ')}`);
    }
    if (draft.confirmation.deniedTaskIds.length > 0) {
      logger.info(`  已拒绝: ${draft.confirmation.deniedTaskIds.join(', ')}`);
    }
  }

  if (draft.verification.required) {
    logger.info('');
    logger.info('-'.repeat(60));
    logger.info('验证要求:');
    logger.info('-'.repeat(60));
    logger.info('  需要验证: 是');
    if (draft.verification.commands.length > 0) {
      for (const cmd of draft.verification.commands) {
        logger.info(`    ${cmd.cli} ${(cmd.args || []).join(' ')}`);
      }
    }
  }

  logger.info('');
  logger.info('-'.repeat(60));
  logger.info('下一步:');
  logger.info('-'.repeat(60));

  if (draft.safetyReview.status === 'blocked') {
    logger.info('  🚫 此 draft 被安全审查阻止，无法执行');
  } else if (draft.status === 'confirmed' || draft.status === 'persisted') {
    logger.info('  ✅ 此 draft 已确认，可以执行');
    logger.info('');
    logger.info('  执行命令:');
    logger.info(`    vectahub draft execute ${draft.draftId}`);
  } else if (draft.status === 'needs_confirmation') {
    logger.info('  ⚠️ 需要确认后才能执行');
    logger.info('');
    logger.info('  确认命令:');
    logger.info(`    vectahub draft confirm ${draft.draftId}`);
    logger.info('');
    logger.info('  拒绝命令:');
    logger.info(`    vectahub draft deny ${draft.draftId}`);
  } else if (draft.status === 'reviewed') {
    logger.info('  ℹ️ 此 draft 已审查，等待确认');
    logger.info('');
    logger.info('  确认命令:');
    logger.info(`    vectahub draft confirm ${draft.draftId}`);
  } else if (draft.status === 'draft') {
    logger.info('  ℹ️ 此 draft 尚未审查');
    logger.info('');
    logger.info('  审查命令:');
    logger.info(`    vectahub draft review ${draft.draftId}`);
  } else if (draft.status === 'completed' || draft.status === 'failed' || draft.status === 'cancelled' || draft.status === 'archived') {
    logger.info(`  ℹ️ 此 draft 状态为 ${draft.status}，无需进一步操作`);
  } else {
    logger.info(`  ℹ️ 当前状态不支持执行`);
  }

  logger.info('');
}

function formatDraftDetail(draft: WorkflowDraft, logger: pino.Logger, output: ReturnType<typeof createCliOutput>, json: boolean): void {
  if (json) {
    output.json({
      draftId: draft.draftId,
      planId: draft.planId,
      name: draft.name,
      status: draft.status,
      mode: draft.mode,
      schemaVersion: draft.schemaVersion,
      steps: draft.steps.map(step => ({
        id: step.id,
        sourceTaskId: step.sourceTaskId,
        type: step.type,
        label: step.label,
        dependsOn: step.dependsOn,
        command: step.command,
        delegate: step.delegate,
        sideEffect: step.sideEffect,
      })),
      safetyReview: draft.safetyReview,
      confirmation: draft.confirmation,
      verification: draft.verification,
      snapshot: draft.snapshot,
      metadata: draft.metadata,
      trace: draft.trace,
    });
    return;
  }

  logger.info('');
  logger.info('='.repeat(60));
  logger.info(`Draft 详情: ${draft.name || draft.draftId}`);
  logger.info('='.repeat(60));
  logger.info('');

  logger.info(`Draft ID:       ${draft.draftId}`);
  logger.info(`Plan ID:        ${draft.planId}`);
  logger.info(`Schema Version: ${draft.schemaVersion}`);
  logger.info(`名称:           ${draft.name || '(未命名)'}`);
  logger.info(`状态:           ${formatDraftStatus(draft.status)}`);
  logger.info(`模式:           ${draft.mode}`);
  logger.info('');

  logger.info('-'.repeat(60));
  logger.info('元数据:');
  logger.info('-'.repeat(60));
  logger.info(`  创建时间:     ${draft.metadata.createdAt}`);
  logger.info(`  来源:         ${draft.metadata.createdFrom}`);
  logger.info(`  工作目录:     ${draft.metadata.cwd}`);
  logger.info(`  干运行可用:   ${draft.metadata.dryRunAvailable ? '是' : '否'}`);
  logger.info(`  请求持久化:   ${draft.metadata.persistRequested ? '是' : '否'}`);

  logger.info('');
  logger.info('-'.repeat(60));
  logger.info('快照:');
  logger.info('-'.repeat(60));
  logger.info(`  Plan Hash:    ${draft.snapshot.planHash}`);
  logger.info(`  Workflow Hash: ${draft.snapshot.workflowHash}`);
  logger.info(`  生成时间:     ${draft.snapshot.generatedAt}`);
  logger.info(`  源工作目录:   ${draft.snapshot.sourceCwd}`);

  logger.info('');
  logger.info('-'.repeat(60));
  logger.info(`步骤详情 (${draft.steps.length}):`);
  logger.info('-'.repeat(60));
  for (let i = 0; i < draft.steps.length; i++) {
    const step = draft.steps[i];
    const typeIcon = step.type === 'exec' ? '⚡' : step.type === 'delegate' ? '🤝' : step.type === 'if' ? '❓' : step.type === 'for_each' ? '🔁' : step.type === 'parallel' ? '⏺' : step.type === 'opencli' ? '🔓' : '❓';

    logger.info('');
    logger.info(`  步骤 ${i + 1}: ${typeIcon} ${step.label || step.id}`);
    logger.info(`    ID:           ${step.id}`);
    logger.info(`    源任务:       ${step.sourceTaskId}`);
    logger.info(`    类型:         ${step.type}`);
    logger.info(`    副作用:       ${formatSideEffect(step.sideEffect) || '无'}`);
    if (step.dependsOn.length > 0) {
      logger.info(`    依赖:         ${step.dependsOn.join(', ')}`);
    }
    if (step.outputVar) {
      logger.info(`    输出变量:     ${step.outputVar}`);
    }
    if (step.artifactOutputs && step.artifactOutputs.length > 0) {
      logger.info(`    Artifact:     ${step.artifactOutputs.join(', ')}`);
    }

    if (step.type === 'exec' && step.command) {
      logger.info(`    命令:         ${step.command.cli}`);
      logger.info(`    参数:         ${(step.command.args || []).join(' ') || '(无)'}`);
    }
    if (step.type === 'delegate' && step.delegate) {
      logger.info(`    委派目标:     ${step.delegate.to}`);
    }
  }

  logger.info('');
  logger.info('-'.repeat(60));
  logger.info('安全审查:');
  logger.info('-'.repeat(60));
  logger.info(`  状态: ${formatSafetyStatus(draft.safetyReview.status)}`);
  if (draft.safetyReview.findings.length > 0) {
    for (const finding of draft.safetyReview.findings) {
      logger.info('');
      logger.info(`  ${formatRiskLevel(finding.level)}`);
      logger.info(`    分类:     ${finding.category}`);
      logger.info(`    原因:     ${finding.reason}`);
      logger.info(`    操作:     ${finding.requiredAction}`);
    }
  }

  if (draft.confirmation) {
    logger.info('');
    logger.info('-'.repeat(60));
    logger.info('确认记录:');
    logger.info('-'.repeat(60));
    logger.info(`  确认时间: ${draft.confirmation.confirmedAt}`);
    logger.info(`  确认方式: ${draft.confirmation.confirmedBy}`);
    if (draft.confirmation.confirmedTaskIds.length > 0) {
      logger.info(`  已确认:   ${draft.confirmation.confirmedTaskIds.join(', ')}`);
    }
    if (draft.confirmation.deniedTaskIds.length > 0) {
      logger.info(`  已拒绝:   ${draft.confirmation.deniedTaskIds.join(', ')}`);
    }
  }

  if (draft.verification.required) {
    logger.info('');
    logger.info('-'.repeat(60));
    logger.info('验证配置:');
    logger.info('-'.repeat(60));
    logger.info(`  需要验证: 是`);
    if (draft.verification.commands.length > 0) {
      for (const cmd of draft.verification.commands) {
        logger.info(`  命令: ${cmd.cli} ${(cmd.args || []).join(' ')}`);
      }
    }
    if (draft.verification.successCriteria.length > 0) {
      logger.info('  成功标准:');
      for (const criteria of draft.verification.successCriteria) {
        logger.info(`    - ${criteria}`);
      }
    }
  }

  if (draft.trace) {
    logger.info('');
    logger.info('-'.repeat(60));
    logger.info('Trace 链接:');
    logger.info('-'.repeat(60));
    if (draft.trace.traceId) {
      logger.info(`  Trace ID:     ${draft.trace.traceId}`);
    }
    logger.info(`  Plan ID:      ${draft.trace.planId}`);
    if (draft.trace.executionId) {
      logger.info(`  Execution ID: ${draft.trace.executionId}`);
    }
    if (draft.trace.auditEventIds.length > 0) {
      logger.info(`  Audit Events: ${draft.trace.auditEventIds.length} 个`);
    }
  }

  logger.info('');
}

function classifyDraftExecutionFailure(
  executionRecord: ExecutionRecord,
  verificationResults?: OrchestrationVerificationResult,
): OrchestrationFailureKind {
  if (verificationResults?.status === 'fail') {
    return 'verification_error';
  }

  const hasFailedStep = executionRecord.steps.some(
    (step) => step.status === 'FAILED' || step.status === 'TIMEOUT' || step.status === 'ABORTED',
  );

  if (hasFailedStep || executionRecord.status === 'FAILED' || executionRecord.status === 'ABORTED') {
    return 'execution_error';
  }

  return 'unknown';
}

function isExecutable(draft: WorkflowDraft): { executable: boolean; reason: string } {
  if (draft.safetyReview.status === 'blocked') {
    return { executable: false, reason: '此 draft 被安全审查阻止' };
  }
  if (draft.safetyReview.status === 'not_reviewed') {
    return { executable: false, reason: '此 draft 尚未通过安全审查' };
  }
  if (draft.status === 'needs_confirmation' && !draft.confirmation) {
    return { executable: false, reason: '此 draft 需要确认后才能执行' };
  }
  if (draft.status === 'cancelled') {
    return { executable: false, reason: '此 draft 已被取消' };
  }
  if (draft.status === 'completed') {
    return { executable: false, reason: '此 draft 已完成执行' };
  }
  if (draft.status === 'failed') {
    return { executable: false, reason: '此 draft 执行失败，请使用 recover-task 恢复' };
  }
  if (draft.status === 'archived') {
    return { executable: false, reason: '此 draft 已归档' };
  }
  if (draft.status === 'executing') {
    return { executable: false, reason: '此 draft 正在执行中' };
  }
  if (draft.status === 'draft' || draft.status === 'reviewed') {
    return { executable: false, reason: '此 draft 需要先确认' };
  }
  return { executable: true, reason: '' };
}

function createDraftCommand(context: InfrastructureContext): Command {
  const logger = context.logger.getLogger('draft');
  const draftCmd = new Command('draft')
    .description('管理 Workflow Drafts');

  const draftStorage = createDraftStorage({
    environment: context.environment,
    logger: context.logger.getLogger('draft-storage'),
  });

  const draftExecutor = createDraftExecutor({
    context,
  });

  draftCmd
    .command('list')
    .description('列出所有 Drafts')
    .option('--json', '以 JSON 格式输出')
    .action(async (options: { json?: boolean }) => {
      const isJson = options.json || context.environment.getArgv().includes('--json');
      const output = createCliOutput({ json: isJson });

      try {
        const drafts = await draftStorage.listDrafts();

        if (drafts.length === 0) {
          if (isJson) {
            output.json({ ok: true, drafts: [], count: 0 });
          } else {
            logger.info('');
            logger.info('没有找到任何 Drafts。');
            logger.info('');
            logger.info('使用 vectahub run --dry-run 生成新的 Draft。');
            logger.info('');
          }
          return;
        }

        if (isJson) {
          output.json({
            ok: true,
            drafts: drafts.map(d => ({
              draftId: d.draftId,
              planId: d.planId,
              name: d.name,
              status: d.status,
              stepCount: d.steps.length,
              safetyStatus: d.safetyReview.status,
              createdAt: d.metadata.createdAt,
            })),
            count: drafts.length,
          });
          return;
        }

        logger.info('');
        logger.info(`Drafts (${drafts.length} 个):`);
        logger.info('='.repeat(60));
        logger.info('');

        for (const draft of drafts) {
          logger.info(`📄 ${draft.name || draft.draftId}`);
          logger.info(`   状态: ${formatDraftStatus(draft.status)} | 安全: ${formatSafetyStatus(draft.safetyReview.status)} | 步骤: ${draft.steps.length}`);
          logger.info(`   创建: ${draft.metadata.createdAt}`);
          logger.info('');
        }

        logger.info('查看详情: vectahub draft detail <draftId>');
        logger.info('审查:     vectahub draft review <draftId>');
        logger.info('');
      } catch (error) {
        logger.error(`列出 Drafts 失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    });

  draftCmd
    .command('detail <draftId>')
    .description('显示 Draft 详细信息')
    .option('--json', '以 JSON 格式输出')
    .action(async (draftId: string, options: { json?: boolean }) => {
      const isJson = options.json || context.environment.getArgv().includes('--json');
      const output = createCliOutput({ json: isJson });

      try {
        const draft = await draftStorage.getDraft(draftId);

        if (!draft) {
          if (isJson) {
            output.json({ ok: false, error: `Draft ${draftId} not found` });
          } else {
            logger.error(`Draft ${draftId} 不存在。`);
            logger.info('使用 vectahub draft list 查看所有 Drafts。');
          }
          return;
        }

        formatDraftDetail(draft, logger, output, isJson);
      } catch (error) {
        logger.error(`获取 Draft 详情失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    });

  draftCmd
    .command('review <draftId>')
    .description('审查 Draft，显示风险、确认要求和下一步')
    .option('--json', '以 JSON 格式输出')
    .action(async (draftId: string, options: { json?: boolean }) => {
      const isJson = options.json || context.environment.getArgv().includes('--json');
      const output = createCliOutput({ json: isJson });

      try {
        const draft = await draftStorage.getDraft(draftId);

        if (!draft) {
          if (isJson) {
            output.json({ ok: false, error: `Draft ${draftId} not found` });
          } else {
            logger.error(`Draft ${draftId} 不存在。`);
            logger.info('使用 vectahub draft list 查看所有 Drafts。');
          }
          return;
        }

        if (isJson) {
          output.json({
            ok: true,
            draftId: draft.draftId,
            planId: draft.planId,
            name: draft.name,
            status: draft.status,
            safetyReview: draft.safetyReview,
            steps: draft.steps.map(s => ({
              id: s.id,
              label: s.label,
              type: s.type,
              sideEffect: s.sideEffect,
              command: s.command,
              delegate: s.delegate,
            })),
            verification: draft.verification,
            nextStep: determineNextStep(draft),
            executable: isExecutable(draft).executable,
          });
          return;
        }

        formatDraftReview(draft, logger, output);
      } catch (error) {
        logger.error(`审查 Draft 失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    });

  draftCmd
    .command('confirm <draftId>')
    .description('确认 Draft 并允许执行')
    .option('--json', '以 JSON 格式输出')
    .action(async (draftId: string, options: { json?: boolean }) => {
      const isJson = options.json || context.environment.getArgv().includes('--json');
      const output = createCliOutput({ json: isJson });

      try {
        const draft = await draftStorage.getDraft(draftId);

        if (!draft) {
          if (isJson) {
            output.json({ ok: false, error: `Draft ${draftId} not found` });
          } else {
            logger.error(`Draft ${draftId} 不存在。`);
          }
          return;
        }

        if (draft.safetyReview.status === 'blocked') {
          if (isJson) {
            output.json({ ok: false, error: '此 Draft 被安全审查阻止，无法确认' });
          } else {
            logger.error('🚫 此 Draft 被安全审查阻止，无法确认。');
          }
          return;
        }

        if (draft.status === 'confirmed' || draft.status === 'persisted') {
          if (isJson) {
            output.json({ ok: true, message: '此 Draft 已经确认', draftId: draft.draftId, status: draft.status });
          } else {
            logger.info('ℹ️ 此 Draft 已经确认。');
            logger.info(`  状态: ${formatDraftStatus(draft.status)}`);
          }
          return;
        }

        const allStepIds = draft.steps.map(s => s.sourceTaskId);
        const updatedDraft = applyConfirmationToDraft(draft, {
          confirmedTaskIds: allStepIds,
          deniedTaskIds: [],
        }, {
          confirmedBy: context.environment.getArgv().includes('--non-interactive') ? 'non_interactive_policy' : 'user',
        });

        await draftStorage.saveDraft(updatedDraft);

        if (isJson) {
          output.json({
            ok: true,
            message: 'Draft 已确认',
            draftId: updatedDraft.draftId,
            status: updatedDraft.status,
            confirmedBy: updatedDraft.confirmation?.confirmedBy,
            confirmedAt: updatedDraft.confirmation?.confirmedAt,
          });
          return;
        }

        logger.info('');
        logger.info('✅ Draft 已确认！');
        logger.info(`  Draft ID: ${updatedDraft.draftId}`);
        logger.info(`  状态:     ${formatDraftStatus(updatedDraft.status)}`);
        if (updatedDraft.confirmation) {
          logger.info(`  确认时间: ${updatedDraft.confirmation.confirmedAt}`);
        }
        logger.info('');
        logger.info('下一步:');
        logger.info(`  vectahub draft execute ${updatedDraft.draftId}`);
        logger.info('');
      } catch (error) {
        logger.error(`确认 Draft 失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    });

  draftCmd
    .command('deny <draftId>')
    .description('拒绝 Draft')
    .option('--json', '以 JSON 格式输出')
    .action(async (draftId: string, options: { json?: boolean }) => {
      const isJson = options.json || context.environment.getArgv().includes('--json');
      const output = createCliOutput({ json: isJson });

      try {
        const draft = await draftStorage.getDraft(draftId);

        if (!draft) {
          if (isJson) {
            output.json({ ok: false, error: `Draft ${draftId} not found` });
          } else {
            logger.error(`Draft ${draftId} 不存在。`);
          }
          return;
        }

        if (draft.status === 'cancelled') {
          if (isJson) {
            output.json({ ok: true, message: '此 Draft 已经拒绝', draftId: draft.draftId, status: draft.status });
          } else {
            logger.info('ℹ️ 此 Draft 已经拒绝。');
          }
          return;
        }

        const allStepIds = draft.steps.map(s => s.sourceTaskId);
        const updatedDraft = applyConfirmationToDraft(draft, {
          confirmedTaskIds: [],
          deniedTaskIds: allStepIds,
        }, {
          confirmedBy: context.environment.getArgv().includes('--non-interactive') ? 'non_interactive_policy' : 'user',
        });

        await draftStorage.saveDraft(updatedDraft);

        if (isJson) {
          output.json({
            ok: true,
            message: 'Draft 已拒绝',
            draftId: updatedDraft.draftId,
            status: updatedDraft.status,
            deniedAt: updatedDraft.confirmation?.confirmedAt,
          });
          return;
        }

        logger.info('');
        logger.info('🚫 Draft 已拒绝！');
        logger.info(`  Draft ID: ${updatedDraft.draftId}`);
        logger.info(`  状态:     ${formatDraftStatus(updatedDraft.status)}`);
        logger.info('');
      } catch (error) {
        logger.error(`拒绝 Draft 失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    });

  draftCmd
    .command('execute <draftId>')
    .description('执行已确认的 Draft')
    .option('--dry-run', '干运行模式，不实际执行')
    .option('--json', '以 JSON 格式输出')
    .action(async (draftId: string, options: { dryRun?: boolean; json?: boolean }) => {
      const isJson = options.json || context.environment.getArgv().includes('--json');
      const output = createCliOutput({ json: isJson });

      try {
        const draft = await draftStorage.getDraft(draftId);

        if (!draft) {
          if (isJson) {
            output.json({ ok: false, error: `Draft ${draftId} not found` });
          } else {
            logger.error(`Draft ${draftId} 不存在。`);
          }
          return;
        }

        const check = isExecutable(draft);
        if (!check.executable) {
          if (isJson) {
            output.json({ ok: false, error: check.reason, draftId: draft.draftId, status: draft.status });
          } else {
            logger.error(`🚫 无法执行: ${check.reason}`);
            logger.info('');
            logger.info(`当前状态: ${formatDraftStatus(draft.status)}`);
          }
          return;
        }

        if (isJson) {
          output.json({
            ok: true,
            message: options.dryRun ? 'Dry-run 模式' : '开始执行 Draft',
            draftId: draft.draftId,
            dryRun: options.dryRun || false,
            stepCount: draft.steps.length,
          });
          return;
        }

        logger.info('');
        if (options.dryRun) {
          logger.info('🔍 干运行模式 - 不实际执行');
        } else {
          logger.info('🚀 开始执行 Draft...');
        }
        logger.info(`  Draft ID: ${draft.draftId}`);
        logger.info(`  名称:     ${draft.name || '(未命名)'}`);
        logger.info(`  步骤:     ${draft.steps.length} 个`);
        logger.info('');

        const result = await draftExecutor.executeConfirmedDraft(draft, {
          dryRun: options.dryRun,
          onProgress: (info) => {
            logger.info(`  [${info.currentStep}/${info.totalSteps}] ${info.stepType}: ${info.status}`);
          },
        });

        const hasExecutionFailure = result.executionRecord.status !== 'COMPLETED';
        const hasVerificationFailure = result.verificationResults?.status === 'fail';
        const recoveryDecision = (hasExecutionFailure || hasVerificationFailure)
          ? decideOrchestrationRecovery({
              planId: draft.planId,
              draftId: draft.draftId,
              executionId: result.executionRecord.executionId,
              traceId: result.executionRecord.traceId ?? draft.trace?.traceId,
              failureKind: classifyDraftExecutionFailure(result.executionRecord, result.verificationResults),
              failureReason: result.verificationResults?.failureReason
                ?? result.executionRecord.steps.find((step) => step.status === 'FAILED' || step.status === 'TIMEOUT' || step.status === 'ABORTED')?.error
                ?? `Draft execution ended with status ${result.executionRecord.status}`,
              planHash: draft.snapshot.planHash,
              currentPlanHash: draft.snapshot.planHash,
              workflowHash: draft.snapshot.workflowHash,
              currentWorkflowHash: draft.snapshot.workflowHash,
              draft,
              executionRecord: result.executionRecord,
              verificationResult: result.verificationResults,
              hasSideEffects: draft.steps.some((step) => step.sideEffect !== 'none' && step.sideEffect !== 'read'),
              stepsCompleted: result.executionRecord.steps.filter((step) => step.status === 'COMPLETED').length,
              stepsFailed: result.executionRecord.steps.filter(
                (step) => step.status === 'FAILED' || step.status === 'TIMEOUT' || step.status === 'ABORTED',
              ).length,
              totalSteps: result.executionRecord.steps.length || draft.steps.length,
            })
          : undefined;
        const recoveryRecord = recoveryDecision
          ? createOrchestrationRecoveryRecord({
              recoveryRunId: `orch-rec-${Date.now()}`,
              sourcePlanId: draft.planId,
              sourceDraftId: draft.draftId,
              sourceExecutionId: result.executionRecord.executionId,
              planId: draft.planId,
              draftId: draft.draftId,
              executionId: result.executionRecord.executionId,
              decision: recoveryDecision,
              sourceTraceId: draft.trace?.traceId,
              recoveryTraceId: result.executionRecord.traceId,
            })
          : undefined;

        if (isJson) {
          output.json({
            ok: !recoveryDecision,
            message: options.dryRun ? '干运行完成' : recoveryDecision ? '执行失败，已生成恢复建议' : '执行完成',
            draftId: draft.draftId,
            executionId: result.executionRecord.executionId,
            status: result.executionRecord.status,
            stepCount: result.executionRecord.steps.length,
            duration: result.executionRecord.duration,
            verificationStatus: result.verificationResults?.status,
            recoveryDecision,
            recoveryRecord,
          });
          return;
        }

        if (recoveryDecision) {
          logger.info('');
          logger.info('='.repeat(60));
          logger.info('⚠️ 执行失败，已生成恢复建议');
          logger.info('='.repeat(60));
          logger.info(`  Execution ID: ${result.executionRecord.executionId}`);
          logger.info(`  状态:         ${result.executionRecord.status}`);
          logger.info(`  恢复策略:     ${recoveryDecision.kind}`);
          logger.info(`  原因:         ${recoveryDecision.summary}`);
          logger.info('');
          for (const action of recoveryDecision.suggestedActions) {
            logger.info(`  → ${action}`);
          }
          logger.info('');
          return;
        }

        logger.info('');
        logger.info('='.repeat(60));
        if (options.dryRun) {
          logger.info('✅ 干运行完成！');
        } else {
          logger.info('✅ 执行完成！');
        }
        logger.info('='.repeat(60));
        logger.info(`  Execution ID: ${result.executionRecord.executionId}`);
        logger.info(`  状态:         ${result.executionRecord.status}`);
        logger.info(`  步骤:         ${result.executionRecord.steps.length} 个`);
        if (result.executionRecord.duration) {
          logger.info(`  耗时:         ${result.executionRecord.duration}ms`);
        }
        logger.info('');
        logger.info(`使用 vectahub detail ${result.executionRecord.executionId} 查看详情`);
        logger.info('');
      } catch (error) {
        logger.error(`执行 Draft 失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    });

  draftCmd
    .command('delete <draftId>')
    .description('删除 Draft')
    .option('--json', '以 JSON 格式输出')
    .action(async (draftId: string, options: { json?: boolean }) => {
      const isJson = options.json || context.environment.getArgv().includes('--json');
      const output = createCliOutput({ json: isJson });

      try {
        const draft = await draftStorage.getDraft(draftId);

        if (!draft) {
          if (isJson) {
            output.json({ ok: false, error: `Draft ${draftId} not found` });
          } else {
            logger.error(`Draft ${draftId} 不存在。`);
          }
          return;
        }

        if (draft.status === 'executing') {
          if (isJson) {
            output.json({ ok: false, error: '无法删除正在执行中的 Draft' });
          } else {
            logger.error('🚫 无法删除正在执行中的 Draft。');
          }
          return;
        }

        await draftStorage.deleteDraft(draftId);

        if (isJson) {
          output.json({ ok: true, message: 'Draft 已删除', draftId });
          return;
        }

        logger.info('');
        logger.info('✅ Draft 已删除！');
        logger.info(`  Draft ID: ${draftId}`);
        logger.info('');
      } catch (error) {
        logger.error(`删除 Draft 失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw error;
      }
    });

  return draftCmd;
}

function determineNextStep(draft: WorkflowDraft): string {
  if (draft.safetyReview.status === 'blocked') {
    return 'blocked';
  }
  if (draft.status === 'confirmed' || draft.status === 'persisted') {
    return 'execute';
  }
  if (draft.status === 'needs_confirmation') {
    return 'confirm';
  }
  if (draft.status === 'reviewed') {
    return 'confirm';
  }
  if (draft.status === 'draft') {
    return 'review';
  }
  return 'none';
}

export { createDraftCommand };
