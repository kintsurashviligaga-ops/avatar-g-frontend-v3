import { NextRequest } from 'next/server';
import { createOrder, getOrCreateDevShop, getProduct, listOrders } from '@/lib/onlineShop/repo';
import { CreateOrderSchema } from '@/lib/onlineShop/schemas';
import { errorResponse, getRequestUserId, okResponse } from '@/lib/onlineShop/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = getRequestUserId(request);
  const fallbackShop = getOrCreateDevShop(userId);
  const shopId = request.nextUrl.searchParams.get('shopId') || fallbackShop.id;

  return okResponse({ orders: listOrders(shopId), shopId });
}

export async function POST(request: NextRequest) {
  const userId = getRequestUserId(request);
  const fallbackShop = getOrCreateDevShop(userId);
  const payload = await request.json().catch(() => ({}));

  const parsed = CreateOrderSchema.safeParse({
    ...payload,
    shopId: payload.shopId || fallbackShop.id,
  });

  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message || 'Invalid order input', 400);
  }

  const product = getProduct(parsed.data.productId);
  if (!product) {
    return errorResponse('Product not found', 404);
  }

  const order = createOrder({
    shopId: parsed.data.shopId,
    productId: parsed.data.productId,
    quantity: parsed.data.quantity,
    totalCents: product.priceCents * parsed.data.quantity,
    currency: product.currency,
    status: 'paid',
  });

  return okResponse({ order }, 201);
}
