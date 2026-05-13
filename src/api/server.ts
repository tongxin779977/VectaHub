import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { createLLMConfig, createLLMEnhancedParser } from '../nl/llm.js';
import { createWorkflowEngine } from '../workflow/engine.js';
import { createStorage } from '../workflow/storage.js';
import { createScheduleManager } from '../workflow/scheduler.js';
import { audit, getCurrentSessionId, AuditEventType, queryAuditLogs } from '../utils/audit.js';
import { getVectaHubPath } from '../utils/paths.js';
import type { Workflow, Step } from '../types/index.js';

function getWorkflowsDir(): string {
  return getVectaHubPath('workflows');
}

interface APIResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

function jsonResponse(res: ServerResponse, statusCode: number, body: APIResponse): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function parseRequestBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

function listWorkflows(): { id: string; name: string; steps: unknown[] }[] {
  const workflowsDir = getWorkflowsDir();

  if (!existsSync(workflowsDir)) return [];
  return readdirSync(workflowsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const content = readFileSync(join(workflowsDir, f), 'utf-8');
      const wf = JSON.parse(content);
      return { id: wf.id || f.replace('.json', ''), name: wf.name || 'unnamed', steps: wf.steps || [] };
    });
}

export async function createAPIServer(port = 3000): Promise<ReturnType<typeof createServer>> {
  const engine = createWorkflowEngine();
  const scheduler = createScheduleManager({ engine });
  await scheduler.start();

  const server = createServer(async (req, res) => {
    const sessionId = getCurrentSessionId();
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const method = req.method || 'GET';

    audit.cliCommand(`${method} ${url.pathname}`, [], sessionId);

    try {
      if (method === 'GET' && url.pathname === '/api/workflows') {
        const workflows = listWorkflows();
        jsonResponse(res, 200, { success: true, data: workflows });
      } else if (method === 'GET' && url.pathname === '/api/executions') {
        const storage = createStorage();
        const executions = await storage.list();
        jsonResponse(res, 200, { success: true, data: executions });
      } else if (method === 'GET' && url.pathname === '/api/audit') {
        const limit = parseInt(url.searchParams.get('limit') || '100', 10);
        const logs = queryAuditLogs({ limit });
        jsonResponse(res, 200, { success: true, data: logs });
      } else if (method === 'POST' && url.pathname === '/api/workflows') {
        const body = await parseRequestBody(req);
        const input = (body.input as string) || '';
        const workflowFile = (body.workflowFile as string);

        let executionResult: { status: string; steps: unknown[]; warnings?: string[] } = {
          status: 'PENDING',
          steps: [],
          warnings: [],
        };

        if (workflowFile && existsSync(workflowFile)) {
          const content = readFileSync(workflowFile, 'utf-8');
          const workflow = JSON.parse(content);
          const result = await engine.execute(workflow);
          executionResult = { status: result.status, steps: result.steps, warnings: result.warnings };
        } else {
          const llmConfig = createLLMConfig();
          let executionResult: { status: string; steps: unknown[]; warnings?: string[] };

          if (workflowFile && existsSync(workflowFile)) {
            const content = readFileSync(workflowFile, 'utf-8');
            const workflow = JSON.parse(content) as Workflow;
            const result = await engine.execute(workflow);
            executionResult = { status: result.status, steps: result.steps, warnings: result.warnings };
          } else {
            if (llmConfig) {
              const llmParser = createLLMEnhancedParser(llmConfig);
              const llmResult = await llmParser.parse(input);
              
              if (llmResult.confidence >= 0.7 && llmResult.workflow?.steps?.length > 0) {
                const steps = llmResult.workflow.steps.map((s, i) => ({
                  id: s.cli ? `step_${i + 1}` : `step_${i + 1}`,
                  type: s.type,
                  cli: s.cli,
                  args: s.args || [],
                  site: (s as any).site,
                  command: (s as any).command,
                  condition: (s as any).condition,
                  items: (s as any).items,
                  body: (s as any).body,
                })) as Step[];
                const workflow = await engine.createWorkflow(llmResult.workflow.name || input, steps);
                const result = await engine.execute(workflow);
                executionResult = { status: result.status, steps: result.steps, warnings: result.warnings };
              } else {
                executionResult = { status: 'NEEDS_CLARIFICATION', steps: [], warnings: ['Low confidence, no workflow generated'] };
              }
            } else {
              executionResult = { status: 'NEEDS_CLARIFICATION', steps: [], warnings: ['LLM not configured'] };
            }
          }
        }

        audit.workflowEnd('api', executionResult.status as AuditEventType, 0, sessionId);
        jsonResponse(res, 200, { success: true, data: executionResult });
      } else if (method === 'POST' && url.pathname === '/api/ai-delegate') {
        const body = await parseRequestBody(req);
        const input = (body.input as string) || '';

        audit.workflowStart('ai-delegate', input, sessionId);

        const llmConfig = createLLMConfig();
        if (!llmConfig) {
          jsonResponse(res, 503, { success: false, error: 'LLM not configured' });
          return;
        }

        const llmParser = createLLMEnhancedParser(llmConfig);
        const llmResult = await llmParser.parse(input);

        audit.intentMatch(llmResult.intent, llmResult.confidence, llmResult.params, sessionId);

        if (llmResult.confidence < 0.5) {
          jsonResponse(res, 400, {
            success: false,
            error: `Low confidence: ${llmResult.confidence}`,
            data: { intent: llmResult.intent, confidence: llmResult.confidence },
          });
          return;
        }

        if (llmResult.workflow?.steps?.length > 0) {
          const steps = llmResult.workflow.steps.map((s, i) => ({
            id: `step_${i + 1}`,
            type: s.type,
            cli: s.cli,
            args: s.args || [],
            site: (s as any).site,
            command: (s as any).command,
            condition: (s as any).condition,
            items: (s as any).items,
            body: (s as any).body,
          })) as Step[];
          const workflow = await engine.createWorkflow(llmResult.workflow.name || input, steps);
          const result = await engine.execute(workflow);

          audit.workflowEnd('ai-delegate', result.status as AuditEventType, result.duration || 0, sessionId);

          jsonResponse(res, 200, {
            success: true,
            data: {
              intent: llmResult.intent,
              confidence: llmResult.confidence,
              execution: { status: result.status, steps: result.steps },
            },
          });
        } else {
          jsonResponse(res, 200, {
            success: true,
            data: { intent: llmResult.intent, confidence: llmResult.confidence, message: 'No workflow steps generated' },
          });
        }
      } else if (method === 'GET' && url.pathname === '/health') {
        jsonResponse(res, 200, { success: true, data: { status: 'ok', uptime: process.uptime() } });
      } else {
        jsonResponse(res, 404, { success: false, error: `Not found: ${method} ${url.pathname}` });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      audit.log({
        event: AuditEventType.WORKFLOW_END,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'API',
        action: `${method} ${url.pathname}`,
        output: { error: message },
        success: false,
        error: message,
      });
      jsonResponse(res, 500, { success: false, error: message });
    }
  });

  return server;
}
