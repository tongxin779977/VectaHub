import { describe, it, expect } from 'vitest';
import { formatHumanReadable } from './human-readable-formatter.js';
import {
  buildReplyResponse,
  buildClarifyResponse,
  buildBlockedResponse,
  buildSuccessResponse,
  buildValidationErrorResponse,
  buildSafetyErrorResponse,
  buildInternalErrorResponse,
} from './index.js';

describe('formatHumanReadable', () => {
  it('should format reply response', () => {
    const response = buildReplyResponse('Hello world');
    const result = formatHumanReadable(response);
    expect(result).toContain('🤖 回复');
    expect(result).toContain('Hello world');
  });

  it('should format clarify response', () => {
    const response = buildClarifyResponse('Need more info', { suggestedAction: 'Please provide details' });
    const result = formatHumanReadable(response);
    expect(result).toContain('❓ 需要澄清');
    expect(result).toContain('Need more info');
    expect(result).toContain('💡 建议下一步: Please provide details');
  });

  it('should format blocked response', () => {
    const response = buildBlockedResponse('Not allowed', { blockedBy: 'safety', suggestedAction: 'Review and try again' });
    const result = formatHumanReadable(response);
    expect(result).toContain('🚫 已阻止');
    expect(result).toContain('Not allowed');
    expect(result).toContain('🔍 阻止原因: 安全检查');
    expect(result).toContain('💡 建议下一步: Review and try again');
  });

  it('should format success response', () => {
    const response = buildSuccessResponse('Operation completed');
    const result = formatHumanReadable(response);
    expect(result).toContain('✅ 成功');
    expect(result).toContain('Operation completed');
  });

  it('should format validation error response', () => {
    const response = buildValidationErrorResponse('Invalid input', ['Field is required', 'Format is wrong'], { suggestedAction: 'Fix the errors' });
    const result = formatHumanReadable(response);
    expect(result).toContain('⚠️ 验证错误');
    expect(result).toContain('Invalid input');
    expect(result).toContain('Field is required');
    expect(result).toContain('Format is wrong');
  });

  it('should format safety error response', () => {
    const response = buildSafetyErrorResponse('Risk detected', { riskLevel: 'high', suggestedAction: 'Proceed with caution' });
    const result = formatHumanReadable(response);
    expect(result).toContain('🔒 安全错误');
    expect(result).toContain('Risk detected');
    expect(result).toContain('🟠 风险等级: 高风险');
  });

  it('should format internal error response', () => {
    const error = new Error('Something went wrong');
    const response = buildInternalErrorResponse(error, { suggestedAction: 'Please retry' });
    const result = formatHumanReadable(response);
    expect(result).toContain('💥 内部错误');
    expect(result).toContain('Something went wrong');
  });
});
