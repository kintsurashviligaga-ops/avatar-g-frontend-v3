"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Globe, LogOut } from 'lucide-react';
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
    <header className="sticky top-0 z-40 border-b border-app-border/20 bg-app-bg/70 px-4 py-3 backdrop-blur md:px-6">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-app-muted">Signed in</p>
          <p className="max-w-[300px] truncate text-sm text-app-text">{userEmail}</p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={withLocalePath('/workspace', locale)} className="hidden rounded-lg px-3 py-2 text-sm text-app-muted hover:bg-white/10 hover:text-app-text sm:block">
            Home
          </Link>
          <Link href="/jobs" className="hidden rounded-lg px-3 py-2 text-sm text-app-muted hover:bg-white/10 hover:text-app-text sm:block">
            Jobs
          </Link>

          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-app-border/30 bg-app-surface/70 px-3 py-2 text-xs text-app-muted"
            title="Language switcher placeholder"
          >
            <Globe className="h-3.5 w-3.5" />
            EN/KA
          </button>

          <Button variant="secondary" size="sm" onClick={onLogout} disabled={isLoggingOut}>
            <LogOut className="mr-1 h-3.5 w-3.5" />
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </Button>
        </div>
      </div>
    </header>
  );
}