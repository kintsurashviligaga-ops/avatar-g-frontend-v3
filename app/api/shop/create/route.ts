import { NextRequest } from 'next/server';
import { CreateShopSchema } from '@/lib/onlineShop/schemas';
import { createShop, listShops } from '@/lib/onlineShop/repo';
import { errorResponse, getRequestUserId, okResponse } from '@/lib/onlineShop/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = getRequestUserId(request);
  return okResponse({ shops: listShops(userId), userId });
}

export async function POST(request: NextRequest) {
  const userId = getRequestUserId(request);

  const parsed = CreateShopSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message || 'Invalid shop input', 400);
  }

  const shop = createShop({
    userId,
    name: parsed.data.name,
    currency: parsed.data.currency,
  });

  return okResponse({ shop, userId }, 201);
}
