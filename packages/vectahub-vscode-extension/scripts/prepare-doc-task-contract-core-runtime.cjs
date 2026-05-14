const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const extensionRoot = path.resolve(__dirname, '..');
const sourcePackageRoot = path.resolve(extensionRoot, '..', 'doc-task-contract-core');
const sourceEntry = path.join(sourcePackageRoot, 'src', 'index.js');
const outputDir = path.join(extensionRoot, 'out', 'node_modules', '@vectahub', 'doc-task-contract-core');
const outputEntry = path.join(outputDir, 'index.js');
const sourceTypes = path.join(sourcePackageRoot, 'src', 'index.d.ts');
const outputTypes = path.join(outputDir, 'index.d.ts');
const outputPackageJson = path.join(outputDir, 'package.json');

if (!fs.existsSync(sourceEntry)) {
  throw new Error(`missing source entry: ${sourceEntry}`);
}

fs.mkdirSync(outputDir, { recursive: true });
const sourceContent = fs.readFileSync(sourceEntry, 'utf8');
const transpileResult = ts.transpileModule(sourceContent, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourceEntry,
});
fs.writeFileSync(outputEntry, transpileResult.outputText, 'utf8');

if (fs.existsSync(sourceTypes)) {
  fs.copyFileSync(sourceTypes, outputTypes);
}

fs.writeFileSync(
  outputPackageJson,
  JSON.stringify(
    {
      name: '@vectahub/doc-task-contract-core',
      private: true,
      main: 'index.js',
      types: 'index.d.ts',
    },
    null,
    2,
  ),
  'utf8',
);
