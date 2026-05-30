/**
 * CLI Help Generator with caching support.
 * Provides help text generation, caching, and customization for CLI commands.
 */

import type { Command } from 'commander';

/** Help section configuration. */
export interface HelpSection {
  title: string;
  content: string;
  order: number;
}

/** Help generator options. */
export interface HelpGeneratorOptions {
  /** Whether to include examples in help output. */
  includeExamples?: boolean;
  /** Whether to include version info in help output. */
  includeVersion?: boolean;
  /** Custom sections to add to help output. */
  customSections?: HelpSection[];
  /** Maximum line width for help text. */
  maxWidth?: number;
}

/** Cached help information. */
interface CachedHelp {
  content: string;
  timestamp: number;
  ttl: number;
}

/** Help cache with TTL support. */
const helpCache = new Map<string, CachedHelp>();

/** Default cache TTL in milliseconds (5 minutes). */
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

/** Default maximum line width. */
const DEFAULT_MAX_WIDTH = 80;

/**
 * Generate help text for a command with caching.
 * @param command - The Commander command instance.
 * @param options - Help generator options.
 * @returns Cached or newly generated help text.
 */
export function generateHelpText(command: Command, options: HelpGeneratorOptions = {}): string {
  const cacheKey = `${command.name()}-${JSON.stringify(options)}`;
  const cached = helpCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.content;
  }

  const helpText = buildHelpText(command, options);

  helpCache.set(cacheKey, {
    content: helpText,
    timestamp: Date.now(),
    ttl: DEFAULT_CACHE_TTL,
  });

  return helpText;
}

/**
 * Build help text for a command.
 * @param command - The Commander command instance.
 * @param options - Help generator options.
 * @returns Formatted help text.
 */
function buildHelpText(command: Command, options: HelpGeneratorOptions): string {
  const sections: string[] = [];
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;

  sections.push(buildHeader(command));

  if (command.description()) {
    sections.push(buildDescription(command.description(), maxWidth));
  }

  sections.push(buildUsage(command));

  if (command.options.length > 0) {
    sections.push(buildOptions(command));
  }

  if (command.commands.length > 0) {
    sections.push(buildSubcommands(command));
  }

  if (options.includeExamples) {
    sections.push(buildExamples(command));
  }

  if (options.customSections) {
    for (const section of options.customSections.sort((a, b) => a.order - b.order)) {
      sections.push(buildCustomSection(section));
    }
  }

  return sections.filter(Boolean).join('\n\n');
}

/**
 * Build header section.
 * @param command - The Commander command instance.
 * @returns Formatted header string.
 */
function buildHeader(command: Command): string {
  const name = command.name();
  const version = command.version();
  const versionStr = version ? ` v${version}` : '';
  return `${name}${versionStr}`;
}

/**
 * Build description section.
 * @param description - Command description.
 * @param maxWidth - Maximum line width.
 * @returns Formatted description string.
 */
function buildDescription(description: string, maxWidth: number): string {
  return wrapText(description, maxWidth);
}

/**
 * Build usage section.
 * @param command - The Commander command instance.
 * @returns Formatted usage string.
 */
function buildUsage(command: Command): string {
  const name = command.name();
  const args = command.args.join(' ');
  const usage = args ? `${name} ${args}` : name;
  return `Usage:\n  ${usage}`;
}

/**
 * Build options section.
 * @param command - The Commander command instance.
 * @returns Formatted options string.
 */
function buildOptions(command: Command): string {
  const lines: string[] = ['Options:'];

  for (const option of command.options) {
    const flags = option.flags;
    const description = option.description;
    lines.push(`  ${flags.padEnd(30)} ${description}`);
  }

  return lines.join('\n');
}

/**
 * Build subcommands section.
 * @param command - The Commander command instance.
 * @returns Formatted subcommands string.
 */
function buildSubcommands(command: Command): string {
  const lines: string[] = ['Commands:'];

  for (const subcommand of command.commands) {
    const name = subcommand.name();
    const description = subcommand.description() || '';
    lines.push(`  ${name.padEnd(20)} ${description}`);
  }

  return lines.join('\n');
}

/**
 * Build examples section.
 * @param command - The Commander command instance.
 * @returns Formatted examples string.
 */
function buildExamples(command: Command): string {
  const name = command.name();
  return `Examples:
  ${name} --help
  ${name} --version`;
}

/**
 * Build custom section.
 * @param section - Custom section configuration.
 * @returns Formatted custom section string.
 */
function buildCustomSection(section: HelpSection): string {
  return `${section.title}:\n${section.content}`;
}

/**
 * Wrap text to fit within specified width.
 * @param text - Text to wrap.
 * @param maxWidth - Maximum line width.
 * @returns Wrapped text.
 */
function wrapText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) {
    return text;
  }

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxWidth) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += (currentLine ? ' ' : '') + word;
    }
  }

  if (currentLine) {
    lines.push(currentLine.trim());
  }

  return lines.join('\n');
}

/**
 * Clear the help cache.
 * @param commandName - Optional command name to clear specific cache entry.
 */
export function clearHelpCache(commandName?: string): void {
  if (commandName) {
    for (const key of helpCache.keys()) {
      if (key.startsWith(commandName)) {
        helpCache.delete(key);
      }
    }
  } else {
    helpCache.clear();
  }
}

/**
 * Get help cache statistics.
 * @returns Object with cache size and hit rate.
 */
export function getHelpCacheStats(): { size: number; entries: string[] } {
  return {
    size: helpCache.size,
    entries: Array.from(helpCache.keys()),
  };
}

/**
 * Generate formatted help text for a command with custom formatting.
 * @param command - The Commander command instance.
 * @param format - Output format ('text' | 'markdown' | 'json').
 * @param options - Help generator options.
 * @returns Formatted help text.
 */
export function generateFormattedHelp(
  command: Command,
  format: 'text' | 'markdown' | 'json' = 'text',
  options: HelpGeneratorOptions = {},
): string {
  switch (format) {
    case 'markdown':
      return generateMarkdownHelp(command, options);
    case 'json':
      return generateJsonHelp(command, options);
    default:
      return generateHelpText(command, options);
  }
}

/**
 * Generate markdown formatted help.
 * @param command - The Commander command instance.
 * @param options - Help generator options.
 * @returns Markdown formatted help text.
 */
function generateMarkdownHelp(command: Command, _options: HelpGeneratorOptions): string {
  const sections: string[] = [];

  sections.push(`# ${command.name()}`);

  if (command.description()) {
    sections.push(command.description());
  }

  sections.push(`## Usage\n\`\`\`\n${command.name()} ${command.args.join(' ')}\n\`\`\``);

  if (command.options.length > 0) {
    const optionsLines = command.options.map(opt => `- \`${opt.flags}\`: ${opt.description}`);
    sections.push(`## Options\n${optionsLines.join('\n')}`);
  }

  if (command.commands.length > 0) {
    const commandsLines = command.commands.map(cmd => `- \`${cmd.name()}\`: ${cmd.description() || ''}`);
    sections.push(`## Commands\n${commandsLines.join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Generate JSON formatted help.
 * @param command - The Commander command instance.
 * @param options - Help generator options.
 * @returns JSON formatted help text.
 */
function generateJsonHelp(command: Command, _options: HelpGeneratorOptions): string {
  const helpData = {
    name: command.name(),
    version: command.version(),
    description: command.description(),
    args: command.args,
    options: command.options.map(opt => ({
      flags: opt.flags,
      description: opt.description,
      required: opt.required,
      defaultValue: opt.defaultValue,
    })),
    commands: command.commands.map(cmd => ({
      name: cmd.name(),
      description: cmd.description(),
    })),
  };

  return JSON.stringify(helpData, null, 2);
}
