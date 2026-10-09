import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { uiModelEntries, validateModelCatalog } from '@/lib/contracts/modelCatalog';
import { MODEL_CATALOG } from '@/lib/models/catalog';
import { verifiedModelCatalog } from '@/lib/models/verify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/admin/model-catalog — the ModelCatalog against the runtime (Section D2), for a person to read.
 *
 * Runs lib/models/verify on the selected Google transport (free: the key's model list, or countTokens on Vertex) and
 * returns: the catalog version, ids the runtime is missing (switched off), ids it has that the catalog does not (the
 * review queue — never added automatically), what a selector may show today, and the build-time validation. `?fresh=1`
 * skips the cache.
 *
 * ADMIN ONLY (404 otherwise). No key or token in the body.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (!(await assertAdminAccess(req, user)).ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { catalog, check } = await verifiedModelCatalog({ force: req.nextUrl.searchParams.get('fresh') === '1' });
  return NextResponse.json({
    version: MODEL_CATALOG.version,
    updatedAt: MODEL_CATALOG.updatedAt,
    validation: validateModelCatalog(MODEL_CATALOG),
    check,
    selectable: uiModelEntries(catalog).map((e) => ({ id: e.id, label: e.label, family: e.family, transport: e.transport })),
    disabled: catalog.entries.filter((e) => !e.enabled).map((e) => e.id),
  });
}
