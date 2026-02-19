import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getOrCreateDevShop, listProducts } from '@/lib/onlineShop/repo';
import { OnlineShopHeader } from '../_components/OnlineShopHeader';

type ProductsPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function OnlineShopProductsPage({ params }: ProductsPageProps) {
  const { locale } = await params;
  const shop = getOrCreateDevShop('dev-user-1');
  const products = listProducts(shop.id);

  return (
    <section className="space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <OnlineShopHeader
        locale={locale}
        title="Online Shop Products"
        subtitle="Review imported products, pricing decisions, and risk levels."
      />

      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white">Catalog</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {products.length === 0 ? (
            <p className="text-sm text-gray-300">No products yet. Use Import to create your first product set.</p>
          ) : (
            products.map((product) => (
              <div key={product.id} className="rounded-xl border border-white/10 p-3">
                <p className="text-sm font-medium text-white">{product.title}</p>
                <p className="text-xs text-gray-400">{product.description}</p>
                <p className="text-xs text-cyan-300">Price: {(product.priceCents / 100).toFixed(2)} {product.currency}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}
