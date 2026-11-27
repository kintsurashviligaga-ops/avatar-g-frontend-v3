/**
 * lib/avatar/studio/server.ts — who may use the Virtual Studio routes (AVATAR_STUDIO_V2 + admin). Every route answers
 * 404 while the flag is off for this user, so a closed feature says nothing about itself. Server only.
 */
import 'server-only';
import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { isAdminUserAsync } from '@/lib/admin/guard';
import { studioAllowed } from './flag';

export async function studioOpenTo(user: User | null, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  return !!user && studioAllowed(await isAdminUserAsync(user), env);
}

export const studioFail = (code: string, message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error: code, message, ...extra }, { status });
