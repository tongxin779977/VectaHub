import type { ExecutionRecord } from './types.js';

/**
 * Parses the `startedAt` field from an ExecutionRecord into an ISO 8601 string.
 *
 * Handles both string and Date representations defensively, since the field
 * may originate from JSON deserialization or in-memory construction.
 *
 * @param record - The execution record whose `startedAt` to parse
 * @returns ISO 8601 date string
 */
export function parseStartedAt(record: ExecutionRecord): string {
  const raw = record.startedAt;
  if (typeof raw === 'object' && raw !== null && 'toISOString' in raw) {
    return (raw as Date).toISOString();
  }
  return String(raw);
}

/**
 * Extracts a date partition key (YYYYMMDD) from an ISO 8601 date string.
 *
 * @param isoDateStr - ISO 8601 date string
 * @returns Partition key in YYYYMMDD format, or `'unknown'` if parsing fails
 */
export function toDatePartitionKey(isoDateStr: string): string {
  const datePart = isoDateStr.slice(0, 10);
  if (datePart.length < 10) return 'unknown';
  return datePart.replace(/-/g, '');
}
