'use client';

import { useRole } from '@/contexts/RoleContext';
import type { Role } from '@/lib/roles';

interface RoleGateProps {
  /** Roles that may see the children. */
  allow: Role[];
  children: React.ReactNode;
}

/**
 * Renders its children only for the given roles. This only hides UI; anything
 * that must really be restricted needs an RLS policy too (see is_admin()).
 */
export default function RoleGate({ allow, children }: RoleGateProps) {
  const role = useRole();
  if (!role || !allow.includes(role)) return null;
  return <>{children}</>;
}
