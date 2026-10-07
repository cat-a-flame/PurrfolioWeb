/**
 * Returns `next` if it is a same-site path, otherwise `fallback`. Stops
 * ?next=@evil.com, //evil.com, /\evil.com and the like from turning a
 * redirect into a jump to another site.
 */
export function safeNextPath(next: string | null, fallback = '/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return fallback;
  }
  // Tabs/newlines are stripped by URL parsers and could re-form "//".
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
