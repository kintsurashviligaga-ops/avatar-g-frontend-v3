import 'server-only';

import { cookies } from 'next/headers';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
	createServerClient as createSsrServerClient,
} from '@supabase/ssr';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env/public';
import { getServerEnv } from '@/lib/env/server';

/**
 * Placeholder used when Supabase is not configured.
 *
 * WHY NOT THROW: this function used to throw `Missing NEXT_PUBLIC_SUPABASE_URL...`, and because
 * `createServerClient()` is called during render by server components and at the top of most API routes,
 * one absent env var took down EVERY page and EVERY route — the whole app rendered its error boundary.
 * That made local UI work impossible and is a needlessly brittle failure mode in production too: a
 * misconfigured Preview environment should degrade to "signed out", not to a blank site.
 *
 * A syntactically valid but unroutable host means the SDK constructs fine and auth calls simply fail,
 * which every caller here already handles (they treat a failed getUser() as "no session").
 */
const UNCONFIGURED_URL = 'https://unconfigured.invalid';
const UNCONFIGURED_KEY = 'unconfigured';

/** True when real Supabase credentials are present. Routes that MUST have them can check this. */
export function isSupabaseConfiguredServer(): boolean {
	return Boolean(publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function getPublicSupabaseConfig() {
	const supabaseUrl = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseAnonKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

	if (!supabaseUrl || !supabaseAnonKey) {
		// Warn loudly — this is a real misconfiguration — but do not take the process down over it.
		// eslint-disable-next-line no-console
		console.warn('[supabase] NEXT_PUBLIC_SUPABASE_URL / ANON_KEY are missing — running signed-out.');
		return { supabaseUrl: UNCONFIGURED_URL, supabaseAnonKey: UNCONFIGURED_KEY };
	}

	return { supabaseUrl, supabaseAnonKey };
}

function getServiceRoleConfig() {
	const { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } = getServerEnv(['SUPABASE_SERVICE_ROLE_KEY']);
	const supabaseUrl = SUPABASE_URL || publicEnv.NEXT_PUBLIC_SUPABASE_URL;

	if (!supabaseUrl) {
		// Same reasoning as getPublicSupabaseConfig: degrade rather than take down every route that
		// happens to import a service-role client. Calls will fail; the app still renders.
		// eslint-disable-next-line no-console
		console.warn('[supabase] SUPABASE_URL is missing — service-role calls will fail.');
		return { supabaseUrl: UNCONFIGURED_URL, serviceRoleKey: UNCONFIGURED_KEY };
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
			getAll() {
				return cookieStore.getAll();
			},
			setAll(cookiesToSet) {
				try {
					cookiesToSet.forEach(({ name, value, options }) =>
						cookieStore.set(name, value, options)
					);
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

/**
 * Auth-aware client for API routes. Tries cookie-based session first
 * (browser callers with Supabase SSR cookies), then falls back to a
 * Bearer token in the `Authorization` header — necessary for mobile
 * apps and any non-browser client that holds a JWT directly.
 *
 * Returns `{ supabase, user }` where `user` is null if no valid session
 * was found in either source. Callers decide whether to 401.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, 'public', any>;

export async function authedClientFromRequest(req: Request): Promise<{
	supabase: AnySupabase;
	user: User | null;
}> {
	// 1. Cookie path
	const cookieClient = createServerClient() as unknown as AnySupabase;
	{
		const { data: { user } } = await cookieClient.auth.getUser();
		if (user) return { supabase: cookieClient, user };
	}

	// 2. Bearer path — build a fresh client bound to the provided JWT
	const auth = req.headers.get('authorization') ?? req.headers.get('Authorization');
	const bearer = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
	if (!bearer) {
		return { supabase: cookieClient, user: null };
	}

	const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfig();
	const bearerClient = createSupabaseJsClient(supabaseUrl, supabaseAnonKey, {
		auth: { autoRefreshToken: false, persistSession: false },
		global: { headers: { Authorization: `Bearer ${bearer}` } },
	}) as unknown as AnySupabase;
	const { data: { user } } = await bearerClient.auth.getUser();
	return { supabase: bearerClient, user };
}
