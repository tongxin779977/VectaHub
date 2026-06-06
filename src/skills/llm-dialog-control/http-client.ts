import { LLMNetworkError } from './dialog-controller.js';

interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

interface HttpResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

export async function httpRequest<T = unknown>(
  url: string,
  options: HttpRequestOptions
): Promise<HttpResponse<T>> {
  const { method, headers = {}, body, timeout = 30000 } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      signal: controller.signal,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new LLMNetworkError(`API error: ${response.status} - ${errorText}`, response.status);
    }

    const data = await response.json() as T;
    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
