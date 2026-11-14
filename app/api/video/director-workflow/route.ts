/**
 * GET /api/video/director-workflow — whether the Video service shows the Director's Workflow to THIS user
 * (DIRECTORS_WORKFLOW: off | admin | everyone). A boolean only, never 404, so the studio asks instead of assuming.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { directorsWorkflowAudience } from '@/lib/video/directorsWorkflow/flag';
import { directorsWorkflowOpenTo } from '@/lib/video/directorsWorkflow/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  let enabled = false;
  if (directorsWorkflowAudience() !== 'off') {
    const { user } = await authedClientFromRequest(req).catch(() => ({ user: null }));
    enabled = directorsWorkflowOpenTo(user);
  }
  return NextResponse.json({ enabled }, { headers: { 'Cache-Control': 'private, no-store' } });
}
