"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { z } from "zod";

// Validation schema
const onboardingSchema = z.object({
  taxStatus: z.enum(["vat_payer", "non_vat_payer"]),
  businessType: z.enum(["dropshipping", "own_product", "digital"]),
  targetIncomeCents: z.number().min(10000), // Min 100 GEL
  budgetCents: z.number().min(5000), // Min 50 GEL
});

type OnboardingFormData = z.infer<typeof onboardingSchema>;

export default function SellerOnboardingPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<OnboardingFormData>({
    taxStatus: "non_vat_payer",
    businessType: "dropshipping",
    targetIncomeCents: 100000, // 1000 GEL
    budgetCents: 50000, // 500 GEL
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Georgian translations
  const t = {
    title: "ბიზნესის პროფილი",
    subtitle: "მოგვიყევი შენი ბიზნესის დეტალები რეალური მოგების გამოსათვლელად",
    vat_payer: "ვარ დღგ გადამხდელი (18%)",
    non_vat: "არ ვარ დღგ გადამხდელი",
    business_type: "ბიზნესის ტიპი",
    business_dropshipping: "Dropshipping / იმპორტი",
    business_own: "საკუთარი პროდუქტი",
    business_digital: "ციფრული პროდუქტი",
    target_income: "სამიზნე თვიური შემოსავალი (₾)",
    budget: "საწყისი ბიუჯეტი (₾)",
    back: "უკან",
    continue: "გაგრძელება",
  };

  const handleSubmit = () => {
    try {
      onboardingSchema.parse(formData);
      setErrors({});
      
      // Store in sessionStorage for simulation page
      sessionStorage.setItem("seller_onboarding", JSON.stringify(formData));
      
      router.push("/seller/simulation");
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMap: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            errorMap[err.path[0].toString()] = err.message;
          }
        });
        setErrors(errorMap);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05070A] via-[#0A0E1A] to-[#05070A] flex items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full">
        
        {/* Header */}
        <div className="text-center space-y-3 mb-10">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            {t.title}
          </h1>
          <p className="text-gray-400">{t.subtitle}</p>
        </div>

        {/* Form Card */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800/50 border border-gray-700/50 rounded-2xl p-8 space-y-8">
          
          {/* VAT Status */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-300 uppercase tracking-wide">
              დღგ სტატუსი
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setFormData({...formData, taxStatus: "vat_payer"})}
                className={`p-4 rounded-xl border-2 transition-all ${
                  formData.taxStatus === "vat_payer"
                    ? "border-purple-500 bg-purple-500/10 text-white"
                    : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
                }`}
              >
                {t.vat_payer}
              </button>
              <button
                onClick={() => setFormData({...formData, taxStatus: "non_vat_payer"})}
                className={`p-4 rounded-xl border-2 transition-all ${
                  formData.taxStatus === "non_vat_payer"
                    ? "border-purple-500 bg-purple-500/10 text-white"
                    : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
                }`}
              >
                {t.non_vat}
              </button>
            </div>
          </div>

          {/* Business Type */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-300 uppercase tracking-wide">
              {t.business_type}
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: "dropshipping", label: t.business_dropshipping },
                { value: "own_product", label: t.business_own },
                { value: "digital", label: t.business_digital },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFormData({...formData, businessType: option.value as 'dropshipping' | 'own_product' | 'digital'})}
                  className={`p-3 rounded-xl border-2 transition-all text-sm ${
                    formData.businessType === option.value
                      ? "border-purple-500 bg-purple-500/10 text-white"
                      : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Target Income */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-300 uppercase tracking-wide">
              {t.target_income}
            </label>
            <input
              type="number"
              value={formData.targetIncomeCents / 100}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  targetIncomeCents: Math.round(Number(e.target.value) * 100),
                })
              }
              className="w-full bg-gray-800/50 border-2 border-gray-700 rounded-xl px-4 py-3 text-white focus:border-purple-500 focus:outline-none transition-all"
              placeholder="1000"
            />
            {errors.targetIncomeCents && (
              <p className="text-red-500 text-sm">{errors.targetIncomeCents}</p>
            )}
          </div>

          {/* Budget */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-300 uppercase tracking-wide">
              {t.budget}
            </label>
            <input
              type="number"
              value={formData.budgetCents / 100}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  budgetCents: Math.round(Number(e.target.value) * 100),
                })
              }
              className="w-full bg-gray-800/50 border-2 border-gray-700 rounded-xl px-4 py-3 text-white focus:border-purple-500 focus:outline-none transition-all"
              placeholder="500"
            />
            {errors.budgetCents && (
              <p className="text-red-500 text-sm">{errors.budgetCents}</p>
            )}
          </div>

        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <Button
            onClick={() => router.push("/seller/start")}
            variant="outline"
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            {t.back}
          </Button>
          <Button
            onClick={handleSubmit}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 flex items-center gap-2"
          >
            {t.continue}
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>

      </div>
    </div>
  );
}
