import { describe, it, expect } from 'vitest';
import { languageDetector, i18n, createMultiLanguageParser } from './i18n.js';

describe('LanguageDetector', () => {
  describe('detect', () => {
    it('should detect Chinese input', () => {
      expect(languageDetector.detect('压缩图片')).toBe('zh-CN');
      expect(languageDetector.detect('查找所有大于100M的文件')).toBe('zh-CN');
    });

    it('should detect English input', () => {
      expect(languageDetector.detect('compress image')).toBe('en-US');
      expect(languageDetector.detect('find all files larger than 100M')).toBe('en-US');
    });

    it('should default to English for mixed input', () => {
      expect(languageDetector.detect('hello world')).toBe('en-US');
    });
  });

  describe('normalize', () => {
    it('should normalize Chinese to English', () => {
      const normalized = languageDetector.normalize('压缩', 'en-US');
      expect(normalized).toBe('compress');
    });

    it('should keep same language when already correct', () => {
      const normalized = languageDetector.normalize('compress', 'en-US');
      expect(normalized).toBe('compress');
    });
  });
});

describe('MultiLanguageParser', () => {
  const baseParser = {
    parse: (input: string) => ({
      intent: 'IMAGE_COMPRESS',
      confidence: 0.9,
      params: {},
    }),
  };

  const mlParser = createMultiLanguageParser(baseParser);

  it('should detect language automatically', () => {
    const result = mlParser.parse('压缩图片');
    expect(result.detectedLanguage).toBe('zh-CN');
  });

  it('should normalize input to detected language', () => {
    const result = mlParser.parse('压缩图片');
    expect(result.normalizedInput).toBeDefined();
  });

  it('should respect manual language setting', () => {
    const result = mlParser.parse('compress image', 'en-US');
    expect(result.detectedLanguage).toBe('en-US');
  });
});

describe('i18n', () => {
  it('should translate intent to Chinese', () => {
    const translations = i18n.translateIntent('IMAGE_COMPRESS', 'zh-CN');
    expect(translations).toContain('压缩图片');
  });

  it('should translate intent to English', () => {
    const translations = i18n.translateIntent('IMAGE_COMPRESS', 'en-US');
    expect(translations).toContain('compress image');
  });

  it('should detect and adapt input', () => {
    const { language, adaptedInput } = i18n.detectAndAdapt('压缩图片');
    expect(language).toBe('zh-CN');
    expect(adaptedInput).toBeDefined();
  });

  it('should create bilingual pattern', () => {
    const pattern = i18n.createBilingualPattern('压缩', 'compress');
    expect(pattern.test('压缩')).toBe(true);
    expect(pattern.test('compress')).toBe(true);
  });
});
