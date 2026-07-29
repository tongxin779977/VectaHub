import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { createWorkflowEngine } from '../workflow/engine.js';
import { createStorage } from '../workflow/storage.js';
import { createScheduleManager } from '../workflow/scheduler.js';
import { AuditEventType, type AuditHelper, type AuditLogger } from '../infrastructure/audit/index.js';
import type { IEnvironmentService } from '../infrastructure/interfaces/index.js';
import type pino from 'pino';

function getWorkflowsDir(environment: IEnvironmentService): string {
  return environment.getPath('workflows');
}

interface APIResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface APIServerDeps {
  audit: AuditHelper;
  auditLogger: Pick<AuditLogger, 'getSessionId' | 'query'>;
  environment: IEnvironmentService;
  logger: pino.Logger;
}

interface APIExecutionSummary {
  status: string;
  steps: unknown[];
  warnings?: string[];
}

function toExecutionSummary(result: { status: string; steps: unknown[]; warnings?: string[] }): APIExecutionSummary {
  return {
    status: result.status,
    steps: result.steps,
    warnings: result.warnings,
  };
}

export class RequestBodyParseError extends Error {
  readonly statusCode = 400;
  constructor(message = 'Invalid JSON in request body') {
    super(message);
    this.name = 'RequestBodyParseError';
  }
}

export class BodyTooLargeError extends Error {
  readonly statusCode = 413;
  constructor(message = 'Request body too large') {
    super(message);
    this.name = 'BodyTooLargeError';
  }
}

const MAX_BODY_SIZE_BYTES = 1024 * 1024; // 1MB 默认限制

function jsonResponse(res: ServerResponse, statusCode: number, body: APIResponse): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function parseRequestBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  // Content-Length 快速路径：提前拒绝超限请求
  const contentLength = req.headers['content-length'];
  if (contentLength !== undefined) {
    const cl = Number(contentLength);
    if (!Number.isFinite(cl) || cl < 0) {
      throw new RequestBodyParseError('Invalid Content-Length header');
    }
    if (cl > MAX_BODY_SIZE_BYTES) {
      throw new BodyTooLargeError(
        `Request body too large: ${cl} bytes exceeds limit of ${MAX_BODY_SIZE_BYTES} bytes`
      );
    }
  }

  return new Promise((resolve, reject) => {
    let body = '';
    let totalBytes = 0;
    let rejected = false;

    req.on('data', (chunk: Buffer) => {
      if (rejected) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_SIZE_BYTES) {
        rejected = true;
        req.destroy();
        reject(new BodyTooLargeError(
          `Request body too large: exceeds limit of ${MAX_BODY_SIZE_BYTES} bytes`
        ));
        return;
      }
      body += chunk.toString();
    });

    req.on('end', () => {
      if (rejected) return;

      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed: unknown = JSON.parse(body);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          reject(new RequestBodyParseError('Request body must be a JSON object'));
          return;
        }
        resolve(parsed as Record<string, unknown>);
      } catch {
        reject(new RequestBodyParseError());
      }
    });

    req.on('error', (err) => {
      if (!rejected) reject(err);
    });
  });
}

function listWorkflows(environment: IEnvironmentService): { id: string; name: string; steps: unknown[] }[] {
  const workflowsDir = getWorkflowsDir(environment);

  if (!existsSync(workflowsDir)) return [];
  return readdirSync(workflowsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const content = readFileSync(join(workflowsDir, f), 'utf-8');
      const wf = JSON.parse(content);
      return { id: wf.id || f.replace('.json', ''), name: wf.name || 'unnamed', steps: wf.steps || [] };
    });
}

export async function createAPIServer(
  port = 3000,
  deps: APIServerDeps
): Promise<ReturnType<typeof createServer>> {
  const engine = createWorkflowEngine({ audit: deps.audit, environment: deps.environment, logger: deps.logger });
  const scheduler = createScheduleManager({ engine, audit: deps.audit, environment: deps.environment });
  await scheduler.start();

  const server = createServer(async (req, res) => {
    const sessionId = deps.auditLogger.getSessionId();
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const method = req.method || 'GET';

    deps.audit.cliCommand(`${method} ${url.pathname}`, [], sessionId);

    try {
      if (method === 'GET' && url.pathname === '/api/workflows') {
        const workflows = listWorkflows(deps.environment);
        jsonResponse(res, 200, { success: true, data: workflows });
      } else if (method === 'GET' && url.pathname === '/api/executions') {
        const storage = createStorage({ environment: deps.environment, logger: deps.logger });
        const executions = await storage.list();
        jsonResponse(res, 200, { success: true, data: executions });
      } else if (method === 'GET' && url.pathname === '/api/audit') {
        const limit = parseInt(url.searchParams.get('limit') || '100', 10);
        const logs = deps.auditLogger.query({ limit });
        jsonResponse(res, 200, { success: true, data: logs });
      } else if (method === 'POST' && url.pathname === '/api/workflows') {
        const body = await parseRequestBody(req);
        const workflowFile = (body.workflowFile as string);

        let executionResult!: APIExecutionSummary;

        if (workflowFile && existsSync(workflowFile)) {
          const content = readFileSync(workflowFile, 'utf-8');
          const workflow = JSON.parse(content);
          const result = await engine.execute(workflow, { sessionId });
          executionResult = toExecutionSummary(result);
        } else {
          // LLM 解析路径已移除,后续将改为 ACP 模式;暂返回 NEEDS_CLARIFICATION
          executionResult = {
            status: 'NEEDS_CLARIFICATION',
            steps: [],
            warnings: ['Natural-language workflow generation is not configured'],
          };
        }

        deps.audit.workflowEnd('api', executionResult.status as AuditEventType, 0, sessionId);
        jsonResponse(res, 200, { success: true, data: executionResult });
      } else if (method === 'POST' && url.pathname === '/api/ai-delegate') {
        // LLM 解析路径已移除,后续将改为 ACP 模式;暂返回 503
        jsonResponse(res, 503, { success: false, error: 'AI delegate is not configured' });
      } else if (method === 'GET' && url.pathname === '/health') {
        jsonResponse(res, 200, { success: true, data: { status: 'ok', uptime: process.uptime() } });
      } else {
        jsonResponse(res, 404, { success: false, error: `Not found: ${method} ${url.pathname}` });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const statusCode = (err instanceof RequestBodyParseError)
        ? 400
        : (err instanceof BodyTooLargeError) ? 413 : 500;
      deps.audit.log({
        event: AuditEventType.WORKFLOW_END,
        timestamp: new Date().toISOString(),
        sessionId,
        module: 'API',
        action: `${method} ${url.pathname}`,
        output: { error: message },
        success: false,
        error: message,
      });
      jsonResponse(res, statusCode, { success: false, error: message });
    }
  });

  return server;
}
