"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Briefcase, Library, Wallet, ShieldCheck, Cpu, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SERVICE_REGISTRY } from '@/lib/service-registry';

const coreItems = [
  { href: '/workspace', label: 'Dashboard', icon: LayoutGrid, color: 'from-cyan-500 to-blue-600', glow: 'rgba(34,211,238,0.5)' },
  { href: '/jobs', label: 'Jobs Center', icon: Briefcase, color: 'from-violet-500 to-indigo-600', glow: 'rgba(139,92,246,0.5)' },
  { href: '/library', label: 'Assets Library', icon: Library, color: 'from-emerald-500 to-teal-600', glow: 'rgba(16,185,129,0.5)' },
  { href: '/billing', label: 'Billing', icon: Wallet, color: 'from-amber-500 to-orange-600', glow: 'rgba(245,158,11,0.5)' },
  { href: '/shop', label: 'Shop', icon: ShieldCheck, color: 'from-rose-500 to-pink-600', glow: 'rgba(244,63,94,0.5)' },
];

export function Sidebar() {
  const pathname = usePathname();
  const services = SERVICE_REGISTRY.filter((service) => service.enabled);

  return (
    <aside className="glass-sidebar hidden w-68 shrink-0 p-4 xl:flex xl:flex-col gap-4 relative overflow-hidden">
      {/* Neon right edge */}
      <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent" />
      {/* Ambient glow top */}
      <div className="absolute -top-16 left-8 w-40 h-40 bg-cyan-500/[0.06] rounded-full blur-3xl pointer-events-none" />

      {/* Brand header */}
      <div className="relative rounded-2xl border border-white/[0.07] bg-gradient-to-br from-cyan-500/[0.08] to-blue-600/[0.05] p-4 overflow-hidden">
        <div className="absolute top-0 right-0 bottom-0 left-0 bg-[radial-gradient(ellipse_at_top_right,rgba(34,211,238,0.08),transparent_70%)] pointer-events-none" />
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.55)]">
              <Cpu className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#030710] shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300/60">Avatar G</p>
            <p className="text-sm font-bold text-white leading-tight">AI Workspace</p>
          </div>
        </div>
      </div>

      {/* Core navigation */}
      <nav className="space-y-0.5">
        <p className="px-2 mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/25">Navigation</p>
        {coreItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 relative overflow-hidden',
                active
                  ? 'bg-gradient-to-r from-cyan-500/[0.14] to-indigo-500/[0.10] border border-cyan-400/[0.18] text-white shadow-[0_0_20px_rgba(34,211,238,0.07)]'
                  : 'text-white/45 hover:bg-white/[0.05] hover:text-white/80'
              )}
            >
              {active && (
                <>
                  <span className="absolute left-0 top-1/4 bottom-1/4 w-0.5 bg-gradient-to-b from-cyan-400 to-violet-500 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                  <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_left,rgba(34,211,238,0.06),transparent_70%)] pointer-events-none" />
                </>
              )}
              <div
                className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all',
                  active
                    ? `bg-gradient-to-br ${item.color} shadow-[0_0_12px_${item.glow}]`
                    : 'bg-white/[0.06] group-hover:bg-white/[0.10]'
                )}
              >
                <Icon className={cn('w-3.5 h-3.5', active ? 'text-white' : 'text-white/40 group-hover:text-white/70')} />
              </div>
              <span className="flex-1 truncate">{item.label}</span>
              {active && <ChevronRight className="w-3 h-3 text-cyan-400/60 shrink-0" />}
            </Link>
          );
        })}
      </nav>

      {/* Services list */}
      <div className="flex-1 overflow-hidden flex flex-col gap-2">
        <div className="neon-separator" />
        <p className="px-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/25">{services.length} Services</p>
        <div className="flex-1 overflow-auto hide-scrollbar space-y-0.5 pr-0.5">
          {services.map((service) => {
            const href = service.route;
            const active = pathname === href;
            return (
              <Link
                key={service.id}
                href={href}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-all duration-150',
                  active
                    ? 'bg-white/[0.08] text-white border border-white/[0.10]'
                    : 'text-white/35 hover:bg-white/[0.04] hover:text-white/65'
                )}
              >
                <span className="text-base leading-none">{service.icon}</span>
                <span className="truncate">{service.name}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}