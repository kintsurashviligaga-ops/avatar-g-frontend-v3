"use client";

import Image from "next/image";

interface BrandLogoProps {
  variant?: "header" | "hero" | "watermark";
  className?: string;
}

export default function BrandLogo({ variant = "header", className = "" }: BrandLogoProps) {
  const sizes = {
    header: "w-10 h-10",
    hero: "w-20 h-20",
    watermark: "w-16 h-16 opacity-20",
  };

  return (
    <div className={"relative " + sizes[variant] + " " + className}>
      <Image
        src="/logo.jpg"
        alt="Avatar G"
        fill
        className="object-contain"
        priority={variant === "hero"}
      />
    </div>
  );
}
