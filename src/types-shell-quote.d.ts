declare module 'shell-quote' {
  export type ParsedEntry = string | { op: string } | { pattern: string };
  export function parse(input: string): ParsedEntry[];
}
