import type { Metadata } from "next";
import PricingPageClient from "@/components/pricing/PricingPageClient";

export const metadata: Metadata = {
  title: "Pricing - Avatar G",
  description: "Choose a plan for Avatar G. Free, Basic, or Premium.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "Pricing - Avatar G",
    description: "Choose a plan for Avatar G. Free, Basic, or Premium.",
    url: "/pricing",
  },
  twitter: {
    title: "Pricing - Avatar G",
    description: "Choose a plan for Avatar G. Free, Basic, or Premium.",
  },
};

export default function MarketingPricingPage() {
  return <PricingPageClient />;
}
