import { describe, expect, it } from 'vitest';

import { createSemanticDetector } from '../sandbox/semantic-detector.js';
import { createSystemWorkflows } from './system-workflows.js';
import { createEnvironmentService } from '../infrastructure/environment/index.js';

const environment = createEnvironmentService();
const SYSTEM_WORKFLOWS = createSystemWorkflows(environment);

describe('SYSTEM_WORKFLOWS', () => {
  it('uses formal script entries for diagnostic queue processing', () => {
    const workflow = SYSTEM_WORKFLOWS['sys:process-diagnostic-queue'];
    const detector = createSemanticDetector();

    const getPendingStep = workflow.steps[0];
    const getPendingCommand = [getPendingStep.cli, ...(getPendingStep.args || [])].join(' ');

    expect(getPendingStep.cli).toBe(process.execPath);
    expect(getPendingCommand).not.toContain('-e');
    expect(detector.detectDangerousCommand(getPendingCommand).detected).toBe(false);

    const processAllStep = workflow.steps[1];
    expect(processAllStep.type).toBe('for_each');
    expect(processAllStep.body).toHaveLength(1);

    const processTaskStep = processAllStep.body?.[0];
    const processTaskCommand = [processTaskStep?.cli, ...(processTaskStep?.args || [])].join(' ');

    expect(processTaskStep?.cli).toBe(process.execPath);
    expect(processTaskCommand).not.toContain('-e');
    expect(processTaskCommand).toContain('process-diagnostic-queue');
    expect(detector.detectDangerousCommand(processTaskCommand).detected).toBe(false);
  });

  it('uses a bundled script for GitHub Actions queue ingestion', () => {
    const workflow = SYSTEM_WORKFLOWS['sys:fetch-gh-actions-errors'];
    const saveStep = workflow.steps[1];
    const saveCommand = [saveStep.cli, ...(saveStep.args || [])].join(' ');

    expect(saveStep.cli).toBe(process.execPath);
    expect(saveCommand).toContain('gh-to-queue');
    expect(saveCommand).not.toContain('-e');
  });
});
