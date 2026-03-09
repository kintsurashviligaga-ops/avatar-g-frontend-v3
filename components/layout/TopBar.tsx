"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Globe, LogOut, Cpu, LayoutGrid, Briefcase, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

type TopBarProps = {
  userEmail: string;
  onLogout: () => void;
  isLoggingOut?: boolean;
};

export function TopBar({ userEmail, onLogout, isLoggingOut }: TopBarProps) {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);

  return (
    <header className="glass-nav sticky top-0 z-50 px-4 py-0 md:px-6">
      {/* Neon top edge */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3">
        {/* Left: Logo + user */}
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-[0_0_16px_rgba(34,211,238,0.5)]">
                <Cpu className="w-4 h-4 text-white" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-[#030710] shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            </div>
            <span className="hidden sm:block text-sm font-bold text-white tracking-tight">Avatar <span className="text-gradient-cyan">G</span></span>
          </div>

          <div className="hidden md:block w-px h-4 bg-white/10" />

          <div className="hidden md:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Workspace</p>
            <p className="max-w-[220px] truncate text-xs font-medium text-white/60">{userEmail}</p>
          </div>
        </div>

        {/* Center nav links */}
        <nav className="hidden lg:flex items-center gap-1">
          {[
            { href: withLocalePath('/workspace', locale), label: 'Dashboard', icon: LayoutGrid },
            { href: '/jobs', label: 'Jobs', icon: Briefcase },
          ].map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  active
                    ? 'bg-white/10 text-white border border-white/12'
                    : 'text-white/45 hover:text-white/80 hover:bg-white/[0.05]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/45 hover:text-white/70 hover:bg-white/[0.07] transition-all"
            title="Language switcher"
          >
            <Globe className="h-3.5 w-3.5" />
            <span>EN/KA</span>
          </button>

          <button
            onClick={onLogout}
            disabled={isLoggingOut}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 py-1.5 text-[11px] font-semibold text-white/45 hover:text-white/80 hover:border-white/20 hover:bg-white/[0.07] disabled:opacity-40 transition-all"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{isLoggingOut ? '…' : 'Sign out'}</span>
          </button>
        </div>
      </div>

      {/* Bottom neon line */}
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
    </header>
  );
}