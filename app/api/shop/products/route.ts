import { NextRequest } from 'next/server';
import { analyzeProduct, assessRisk, recommendPricing } from '@/lib/onlineShop/ai';
import { createProduct, getOrCreateDevShop, listProducts, listSuppliers } from '@/lib/onlineShop/repo';
import { CreateProductSchema, ListProductsSchema } from '@/lib/onlineShop/schemas';
import { errorResponse, getRequestUserId, okResponse } from '@/lib/onlineShop/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = getRequestUserId(request);
  const defaultShop = getOrCreateDevShop(userId);

  const parsed = ListProductsSchema.safeParse({
    shopId: request.nextUrl.searchParams.get('shopId') || defaultShop.id,
  });

  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message || 'Invalid product query', 400);
  }

  return okResponse({ products: listProducts(parsed.data.shopId), shopId: parsed.data.shopId });
}

export async function POST(request: NextRequest) {
  const userId = getRequestUserId(request);
  const fallbackShop = getOrCreateDevShop(userId);
  const payload = await request.json().catch(() => ({}));

  const parsed = CreateProductSchema.safeParse({
    ...payload,
    shopId: payload.shopId || fallbackShop.id,
  });

  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message || 'Invalid product input', 400);
  }

  const supplier = listSuppliers().find((entry) => entry.id === parsed.data.supplierId);
  if (!supplier) {
    return errorResponse('Supplier not found', 404);
  }

  const analysis = analyzeProduct({
    title: parsed.data.title,
    description: parsed.data.description,
    supplierRating: supplier.rating,
    costCents: parsed.data.costCents,
  });

  const pricing = recommendPricing(
    { costCents: parsed.data.costCents },
    {
      minMarginPercent: parsed.data.minMarginPercent,
      maxMarginPercent: Math.max(parsed.data.minMarginPercent + 10, 60),
      roundToNearest: 100,
    }
  );

  const product = createProduct({
    shopId: parsed.data.shopId,
    title: parsed.data.title,
    description: parsed.data.description,
    supplierId: parsed.data.supplierId,
    costCents: parsed.data.costCents,
    priceCents: pricing.recommendedPriceCents,
    currency: parsed.data.currency,
    inventory: parsed.data.inventory,
    riskLevel: analysis.riskLevel,
  });

  const risk = assessRisk({
    costCents: product.costCents,
    inventory: product.inventory,
    riskLevel: product.riskLevel,
  });

  return okResponse({
    product,
    analysis,
    pricing,
    risk,
  }, 201);
}
