"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MetricWidget, AlertBanner, ChartCard } from "@/components/dashboard/SellerWidgets";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  TrendingUp,
  Receipt,
  AlertTriangle,
  Target,
  BarChart3,
  ShoppingCart,
  Package,
  CreditCard,
} from "lucide-react";

interface SellerKPI {
  todaySalesCents: number;
  netProfitCents: number;
  vatPayableCents: number;
  currentMarginBps: number;
  breakEvenDaysEstimate: number;
  riskScore: number;
  recommendedMinPriceCents: number;
  totalOrders: number;
  pendingPayoutCents: number;
}

export default function SellerDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<SellerKPI | null>(null);

  useEffect(() => {
    fetchKPI();
  }, []);

  const fetchKPI = async () => {
    // TODO: Call API endpoint
    // const response = await fetch("/api/seller/kpi");
    // const data = await response.json();
    
    // Mock data for now
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    setKpi({
      todaySalesCents: 125000, // 1250 GEL
      netProfitCents: 31250, // 312.50 GEL (25% margin)
      vatPayableCents: 22500, // 225 GEL (18% VAT)
      currentMarginBps: 2500, // 25%
      breakEvenDaysEstimate: 14,
      riskScore: 25, // Low risk
      recommendedMinPriceCents: 8500, // 85 GEL
      totalOrders: 18,
      pendingPayoutCents: 58000, // 580 GEL
    });

    setLoading(false);
  };

  const t = {
    title: "მთავარი პანელი",
    subtitle: "შენი მაღაზიის მიმოხილვა დღეს",
    today_sales: "დღევანდელი გაყიდვები",
    net_profit: "სუფთა მოგება",
    vat_payable: "დღგ გადასახდელი",
    current_margin: "მიმდინარე მარჟა",
    breakeven: "Break-even პროგნოზი",
    risk: "Risk ინდიკატორი",
    recommended_price: "რეკომენდირებული მინ. ფასი",
    total_orders: "სულ შეკვეთები",
    pending_payout: "მომლოდინე გადახდა",
    margin_good: "✓ მარჟა კარგია!",
    margin_good_desc: "შენი მარჟა 25%-ია - დაცულია 20%-ზე მაღალი.",
    margin_warning: "⚠️ მარჟა დაბალია!",
    margin_warning_desc: "შენი მარჟა 20%-ზე დაბალია. შეცვალე ფასები ან შეამცირე ხარჯები.",
    days_suffix: "დღეში",
    low_risk: "დაბალი რისკი",
    medium_risk: "საშუალო რისკი",
    high_risk: "მაღალი რისკი",
    view_products: "პროდუქტების ნახვა",
    view_orders: "შეკვეთების ნახვა",
    request_payout: "გადახდის მოთხოვნა",
    view_forecast: "პროგნოზის ნახვა",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#05070A] via-[#0A0E1A] to-[#05070A] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xl text-gray-400">იტვირთება...</p>
        </div>
      </div>
    );
  }

  if (!kpi) return null;

  const marginPercent = kpi.currentMarginBps / 100;
  const isMarginHealthy = kpi.currentMarginBps >= 2000;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05070A] via-[#0A0E1A] to-[#05070A] px-4 py-12">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
            {t.title}
          </h1>
          <p className="text-gray-400">{t.subtitle}</p>
        </div>

        {/* Margin Alert */}
        <div className="mb-8">
          <AlertBanner
            variant={isMarginHealthy ? "success" : "danger"}
            title={isMarginHealthy ? t.margin_good : t.margin_warning}
            message={isMarginHealthy ? t.margin_good_desc : t.margin_warning_desc}
            icon={isMarginHealthy ? TrendingUp : AlertTriangle}
          />
        </div>

        {/* KPI Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          
          {/* Today's Sales */}
          <MetricWidget
            title={t.today_sales}
            value={`₾${(kpi.todaySalesCents / 100).toFixed(2)}`}
            icon={DollarSign}
            trend="up"
            trendValue="+12% from yesterday"
            variant="default"
          />

          {/* Net Profit */}
          <MetricWidget
            title={t.net_profit}
            value={`₾${(kpi.netProfitCents / 100).toFixed(2)}`}
            subtitle={`${marginPercent.toFixed(1)}% margin`}
            icon={TrendingUp}
            variant={isMarginHealthy ? "success" : "danger"}
          />

          {/* VAT Payable */}
          <MetricWidget
            title={t.vat_payable}
            value={`₾${(kpi.vatPayableCents / 100).toFixed(2)}`}
            icon={Receipt}
            variant="warning"
          />

          {/* Current Margin */}
          <MetricWidget
            title={t.current_margin}
            value={`${marginPercent.toFixed(1)}%`}
            icon={BarChart3}
            variant={isMarginHealthy ? "success" : "danger"}
          />

          {/* Break-even */}
          <MetricWidget
            title={t.breakeven}
            value={kpi.breakEvenDaysEstimate.toString()}
            subtitle={t.days_suffix}
            icon={Target}
            variant="default"
          />

          {/* Risk Score */}
          <MetricWidget
            title={t.risk}
            value={`${kpi.riskScore}/100`}
            subtitle={
              kpi.riskScore < 30 ? t.low_risk :
              kpi.riskScore < 60 ? t.medium_risk :
              t.high_risk
            }
            icon={AlertTriangle}
            variant={
              kpi.riskScore < 30 ? "success" :
              kpi.riskScore < 60 ? "warning" :
              "danger"
            }
          />

          {/* Recommended Price */}
          <MetricWidget
            title={t.recommended_price}
            value={`₾${(kpi.recommendedMinPriceCents / 100).toFixed(2)}`}
            icon={TrendingUp}
            variant="default"
          />

          {/* Total Orders */}
          <MetricWidget
            title={t.total_orders}
            value={kpi.totalOrders.toString()}
            icon={ShoppingCart}
            variant="default"
          />

          {/* Pending Payout */}
          <MetricWidget
            title={t.pending_payout}
            value={`₾${(kpi.pendingPayoutCents / 100).toFixed(2)}`}
            icon={CreditCard}
            variant="default"
          />

        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Button
            onClick={() => router.push("/dashboard/products")}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 flex items-center gap-2 justify-center py-6"
          >
            <Package className="w-5 h-5" />
            {t.view_products}
          </Button>
          <Button
            onClick={() => router.push("/dashboard/orders")}
            variant="outline"
            className="flex items-center gap-2 justify-center py-6"
          >
            <ShoppingCart className="w-5 h-5" />
            {t.view_orders}
          </Button>
          <Button
            onClick={() => router.push("/dashboard/payouts")}
            variant="outline"
            className="flex items-center gap-2 justify-center py-6"
          >
            <CreditCard className="w-5 h-5" />
            {t.request_payout}
          </Button>
          <Button
            onClick={() => router.push("/dashboard/forecast")}
            variant="outline"
            className="flex items-center gap-2 justify-center py-6"
          >
            <BarChart3 className="w-5 h-5" />
            {t.view_forecast}
          </Button>
        </div>

        {/* Charts Row */}
        <div className="grid md:grid-cols-2 gap-6">
          
          {/* Revenue Trend Chart */}
          <ChartCard
            title="გაყიდვების ტრენდი"
            subtitle="ბოლო 7 დღე"
          >
            <div className="h-64 flex items-center justify-center text-gray-500">
              [Chart: Revenue trend - integrate recharts or similar]
            </div>
          </ChartCard>

          {/* Margin Stability Chart */}
          <ChartCard
            title="მარჟის სტაბილურობა"
            subtitle="ბოლო 7 დღე"
          >
            <div className="h-64 flex items-center justify-center text-gray-500">
              [Chart: Margin % over time]
            </div>
          </ChartCard>

        </div>

      </div>
    </div>
  );
}
