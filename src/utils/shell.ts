import { parse } from 'shell-quote';

export function splitPosixArgs(input: string): string[] {
  const parsed = parse(input);
  return parsed.map((part): string => {
    if (typeof part === 'string') return part;
    if ('op' in part) return part.op;
    if ('pattern' in part) return String(part.pattern);
    return String(part);
  });
}
