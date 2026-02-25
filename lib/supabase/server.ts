import 'server-only';

import { cookies } from 'next/headers';
import type { User } from '@supabase/supabase-js';
import {
	createServerClient as createSsrServerClient,
	type CookieOptions,
} from '@supabase/ssr';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env/public';
import { getServerEnv } from '@/lib/env/server';

function getPublicSupabaseConfig() {
	const supabaseUrl = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseAnonKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

	if (!supabaseUrl || !supabaseAnonKey) {
		throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
	}

	return { supabaseUrl, supabaseAnonKey };
}

function getServiceRoleConfig() {
	const { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } = getServerEnv(['SUPABASE_SERVICE_ROLE_KEY']);
	const supabaseUrl = SUPABASE_URL || publicEnv.NEXT_PUBLIC_SUPABASE_URL;

	if (!supabaseUrl) {
		throw new Error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
	}

	return {
		supabaseUrl,
		serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY as string,
	};
}

export function createServerClient() {
	const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfig();
	const cookieStore = cookies();

	return createSsrServerClient(supabaseUrl, supabaseAnonKey, {
		cookies: {
			get(name: string) {
				return cookieStore.get(name)?.value;
			},
			set(name: string, value: string, options: CookieOptions) {
				try {
					cookieStore.set({ name, value, ...options });
				} catch {
					// Cookie writes can fail in some server component contexts.
				}
			},
			remove(name: string, options: CookieOptions) {
				try {
					cookieStore.set({ name, value: '', ...options, maxAge: 0 });
				} catch {
					// Cookie writes can fail in some server component contexts.
				}
			},
		},
	});
}

export function createServiceRoleClient() {
	const { supabaseUrl, serviceRoleKey } = getServiceRoleConfig();
	return createSupabaseJsClient(supabaseUrl, serviceRoleKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

export async function requireUser(): Promise<User> {
	const supabase = createServerClient();
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();

	if (error || !user) {
		throw new Error('UNAUTHENTICATED');
	}

	return user;
}

export async function getProfile(userId?: string) {
	const targetUserId = userId ?? (await requireUser()).id;
	const supabase = createServerClient();
	const { data, error } = await supabase
		.from('profiles')
		.select('*')
		.eq('id', targetUserId)
		.maybeSingle();

	if (error) {
		throw error;
	}

	return data;
}

export const createRouteHandlerClient = () => createServerClient();
export const createSupabaseServerClient = () => createServerClient();
export const createClient = () => createServerClient();
