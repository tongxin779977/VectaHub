import { spawn } from 'child_process';

export interface StreamHandlerOptions {
  maxBufferSize: number;
  chunkSize: number;
  onChunk?: (chunk: string) => void;
  onFinish?: (fullOutput: string) => void;
}

export class StreamCommandHandler {
  async executeWithStreaming(
    command: string,
    args: string[],
    options: StreamHandlerOptions
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(command, args);
      let output = '';
      let bufferSize = 0;

      childProcess.stdout?.on('data', (chunk: Buffer) => {
        const chunkStr = chunk.toString();

        // 1. 调用回调
        options.onChunk?.(chunkStr);

        // 2. 管理内存
        if (bufferSize + chunk.length > options.maxBufferSize) {
          // 缓冲区已满，开始滚动
          output = output.slice(-Math.floor(options.maxBufferSize / 2)) + chunkStr;
          bufferSize = output.length;
        } else {
          output += chunkStr;
          bufferSize += chunk.length;
        }
      });

      childProcess.stderr?.on('data', (chunk: Buffer) => {
        // 类似处理
        const chunkStr = chunk.toString();
        options.onChunk?.(chunkStr);
        output += chunkStr;
      });

      childProcess.on('close', (code) => {
        if (code === 0) {
          options.onFinish?.(output);
          resolve(output);
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });

      childProcess.on('error', (err) => {
        reject(err);
      });
    });
  }
}
