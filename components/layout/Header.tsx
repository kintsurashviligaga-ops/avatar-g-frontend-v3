"use client";

import Link from "next/link";
import BrandLogo from "@/components/brand/BrandLogo";
import LanguageToggle from "@/components/LanguageToggle";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <header className="sticky top-0 z-40 border-b border-cyan-500/20 bg-[#05070A]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href={isHome ? "/workspace" : "/"} className="flex items-center gap-3">
          <BrandLogo variant="header" />
          <span className="font-bold text-xl bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Avatar G
          </span>
        </Link>
        <LanguageToggle />
      </div>
    </header>
  );
}
