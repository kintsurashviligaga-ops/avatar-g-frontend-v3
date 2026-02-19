import type {
  FulfillmentJob,
  ImportRecord,
  Order,
  Product,
  Shop,
  Supplier,
} from './types';

const nowIso = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const suppliersSeed: Supplier[] = [
  { id: 'sup_mock_1', name: 'Mock Supplier Alpha', country: 'US', rating: 4.7, apiMode: 'mock', createdAt: nowIso() },
  { id: 'sup_mock_2', name: 'Mock Supplier Delta', country: 'DE', rating: 4.4, apiMode: 'mock', createdAt: nowIso() },
  { id: 'sup_mock_3', name: 'Mock Supplier Geo', country: 'GE', rating: 4.2, apiMode: 'mock', createdAt: nowIso() },
];

const memoryStore: {
  shops: Shop[];
  suppliers: Supplier[];
  products: Product[];
  imports: ImportRecord[];
  orders: Order[];
  fulfillmentJobs: FulfillmentJob[];
} = {
  shops: [],
  suppliers: suppliersSeed,
  products: [],
  imports: [],
  orders: [],
  fulfillmentJobs: [],
};

export function createShop(input: { userId: string; name: string; currency: Shop['currency'] }): Shop {
  const shop: Shop = {
    id: makeId('shop'),
    userId: input.userId,
    name: input.name,
    currency: input.currency,
    createdAt: nowIso(),
  };

  memoryStore.shops.push(shop);
  return shop;
}

export function listShops(userId: string): Shop[] {
  return memoryStore.shops.filter((shop) => shop.userId === userId);
}

export function listSuppliers(minRating?: number): Supplier[] {
  if (typeof minRating !== 'number') {
    return [...memoryStore.suppliers];
  }

  return memoryStore.suppliers.filter((supplier) => supplier.rating >= minRating);
}

export function createProduct(input: Omit<Product, 'id' | 'createdAt'>): Product {
  const product: Product = {
    ...input,
    id: makeId('prd'),
    createdAt: nowIso(),
  };

  memoryStore.products.push(product);
  return product;
}

export function listProducts(shopId: string): Product[] {
  return memoryStore.products.filter((product) => product.shopId === shopId);
}

export function getProduct(productId: string): Product | undefined {
  return memoryStore.products.find((product) => product.id === productId);
}

export function createImportRecord(input: Omit<ImportRecord, 'id' | 'createdAt'>): ImportRecord {
  const record: ImportRecord = {
    ...input,
    id: makeId('imp'),
    createdAt: nowIso(),
  };

  memoryStore.imports.push(record);
  return record;
}

export function listImports(shopId: string): ImportRecord[] {
  return memoryStore.imports.filter((record) => record.shopId === shopId);
}

export function createOrder(input: Omit<Order, 'id' | 'createdAt'>): Order {
  const order: Order = {
    ...input,
    id: makeId('ord'),
    createdAt: nowIso(),
  };

  memoryStore.orders.push(order);
  return order;
}

export function listOrders(shopId: string): Order[] {
  return memoryStore.orders.filter((order) => order.shopId === shopId);
}

export function getOrder(orderId: string): Order | undefined {
  return memoryStore.orders.find((order) => order.id === orderId);
}

export function updateOrder(orderId: string, patch: Partial<Order>): Order | undefined {
  const order = memoryStore.orders.find((item) => item.id === orderId);
  if (!order) {
    return undefined;
  }

  Object.assign(order, patch);
  return order;
}

export function createFulfillmentJob(input: Omit<FulfillmentJob, 'id' | 'createdAt' | 'updatedAt'>): FulfillmentJob {
  const job: FulfillmentJob = {
    ...input,
    id: makeId('ful'),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  memoryStore.fulfillmentJobs.push(job);
  return job;
}

export function listFulfillmentJobs(): FulfillmentJob[] {
  return [...memoryStore.fulfillmentJobs];
}

export function getFulfillmentJob(jobId: string): FulfillmentJob | undefined {
  return memoryStore.fulfillmentJobs.find((job) => job.id === jobId);
}

export function updateFulfillmentJob(jobId: string, patch: Partial<FulfillmentJob>): FulfillmentJob | undefined {
  const job = memoryStore.fulfillmentJobs.find((item) => item.id === jobId);
  if (!job) {
    return undefined;
  }

  Object.assign(job, patch, { updatedAt: nowIso() });
  return job;
}

export function getOrCreateDevShop(userId: string): Shop {
  const existing = listShops(userId)[0];
  if (existing) {
    return existing;
  }

  return createShop({ userId, name: 'AI Auto-Dropshipping', currency: 'USD' });
}
