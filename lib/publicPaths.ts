// Routes reachable without being logged in.
export const PUBLIC_PATHS = ['/login', '/signup', '/auth/callback'];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}
