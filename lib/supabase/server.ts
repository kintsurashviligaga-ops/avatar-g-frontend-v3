import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import { getServerEnv } from "@/lib/env/server";

const getSupabaseConfig = () => {
	const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getServerEnv([
		'SUPABASE_SERVICE_ROLE_KEY',
	]);
	const supabaseUrl = SUPABASE_URL || publicEnv.NEXT_PUBLIC_SUPABASE_URL;

	if (!supabaseUrl) {
		throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is missing");
	}

	return { supabaseUrl, supabaseServiceKey: SUPABASE_SERVICE_ROLE_KEY as string };
};

export const createRouteHandlerClient = () => {
	const { supabaseUrl, supabaseServiceKey } = getSupabaseConfig();
	return createClient(supabaseUrl, supabaseServiceKey, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
};

export const createSupabaseServerClient = () => createRouteHandlerClient();
