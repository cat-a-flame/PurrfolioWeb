/** Returns `next` only if it's a path on this site (blocks @evil.com, //evil.com, /\evil.com). */
export function safeNextPath(next: string | null, fallback = '/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return fallback;
  }
  // URL parsers drop control characters, which could turn "/\t/" into "//".
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
