"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Sparkles, LayoutDashboard, Menu, X, Cpu,
} from "lucide-react";
import { useState } from "react";
import { useIdentity } from "@/lib/identity/IdentityContext";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { SERVICE_REGISTRY } from "@/lib/service-registry";

export default function Navigation() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { globalAvatarId, verifyIdentity } = useIdentity();
  const { language, setLanguage, t } = useLanguage();

  const hasIdentity = verifyIdentity();

  const coreNavItems = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/dashboard", label: t("nav.workspace"), icon: LayoutDashboard },
    { href: "/services", label: "Services", icon: Sparkles },
  ];

  const serviceNavItems = SERVICE_REGISTRY
    .filter((service) => service.enabled)
    .map((service) => ({ href: service.route, label: service.name, icon: Sparkles }));

  const navItems = [...coreNavItems, ...serviceNavItems];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

      <div className="glass-nav relative">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">

            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="relative">
                <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-[0_0_20px_rgba(34,211,238,0.55)] group-hover:shadow-[0_0_32px_rgba(34,211,238,0.75)] transition-shadow duration-300">
                  <Cpu className="w-4 h-4 text-white" />
                </div>
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#030710] shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              </div>
              <span className="font-black text-lg tracking-[-0.03em]">
                <span className="text-white">Avatar</span>{" "}
                <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">G</span>
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-0.5 overflow-x-auto max-w-[58vw] hide-scrollbar">
              {navItems.slice(0, 6).map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? "text-white bg-white/[0.08] border border-white/[0.11] shadow-[0_0_16px_rgba(34,211,238,0.08)]"
                        : "text-white/45 hover:text-white/80 hover:bg-white/[0.05]"
                    }`}
                  >
                    <item.icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="activeNav"
                        className="absolute inset-0 rounded-xl -z-10"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>

            <div className="hidden md:flex items-center gap-2.5">
              {hasIdentity ? (
                <div className="flex items-center gap-2 px-3 py-1.5 border border-cyan-400/25 bg-cyan-400/[0.07] rounded-xl backdrop-blur shadow-[0_0_16px_rgba(34,211,238,0.10)]">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
                  </span>
                  <span className="text-[11px] text-cyan-200 font-mono font-semibold tracking-wide">
                    {globalAvatarId?.slice(0, 8)}...
                  </span>
                </div>
              ) : (
                <Link
                  href="/services/avatar-builder"
                  className="ag-btn-primary px-4 py-2 text-sm rounded-xl"
                >
                  {t("nav.createIdentity")}
                </Link>
              )}

              <div className="flex items-center rounded-xl border border-white/[0.09] bg-white/[0.04] px-2.5 py-1.5 backdrop-blur">
                <select
                  value={language}
                  onChange={(e) =>
                    setLanguage(e.target.value as "ka" | "en" | "ru")
                  }
                  className="bg-transparent text-[11px] text-white/60 font-semibold tracking-wide focus:outline-none cursor-pointer hover:text-white transition-colors appearance-none"
                  aria-label={t("nav.language")}
                >
                  <option value="ka">KA</option>
                  <option value="en">EN</option>
                  <option value="ru">RU</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-xl border border-white/[0.09] bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/[0.08] transition-all"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="md:hidden border-b border-white/[0.08] bg-[rgba(3,7,16,0.97)] backdrop-blur-2xl"
          >
            <div className="px-4 py-4 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    pathname === item.href
                      ? "bg-white/[0.08] text-white border border-white/[0.10]"
                      : "text-white/45 hover:bg-white/[0.05] hover:text-white/80"
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </Link>
              ))}

              <div className="pt-3 border-t border-white/[0.07]">
                <select
                  value={language}
                  onChange={(e) =>
                    setLanguage(e.target.value as "ka" | "en" | "ru")
                  }
                  className="w-full rounded-xl border border-white/[0.10] bg-white/[0.05] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-400/30"
                >
                  <option value="ka">KA</option>
                  <option value="en">EN</option>
                  <option value="ru">RU</option>
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
