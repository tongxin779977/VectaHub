import YAML from 'yaml';
import type { OutputFormat, ValidationResult } from './types.js';

export function validateOutput(
  output: string,
  format: OutputFormat
): ValidationResult {
  const cleaned = output.trim();
  
  if (cleaned.length === 0) {
    return { valid: false, error: 'Output is empty' };
  }

  try {
    switch (format.type) {
      case 'json':
        return validateJSON(cleaned);
      case 'yaml':
        return validateYAML(cleaned);
      case 'text':
        return validateText(cleaned, format);
      default:
        return { valid: false, error: `Unknown format type: ${format.type}` };
    }
  } catch (error) {
    return {
      valid: false,
      error: `Validation failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function validateJSON(output: string): ValidationResult {
  try {
    JSON.parse(output);
    return { valid: true };
  } catch (error) {
    let cleaned = output.trim();
    
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7).trim();
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3).trim();
    }
    
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3).trim();
    }
    
    try {
      JSON.parse(cleaned);
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid JSON format' };
    }
  }
}

function validateYAML(output: string): ValidationResult {
  try {
    YAML.parse(output);
    return { valid: true };
  } catch (error) {
    let cleaned = output.trim();
    
    if (cleaned.startsWith('```yaml')) {
      cleaned = cleaned.substring(7).trim();
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3).trim();
    }
    
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3).trim();
    }
    
    try {
      YAML.parse(cleaned);
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid YAML format' };
    }
  }
}

function validateText(output: string, format: OutputFormat): ValidationResult {
  if (format.validation && !format.validation(output)) {
    return { valid: false, error: 'Text failed custom validation' };
  }
  
  return { valid: true };
}

export function extractCleanOutput(output: string, format: OutputFormat): string {
  let cleaned = output.trim();
  
  if (cleaned.startsWith('```json') || cleaned.startsWith('```yaml') || cleaned.startsWith('```')) {
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7).trim();
    } else if (cleaned.startsWith('```yaml')) {
      cleaned = cleaned.substring(7).trim();
    } else {
      cleaned = cleaned.substring(3).trim();
    }
    
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3).trim();
    }
  }
  
  return cleaned;
}

export function createRetryPrompt(
  originalPrompt: string,
  lastError: string,
  attempt: number
): string {
  return `
${originalPrompt}

---

PREVIOUS ATTEMPT FAILED (Attempt ${attempt}):
ERROR: ${lastError}

PLEASE TRY AGAIN, following ALL instructions EXACTLY, and ensure your output is in the REQUIRED FORMAT! DO NOT repeat the error or include any extra explanations!
  `.trim();
}
