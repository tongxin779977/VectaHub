import { describe, it, expect, vi } from 'vitest';
import { LazyModuleLoader } from './lazy-loader.js';

describe('LazyModuleLoader', () => {
  it('should register and load a module', async () => {
    const loader = new LazyModuleLoader();
    const factory = vi.fn(async () => ({ test: 'value' }));
    
    loader.register('test-module', factory);
    
    const module = await loader.get('test-module');
    expect(module).toEqual({ test: 'value' });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('should cache loaded modules', async () => {
    const loader = new LazyModuleLoader();
    const factory = vi.fn(async () => ({ test: 'value' }));
    
    loader.register('test-module', factory);
    
    await loader.get('test-module');
    const module2 = await loader.get('test-module');
    
    expect(factory).toHaveBeenCalledTimes(1);
    expect(module2).toEqual({ test: 'value' });
  });

  it('should throw for unregistered modules', async () => {
    const loader = new LazyModuleLoader();
    await expect(loader.get('unknown')).rejects.toThrow('Module unknown not registered');
  });
});
