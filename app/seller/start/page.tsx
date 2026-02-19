"use client";

import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingUp, Shield, BarChart3 } from "lucide-react";

export default function SellerStartPage() {
  const router = useRouter();
  const { language: _language } = useLanguage();

  // Load Georgian translations (ka is default)
  const t = {
    headline: "არ გაყიდო არამომგებიანი პროდუქტი",
    subheadline: "AI-თი გაანალიზე რეალური მოგება, დღგ და რისკები - დაიწყე ახლა.",
    cta: "დაიწყე მოგების სიმულაცია",
    features: [
      {
        icon: TrendingUp,
        title: "რეალური მოგების გამოთვლა",
        desc: "AI-თი ავტომატური მარჟის, დღგ-ის და ხარჯების ანალიზი"
      },
      {
        icon: Shield,
        title: "20% მინიმალური მარჟა",
        desc: "ავტომატური დაცვა ზარალისგან - არ გაშვებ პროდუქტს 20%-ზე დაბალი მარჟით"
      },
      {
        icon: BarChart3,
        title: "6 თვიანი პროგნოზი",
        desc: "შემოსავლის, მოგებისა და რისკების AI-პროგნოზირება"
      }
    ]
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05070A] via-[#0A0E1A] to-[#05070A] flex items-center justify-center px-4 py-12">
      <div className="max-w-4xl w-full">
        
        {/* Hero Section */}
        <div className="text-center space-y-6 mb-12">
          <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent leading-tight">
            {t.headline}
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 max-w-2xl mx-auto">
            {t.subheadline}
          </p>
          
          <Button 
            onClick={() => router.push("/seller/onboarding")}
            className="mt-8 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-12 py-6 text-lg font-semibold rounded-xl shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 flex items-center gap-3 mx-auto"
          >
            {t.cta}
            <ArrowRight className="w-6 h-6" />
          </Button>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mt-16">
          {t.features.map((feature, idx) => (
            <div 
              key={idx}
              className="bg-gradient-to-br from-gray-900 to-gray-800/50 border border-gray-700/50 rounded-2xl p-6 hover:border-purple-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/20"
            >
              <div className="bg-gradient-to-br from-blue-600 to-purple-600 w-12 h-12 rounded-xl flex items-center justify-center mb-4">
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
              <p className="text-gray-400">{feature.desc}</p>
            </div>
          ))}
        </div>

        {/* Trust Signals */}
        <div className="mt-16 text-center">
          <div className="flex items-center justify-center gap-8 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-500" />
              <span>Stripe Live Mode</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-500" />
              <span>18% დღგ ავტომატური</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-500" />
              <span>Integer Cents ხარისხი</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
