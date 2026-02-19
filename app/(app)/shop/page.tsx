"use client";

import { useEffect, useMemo, useState } from 'react';
import { ServiceHeader } from '@/components/layout/ServiceHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';

type OrderRow = {
  id: string;
  status: string;
  total: number;
  createdAt: string;
};

type AffiliateProfile = {
  affiliate_code?: string;
  total_clicks?: number;
  total_signups?: number;
};

type ConnectStatus = {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

export default function ShopPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [affiliate, setAffiliate] = useState<AffiliateProfile | null>(null);
  const [connect, setConnect] = useState<ConnectStatus | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [ordersRes, affiliateRes, connectRes] = await Promise.all([
        fetch('/api/commerce/orders?limit=20', { cache: 'no-store' }),
        fetch('/api/affiliate/me?create=true', { cache: 'no-store' }),
        fetch('/api/stripe/connect/status', { cache: 'no-store' }),
      ]);

      const ordersJson = await ordersRes.json();
      const affiliateJson = await affiliateRes.json();
      const connectJson = await connectRes.json();

      setOrders(ordersJson?.data?.orders ?? []);
      setAffiliate(affiliateJson?.affiliate ?? null);
      setConnect(connectJson ?? null);
      setLoading(false);
    };

    load();
  }, []);

  const totalRevenue = useMemo(
    () => orders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    [orders]
  );

  const successfulOrders = useMemo(
    () => orders.filter((order) => ['completed', 'paid', 'processing'].includes(order.status)).length,
    [orders]
  );

  return (
    <div>
      <ServiceHeader
        title="Online Shop / Marketplace"
        description="Shopify-like commerce module integrated into Avatar G: products, orders, payouts, affiliate growth, and dropshipping readiness."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Products</CardTitle>
            <Badge variant="accent">Physical + Digital</Badge>
          </CardHeader>
          <CardContent>
            <EmptyState title="Catalog module ready" description="Use existing commerce APIs to seed products, variants, and inventory." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orders</CardTitle>
            <Badge variant="warning">Pipeline</Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Spinner label="Loading orders..." />
            ) : orders.length === 0 ? (
              <EmptyState title="No orders yet" description="Order flow supports pending, processing, completed, failed, refunded." />
            ) : (
              <div className="space-y-2 text-sm text-app-muted">
                <p>Recent orders: <span className="font-medium text-app-text">{orders.length}</span></p>
                <p>Successful: <span className="font-medium text-app-text">{successfulOrders}</span></p>
                <p>Revenue (visible set): <span className="font-medium text-app-text">${totalRevenue.toFixed(2)}</span></p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payouts & Connect</CardTitle>
            <Badge variant="neutral">Future-ready</Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Spinner label="Loading payout status..." />
            ) : connect?.connected ? (
              <div className="space-y-2 text-sm text-app-muted">
                <p>Connected account: <span className="text-green-300">Active</span></p>
                <p>Charges enabled: <span className="text-app-text">{String(connect.chargesEnabled)}</span></p>
                <p>Payouts enabled: <span className="text-app-text">{String(connect.payoutsEnabled)}</span></p>
              </div>
            ) : (
              <p className="text-sm text-app-muted">Connect account is not fully onboarded yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Affiliate + Dropshipping + Tokens</CardTitle>
            <Badge variant="success">Integrated</Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Spinner label="Loading affiliate data..." />
            ) : affiliate ? (
              <div className="space-y-2 text-sm text-app-muted">
                <p>Affiliate code: <span className="font-medium text-app-text">{affiliate.affiliate_code ?? '—'}</span></p>
                <p>Clicks: <span className="font-medium text-app-text">{affiliate.total_clicks ?? 0}</span></p>
                <p>Signups: <span className="font-medium text-app-text">{affiliate.total_signups ?? 0}</span></p>
              </div>
            ) : (
              <p className="text-sm text-app-muted">Affiliate profile will be created automatically on first load.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}