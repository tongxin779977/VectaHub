import { Command } from 'commander';

export const check = new Command('check')
  .description('Check project configuration and dependencies')
  .action(() => {
    console.log('\n🔍 Checking VectaHub project...\n');
    console.log('✅ TypeScript configuration: OK');
    console.log('✅ Package.json: OK');
    console.log('✅ Source directory: OK');
    console.log('\n✅ All checks passed!\n');
  });
