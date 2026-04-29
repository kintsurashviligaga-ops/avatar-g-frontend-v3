'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Bot, UserCircle2, ImageIcon, Video, Music2,
  FileText, Workflow, BarChart3, Settings, ChevronRight, Zap,
  Menu, X, LogOut, User, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Nav config ──────────────────────────────────────────────────────────────

const NAV = [
  {
    section: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', color: '#6366f1' },
    ],
  },
  {
    section: 'Create',
    items: [
      { id: 'agent-g',  label: 'Agent G',          icon: Bot,          href: '/dashboard/agent-g', color: '#6366f1' },
      { id: 'avatar',   label: 'Avatar Studio',    icon: UserCircle2,  href: '/dashboard/avatar',  color: '#8b5cf6' },
      { id: 'image',    label: 'Image Generation', icon: ImageIcon,    href: '/dashboard/image',   color: '#f59e0b' },
      { id: 'video',    label: 'Video Generation', icon: Video,        href: '/dashboard/video',   color: '#ef4444' },
      { id: 'music',    label: 'Music Production', icon: Music2,       href: '/dashboard/music',   color: '#10b981' },
      { id: 'copy',     label: 'Text & Copy',      icon: FileText,     href: '/dashboard/copy',    color: '#06b6d4' },
    ],
  },
  {
    section: 'Intelligence',
    items: [
      { id: 'workflows',  label: 'Workflow Builder', icon: Workflow,   href: '/dashboard/workflows',  color: '#84cc16' },
      { id: 'analytics',  label: 'Analytics',        icon: BarChart3,  href: '/dashboard/analytics',  color: '#3b82f6' },
    ],
  },
] as const;

// ─── Credits widget ───────────────────────────────────────────────────────────

function CreditsBar({ credits = 4200, total = 10000 }: { credits?: number; total?: number }) {
  const pct = Math.round((credits / total) * 100);
  return (
    <div className="px-3 py-3 mx-2 rounded-xl" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Credits</span>
        <span className="text-[11px] font-mono text-white/70">{credits.toLocaleString()}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #6366f1, #00d4ff)' }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-white/30">{pct}% remaining</span>
        <button className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors font-medium">Buy more</button>
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

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  const isActive = (href: string) => {
    const localePath = `/${locale}${href}`;
    if (href === '/dashboard') return pathname === localePath || pathname === `/${locale}/dashboard`;
    return pathname.startsWith(localePath);
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#08080e' }}>

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
        style={{ width: 240, background: 'rgba(10,10,18,0.98)', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-14 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <Link href={`/${locale}/dashboard`} className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#6366f1,#00d4ff)' }}>
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm text-white" style={{ fontFamily: 'var(--font-syne, system-ui)', letterSpacing: '-0.02em' }}>
              MyAvatar<span style={{ color: '#00d4ff' }}>.ge</span>
            </span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-white/40 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-5">
          {NAV.map(group => (
            <div key={group.section}>
              <p className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/25">{group.section}</p>
              <div className="space-y-0.5 px-2">
                {group.items.map(item => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.id}
                      href={`/${locale}${item.href}`}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all group relative',
                        active ? 'text-white' : 'text-white/50 hover:text-white/85 hover:bg-white/[0.04]',
                      )}
                      style={active ? {
                        background: `${item.color}14`,
                        border: `1px solid ${item.color}30`,
                        color: '#fff',
                      } : {}}
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
                      <span className="flex-1 font-medium text-[13px]">{item.label}</span>
                      {active && <ChevronRight className="w-3 h-3 opacity-40" style={{ color: item.color }} />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Credits */}
        <div className="flex-shrink-0 pb-2">
          <CreditsBar />
        </div>

        {/* User */}
        <div className="flex-shrink-0 px-3 pb-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-all cursor-pointer mt-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              <User className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-white/80 truncate">My Account</p>
              <p className="text-[10px] text-white/35 truncate">Pro Plan</p>
            </div>
            <Settings className="w-3.5 h-3.5 text-white/25 hover:text-white/60 transition-colors flex-shrink-0" />
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div
          className="flex items-center gap-3 px-4 h-14 flex-shrink-0 lg:hidden"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(8,8,14,0.98)' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.06] transition-all"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-sm text-white" style={{ fontFamily: 'var(--font-syne, system-ui)' }}>
            MyAvatar<span style={{ color: '#00d4ff' }}>.ge</span>
          </span>
          <div className="flex items-center gap-1 ml-auto">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[12px] font-mono text-white/60">4,200</span>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
