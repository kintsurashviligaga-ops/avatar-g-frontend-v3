"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Store, Shield, TrendingUp, CreditCard } from "lucide-react";

export default function SellerActivationPage() {
  const router = useRouter();
  const [activating, setActivating] = useState(true);
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState([
    { id: 1, label: "მაღაზიის შექმნა", status: "pending" },
    { id: 2, label: "Stripe Live ინტეგრაცია", status: "pending" },
    { id: 3, label: "20% margin guard ჩართვა", status: "pending" },
    { id: 4, label: "დღგ მოდულის კონფიგურაცია", status: "pending" },
    { id: 5, label: "პირველი პროდუქტის რეკომენდაცია", status: "pending" },
  ]);

  useEffect(() => {
    activateShop();
  }, []);

  const activateShop = async () => {
    // Load onboarding data
    const stored = sessionStorage.getItem("seller_onboarding");
    if (!stored) {
      router.push("/seller/onboarding");
      return;
    }

    const onboardingData = JSON.parse(stored);

    // Simulate activation steps
    for (let i = 0; i < steps.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      setSteps((prev) =>
        prev.map((step, idx) => ({
          ...step,
          status: idx <= i ? "completed" : "pending",
        }))
      );
      
      setProgress(((i + 1) / steps.length) * 100);
    }

    // Activation complete
    await new Promise((resolve) => setTimeout(resolve, 500));
    setActivating(false);

    // In production: Call API to create seller profile
    // POST /api/seller/activate with onboardingData

    // Clear sessionStorage
    sessionStorage.removeItem("seller_onboarding");
  };

  const t = {
    title: "მაღაზიის აქტივაცია",
    subtitle: "შენი მაღაზია მზადდება...",
    complete_title: "✓ მაღაზია საკმაოდ მზადაა!",
    complete_subtitle: "ყველაფერი კონფიგურირებულია. ახლა შეგიძლია პირველი პროდუქტის დამატება.",
    goto_dashboard: "მთავარ პანელზე გადასვლა",
    status_pending: "მომლოდინე",
    status_completed: "დასრულებული",
    activation_processing: "მაღაზიის შექმნა...",
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05070A] via-[#0A0E1A] to-[#05070A] flex items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full">
        
        {/* Header */}
        <div className="text-center space-y-3 mb-10">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            {activating ? t.title : t.complete_title}
          </h1>
          <p className="text-gray-400">
            {activating ? t.subtitle : t.complete_subtitle}
          </p>
        </div>

        {/* Progress Bar */}
        {activating && (
          <div className="mb-8">
            <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-600 to-purple-600 h-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-center text-sm text-gray-500 mt-2">
              {Math.round(progress)}%
            </p>
          </div>
        )}

        {/* Activation Steps */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800/50 border border-gray-700/50 rounded-2xl p-8 space-y-6 mb-8">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
                step.status === "completed"
                  ? "bg-green-500/20 border-green-500"
                  : "bg-gray-800/50 border-gray-700"
              }`}>
                {step.status === "completed" ? (
                  <Check className="w-6 h-6 text-green-500" />
                ) : (
                  <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
                )}
              </div>
              <div className="flex-1">
                <p className={`font-semibold ${
                  step.status === "completed" ? "text-white" : "text-gray-400"
                }`}>
                  {step.label}
                </p>
                <p className="text-sm text-gray-500">
                  {step.status === "completed" ? t.status_completed : t.status_pending}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Success State */}
        {!activating && (
          <div className="space-y-6">
            
            {/* Feature Icons */}
            <div className="grid grid-cols-4 gap-4">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                  <Store className="w-7 h-7 text-white" />
                </div>
                <p className="text-xs text-gray-400">მაღაზია</p>
              </div>
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-14 h-14 bg-gradient-to-br from-green-600 to-emerald-600 rounded-xl flex items-center justify-center">
                  <Shield className="w-7 h-7 text-white" />
                </div>
                <p className="text-xs text-gray-400">20% Guard</p>
              </div>
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-7 h-7 text-white" />
                </div>
                <p className="text-xs text-gray-400">AI რეკომენდაცია</p>
              </div>
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-14 h-14 bg-gradient-to-br from-yellow-600 to-orange-600 rounded-xl flex items-center justify-center">
                  <CreditCard className="w-7 h-7 text-white" />
                </div>
                <p className="text-xs text-gray-400">Stripe Live</p>
              </div>
            </div>

            {/* CTA Button */}
            <Button
              onClick={() => router.push("/dashboard/seller")}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white py-6 text-lg font-semibold rounded-xl shadow-2xl hover:shadow-green-500/50 transition-all duration-300"
            >
              {t.goto_dashboard}
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
