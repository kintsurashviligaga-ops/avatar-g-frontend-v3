'use client';

import { ReactNode } from 'react';
import { useParams } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SupportedLocale = 'ka' | 'en' | 'ru';

interface FooterSection {
  title: string;
  links: string[];
}

interface FooterContent {
  sections: FooterSection[];
  copyright: string;
  builtFor: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const footerContentMap: Record<SupportedLocale, FooterContent> = {
  en: {
    sections: [
      { title: 'Company', links: ['About', 'Services', 'Pricing'] },
      { title: 'Legal', links: ['Privacy', 'Terms', 'Security'] },
      { title: 'Contact', links: ['Support', 'Contact Form', 'Status'] },
      { title: 'Socials', links: ['X', 'LinkedIn', 'GitHub'] },
    ],
    copyright: '2024 Avatar G. All rights reserved.',
    builtFor: 'Built for creators',
  },
  ka: {
    sections: [
      { title: 'Company', links: ['About', 'Services', 'Pricing'] },
      { title: 'Legal', links: ['Privacy', 'Terms', 'Security'] },
      { title: 'Contact', links: ['Support', 'Contact Form', 'Status'] },
      { title: 'Socials', links: ['X', 'LinkedIn', 'GitHub'] },
    ],
    copyright: '2024 Avatar G.',
    builtFor: 'Built for creators',
  },
  ru: {
    sections: [
      { title: 'Company', links: ['About', 'Services', 'Pricing'] },
      { title: 'Legal', links: ['Privacy', 'Terms', 'Security'] },
      { title: 'Contact', links: ['Support', 'Contact Form', 'Status'] },
      { title: 'Socials', links: ['X', 'LinkedIn', 'GitHub'] },
    ],
    copyright: '2024 Avatar G.',
    builtFor: 'Built for creators',
  },
};

function isSupportedLocale(v: unknown): v is SupportedLocale {
  return typeof v === 'string' && ['ka', 'en', 'ru'].includes(v);
}

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-white/10 bg-[#050510]/95 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <span className="text-lg font-bold text-white">Avatar G</span>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

export function Footer() {
  const params = useParams();
  const raw = params?.locale;
  const locale: SupportedLocale = isSupportedLocale(raw) ? raw : 'ka';
  const content = footerContentMap[locale];

  return (
    <footer className="border-t border-white/10 mt-20 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {content.sections.map((section) => (
            <div key={section.title}>
              <h3 className="font-semibold mb-4 text-white">{section.title}</h3>
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
        <div className="flex flex-col md:flex-row justify-between items-center text-xs text-gray-400 pt-8 border-t border-white/10">
          <span>{content.copyright}</span>
          <span>{content.builtFor}</span>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// PageHeader
// ---------------------------------------------------------------------------

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
      <h1 className="text-4xl md:text-5xl font-bold mb-4 text-white">{title}</h1>
      {subtitle && <p className="text-lg text-gray-400">{subtitle}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppLayout (default export)
// ---------------------------------------------------------------------------

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-transparent text-white">
      <Navbar />
      <main className="pt-20">{children}</main>
      <Footer />
    </div>
  );
}
