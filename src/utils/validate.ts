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
    requiredMethods: ['info', 'warn', 'error', 'debug'],
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

export const validate = new Command('validate')
  .description('Validate module interface contracts')
  .action(async () => {
    console.log('\n🔍 Validating module interfaces...\n');

    const results: ValidationResult[] = [];
    let passCount = 0;
    let failCount = 0;
    let warnCount = 0;

    for (const contract of MODULE_CONTRACTS) {
      const result = validateModule(contract);
      results.push(result);

      if (result.status === 'pass') passCount++;
      else if (result.status === 'fail') failCount++;
      else warnCount++;

      const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
      console.log(`${icon} ${result.module}: ${result.message}`);
      if (result.details) {
        result.details.forEach(d => console.log(d));
      }
      console.log('');
    }

    console.log('─'.repeat(50));
    console.log(`\n📊 Validation Summary:`);
    console.log(`   ✅ Passed:  ${passCount}`);
    console.log(`   ❌ Failed:  ${failCount}`);
    console.log(`   ⚠️  Warnings: ${warnCount}`);
    console.log('');

    if (failCount > 0) {
      console.log('❌ Validation FAILED - some modules have missing methods\n');
      process.exit(1);
    } else if (warnCount > 0) {
      console.log('⚠️  Validation passed with warnings\n');
    } else {
      console.log('✅ All modules validated successfully!\n');
    }
  });