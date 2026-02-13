'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { colors, shadows } from '@/lib/design/tokens';
import { Logo } from '@/components/brand/Logo';

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
  const t = useTranslations('navigation');

  const navItems = [
    { labelKey: 'services', href: '/services' },
    { labelKey: 'workspace', href: '/dashboard' },
    { labelKey: 'about', href: '/about' },
    { labelKey: 'contact', href: '/contact' },
  ];

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
        <Logo variant="full" size="md" href="/" />

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

        {/* CTA Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-6 py-2 rounded-lg font-medium text-sm hidden md:block"
          style={{
            background: colors.gradients.cyanToBlue,
            color: colors.text.primary,
          }}
        >
          {t('cta') || 'დაიწყე ახლა'}
        </motion.button>
      </div>
    </motion.nav>
  );
}

export function Footer() {
  return (
    <footer
      className="border-t mt-20 py-12"
      style={{ borderColor: colors.border.light }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h3 className="font-semibold mb-4">Product</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  API
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Company</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  About
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Blog
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Careers
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Legal</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Privacy
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Terms
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Security
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-4">Follow</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Twitter
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  GitHub
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Discord
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div
          className="border-t pt-8 flex flex-col md:flex-row items-center justify-between text-sm text-gray-400"
          style={{ borderColor: colors.border.light }}
        >
          <p>&copy; 2024 Avatar G. All rights reserved.</p>
          <p>Built with ❤️ for creators</p>
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
