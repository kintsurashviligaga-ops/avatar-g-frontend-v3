"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, AlertTriangle, TrendingUp, DollarSign, Shield } from "lucide-react";

interface SimulationResult {
  retailPriceCents: number;
  supplierCostCents: number;
  platformFeeCents: number;
  vatCents: number;
  netProfitCents: number;
  marginBps: number;
  marginPercent: number;
  breakEvenUnits: number;
  riskScore: number;
  isViable: boolean;
}

interface OnboardingData {
  budgetCents: number;
  taxStatus: 'vat_payer' | 'non_vat_payer';
  businessType: 'dropshipping' | 'digital' | 'own_product';
}

export default function SellerSimulationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [formData, setFormData] = useState<OnboardingData | null>(null);

  useEffect(() => {
    // Load onboarding data from sessionStorage
    const stored = sessionStorage.getItem("seller_onboarding");
    if (!stored) {
      router.push("/seller/onboarding");
      return;
    }

    const parsed = JSON.parse(stored) as Partial<OnboardingData>;
    const data: OnboardingData = {
      budgetCents: typeof parsed.budgetCents === 'number' ? parsed.budgetCents : 0,
      taxStatus: parsed.taxStatus === 'vat_payer' ? 'vat_payer' : 'non_vat_payer',
      businessType:
        parsed.businessType === 'dropshipping' ||
        parsed.businessType === 'digital' ||
        parsed.businessType === 'own_product'
          ? parsed.businessType
          : 'own_product',
    };
    setFormData(data);

    // Simulate AI calculation (in production, call API)
    simulateMargin(data);
  }, [router]);

  const simulateMargin = async (data: OnboardingData) => {
    setLoading(true);
    
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Example calculation (in production, use /lib/finance/margin.ts)
    const supplierCostCents = Math.round(data.budgetCents * 0.4); // 40% of budget
    const shippingCostCents = Math.round(supplierCostCents * 0.15); // 15% of supplier cost
    const platformFeeBps = 500; // 5%
    const vatBps = data.taxStatus === "vat_payer" ? 1800 : 0; // 18% VAT

    // Calculate retail price for 25% margin
    const costBase = supplierCostCents + shippingCostCents;
    const targetMarginBps = 2500; // 25%
    
    // retailPrice = cost / (1 - margin - platformFee - vat)
    const totalDeductionBps = targetMarginBps + platformFeeBps + vatBps;
    const retailPriceCents = Math.round((costBase * 10000) / (10000 - totalDeductionBps));

    const platformFeeCents = Math.round((retailPriceCents * platformFeeBps) / 10000);
    const vatCents = Math.round((retailPriceCents * vatBps) / 10000);
    const netProfitCents = retailPriceCents - costBase - platformFeeCents - vatCents;
    const marginBps = Math.round((netProfitCents * 10000) / retailPriceCents);
    const marginPercent = marginBps / 100;

    // Break-even calculation
    const fixedCostsEstimate = 5000; // 50 GEL fixed costs
    const breakEvenUnits = Math.ceil(fixedCostsEstimate / (netProfitCents || 1));

    // Risk score (0-100, higher = riskier)
    let riskScore = 0;
    if (marginBps < 2000) riskScore += 50; // Below 20% margin
    if (data.businessType === "dropshipping") riskScore += 20; // Dropshipping is riskier
    if (data.taxStatus === "vat_payer") riskScore += 10; // VAT complexity
    if (breakEvenUnits > 100) riskScore += 20; // High break-even

    const isViable = marginBps >= 2000; // 20% minimum

    setSimulation({
      retailPriceCents,
      supplierCostCents: costBase,
      platformFeeCents,
      vatCents,
      netProfitCents,
      marginBps,
      marginPercent,
      breakEvenUnits,
      riskScore,
      isViable,
    });

    setLoading(false);
  };

  const t = {
    title: "შენი მოგების სიმულაცია",
    subtitle: "AI-თი გამოთვლილი რეალური მოგება და რისკები",
    calculating: "მოგების გამოთვლა...",
    retail_price: "საცალო ფასი",
    supplier_cost: "მიმწოდებლის ღირებულება",
    platform_fee: "პლატფორმის საკომისიო (5%)",
    vat: "დღგ (18%)",
    net_profit: "სუფთა მოგება",
    margin: "მოგების მარჟა",
    breakeven: "Break-even (ერთეული)",
    risk_score: "რისკის ქულა",
    margin_warning: "⚠️ მარჟა ძალიან დაბალია!",
    margin_block: "მარჟა უნდა იყოს მინიმუმ 20%. უკან დაბრუნდი და შეცვალე პარამეტრები.",
    margin_good: "✓ მარჟა კარგია!",
    margin_desc: "შენი მოგება დაცულია 20%-ზე მაღალი მარჟით.",
    back: "უკან",
    activate: "ააქტიურე მაღაზია",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#05070A] via-[#0A0E1A] to-[#05070A] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xl text-gray-400">{t.calculating}</p>
        </div>
      </div>
    );
  }

  if (!simulation) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05070A] via-[#0A0E1A] to-[#05070A] flex items-center justify-center px-4 py-12">
      <div className="max-w-4xl w-full">
        
        {/* Header */}
        <div className="text-center space-y-3 mb-10">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            {t.title}
          </h1>
          <p className="text-gray-400">{t.subtitle}</p>
        </div>

        {/* Margin Status Alert */}
        <div className={`mb-6 p-6 rounded-2xl border-2 ${
          simulation.isViable
            ? "bg-green-500/10 border-green-500/50"
            : "bg-red-500/10 border-red-500/50"
        }`}>
          <div className="flex items-start gap-4">
            {simulation.isViable ? (
              <Shield className="w-8 h-8 text-green-500 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-red-500 flex-shrink-0" />
            )}
            <div>
              <h3 className={`text-xl font-bold mb-2 ${
                simulation.isViable ? "text-green-400" : "text-red-400"
              }`}>
                {simulation.isViable ? t.margin_good : t.margin_warning}
              </h3>
              <p className={simulation.isViable ? "text-green-200" : "text-red-200"}>
                {simulation.isViable ? t.margin_desc : t.margin_block}
              </p>
            </div>
          </div>
        </div>

        {/* Simulation Results Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          
          {/* Retail Price */}
          <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/10 border border-blue-500/30 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="w-5 h-5 text-blue-400" />
              <p className="text-sm text-gray-400 uppercase tracking-wide">{t.retail_price}</p>
            </div>
            <p className="text-3xl font-bold text-white">
              ₾{(simulation.retailPriceCents / 100).toFixed(2)}
            </p>
          </div>

          {/* Supplier Cost */}
          <div className="bg-gradient-to-br from-gray-900 to-gray-800/50 border border-gray-700/50 rounded-2xl p-6">
            <p className="text-sm text-gray-400 uppercase tracking-wide mb-2">{t.supplier_cost}</p>
            <p className="text-3xl font-bold text-white">
              ₾{(simulation.supplierCostCents / 100).toFixed(2)}
            </p>
          </div>

          {/* Platform Fee */}
          <div className="bg-gradient-to-br from-gray-900 to-gray-800/50 border border-gray-700/50 rounded-2xl p-6">
            <p className="text-sm text-gray-400 uppercase tracking-wide mb-2">{t.platform_fee}</p>
            <p className="text-3xl font-bold text-white">
              ₾{(simulation.platformFeeCents / 100).toFixed(2)}
            </p>
          </div>

          {/* VAT */}
          {formData?.taxStatus === "vat_payer" && (
            <div className="bg-gradient-to-br from-gray-900 to-gray-800/50 border border-gray-700/50 rounded-2xl p-6">
              <p className="text-sm text-gray-400 uppercase tracking-wide mb-2">{t.vat}</p>
              <p className="text-3xl font-bold text-white">
                ₾{(simulation.vatCents / 100).toFixed(2)}
              </p>
            </div>
          )}

          {/* Net Profit */}
          <div className={`bg-gradient-to-br rounded-2xl p-6 border-2 ${
            simulation.isViable
              ? "from-green-900/30 to-green-800/10 border-green-500/50"
              : "from-red-900/30 to-red-800/10 border-red-500/50"
          }`}>
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className={`w-5 h-5 ${simulation.isViable ? "text-green-400" : "text-red-400"}`} />
              <p className="text-sm text-gray-400 uppercase tracking-wide">{t.net_profit}</p>
            </div>
            <p className={`text-3xl font-bold ${simulation.isViable ? "text-green-400" : "text-red-400"}`}>
              ₾{(simulation.netProfitCents / 100).toFixed(2)}
            </p>
          </div>

          {/* Margin */}
          <div className={`bg-gradient-to-br rounded-2xl p-6 border-2 ${
            simulation.isViable
              ? "from-green-900/30 to-green-800/10 border-green-500/50"
              : "from-red-900/30 to-red-800/10 border-red-500/50"
          }`}>
            <p className="text-sm text-gray-400 uppercase tracking-wide mb-2">{t.margin}</p>
            <p className={`text-3xl font-bold ${simulation.isViable ? "text-green-400" : "text-red-400"}`}>
              {simulation.marginPercent.toFixed(1)}%
            </p>
          </div>

          {/* Break-even */}
          <div className="bg-gradient-to-br from-gray-900 to-gray-800/50 border border-gray-700/50 rounded-2xl p-6">
            <p className="text-sm text-gray-400 uppercase tracking-wide mb-2">{t.breakeven}</p>
            <p className="text-3xl font-bold text-white">{simulation.breakEvenUnits}</p>
          </div>

          {/* Risk Score */}
          <div className="bg-gradient-to-br from-gray-900 to-gray-800/50 border border-gray-700/50 rounded-2xl p-6">
            <p className="text-sm text-gray-400 uppercase tracking-wide mb-2">{t.risk_score}</p>
            <p className="text-3xl font-bold text-white">{simulation.riskScore}/100</p>
          </div>

        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            onClick={() => router.push("/seller/onboarding")}
            variant="outline"
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            {t.back}
          </Button>
          <Button
            onClick={() => {
              if (simulation.isViable) {
                router.push("/seller/activation");
              }
            }}
            disabled={!simulation.isViable}
            className={`flex items-center gap-2 ${
              simulation.isViable
                ? "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500"
                : "bg-gray-700 cursor-not-allowed opacity-50"
            }`}
          >
            {t.activate}
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>

      </div>
    </div>
  );
}
