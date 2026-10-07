'use client';

import { useRole } from '@/contexts/RoleContext';
import type { Role } from '@/lib/roles';

interface RoleGateProps {
  allow: Role[];
  children: React.ReactNode;
}

/** Hides UI only. Real restrictions need an RLS policy (see is_admin()). */
export default function RoleGate({ allow, children }: RoleGateProps) {
  const role = useRole();
  if (!role || !allow.includes(role)) return null;
  return <>{children}</>;
}
