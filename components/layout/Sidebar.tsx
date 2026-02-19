"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Briefcase, Library, Wallet, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SERVICE_REGISTRY } from '@/lib/service-registry';

const coreItems = [
  { href: '/workspace', label: 'Workspace', icon: LayoutGrid },
  { href: '/jobs', label: 'Jobs Center', icon: Briefcase },
  { href: '/library', label: 'Assets Library', icon: Library },
  { href: '/billing', label: 'Billing', icon: Wallet },
  { href: '/shop', label: 'Shop', icon: ShieldCheck },
];

export function Sidebar() {
  const pathname = usePathname();
  const services = SERVICE_REGISTRY.filter((service) => service.enabled);

  return (
    <aside className="hidden w-72 shrink-0 border-r border-app-border/25 bg-app-surface/55 p-4 backdrop-blur xl:block">
      <div className="mb-4 rounded-2xl border border-app-border/35 bg-app-elevated/70 p-4">
        <p className="text-xs uppercase tracking-wider text-app-neon">Avatar G</p>
        <h2 className="mt-1 text-lg font-semibold text-app-text">Premium Workspace</h2>
      </div>

      <nav className="space-y-1">
        {coreItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition',
                active
                  ? 'bg-gradient-to-r from-indigo-500/35 to-cyan-500/35 text-white'
                  : 'text-app-muted hover:bg-app-elevated/80 hover:text-app-text'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="mb-2 px-2 text-xs uppercase tracking-wide text-app-muted">{services.length} Services</p>
        <div className="max-h-[60vh] space-y-1 overflow-auto pr-1">
          {services.map((service) => {
            const href = service.route;
            const active = pathname === href;
            return (
              <Link
                key={service.id}
                href={href}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition',
                  active
                    ? 'bg-app-accent/25 text-indigo-100'
                    : 'text-app-muted hover:bg-white/10 hover:text-app-text'
                )}
              >
                <span>{service.icon}</span>
                <span className="truncate">{service.name}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}