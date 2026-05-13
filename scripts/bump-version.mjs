import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

function bumpPatch(version) {
  const parts = version.split('.');
  if (parts.length !== 3) {
    throw new Error(`Invalid semver: ${version}`);
  }
  const patch = parseInt(parts[2], 10);
  if (isNaN(patch)) {
    throw new Error(`Invalid patch version: ${parts[2]}`);
  }
  parts[2] = String(patch + 1);
  return parts.join('.');
}

function syncVersion(filePath, newVersion) {
  const content = readFileSync(filePath, 'utf-8');
  const updated = content.replace(/"version"\s*:\s*"[^"]*"/, `"version": "${newVersion}"`);
  writeFileSync(filePath, updated, 'utf-8');
  return newVersion;
}

const rootPkgPath = resolve(rootDir, 'package.json');
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'));
const oldVersion = rootPkg.version;
const newVersion = bumpPatch(oldVersion);

syncVersion(rootPkgPath, newVersion);

const extPkgPath = resolve(rootDir, 'packages', 'vectahub-vscode-extension', 'package.json');
syncVersion(extPkgPath, newVersion);

console.log(`${oldVersion} → ${newVersion}`);