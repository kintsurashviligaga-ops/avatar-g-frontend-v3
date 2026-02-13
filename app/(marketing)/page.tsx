import type { Metadata } from "next";
import LandingPageClient from "@/components/landing/LandingPageClient";

export const metadata: Metadata = {
  title: "Avatar G - Cinematic AI Studio",
  description: "Create avatars, video, music, and photography with a premium AI workflow.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Avatar G - Cinematic AI Studio",
    description: "Create avatars, video, music, and photography with a premium AI workflow.",
    url: "/",
  },
  twitter: {
    title: "Avatar G - Cinematic AI Studio",
    description: "Create avatars, video, music, and photography with a premium AI workflow.",
  },
};

export default function MarketingHomePage() {
  return <LandingPageClient />;
}
