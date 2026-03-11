"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Briefcase, Library, Wallet, ShieldCheck, Cpu, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SERVICE_REGISTRY } from '@/lib/service-registry';

const coreItems = [
  { href: '/workspace', label: 'Dashboard', icon: LayoutGrid },
  { href: '/jobs', label: 'Jobs Center', icon: Briefcase },
  { href: '/library', label: 'Assets Library', icon: Library },
  { href: '/billing', label: 'Billing', icon: Wallet },
  { href: '/shop', label: 'Shop', icon: ShieldCheck },
];

export function Sidebar() {
  const pathname = usePathname();
  const services = SERVICE_REGISTRY.filter((service) => service.enabled);

  return (
    <aside className="glass-sidebar hidden w-68 shrink-0 p-4 xl:flex xl:flex-col gap-4 relative overflow-hidden">
      {/* Accent right edge */}
      <div className="absolute top-0 right-0 bottom-0 w-px" style={{ background: 'linear-gradient(to bottom, transparent, var(--color-accent-soft), transparent)' }} />
      {/* Ambient glow top */}
      <div className="absolute -top-16 left-8 w-40 h-40 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: 'var(--color-accent-soft)' }} />

      {/* Brand header */}
      <div
        className="relative rounded-2xl overflow-hidden p-4"
        style={{
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-accent-soft)',
        }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at top right, var(--color-accent-soft), transparent 70%)' }} />
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg">
              <Cpu className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 shadow-sm" style={{ borderColor: 'var(--color-bg)' }} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--color-accent)' }}>Avatar G</p>
            <p className="text-sm font-bold leading-tight" style={{ color: 'var(--color-text)' }}>AI Workspace</p>
          </div>
        </div>
      </div>

      {/* Core navigation */}
      <nav className="space-y-0.5">
        <p className="px-2 mb-2 text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--color-text-tertiary)' }}>Navigation</p>
        {coreItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 relative overflow-hidden',
              )}
              style={active ? {
                backgroundColor: 'var(--color-accent-soft)',
                border: '1px solid var(--color-border-hover)',
                color: 'var(--color-text)',
              } : {
                color: 'var(--color-text-secondary)',
                border: '1px solid transparent',
              }}
            >
              {active && (
                <>
                  <span className="absolute left-0 top-1/4 bottom-1/4 w-0.5 rounded-full bg-gradient-to-b from-cyan-400 to-violet-500" />
                  <span className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at left, var(--color-accent-soft), transparent 70%)' }} />
                </>
              )}
              <div
                className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all',
                )}
                style={active ? {
                  background: 'linear-gradient(135deg, var(--color-accent), #6366f1)',
                } : {
                  backgroundColor: 'var(--card-bg)',
                }}
              >
                <Icon className="w-3.5 h-3.5" style={{ color: active ? '#fff' : 'var(--color-text-tertiary)' }} />
              </div>
              <span className="flex-1 truncate">{item.label}</span>
              {active && <ChevronRight className="w-3 h-3 shrink-0" style={{ color: 'var(--color-accent)' }} />}
            </Link>
          );
        })}
      </nav>

      {/* Services list */}
      <div className="flex-1 overflow-hidden flex flex-col gap-2">
        <div className="neon-separator" />
        <p className="px-2 text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--color-text-tertiary)' }}>{services.length} Services</p>
        <div className="flex-1 overflow-auto hide-scrollbar space-y-0.5 pr-0.5">
          {services.map((service) => {
            const href = service.route;
            const active = pathname === href;
            return (
              <Link
                key={service.id}
                href={href}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-all duration-150"
                style={active ? {
                  backgroundColor: 'var(--card-hover)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                } : {
                  color: 'var(--color-text-secondary)',
                  border: '1px solid transparent',
                }}
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