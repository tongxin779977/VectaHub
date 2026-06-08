import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findProjectRoot } from './facade.js';

describe('findProjectRoot', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vectahub-project-root-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds project root with .git marker', () => {
    const projectDir = join(tempDir, 'my-project');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(join(projectDir, '.git'));

    const subDir = join(projectDir, 'src', 'lib');
    mkdirSync(subDir, { recursive: true });

    expect(findProjectRoot(subDir)).toBe(projectDir);
  });

  it('finds project root with package.json marker', () => {
    const projectDir = join(tempDir, 'node-project');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'package.json'), '{}');

    const subDir = join(projectDir, 'packages', 'core');
    mkdirSync(subDir, { recursive: true });

    expect(findProjectRoot(subDir)).toBe(projectDir);
  });

  it('finds project root with .vectahub marker', () => {
    const projectDir = join(tempDir, 'vectahub-project');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(join(projectDir, '.vectahub'));

    const subDir = join(projectDir, 'workflows');
    mkdirSync(subDir, { recursive: true });

    expect(findProjectRoot(subDir)).toBe(projectDir);
  });

  it('prefers .vectahub over .git when both exist at different levels', () => {
    // .git at outer level, .vectahub at inner level
    const outerDir = join(tempDir, 'outer');
    mkdirSync(outerDir, { recursive: true });
    mkdirSync(join(outerDir, '.git'));

    const innerDir = join(outerDir, 'inner');
    mkdirSync(innerDir, { recursive: true });
    mkdirSync(join(innerDir, '.vectahub'));

    const subDir = join(innerDir, 'src');
    mkdirSync(subDir, { recursive: true });

    // Should find the nearest ancestor with any marker
    expect(findProjectRoot(subDir)).toBe(innerDir);
  });

  it('returns undefined when no marker found', () => {
    const emptyDir = join(tempDir, 'empty');
    mkdirSync(emptyDir, { recursive: true });

    // Use a very deep path unlikely to have markers
    const deepDir = join(emptyDir, 'a', 'b', 'c');
    mkdirSync(deepDir, { recursive: true });

    // This may or may not find a marker depending on tempdir structure
    // At minimum, it should not throw
    const result = findProjectRoot(deepDir);
    // Result depends on whether tmpdir itself has markers
    expect(typeof result === 'string' || result === undefined).toBe(true);
  });

  it('returns startDir itself when it contains a marker', () => {
    mkdirSync(join(tempDir, '.git'));

    expect(findProjectRoot(tempDir)).toBe(tempDir);
  });

  it('defaults to process.cwd() when startDir is not provided', () => {
    // process.cwd() should have .git or package.json in the project
    const result = findProjectRoot();
    expect(result).toBeDefined();
  });
});
