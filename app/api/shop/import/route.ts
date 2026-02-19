import { NextRequest } from 'next/server';
import { createImportRecord, createProduct, getOrCreateDevShop, listSuppliers } from '@/lib/onlineShop/repo';
import { ImportProductsSchema } from '@/lib/onlineShop/schemas';
import { errorResponse, getRequestUserId, okResponse } from '@/lib/onlineShop/http';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const userId = getRequestUserId(request);
  const fallbackShop = getOrCreateDevShop(userId);
  const payload = await request.json().catch(() => ({}));

  const parsed = ImportProductsSchema.safeParse({
    ...payload,
    shopId: payload.shopId || fallbackShop.id,
  });

  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message || 'Invalid import input', 400);
  }

  const supplier = listSuppliers().find((entry) => entry.id === parsed.data.supplierId);
  if (!supplier) {
    return errorResponse('Supplier not found', 404);
  }

  const importedProducts = ['Premium Smart Lamp', 'Portable Blender Pro'].map((title, index) =>
    createProduct({
      shopId: parsed.data.shopId,
      title,
      description: `Imported from ${parsed.data.sourceUrl}`,
      supplierId: parsed.data.supplierId,
      costCents: 3000 + index * 800,
      priceCents: 6900 + index * 1200,
      currency: 'USD',
      inventory: 25,
      riskLevel: 'low',
    })
  );

  const importRecord = createImportRecord({
    shopId: parsed.data.shopId,
    supplierId: parsed.data.supplierId,
    sourceUrl: parsed.data.sourceUrl,
    status: 'completed',
    productIds: importedProducts.map((entry) => entry.id),
    notes: `Imported from ${supplier.name} in mock mode`,
  });

  return okResponse({ import: importRecord, products: importedProducts }, 201);
}
