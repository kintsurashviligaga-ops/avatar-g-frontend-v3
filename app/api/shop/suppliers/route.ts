import { NextRequest } from 'next/server';
import { listSuppliers } from '@/lib/onlineShop/repo';
import { ListSuppliersSchema } from '@/lib/onlineShop/schemas';
import { errorResponse, okResponse } from '@/lib/onlineShop/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const query = {
    minRating: request.nextUrl.searchParams.get('minRating') || undefined,
  };

  const parsed = ListSuppliersSchema.safeParse(query);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message || 'Invalid supplier query', 400);
  }

  return okResponse({ suppliers: listSuppliers(parsed.data.minRating) });
}
