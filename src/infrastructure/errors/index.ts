export enum ErrorType {
  CONFIGURATION = 'CONFIGURATION',
  PERMISSION = 'PERMISSION',
  FILESYSTEM = 'FILESYSTEM',
  RUNTIME = 'RUNTIME',
  UNKNOWN = 'UNKNOWN',
}

export class VectaHubError extends Error {
  constructor(
    message: string,
    public readonly type: ErrorType = ErrorType.UNKNOWN,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'VectaHubError';
  }
}

export function classifyError(error: unknown): { type: ErrorType; message: string; cause?: unknown } {
  if (error instanceof VectaHubError) {
    return {
      type: error.type,
      message: error.message,
      cause: error.cause,
    };
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    
    if (msg.includes('permission') || msg.includes('eacces')) {
      return {
        type: ErrorType.PERMISSION,
        message: error.message,
        cause: error,
      };
    }
    
    if (msg.includes('enoent') || msg.includes('file not found') || msg.includes('not found')) {
      return {
        type: ErrorType.FILESYSTEM,
        message: error.message,
        cause: error,
      };
    }
    
    if (msg.includes('config') || msg.includes('configuration') || msg.includes('invalid')) {
      return {
        type: ErrorType.CONFIGURATION,
        message: error.message,
        cause: error,
      };
    }

    return {
      type: ErrorType.RUNTIME,
      message: error.message,
      cause: error,
    };
  }

  return {
    type: ErrorType.UNKNOWN,
    message: String(error),
    cause: error,
  };
}

export function formatErrorMessage(error: unknown, context?: string): string {
  const { type, message } = classifyError(error);
  const contextPrefix = context ? `[${context}] ` : '';
  
  const typeLabels: Record<ErrorType, string> = {
    [ErrorType.CONFIGURATION]: '配置错误',
    [ErrorType.PERMISSION]: '权限错误',
    [ErrorType.FILESYSTEM]: '文件系统错误',
    [ErrorType.RUNTIME]: '运行时错误',
    [ErrorType.UNKNOWN]: '未知错误',
  };

  return `${contextPrefix}${typeLabels[type]}: ${message}`;
}
