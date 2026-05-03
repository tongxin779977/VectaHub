import { describe, it, expect, vi } from 'vitest';
import { StreamCommandHandler } from './stream-handler.js';

describe('StreamCommandHandler', () => {
  it('should execute a command and return output', async () => {
    const handler = new StreamCommandHandler();
    const result = await handler.executeWithStreaming('echo', ['hello world'], {
      maxBufferSize: 1024 * 1024,
      chunkSize: 1024
    });
    
    expect(result).toContain('hello world');
  });

  it('should call onChunk callback for data chunks', async () => {
    const handler = new StreamCommandHandler();
    const chunkCallback = vi.fn();
    
    await handler.executeWithStreaming('echo', ['hello'], {
      maxBufferSize: 1024 * 1024,
      chunkSize: 1024,
      onChunk: chunkCallback
    });
    
    expect(chunkCallback).toHaveBeenCalled();
  });

  it('should reject when command fails', async () => {
    const handler = new StreamCommandHandler();
    
    await expect(
      handler.executeWithStreaming('nonexistent-command', [], {
        maxBufferSize: 1024 * 1024,
        chunkSize: 1024
      })
    ).rejects.toThrow();
  });
});
