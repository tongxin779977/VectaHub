import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExecutor } from './executor.js';
import { getCliToolRegistry } from '../cli-tools/index.js';
import { createNoopAuditHelper } from '../infrastructure/audit/index.js';
import { createEnvironmentService } from '../infrastructure/environment/index.js';
import * as cp from 'child_process';

const environment = createEnvironmentService();

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

vi.mock('../cli-tools/index.js', () => ({
  getCliToolRegistry: vi.fn(),
}));

describe('Workflow Pre-flight Checks', () => {
  let executor: any;
  const mockRegistry = {
    getTool: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    executor = createExecutor({ audit: createNoopAuditHelper(), environment });
    (getCliToolRegistry as any).mockReturnValue(mockRegistry);
  });

  it('should block execution if a tool fails pre-flight check', async () => {
    const steps = [
      { id: 'step1', type: 'exec', cli: 'gh', args: ['run', 'list'] }
    ];
    
    mockRegistry.getTool.mockReturnValue({
      name: 'gh',
      authCheckCommand: 'gh auth status',
      authHelpMessage: 'Please login to GH'
    });

    // Mock spawn to simulate failure (exit code 1)
    const mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event, cb) => {
        if (event === 'close') setTimeout(() => cb(1), 10);
      }),
      kill: vi.fn(),
    };
    (cp.spawn as any).mockReturnValue(mockChild);

    const results = await executor.executeWorkflow(steps, { mode: 'RELAXED' });

    expect(results).toHaveLength(1);
    expect(results[0].stepId).toBe('pre-flight');
    expect(results[0].status).toBe('FAILED');
    expect(results[0].error).toBe('Please login to GH');
  });

  it('should continue execution if pre-flight check passes', async () => {
    const steps = [
      { id: 'step1', type: 'exec', cli: 'gh', args: ['run', 'list'] }
    ];
    
    mockRegistry.getTool.mockReturnValue({
      name: 'gh',
      authCheckCommand: 'gh auth status'
    });

    // Mock spawn to simulate success (exit code 0)
    const mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event, cb) => {
        if (event === 'close') setTimeout(() => cb(0), 10);
      }),
      kill: vi.fn(),
    };
    (cp.spawn as any).mockReturnValue(mockChild);

    const results = await executor.executeWorkflow(steps, { mode: 'RELAXED' });

    expect(results[0].stepId).toBe('step1');
    expect(results[0].status).toBe('COMPLETED');
  });
});
