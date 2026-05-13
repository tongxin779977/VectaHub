import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInfo = vi.fn();
const mockError = vi.fn();

vi.mock('../utils/logger.js', () => ({
  createConsoleLogger: vi.fn(() => ({
    info: mockInfo,
    error: mockError,
    debug: vi.fn(),
  })),
  getLogger: vi.fn(() => ({
    info: mockInfo,
    error: mockError,
    debug: vi.fn(),
  })),
}));

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

const { archiveCmd } = await import('./archive.js');

describe('archive command', () => {
  beforeEach(() => {
    mockInfo.mockClear();
    mockError.mockClear();
  });

  it('should show usage when no options provided', async () => {
    await archiveCmd.parseAsync(['node', 'test']);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  it('should show no archives when none exist', async () => {
    await archiveCmd.parseAsync(['node', 'test', '--list']);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('No archives'));
  });

  it('should accept --before option', async () => {
    await archiveCmd.parseAsync(['node', 'test', '--before', '2026-06-01']);
    expect(mockInfo).toHaveBeenCalled();
  });

  it('should handle invalid date format', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await archiveCmd.parseAsync(['node', 'test', '--before', 'not-a-date']);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('should delete archive without error', async () => {
    await archiveCmd.parseAsync(['node', 'test', '--delete', 'nonexistent']);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('deleted'));
  });
});
