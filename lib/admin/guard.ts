import { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';

type AdminUserMetadata = {
  role?: string;
  roles?: string[];
  is_admin?: boolean;
};

export function isAdminUser(user: User | null): boolean {
  if (!user) return false;
  const metadata = (user.user_metadata ?? {}) as AdminUserMetadata;
  if (metadata.is_admin) return true;
  if (metadata.role === 'admin' || metadata.role === 'owner') return true;
  return Array.isArray(metadata.roles) && (metadata.roles.includes('admin') || metadata.roles.includes('owner'));
}

export function hasValidAdminKey(request: NextRequest): boolean {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) return false;
  const provided = request.headers.get('x-admin-key');
  return Boolean(provided && provided === expected);
}

export function assertAdminAccess(request: NextRequest, user: User | null): { ok: true } | { ok: false; reason: string } {
  if (isAdminUser(user) || hasValidAdminKey(request)) {
    return { ok: true };
  }
  return { ok: false, reason: 'Admin access required' };
}
