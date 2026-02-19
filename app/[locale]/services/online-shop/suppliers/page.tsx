import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listSuppliers } from '@/lib/onlineShop/repo';
import { OnlineShopHeader } from '../_components/OnlineShopHeader';

type SuppliersPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function OnlineShopSuppliersPage({ params }: SuppliersPageProps) {
  const { locale } = await params;
  const suppliers = listSuppliers();

  return (
    <section className="space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <OnlineShopHeader
        locale={locale}
        title="Online Shop Suppliers"
        subtitle="Compare supplier quality and select the best source for your dropshipping pipeline."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {suppliers.map((supplier) => (
          <Card key={supplier.id} className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-white">{supplier.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-gray-300">
              <p>Country: {supplier.country}</p>
              <p>Rating: {supplier.rating.toFixed(1)} / 5</p>
              <p>Mode: {supplier.apiMode}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
