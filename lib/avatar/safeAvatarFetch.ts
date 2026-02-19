import { createServiceRoleClient } from '@/lib/supabase/server';

type AvatarRecord = {
  id: string;
  owner_id: string;
  preview_image_url: string | null;
  model_url: string | null;
  name: string | null;
  created_at: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function safeAvatarFetch(id: string): Promise<AvatarRecord | null> {
  try {
    if (!id || !UUID_RE.test(id)) {
      return null;
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('avatars')
      .select('id, owner_id, preview_image_url, model_url, name, created_at')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data as AvatarRecord;
  } catch {
    return null;
  }
}
