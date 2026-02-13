import type { Metadata } from "next";
import { publicEnv } from "@/lib/env/public";

const metadataBaseUrl = publicEnv.NEXT_PUBLIC_APP_URL || "https://avatar-g-frontend-v3.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  title: {
    default: "Avatar G - Premium AI Studio",
    template: "%s - Avatar G",
  },
  description: "Cinematic AI studio for avatars, video, music, and voice.",
  alternates: {
    canonical: metadataBaseUrl,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: metadataBaseUrl,
    siteName: "Avatar G",
    images: [{
      url: "/og-image.png",
      width: 1200,
      height: 630,
      alt: "Avatar G - Premium AI Studio",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Avatar G - Premium AI Studio",
    description: "Cinematic AI studio for avatars, video, music, and voice.",
    images: ["/og-image.png"],
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
