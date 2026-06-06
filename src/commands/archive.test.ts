import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInfo = vi.fn();
const mockError = vi.fn();

vi.mock('../execution/archiver.js', () => ({
  createArchiver: vi.fn(() => ({
    archiveBefore: vi.fn(() => Promise.resolve({
      archiveId: 'archive_202601',
      archivedCount: 0,
      originalSize: 0,
      compressedSize: 0,
      compressionRatio: 0,
    })),
    listArchives: vi.fn(() => Promise.resolve([])),
    restore: vi.fn(() => Promise.resolve()),
    deleteArchive: vi.fn(() => Promise.resolve()),
  })),
}));

function createMockContext() {
  return {
    audit: {
      getHelper: () => ({ log: vi.fn(), cliOutput: vi.fn(), securityAlert: vi.fn(), securityAction: vi.fn() }),
      getLogger: () => ({ getSessionId: () => 'test-session' }),
    },
    environment: {} as never,
    config: {} as never,
    logger: {
      getLogger: () => ({ info: mockInfo, error: mockError, debug: vi.fn(), warn: vi.fn() }),
      setMuted: vi.fn(),
    },
  };
}

const { createArchiveCmd } = await import('./archive.js');

describe('archive command', () => {
  beforeEach(() => {
    mockInfo.mockClear();
    mockError.mockClear();
  });

  it('should show usage when no options provided', async () => {
    await createArchiveCmd(createMockContext() as never).parseAsync(['node', 'test']);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  it('should show no archives when none exist', async () => {
    await createArchiveCmd(createMockContext() as never).parseAsync(['node', 'test', '--list']);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('No archives'));
  });

  it('should accept --before option', async () => {
    await createArchiveCmd(createMockContext() as never).parseAsync(['node', 'test', '--before', '2026-06-01']);
    expect(mockInfo).toHaveBeenCalled();
  });

  it('should handle invalid date format', async () => {
    await expect(
      createArchiveCmd(createMockContext() as never).parseAsync(['node', 'test', '--before', 'not-a-date'])
    ).rejects.toThrow();
  });

  it('should delete archive without error', async () => {
    await createArchiveCmd(createMockContext() as never).parseAsync(['node', 'test', '--delete', 'nonexistent']);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('deleted'));
  });
});
