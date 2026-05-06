import { randomBytes } from 'node:crypto';

const ID_PATTERN = /^exec_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_([a-f0-9]{4})$/;

export function generateId(): string {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const dd = now.getDate().toString().padStart(2, '0');
  const hh = now.getHours().toString().padStart(2, '0');
  const mi = now.getMinutes().toString().padStart(2, '0');
  const ss = now.getSeconds().toString().padStart(2, '0');
  const hex = randomBytes(2).toString('hex');
  return `exec_${yyyy}${mm}${dd}_${hh}${mi}${ss}_${hex}`;
}

export function parseTimestamp(id: string): Date | null {
  const match = ID_PATTERN.exec(id);
  if (!match) return null;
  const [, yyyy, mm, dd, hh, mi, ss] = match;
  const date = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(mi),
    Number(ss),
  );
  if (isNaN(date.getTime())) return null;
  return date;
}
