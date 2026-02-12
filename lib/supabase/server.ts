import { createClient } from "@supabase/supabase-js";

const getSupabaseConfig = () => {
	const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !supabaseServiceKey) {
		throw new Error("Supabase env vars are missing");
	}

	return { supabaseUrl, supabaseServiceKey };
};

export const createRouteHandlerClient = () => {
	const { supabaseUrl, supabaseServiceKey } = getSupabaseConfig();
	return createClient(supabaseUrl, supabaseServiceKey, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
};

export const createSupabaseServerClient = () => createRouteHandlerClient();
