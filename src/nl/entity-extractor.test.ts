import { describe, it, expect, beforeEach } from 'vitest';
import { createEntityExtractor } from './entity-extractor.js';

describe('EntityExtractor', () => {
  let extractor: ReturnType<typeof createEntityExtractor>;

  beforeEach(() => {
    extractor = createEntityExtractor();
  });

  describe('extract', () => {
    it('should extract FILE_PATH entities', () => {
      const result = extractor.extract('查找 src/components/App.tsx 文件');
      const filePaths = result.filter(e => e.type === 'FILE_PATH');
      expect(filePaths.length).toBeGreaterThan(0);
      expect(filePaths.some(e => e.value.includes('App'))).toBe(true);
    });

    it('should extract CLI_TOOL entities', () => {
      const result = extractor.extract('运行 npm run build');
      const cliTools = result.filter(e => e.type === 'CLI_TOOL');
      expect(cliTools.length).toBeGreaterThan(0);
      expect(cliTools[0].value).toBe('npm');
    });

    it('should extract multiple entity types', () => {
      const result = extractor.extract('用 docker 部署 src/app.js 到 prod');
      expect(result.some(e => e.type === 'CLI_TOOL')).toBe(true);
      expect(result.some(e => e.type === 'FILE_PATH')).toBe(true);
      expect(result.some(e => e.type === 'ENV')).toBe(true);
    });

    it('should not duplicate entities', () => {
      const result = extractor.extract('运行 npm run npm');
      const npmEntities = result.filter(e => e.value === 'npm');
      expect(npmEntities.length).toBe(1);
    });

    it('should return empty for no matches', () => {
      const result = extractor.extract('你好世界');
      expect(result.length).toBe(0);
    });
  });
});