import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OnlineShopHeader } from '../_components/OnlineShopHeader';

type SettingsPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function OnlineShopSettingsPage({ params }: SettingsPageProps) {
  const { locale } = await params;

  return (
    <section className="space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <OnlineShopHeader
        locale={locale}
        title="Online Shop Settings"
        subtitle="Configure pricing rules, risk tolerance, and fulfillment automation defaults."
      />

      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white">Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-300">
          <p>• Pricing mode: AI Assisted</p>
          <p>• Default currency: USD</p>
          <p>• Fulfillment mode: Mock Supplier API</p>
          <p>• Risk threshold: medium</p>
        </CardContent>
      </Card>
    </section>
  );
}
