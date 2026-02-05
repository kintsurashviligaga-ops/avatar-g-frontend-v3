import { Metadata } from "next";
import ServicePageClient from "./ServicePageClient";

// Static params for export
export function generateStaticParams() {
  return [
    { id: "text-intelligence" },
    { id: "image-generator" },
    { id: "video-lab" },
    { id: "voice-studio" },
    { id: "code-assistant" },
    { id: "data-analyst" },
  ];
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  return {
    title: `Avatar G - ${params.id.replace(/-/g, " ")}`,
  };
}

export default function ServicePage({ params }: { params: { id: string } }) {
  return <ServicePageClient id={params.id} />;
}
