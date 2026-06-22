'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, X, LayoutGrid, Briefcase, Library, Wallet, ShieldCheck, Cpu,
  Settings as SettingsIcon, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SERVICE_REGISTRY } from '@/lib/service-registry';

/**
 * MobileSidebar — hamburger + slide-in drawer for screens below `xl`.
 *
 * The desktop `<Sidebar>` is `hidden xl:flex`, leaving narrow viewports with NO
 * way to reach the nav. This component fills that gap WITHOUT touching the
 * desktop sidebar (zero regression risk): a fixed hamburger button (`xl:hidden`)
 * opens an AnimatePresence-driven drawer with the same nav content.
 *
 * Spec features (Master Prompt §2):
 *   • Framer Motion AnimatePresence open/close
 *   • Hardware-accelerated transform (translateX) — no layout reflow
 *   • Tablet/mobile responsive — overlays content, no shift on desktop
 *   • Auto-closes on route change so the user lands on the new page cleanly
 *   • Click backdrop / Esc to dismiss
 */

const coreItems = [
  { href: '/workspace', label: 'Dashboard', icon: LayoutGrid },
  { href: '/jobs', label: 'Jobs Center', icon: Briefcase },
  { href: '/library', label: 'Assets Library', icon: Library },
  { href: '/billing', label: 'Billing', icon: Wallet },
  { href: '/shop', label: 'Shop', icon: ShieldCheck },
];

const drawerVariants = {
  hidden: { x: '-100%' },
  visible: { x: '0%', transition: { type: 'spring', stiffness: 320, damping: 36 } },
  exit: { x: '-100%', transition: { duration: 0.22, ease: 'easeIn' } },
};

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.18 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
};

export function MobileSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const services = SERVICE_REGISTRY.filter((service) => service.enabled);

  // Auto-close when the route changes so the drawer never hangs over the next page.
  useEffect(() => { setOpen(false); }, [pathname]);

  // Esc to dismiss; lock the body while the drawer is open so the underlying
  // content doesn't scroll behind it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  // Derive locale prefix from the URL for the Settings link (matches the rest of
  // the app's `/[locale]/...` routing). Falls back to `/ka` when none is detected.
  const locale = (() => {
    const seg = pathname.split('/')[1] ?? '';
    return (['ka', 'en', 'ru'] as const).includes(seg as 'ka' | 'en' | 'ru') ? seg : 'ka';
  })();

  return (
    <>
      {/* Hamburger button — fixed top-left, hidden on xl+ (desktop has the
          permanent sidebar). Tap target ≥ 44px for touch. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="fixed left-3 top-3 z-40 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-app-elevated/80 text-app-text shadow-sm ring-1 ring-app-border/40 backdrop-blur-md transition-colors hover:bg-app-elevated xl:hidden"
      >
        <motion.div
          animate={open ? 'open' : 'closed'}
          variants={{ closed: { rotate: 0 }, open: { rotate: 90 } }}
          transition={{ duration: 0.2 }}
        >
          <Menu className="h-5 w-5" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              key="mobile-sidebar-backdrop"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm xl:hidden"
            />

            {/* Drawer */}
            <motion.aside
              key="mobile-sidebar-drawer"
              variants={drawerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              className="fixed inset-y-0 left-0 z-50 flex w-[min(80vw,288px)] flex-col gap-4 overflow-hidden bg-[var(--color-bg)]/95 p-4 ring-1 ring-app-border/40 backdrop-blur-xl xl:hidden"
            >
              {/* Brand + close */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg">
                      <Cpu className="h-4 w-4 text-white" />
                    </div>
                    <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 bg-emerald-400 shadow-sm" style={{ borderColor: 'var(--color-bg)' }} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-app-accent">Avatar G</p>
                    <p className="text-sm font-bold leading-tight text-app-text">AI Workspace</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Core navigation */}
              <nav className="space-y-0.5">
                <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[0.16em] text-app-muted">Navigation</p>
                {coreItems.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/');
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200',
                        active
                          ? 'bg-app-accent/10 text-app-text ring-1 ring-app-accent/20'
                          : 'text-app-text/85 hover:bg-app-elevated/60',
                      )}
                    >
                      <span className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                        active ? 'bg-gradient-to-br from-cyan-400 to-blue-600 text-white' : 'bg-app-elevated text-app-muted',
                      )}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {active && <ChevronRight className="h-3 w-3 shrink-0 text-app-accent" />}
                    </Link>
                  );
                })}

                {/* Settings — separated because it's the new top-level route. */}
                <Link
                  href={`/${locale}/settings`}
                  className={cn(
                    'group mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200',
                    pathname === `/${locale}/settings`
                      ? 'bg-app-accent/10 text-app-text ring-1 ring-app-accent/20'
                      : 'text-app-text/85 hover:bg-app-elevated/60',
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-app-elevated text-app-muted">
                    <SettingsIcon className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1 truncate">Settings</span>
                </Link>
              </nav>

              {/* Services */}
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <div className="h-px bg-gradient-to-r from-transparent via-app-border to-transparent" />
                <p className="px-2 text-[9px] font-bold uppercase tracking-[0.16em] text-app-muted">{services.length} Services</p>
                <div className="flex-1 space-y-0.5 overflow-y-auto pr-0.5">
                  {services.map((service) => {
                    const href = service.route;
                    const active = pathname === href;
                    return (
                      <Link
                        key={service.id}
                        href={href}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-all duration-150',
                          active ? 'bg-app-elevated text-app-text ring-1 ring-app-border' : 'text-app-text/75 hover:bg-app-elevated/60',
                        )}
                      >
                        <span className="text-base leading-none">{service.icon}</span>
                        <span className="truncate">{service.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
