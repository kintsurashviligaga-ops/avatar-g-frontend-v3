import { z } from 'zod';

const CurrencySchema = z.enum(['USD', 'EUR', 'GEL']);

export const CreateShopSchema = z.object({
  name: z.string().min(2).max(120),
  currency: CurrencySchema.default('USD'),
});

export const ListSuppliersSchema = z.object({
  minRating: z.coerce.number().min(0).max(5).optional(),
});

export const CreateProductSchema = z.object({
  shopId: z.string().min(1),
  title: z.string().min(2).max(180),
  description: z.string().min(2).max(2000),
  supplierId: z.string().min(1),
  costCents: z.coerce.number().int().positive(),
  currency: CurrencySchema.default('USD'),
  inventory: z.coerce.number().int().min(0).default(0),
  minMarginPercent: z.coerce.number().min(1).max(95).default(30),
});

export const ListProductsSchema = z.object({
  shopId: z.string().min(1),
});

export const ImportProductsSchema = z.object({
  shopId: z.string().min(1),
  supplierId: z.string().min(1),
  sourceUrl: z.string().url(),
});

export const CreateOrderSchema = z.object({
  shopId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive().max(100),
});

export const FulfillOrderSchema = z.object({
  orderId: z.string().min(1),
});

export type CreateShopInput = z.infer<typeof CreateShopSchema>;
export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type ImportProductsInput = z.infer<typeof ImportProductsSchema>;
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
