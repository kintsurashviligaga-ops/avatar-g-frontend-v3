"use client";

import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import SpaceBackground from "@/components/SpaceBackground";

const plans = [
  { name: "უფასო", price: "0", description: "დაიწყე უფასოდ", features: ["100 მესიჯი/თვე", "10 სურათის გენერაცია", "ძირითადი მოდელები"], gradient: "from-gray-500 to-gray-600", popular: false },
  { name: "პრო", price: "29", description: "პროფესიონალებისთვის", features: ["ულიმიტო მესიჯები", "500 სურათი/თვე", "ყველა პრემიუმ მოდელი", "API წვდომა"], gradient: "from-cyan-500 to-blue-600", popular: true },
  { name: "ბიზნესი", price: "99", description: "გუნდებისთვის", features: ["ყველაფერი პრო-დან", "ულიმიტო სურათები", "5 გუნდის წევრი", "Custom მოდელები"], gradient: "from-purple-500 to-pink-600", popular: false },
];

export default function PricingPage() {
  return (
    <main className="relative min-h-screen">
      <SpaceBackground />
      <section className="pt-32 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
            <h1 className="text-5xl font-bold text-white mb-4">აირჩიე შენი <span className="text-cyan-400">პლანი</span></h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">დაიწყე უფასოდ და განაახლე როცა მოგწონს</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((plan, index) => (
              <motion.div key={plan.name} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }} className={`relative p-8 rounded-2xl ${plan.popular ? "bg-gradient-to-b from-cyan-500/20 to-blue-500/20 border-2 border-cyan-500/50" : "bg-white/5 border border-white/10"} backdrop-blur-sm`}>
                {plan.popular && <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-medium rounded-full flex items-center gap-1"><Sparkles className="w-4 h-4" />პოპულარული</div>}
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                  <p className="text-gray-400 text-sm mb-4">{plan.description}</p>
                  <div className="flex items-baseline justify-center gap-1"><span className="text-5xl font-bold text-white">₾{plan.price}</span><span className="text-gray-400">/თვე</span></div>
                </div>
                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full bg-gradient-to-r ${plan.gradient} flex items-center justify-center flex-shrink-0`}><Check className="w-3 h-3 text-white" /></div>
                      <span className="text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className={`w-full py-3 rounded-xl font-medium transition-all ${plan.popular ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/25" : "bg-white/10 text-white hover:bg-white/20"}`}>აირჩიე {plan.name}</motion.button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
