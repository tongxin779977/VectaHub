import { vi } from 'vitest';

const mockStorage = {
  save: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(undefined),
  list: vi.fn().mockResolvedValue([]),
  delete: vi.fn().mockResolvedValue(undefined),
  saveWorkflow: vi.fn().mockResolvedValue(undefined),
  getWorkflow: vi.fn().mockResolvedValue(undefined),
  listWorkflows: vi.fn().mockResolvedValue([]),
  deleteWorkflow: vi.fn().mockResolvedValue(undefined),
};

export const createStorage = vi.fn().mockImplementation(() => Promise.resolve(mockStorage));
export type { Storage } from '../storage.js';
