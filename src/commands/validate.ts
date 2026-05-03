import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface ValidationResult {
  module: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string[];
}

interface ModuleContract {
  name: string;
  file: string;
  requiredMethods: string[];
  optionalMethods?: string[];
}

const MODULE_CONTRACTS: ModuleContract[] = [
  {
    name: 'nl',
    file: 'src/nl/parser.ts',
    requiredMethods: ['parse', 'parseToTaskList'],
  },
  {
    name: 'intent-matcher',
    file: 'src/nl/intent-matcher.ts',
    requiredMethods: ['match', 'registerPattern', 'getPatterns'],
  },
  {
    name: 'workflow',
    file: 'src/workflow/engine.ts',
    requiredMethods: ['createWorkflow', 'execute', 'getWorkflow', 'listWorkflows'],
  },
  {
    name: 'executor',
    file: 'src/workflow/executor.ts',
    requiredMethods: ['exec', 'execute', 'executeWorkflow', 'validateStep'],
  },
  {
    name: 'storage',
    file: 'src/workflow/storage.ts',
    requiredMethods: ['save', 'get', 'list', 'delete'],
  },
  {
    name: 'sandbox',
    file: 'src/sandbox/detector.ts',
    requiredMethods: ['detect', 'isDangerous'],
  },
  {
    name: 'utils',
    file: 'src/utils/logger.ts',
    requiredMethods: ['createLogger', 'createConsoleLogger'],
  },
];

function extractMethods(filePath: string): string[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const methods: string[] = [];

  const interfaceMethodMatches = content.matchAll(/export\s+interface\s+\w+\s*\{([^}]+)\}/g);
  for (const ifaceMatch of interfaceMethodMatches) {
    const interfaceBody = ifaceMatch[1];
    const methodMatches = interfaceBody.matchAll(/(\w+)\s*\([^)]*\)\s*:/g);
    for (const m of methodMatches) {
      methods.push(m[1]);
    }
  }

  const functionMatches = content.matchAll(/function\s+(\w+)/g);
  for (const match of functionMatches) {
    if (!methods.includes(match[1])) {
      methods.push(match[1]);
    }
  }

  const exportMatches = content.matchAll(/export\s+(?:function|const|class|interface|type)\s+(\w+)/g);
  for (const match of exportMatches) {
    if (!methods.includes(match[1])) {
      methods.push(match[1]);
    }
  }

  const objectMethodMatches = content.matchAll(/(?:^|\n)\s*(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*[{;=]/gm);
  for (const match of objectMethodMatches) {
    if (!methods.includes(match[1]) && !['if', 'else', 'for', 'while', 'switch', 'case', 'try', 'catch', 'return', 'import', 'export', 'type', 'interface'].includes(match[1])) {
      methods.push(match[1]);
    }
  }

  return methods;
}

function validateModule(contract: ModuleContract): ValidationResult {
  const filePath = join(process.cwd(), contract.file);
  const details: string[] = [];

  if (!existsSync(join(process.cwd(), 'src'))) {
    return {
      module: contract.name,
      status: 'warning',
      message: 'src/ directory not found',
    };
  }

  if (!existsSync(filePath)) {
    return {
      module: contract.name,
      status: 'warning',
      message: `Module file not found: ${contract.file}`,
    };
  }

  const methods = extractMethods(filePath);
  const missingMethods: string[] = [];

  for (const required of contract.requiredMethods) {
    if (methods.some(m => m.toLowerCase() === required.toLowerCase())) {
      details.push(`  ✅ ${required}`);
    } else {
      missingMethods.push(required);
      details.push(`  ❌ ${required} (missing)`);
    }
  }

  if (missingMethods.length > 0) {
    return {
      module: contract.name,
      status: 'fail',
      message: `Missing methods: ${missingMethods.join(', ')}`,
      details,
    };
  }

  const optionalFound = contract.optionalMethods?.filter(m =>
    methods.some(existing => existing.toLowerCase() === m.toLowerCase())
  ).length || 0;

  return {
    module: contract.name,
    status: 'pass',
    message: `All ${contract.requiredMethods.length} required methods present${optionalFound > 0 ? ` (+${optionalFound} optional)` : ''}`,
    details,
  };
}

function formatValidationResults(results: ValidationResult[]): string {
  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;

  const lines = ['\n🔍 Validating module interfaces...\n'];

  for (const result of results) {
    if (result.status === 'pass') passCount++;
    else if (result.status === 'fail') failCount++;
    else warnCount++;

    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
    lines.push(`${icon} ${result.module}: ${result.message}`);
    if (result.details) {
      result.details.forEach(d => lines.push(d));
    }
    lines.push('');
  }

  lines.push('─'.repeat(50));
  lines.push(`\n📊 Validation Summary:`);
  lines.push(`   ✅ Passed:  ${passCount}`);
  lines.push(`   ❌ Failed:  ${failCount}`);
  lines.push(`   ⚠️  Warnings: ${warnCount}`);
  lines.push('');

  if (failCount > 0) {
    lines.push('❌ Validation FAILED - some modules have missing methods\n');
  } else if (warnCount > 0) {
    lines.push('⚠️  Validation passed with warnings\n');
  } else {
    lines.push('✅ All modules validated successfully!\n');
  }

  return lines.join('\n');
}

export const validate = new Command('validate')
  .description('Validate module interface contracts')
  .action(async () => {
    const results: ValidationResult[] = [];

    for (const contract of MODULE_CONTRACTS) {
      const result = validateModule(contract);
      results.push(result);
    }

    console.log(formatValidationResults(results));

    const failCount = results.filter(r => r.status === 'fail').length;
    if (failCount > 0) {
      process.exit(1);
    }
  });
