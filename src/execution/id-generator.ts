import { randomBytes } from 'node:crypto';

const ID_PREFIX = 'exec_';
const ID_LENGTH = 29;
let lastTimestampToken = '';
let lastTimestampMillis = 0;

function parseDigit(value: string, index: number): number {
  const code = value.charCodeAt(index) - 48;
  return code >= 0 && code <= 9 ? code : -1;
}

function parseFixedInt(value: string, start: number, length: number): number {
  let parsed = 0;

  for (let offset = 0; offset < length; offset += 1) {
    const digit = parseDigit(value, start + offset);
    if (digit < 0) {
      return -1;
    }
    parsed = (parsed * 10) + digit;
  }

  return parsed;
}

function isLowerHex(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 102);
}

export function generateId(): string {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const dd = now.getDate().toString().padStart(2, '0');
  const hh = now.getHours().toString().padStart(2, '0');
  const mi = now.getMinutes().toString().padStart(2, '0');
  const ss = now.getSeconds().toString().padStart(2, '0');
  const hex = randomBytes(4).toString('hex');
  return `exec_${yyyy}${mm}${dd}_${hh}${mi}${ss}_${hex}`;
}

export function parseTimestamp(id: string): Date | null {
  if (id.length !== ID_LENGTH || !id.startsWith(ID_PREFIX) || id.charCodeAt(13) !== 95 || id.charCodeAt(20) !== 95) {
    return null;
  }

  for (let index = 21; index < ID_LENGTH; index += 1) {
    if (!isLowerHex(id.charCodeAt(index))) {
      return null;
    }
  }

  const timestampToken = id.slice(5, 20);
  if (timestampToken === lastTimestampToken) {
    return new Date(lastTimestampMillis);
  }

  const yyyy = parseFixedInt(id, 5, 4);
  const mm = parseFixedInt(id, 9, 2);
  const dd = parseFixedInt(id, 11, 2);
  const hh = parseFixedInt(id, 14, 2);
  const mi = parseFixedInt(id, 16, 2);
  const ss = parseFixedInt(id, 18, 2);
  if (yyyy < 0 || mm < 0 || dd < 0 || hh < 0 || mi < 0 || ss < 0) {
    return null;
  }

  const date = new Date(
    yyyy,
    mm - 1,
    dd,
    hh,
    mi,
    ss,
  );
  if (isNaN(date.getTime())) return null;
  lastTimestampToken = timestampToken;
  lastTimestampMillis = date.getTime();
  return date;
}
