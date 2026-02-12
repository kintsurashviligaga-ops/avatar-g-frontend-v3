"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { 
  Home, 
  User, 
  Film,
  Camera,
  Music,
  LayoutDashboard, 
  Menu,
  X
} from "lucide-react";
import { useState } from "react";
import { useIdentity } from "@/lib/identity/IdentityContext";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function Navigation() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { globalAvatarId, verifyIdentity } = useIdentity();
  const { language, setLanguage, t } = useLanguage();
  
  const hasIdentity = verifyIdentity();

  const navItems = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/dashboard", label: t("nav.workspace"), icon: LayoutDashboard },
    { href: "/services/avatar-builder", label: t("nav.avatar"), icon: User },
    { href: "/services/media-production", label: t("nav.video"), icon: Film },
    { href: "/services/photo-studio", label: t("nav.images"), icon: Camera },
    { href: "/services/music-studio", label: t("nav.music"), icon: Music },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0A0A0A]/80 backdrop-blur-md border-b border-white/10">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 flex items-center justify-center">
              <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
                {/* Rocket Body */}
                <path d="M100 20 L110 40 L90 40 Z" fill="#D4AF37" stroke="#00FFFF" strokeWidth="2"/>
                {/* Main Body */}
                <rect x="85" y="35" width="30" height="70" fill="#00FFFF" stroke="#D4AF37" strokeWidth="2" rx="3"/>
                {/* Window */}
                <circle cx="100" cy="55" r="6" fill="#0A0A0A" stroke="#D4AF37" strokeWidth="1.5"/>
                {/* Left Fin */}
                <path d="M85 80 L70 95 L85 85 Z" fill="#D4AF37" stroke="#00FFFF" strokeWidth="1.5"/>
                {/* Right Fin */}
                <path d="M115 80 L130 95 L115 85 Z" fill="#D4AF37" stroke="#00FFFF" strokeWidth="1.5"/>
                {/* Engine Base */}
                <rect x="90" y="95" width="20" height="15" fill="#FF6B6B" stroke="#FFA500" strokeWidth="1"/>
              </svg>
            </div>
            <span className="font-bold text-xl bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] bg-clip-text text-transparent">
              Avatar G
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative px-4 py-2 rounded-lg transition-colors ${
                    isActive ? "text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="activeNav"
                      className="absolute inset-0 bg-white/10 rounded-lg -z-10"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Identity Badge */}
          <div className="hidden md:flex items-center gap-3">
            {hasIdentity ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#00FFFF]/10 border border-[#00FFFF]/30 rounded-full">
                <div className="w-2 h-2 rounded-full bg-[#00FFFF] animate-pulse" />
                <span className="text-xs text-[#00FFFF] font-mono">
                  {globalAvatarId?.slice(0, 8)}...
                </span>
              </div>
            ) : (
              <Link
                href="/services/avatar-builder"
                className="px-4 py-2 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] text-black text-sm font-semibold rounded-lg"
              >
                {t("nav.createIdentity")}
              </Link>
            )}

            <div className="flex items-center rounded-lg border border-white/10 bg-white/5 px-2 py-1">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as "ka" | "en" | "ru")}
                className="bg-transparent text-xs text-white focus:outline-none"
                aria-label={t("nav.language")}
              >
                <option value="ka">KA</option>
                <option value="en">EN</option>
                <option value="ru">RU</option>
              </select>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-gray-400 hover:text-white"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <motion.div
        initial={false}
        animate={{ height: isMobileMenuOpen ? "auto" : 0, opacity: isMobileMenuOpen ? 1 : 0 }}
        className="md:hidden overflow-hidden bg-[#0A0A0A] border-b border-white/10"
      >
        <div className="px-4 py-4 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg ${
                pathname === item.href ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}

          <div className="px-4 pt-2">
            <label className="text-xs text-gray-500">{t("nav.language")}</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "ka" | "en" | "ru")}
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="ka">KA</option>
              <option value="en">EN</option>
              <option value="ru">RU</option>
            </select>
          </div>
        </div>
      </motion.div>
    </nav>
  );
}
