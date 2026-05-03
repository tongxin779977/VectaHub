import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import {
  loadTemplate,
  listTemplates,
  instantiateTemplate,
  type WorkflowTemplate,
} from './template.js';

const TEST_DIR = '/tmp/vectahub-test-templates';

const SAMPLE_TEMPLATE = `
name: git-commit
description: "Git add and commit workflow"
category: git
tags: [git, commit, version-control]
parameters:
  - name: message
    description: "Commit message"
    required: true
    default: "auto commit"
  - name: files
    description: "Files to stage"
    required: false
    default: "."
steps:
  - id: stage
    type: exec
    cli: git
    args: ["add", "\${files}"]
  - id: commit
    type: exec
    cli: git
    args: ["commit", "-m", "\${message}"]
`;

const SAMPLE_TEMPLATE_NO_PARAMS = `
name: backup-files
description: "Backup current directory"
category: utility
tags: [backup, files]
steps:
  - id: backup
    type: exec
    cli: cp
    args: ["-r", ".", "../backup-\$(date +%Y%m%d)"]
`;

describe('WorkflowTemplate', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('loadTemplate', () => {
    it('should load a template from file', () => {
      const path = join(TEST_DIR, 'git-commit.yaml');
      writeFileSync(path, SAMPLE_TEMPLATE);
      const tmpl = loadTemplate(path);
      expect(tmpl.name).toBe('git-commit');
      expect(tmpl.description).toBe('Git add and commit workflow');
      expect(tmpl.category).toBe('git');
      expect(tmpl.tags).toEqual(['git', 'commit', 'version-control']);
    });

    it('should parse parameters', () => {
      const path = join(TEST_DIR, 'git-commit.yaml');
      writeFileSync(path, SAMPLE_TEMPLATE);
      const tmpl = loadTemplate(path);
      expect(tmpl.parameters?.length).toBe(2);
      expect(tmpl.parameters?.[0].name).toBe('message');
      expect(tmpl.parameters?.[0].required).toBe(true);
      expect(tmpl.parameters?.[0].default).toBe('auto commit');
    });

    it('should parse steps', () => {
      const path = join(TEST_DIR, 'git-commit.yaml');
      writeFileSync(path, SAMPLE_TEMPLATE);
      const tmpl = loadTemplate(path);
      expect(tmpl.steps.length).toBe(2);
      expect(tmpl.steps[0].id).toBe('stage');
      expect(tmpl.steps[1].id).toBe('commit');
    });

    it('should handle template without parameters', () => {
      const path = join(TEST_DIR, 'backup.yaml');
      writeFileSync(path, SAMPLE_TEMPLATE_NO_PARAMS);
      const tmpl = loadTemplate(path);
      expect(tmpl.parameters).toBeUndefined();
      expect(tmpl.steps.length).toBe(1);
    });

    it('should throw for non-existent file', () => {
      expect(() => loadTemplate('/nonexistent/template.yaml')).toThrow();
    });
  });

  describe('listTemplates', () => {
    it('should list all templates in a directory', () => {
      writeFileSync(join(TEST_DIR, 'a.yaml'), SAMPLE_TEMPLATE);
      writeFileSync(join(TEST_DIR, 'b.yaml'), SAMPLE_TEMPLATE_NO_PARAMS);
      const templates = listTemplates(TEST_DIR);
      expect(templates.length).toBe(2);
      expect(templates.some(t => t.name === 'git-commit')).toBe(true);
      expect(templates.some(t => t.name === 'backup-files')).toBe(true);
    });

    it('should return empty array for empty directory', () => {
      const templates = listTemplates(TEST_DIR);
      expect(templates.length).toBe(0);
    });

    it('should return empty array for non-existent directory', () => {
      const templates = listTemplates('/nonexistent/dir');
      expect(templates.length).toBe(0);
    });

    it('should skip non-YAML files', () => {
      writeFileSync(join(TEST_DIR, 'readme.txt'), 'not a template');
      writeFileSync(join(TEST_DIR, 'valid.yaml'), SAMPLE_TEMPLATE);
      const templates = listTemplates(TEST_DIR);
      expect(templates.length).toBe(1);
    });

    it('should filter by category', () => {
      writeFileSync(join(TEST_DIR, 'git.yaml'), SAMPLE_TEMPLATE);
      writeFileSync(join(TEST_DIR, 'backup.yaml'), SAMPLE_TEMPLATE_NO_PARAMS);
      const gitTemplates = listTemplates(TEST_DIR, 'git');
      expect(gitTemplates.length).toBe(1);
      expect(gitTemplates[0].category).toBe('git');
    });

    it('should filter by tag', () => {
      writeFileSync(join(TEST_DIR, 'git.yaml'), SAMPLE_TEMPLATE);
      writeFileSync(join(TEST_DIR, 'backup.yaml'), SAMPLE_TEMPLATE_NO_PARAMS);
      const commitTemplates = listTemplates(TEST_DIR, undefined, 'commit');
      expect(commitTemplates.length).toBe(1);
    });
  });

  describe('instantiateTemplate', () => {
    it('should instantiate template with default params', () => {
      const path = join(TEST_DIR, 'git-commit.yaml');
      writeFileSync(path, SAMPLE_TEMPLATE);
      const workflow = instantiateTemplate(path, {});
      expect(workflow.name).toContain('git-commit');
      expect(workflow.steps.length).toBe(2);
      expect(workflow.steps[0].cli).toBe('git');
    });

    it('should substitute parameters into steps', () => {
      const path = join(TEST_DIR, 'git-commit.yaml');
      writeFileSync(path, SAMPLE_TEMPLATE);
      const workflow = instantiateTemplate(path, { message: 'my commit' });
      expect(workflow.steps[1].args).toContain('my commit');
    });

    it('should use custom parameter values', () => {
      const path = join(TEST_DIR, 'git-commit.yaml');
      writeFileSync(path, SAMPLE_TEMPLATE);
      const workflow = instantiateTemplate(path, { files: 'src/', message: 'update' });
      expect(workflow.steps[0].args).toContain('src/');
      expect(workflow.steps[1].args).toContain('update');
    });

    it('should use defaults for unspecified params', () => {
      const path = join(TEST_DIR, 'git-commit.yaml');
      writeFileSync(path, SAMPLE_TEMPLATE);
      const workflow = instantiateTemplate(path, {});
      expect(workflow.steps[0].args).toContain('.');
      expect(workflow.steps[1].args).toContain('auto commit');
    });

    it('should throw when required param missing without default', () => {
      const requiredTemplate = `
name: required-test
description: "test"
category: test
tags: []
parameters:
  - name: target
    description: "target"
    required: true
steps:
  - id: s1
    type: exec
    cli: echo
    args: ["\${target}"]
`;
      const path = join(TEST_DIR, 'required.yaml');
      writeFileSync(path, requiredTemplate);
      expect(() => instantiateTemplate(path, {})).toThrow(/target/);
    });

    it('should generate timestamped workflow name', () => {
      const path = join(TEST_DIR, 'git-commit.yaml');
      writeFileSync(path, SAMPLE_TEMPLATE);
      const workflow = instantiateTemplate(path, {});
      expect(workflow.name).toMatch(/git-commit-\d+/);
    });

    it('should set mode to relaxed by default', () => {
      const path = join(TEST_DIR, 'git-commit.yaml');
      writeFileSync(path, SAMPLE_TEMPLATE);
      const workflow = instantiateTemplate(path, {});
      expect(workflow.mode).toBe('relaxed');
    });
  });
});
