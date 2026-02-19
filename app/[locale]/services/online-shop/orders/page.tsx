import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getOrCreateDevShop, listOrders } from '@/lib/onlineShop/repo';
import { OnlineShopHeader } from '../_components/OnlineShopHeader';

type OrdersPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function OnlineShopOrdersPage({ params }: OrdersPageProps) {
  const { locale } = await params;
  const shop = getOrCreateDevShop('dev-user-1');
  const orders = listOrders(shop.id);

  return (
    <section className="space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <OnlineShopHeader
        locale={locale}
        title="Online Shop Orders"
        subtitle="Track paid orders and trigger automated fulfillment jobs."
      />

      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white">Order Queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {orders.length === 0 ? (
            <p className="text-sm text-gray-300">No orders yet. Create orders from API: POST /api/shop/orders.</p>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="rounded-xl border border-white/10 p-3 text-sm text-gray-200">
                <p>Order: {order.id}</p>
                <p>Status: {order.status}</p>
                <p>Total: {(order.totalCents / 100).toFixed(2)} {order.currency}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}
