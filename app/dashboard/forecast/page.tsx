"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/dashboard/SellerWidgets";
import {
  TrendingUp,
  AlertTriangle,
  ArrowLeft,
  Download,
} from "lucide-react";

interface MonthlyForecast {
  month: number;
  gmvProjectionCents: number;
  revenueProjectionCents: number;
  netProfitProjectionCents: number;
  estimatedOrders: number;
  ltvCacRatio: number;
  confidenceScore: number;
}

interface ForecastData {
  forecasts: MonthlyForecast[];
  assumptions: string[];
  risks: string[];
  recommendations: string[];
}

export default function ForecastPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);

  useEffect(() => {
    fetchForecast();
  }, []);

  const fetchForecast = async () => {
    // TODO: Call API
    // const response = await fetch("/api/forecast");
    // const data = await response.json();

    // Mock data
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setForecastData({
      forecasts: [
        {
          month: 1,
          gmvProjectionCents: 200000, // 2000 GEL
          revenueProjectionCents: 10000, // 100 GEL (5%)
          netProfitProjectionCents: 50000, // 500 GEL (25%)
          estimatedOrders: 25,
          ltvCacRatio: 3.2,
          confidenceScore: 0.85,
        },
        {
          month: 3,
          gmvProjectionCents: 650000, // 6500 GEL
          revenueProjectionCents: 32500, // 325 GEL
          netProfitProjectionCents: 162500, // 1625 GEL
          estimatedOrders: 80,
          ltvCacRatio: 3.5,
          confidenceScore: 0.75,
        },
        {
          month: 6,
          gmvProjectionCents: 1400000, // 14000 GEL
          revenueProjectionCents: 70000, // 700 GEL
          netProfitProjectionCents: 350000, // 3500 GEL
          estimatedOrders: 175,
          ltvCacRatio: 3.8,
          confidenceScore: 0.65,
        },
      ],
      assumptions: [
        "თვიური ზრდის ტემპი: 25% (ისტორიული მონაცემებიდან)",
        "საშუალო მარჟა: 25%",
        "LTV/CAC თანაფარდობა: 3.2",
        "ბაზრის გაჯერება: თანდათანობითი შემცირება 6 თვეში",
        "სეზონურობა: არ არის გათვალისწინებული",
      ],
      risks: [
        "⚠️ 6-თვიანი პროგნოზის სანდოობა: 65%",
        "⚠️ ბაზრის გაჯერება შესაძლებელია 6 თვეში",
      ],
      recommendations: [
        "🚀 შენი მეტრიკები კარგია - გაზარდე მარკეტინგის ბიუჯეტი",
        "📦 დაამატე ახალი პროდუქტები 3 თვეში",
        "🔁 გაზარდე შენახვის მაჩვენებელი LTV-ს გასაზრდელად",
      ],
    });

    setLoading(false);
  };

  const t = {
    title: "შემოსავლის პროგნოზი",
    subtitle: "1, 3 და 6 თვიანი პროექციები",
    month_1: "1 თვე",
    month_3: "3 თვე",
    month_6: "6 თვე",
    gmv: "GMV (ბრუტო გაყიდვები)",
    platform_revenue: "პლატფორმის შემოსავალი",
    net_profit: "სუფთა მოგება",
    estimated_orders: "სავარაუდო შეკვეთები",
    confidence: "სანდოობა",
    assumptions: "დაშვებები",
    risks: "რისკები",
    recommendations: "რეკომენდაციები",
    export: "რეპორტის ექსპორტი",
    back: "უკან",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#050510] via-[#0A0E1A] to-[#050510] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xl text-gray-400">პროგნოზის გენერაცია...</p>
        </div>
      </div>
    );
  }

  if (!forecastData) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#050510] via-[#0A0E1A] to-[#050510] px-4 py-12">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
              {t.title}
            </h1>
            <p className="text-gray-400">{t.subtitle}</p>
          </div>
          <Button
            onClick={() => {/* TODO: Export */}}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Download className="w-5 h-5" />
            {t.export}
          </Button>
        </div>

        {/* Forecast Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {forecastData.forecasts.map((forecast) => (
            <div
              key={forecast.month}
              className="bg-gradient-to-br from-gray-900 to-gray-800/50 border-2 border-purple-500/30 rounded-2xl p-6"
            >
              {/* Month Header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">
                  {forecast.month === 1 ? t.month_1 : forecast.month === 3 ? t.month_3 : t.month_6}
                </h3>
                <div className="px-3 py-1 bg-purple-500/20 rounded-full">
                  <p className="text-sm text-purple-300">
                    {(forecast.confidenceScore * 100).toFixed(0)}% {t.confidence}
                  </p>
                </div>
              </div>

              {/* GMV */}
              <div className="mb-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t.gmv}</p>
                <p className="text-3xl font-bold text-white">
                  ₾{(forecast.gmvProjectionCents / 100).toLocaleString()}
                </p>
              </div>

              {/* Net Profit */}
              <div className="mb-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t.net_profit}</p>
                <p className="text-2xl font-bold text-green-400">
                  ₾{(forecast.netProfitProjectionCents / 100).toLocaleString()}
                </p>
              </div>

              {/* Estimated Orders */}
              <div className="mb-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t.estimated_orders}</p>
                <p className="text-xl font-bold text-gray-300">
                  {forecast.estimatedOrders}
                </p>
              </div>

              {/* LTV/CAC */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">LTV/CAC</p>
                <p className="text-xl font-bold text-blue-400">
                  {forecast.ltvCacRatio.toFixed(2)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Assumptions */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          
          {/* Assumptions Card */}
          <ChartCard title={t.assumptions}>
            <ul className="space-y-3">
              {forecastData.assumptions.map((assumption, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="text-blue-400 flex-shrink-0">•</span>
                  <span>{assumption}</span>
                </li>
              ))}
            </ul>
          </ChartCard>

          {/* Risks Card */}
          <ChartCard title={t.risks}>
            <ul className="space-y-3">
              {forecastData.risks.map((risk, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-yellow-300">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </ChartCard>

          {/* Recommendations Card */}
          <ChartCard title={t.recommendations}>
            <ul className="space-y-3">
              {forecastData.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-green-300">
                  <TrendingUp className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </ChartCard>

        </div>

        {/* Growth Chart Placeholder */}
        <ChartCard title="ზრდის დინამიკა" subtitle="GMV პროგნოზი 6 თვეზე">
          <div className="h-80 flex items-center justify-center text-gray-500">
            [Chart: Line chart showing GMV growth over 6 months - integrate recharts]
          </div>
        </ChartCard>

        {/* Back Button */}
        <div className="mt-8">
          <Button
            onClick={() => router.push("/dashboard/seller")}
            variant="outline"
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            {t.back}
          </Button>
        </div>

      </div>
    </div>
  );
}
