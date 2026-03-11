"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Globe, LogOut, Cpu, LayoutGrid, Briefcase } from 'lucide-react';
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
      {/* Top edge accent */}
      <div className="absolute top-0 inset-x-0 h-px" style={{ background: 'linear-gradient(to right, transparent, var(--color-accent-soft), transparent)' }} />

      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3">
        {/* Left: Logo + user */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg">
                <Cpu className="w-4 h-4 text-white" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border shadow-sm" style={{ borderColor: 'var(--color-bg)' }} />
            </div>
            <span className="hidden sm:block text-sm font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
              Avatar <span style={{ color: 'var(--color-accent)' }}>G</span>
            </span>
          </div>

          <div className="hidden md:block w-px h-4" style={{ backgroundColor: 'var(--color-border)' }} />

          <div className="hidden md:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-tertiary)' }}>Workspace</p>
            <p className="max-w-[220px] truncate text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{userEmail}</p>
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
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200"
                style={active ? {
                  backgroundColor: 'var(--card-hover)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                } : {
                  color: 'var(--color-text-secondary)',
                  border: '1px solid transparent',
                }}
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
            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-all"
            style={{
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--card-bg)',
              color: 'var(--color-text-secondary)',
            }}
            title="Language switcher"
          >
            <Globe className="h-3.5 w-3.5" />
            <span>EN/KA</span>
          </button>

          <button
            onClick={onLogout}
            disabled={isLoggingOut}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40 transition-all"
            style={{
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--card-bg)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{isLoggingOut ? '…' : 'Sign out'}</span>
          </button>
        </div>
      </div>

      {/* Bottom accent line */}
      <div className="absolute bottom-0 inset-x-0 h-px" style={{ background: 'linear-gradient(to right, transparent, var(--color-accent-soft), transparent)' }} />
    </header>
  );
}