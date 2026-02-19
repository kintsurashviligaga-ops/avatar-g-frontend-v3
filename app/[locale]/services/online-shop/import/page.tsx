import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OnlineShopHeader } from '../_components/OnlineShopHeader';

type ImportPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function OnlineShopImportPage({ params }: ImportPageProps) {
  const { locale } = await params;

  return (
    <section className="space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <OnlineShopHeader
        locale={locale}
        title="Online Shop Import"
        subtitle="Use AI-assisted import to fetch product candidates from supplier feeds."
      />

      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white">Mock Import Endpoint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-300">
          <p>POST <span className="text-cyan-300">/api/shop/import</span> with:</p>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-gray-200">{`{
  "shopId": "shop_xxx",
  "supplierId": "sup_mock_1",
  "sourceUrl": "https://supplier-feed.example/products"
}`}</pre>
        </CardContent>
      </Card>
    </section>
  );
}
