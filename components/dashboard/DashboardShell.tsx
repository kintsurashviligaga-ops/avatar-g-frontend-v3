'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Settings,
  ChevronRight,
  Zap,
  Menu,
  X,
  User,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DASHBOARD_NAV_SECTIONS } from './hyperframe.config';
import MatildaVoiceChat from './MatildaVoiceChat';

// ─── Credits widget ───────────────────────────────────────────────────────────

function CreditsBar({ credits = 4200, total = 10000 }: { credits?: number; total?: number }) {
  const pct = Math.round((credits / total) * 100);
  return (
    <div className="hf-credits-card mx-2 rounded-2xl px-3.5 py-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/55">Credits</span>
        <span className="text-[11px] font-mono text-cyan-100/80">{credits.toLocaleString()}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #22d3ee, #34d399)' }}
        />
      </div>
      <div className="mt-1.5 flex justify-between">
        <span className="text-[10px] text-white/40">{pct}% remaining</span>
        <button className="text-[10px] font-medium text-cyan-300 transition-colors hover:text-cyan-100">Buy more</button>
      </div>
    </div>
  );
}

// ─── Shell ───────────────────────────────────────────────────────────────────

interface DashboardShellProps {
  children: React.ReactNode;
  locale?: string;
}

export default function DashboardShell({ children, locale = 'ka' }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const navItems = DASHBOARD_NAV_SECTIONS.flatMap((section) => section.items);

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  const isActive = (href: string) => {
    const localePath = `/${locale}${href}`;
    if (href === '/dashboard') return pathname === localePath || pathname === `/${locale}/dashboard`;
    return pathname.startsWith(localePath);
  };

  const currentItem = navItems.find((item) => isActive(item.href)) ?? navItems[0];
  const dashboardRoot = `/${locale}/dashboard`;
  const isOmniRoot = pathname === dashboardRoot || pathname === `${dashboardRoot}/`;

  if (isOmniRoot) {
    return (
      <div className="hf-dashboard-shell flex h-[var(--app-screen-height)] min-h-[var(--app-screen-height)] overflow-hidden">
        <main className="hf-main-wrap hf-main-content flex-1 overflow-hidden">
          <div className="h-full w-full">{children}</div>
        </main>
        <MatildaVoiceChat locale={locale} />
      </div>
    );
  }

  return (
    <div className="hf-dashboard-shell flex h-[var(--app-screen-height)] min-h-[var(--app-screen-height)] overflow-hidden">

      {/* ── Mobile backdrop ─────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full z-50 flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ width: 288 }}
      >
        <div className="hf-sidebar absolute inset-0" aria-hidden />

        {/* Logo */}
        <div className="relative z-10 flex h-16 flex-shrink-0 items-center justify-between px-4" style={{ borderBottom: '1px solid rgba(165,243,252,0.14)' }}>
          <Link href={`/${locale}/dashboard`} className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(140deg,#22d3ee,#34d399)' }}>
              <Sparkles className="h-4 w-4 text-slate-950" />
            </div>
            <span className="hf-heading text-sm font-bold text-white" style={{ letterSpacing: '-0.02em' }}>
              MyAvatar<span style={{ color: '#00d4ff' }}>.ge</span>
            </span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="text-white/40 transition-colors hover:text-white lg:hidden">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="relative z-10 flex-1 space-y-5 overflow-y-auto py-4">
          {DASHBOARD_NAV_SECTIONS.map((group) => (
            <div key={group.section}>
              <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/35">{group.section}</p>
              <div className="space-y-0.5 px-2">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.id}
                      href={`/${locale}${item.href}`}
                      className={cn(
                        'hf-sidebar-link group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
                        active ? 'active text-white' : 'text-white/60',
                      )}
                    >
                      {active && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                          style={{ background: item.color }}
                        />
                      )}
                      <Icon
                        className="w-4 h-4 flex-shrink-0 transition-colors"
                        style={{ color: active ? item.color : undefined }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold leading-tight">{item.label}</span>
                        <span className="block truncate text-[10px] font-medium text-white/35">{item.subtitle}</span>
                      </span>
                      {active && <ChevronRight className="w-3 h-3 opacity-40" style={{ color: item.color }} />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Credits */}
        <div className="relative z-10 flex-shrink-0 pb-2">
          <CreditsBar />
        </div>

        {/* User */}
        <div className="relative z-10 flex-shrink-0 px-3 pb-3" style={{ borderTop: '1px solid rgba(165,243,252,0.14)' }}>
          <div className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-all hover:bg-cyan-300/5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full" style={{ background: 'linear-gradient(140deg,#22d3ee,#34d399)' }}>
              <User className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-[12px] font-medium text-white/85">My Account</p>
              <p className="truncate text-[10px] text-cyan-100/40">Pro Plan</p>
            </div>
            <Settings className="h-3.5 w-3.5 flex-shrink-0 text-white/25 transition-colors hover:text-white/60" />
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div
          className="relative z-10 flex h-14 flex-shrink-0 items-center gap-3 px-4 lg:hidden"
          style={{ borderBottom: '1px solid rgba(165,243,252,0.14)', background: 'rgba(5,11,24,0.9)' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white/60 transition-all hover:bg-white/[0.06] hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="hf-heading text-sm font-bold text-white">
            MyAvatar<span style={{ color: '#00d4ff' }}>.ge</span>
          </span>
          <div className="ml-auto flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/10 px-2.5 py-1">
            <Zap className="h-3.5 w-3.5 text-cyan-300" />
            <span className="text-[12px] font-mono text-cyan-100/85">4,200</span>
          </div>
        </div>

        <div className="relative z-10 hidden h-16 items-center border-b border-cyan-100/10 px-6 lg:flex">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-200/40">Hyperframe Control</p>
            <p className="hf-heading mt-0.5 text-sm font-semibold text-white/90">{currentItem?.label ?? 'Dashboard'}</p>
          </div>
          <div className="ml-auto flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1.5">
            <Zap className="h-3.5 w-3.5 text-cyan-300" />
            <span className="text-[12px] font-mono text-cyan-100/90">4,200 credits</span>
          </div>
        </div>

        {/* Page content */}
        <main className="hf-main-wrap hf-main-content flex-1 overflow-y-auto">
          <div className="min-h-full px-3 py-4 sm:px-4 lg:px-6 lg:py-5">{children}</div>
        </main>
      </div>
      <MatildaVoiceChat locale={locale} />
    </div>
  );
}
