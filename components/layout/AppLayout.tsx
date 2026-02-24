'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { colors } from '@/lib/design/tokens';
import { Logo } from '@/components/brand/Logo';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useAffiliateStatus } from '@/hooks/useAffiliateStatus';
import { createBrowserClient } from '@/lib/supabase/browser';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#05070A] text-white flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('navigation');
  const subscriptionT = useTranslations('subscription');
  const affiliateT = useTranslations('affiliate');
  const { data: subscriptionData, openCustomerPortal } = useSubscriptionStatus();
  const { isAffiliate, isActive } = useAffiliateStatus();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [supabase, setSupabase] = useState<ReturnType<typeof createBrowserClient> | null>(null);
  const locale = getLocaleFromPathname(pathname);
  const toLocale = (path: string) => withLocalePath(path, locale);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const languageOptions: Array<{ code: 'ka' | 'ru' | 'en'; label: string }> = [
    { code: 'ka', label: 'KA' },
    { code: 'ru', label: 'RU' },
    { code: 'en', label: 'EN' },
  ];

  const switchLocale = (nextLocale: 'ka' | 'ru' | 'en') => {
    const normalizedPath = pathname || '/';
    const withoutLocale = normalizedPath.replace(/^\/(en|ka|ru)(?=\/|$)/, '');
    const targetPath = `/${nextLocale}${withoutLocale || ''}`;
    router.push(targetPath);
    setIsMobileMenuOpen(false);
  };

  useEffect(() => {
    try {
      setSupabase(createBrowserClient());
    } catch {
      setSupabase(null);
    }
  }, []);

  const navItems = [
    { labelKey: 'services', href: toLocale('/services') },
    { labelKey: 'workspace', href: toLocale('/workspace') },
    { labelKey: 'about', href: toLocale('/about') },
    { labelKey: 'contact', href: toLocale('/contact') },
  ];

  const subscriptionPlan = subscriptionData?.subscription?.plan || null;
  const hasActiveSubscription =
    subscriptionData?.hasSubscription === true &&
    ['active', 'trialing'].includes(subscriptionData?.status || '');

  const isPastDue = subscriptionData?.status === 'past_due';

  const handleFixPayment = async () => {
    try {
      await openCustomerPortal();
    } catch {
      // Keep UI stable if portal cannot be opened.
    }
  };

  const handleLogout = async () => {
    setAuthBusy(true);
    try {
      if (!supabase) {
        router.replace(`/auth?next=${encodeURIComponent(toLocale('/workspace'))}`);
        router.refresh();
        return;
      }

      await supabase.auth.signOut();
      setUserEmail(null);
      router.replace(`/auth?next=${encodeURIComponent(toLocale('/workspace'))}`);
      router.refresh();
    } finally {
      setAuthBusy(false);
    }
  };

  const resolvePlanLabel = () => {
    if (!subscriptionPlan) {
      return subscriptionT('badge.generic');
    }

    const planKey = `plans.${subscriptionPlan}.title`;
    return subscriptionT(planKey as never);
  };

  useEffect(() => {
    if (!supabase) {
      setUserEmail(null);
      return;
    }

    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (isMounted) {
        const email = data.user?.email ?? null;
        setUserEmail(email);

        if (data.user) {
          fetch('/api/affiliate/claim', { method: 'POST' }).catch(() => undefined);
        }
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);

      if (session?.user) {
        fetch('/api/affiliate/claim', { method: 'POST' }).catch(() => undefined);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className={`fixed top-0 left-0 right-0 z-50 border-b transition-all duration-300`}
      style={{
        backgroundColor: 'rgba(5, 7, 10, 0.8)',
        borderColor: colors.border.light,
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Logo variant="full" size="md" href={toLocale('/')} />

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm transition-colors relative group ${
                pathname === item.href ? 'text-cyan-400' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t(item.labelKey)}
              <span
                className={`absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-cyan-400 to-blue-500 transition-all group-hover:w-full ${
                  pathname === item.href ? 'w-full' : ''
                }`}
              />
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-1">
            {languageOptions.map((language) => (
              <button
                key={language.code}
                onClick={() => switchLocale(language.code)}
                className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
                  locale === language.code
                    ? 'bg-cyan-500/30 text-cyan-100'
                    : 'text-gray-300 hover:text-white'
                }`}
                aria-label={`Switch language to ${language.label}`}
              >
                {language.label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">

          {isAffiliate && (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
              isActive
                ? 'bg-blue-500/20 text-blue-200 border-blue-500/40'
                : 'bg-gray-500/20 text-gray-300 border-gray-500/40'
            }`}>
              {affiliateT('badge.label')}
            </span>
          )}
          {hasActiveSubscription && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              {subscriptionData?.status === 'trialing'
                ? subscriptionT('badge.trialing', { plan: resolvePlanLabel() })
                : subscriptionT('badge.active', { plan: resolvePlanLabel() })}
            </span>
          )}

          {userEmail ? (
            <>
              <span className="max-w-[220px] truncate text-xs text-gray-300">{userEmail}</span>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleLogout}
                disabled={authBusy}
                className="px-6 py-2 rounded-lg font-medium text-sm border border-white/20 bg-white/10 disabled:opacity-60"
                style={{ color: colors.text.primary }}
              >
                {authBusy ? `${t('logout')}...` : t('logout')}
              </motion.button>
            </>
          ) : (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push(`/auth?next=${encodeURIComponent(toLocale('/workspace'))}`)}
              className="px-6 py-2 rounded-lg font-medium text-sm"
              style={{
                background: colors.gradients.cyanToBlue,
                color: colors.text.primary,
              }}
            >
              {t('login')}
            </motion.button>
          )}

          </div>
        </div>

        <button
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          className="md:hidden p-2 text-gray-300 hover:text-white"
          aria-label="Toggle navigation menu"
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-[#05070A]/95 px-4 py-4">
          <div className="mb-4 flex items-center gap-2">
            {languageOptions.map((language) => (
              <button
                key={language.code}
                onClick={() => switchLocale(language.code)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  locale === language.code
                    ? 'bg-cyan-500/30 text-cyan-100'
                    : 'bg-white/5 text-gray-300 hover:text-white'
                }`}
              >
                {language.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`block rounded-lg px-3 py-2 text-sm transition ${
                  pathname === item.href ? 'bg-cyan-500/20 text-cyan-200' : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                {t(item.labelKey)}
              </Link>
            ))}
          </div>

          <div className="mt-4 border-t border-white/10 pt-4">
            {userEmail ? (
              <div className="space-y-2">
                <div className="truncate text-xs text-gray-300">{userEmail}</div>
                <button
                  onClick={handleLogout}
                  disabled={authBusy}
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm"
                >
                  {authBusy ? `${t('logout')}...` : t('logout')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  router.push(`/auth?next=${encodeURIComponent(toLocale('/workspace'))}`);
                }}
                className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                {t('login')}
              </button>
            )}
          </div>
        </div>
      )}

      {isPastDue && (
        <div className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div>
              <p className="text-sm text-amber-200 font-semibold">
                {subscriptionT('banner.past_due_title')}
              </p>
              <p className="text-xs text-amber-200/80">
                {subscriptionT('banner.past_due_description')}
              </p>
            </div>
            <button
              onClick={handleFixPayment}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-400/20 text-amber-100 border border-amber-400/40 hover:bg-amber-400/30 transition"
            >
              {subscriptionT('banner.fix_payment')}
            </button>
          </div>
        </div>
      )}
    </motion.nav>
  );
}

export function Footer() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);

  const footerContent = {
    en: {
      sections: [
        { title: 'Product', links: ['Features', 'Pricing', 'API'] },
        { title: 'Company', links: ['About', 'Blog', 'Careers'] },
        { title: 'Legal', links: ['Privacy', 'Terms', 'Security'] },
        { title: 'Follow', links: ['Twitter', 'GitHub', 'Discord'] },
      ],
      copyright: '© 2024 Avatar G. All rights reserved.',
      builtFor: 'Built with ❤️ for creators',
    },
    ka: {
      sections: [
        { title: 'პროდუქტი', links: ['ფუნქციები', 'ფასები', 'API'] },
        { title: 'კომპანია', links: ['ჩვენს შესახებ', 'ბლოგი', 'ვაკანსიები'] },
        { title: 'იურიდიული', links: ['კონფიდენციალურობა', 'წესები', 'უსაფრთხოება'] },
        { title: 'გამოგვყევი', links: ['Twitter', 'GitHub', 'Discord'] },
      ],
      copyright: '© 2024 Avatar G. ყველა უფლება დაცულია.',
      builtFor: 'შექმნილია ❤️ შემქმნელებისთვის',
    },
    ru: {
      sections: [
        { title: 'Продукт', links: ['Функции', 'Тарифы', 'API'] },
        { title: 'Компания', links: ['О нас', 'Блог', 'Карьера'] },
        { title: 'Право', links: ['Конфиденциальность', 'Условия', 'Безопасность'] },
        { title: 'Соцсети', links: ['Twitter', 'GitHub', 'Discord'] },
      ],
      copyright: '© 2024 Avatar G. Все права защищены.',
      builtFor: 'Создано с ❤️ для креаторов',
    },
  };

  const content = footerContent[locale as 'en' | 'ka' | 'ru'] ?? footerContent.ka;

  return (
    <footer
      className="border-t mt-20 py-12"
      style={{ borderColor: colors.border.light }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {content.sections.map((section) => (
            <div key={section.title}>
              <h3 className="font-semibold mb-4">{section.title}</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                {section.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="hover:text-white transition-colors">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="border-t pt-8 flex flex-col md:flex-row items-center justify-between text-sm text-gray-400"
          style={{ borderColor: colors.border.light }}
        >
          <p>{content.copyright}</p>
          <p>{content.builtFor}</p>
        </div>
      </div>
    </footer>
  );
}

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`max-w-7xl mx-auto px-4 sm:px-6 py-8 ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  className = '',
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`pt-32 pb-12 ${className}`}>
      <h1 className="text-4xl md:text-5xl font-bold mb-4">{title}</h1>
      {subtitle && <p className="text-lg text-gray-400">{subtitle}</p>}
    </div>
  );
}
