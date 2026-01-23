import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ success: false, error: 'jobId is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('render_jobs')
      .select('id,status,final_video_url,error_message,created_at,updated_at')
      .eq('id', jobId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { success: false, status: 'not_found', finalVideoUrl: null, error_message: null },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      id: data.id,
      status: data.status,
      finalVideoUrl: data.final_video_url ?? null,
      error_message: data.error_message ?? null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
