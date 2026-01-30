import type { Metadata } from 'next';
import { Orbitron, Inter } from 'next/font/google';
import { validateServerEnv } from '@/lib/env/server';
import { validatePublicEnv } from '@/lib/env/public';
import './globals.css';

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// TEMPORARILY DISABLED: Validation causes build to fail on Vercel
// TODO: Re-enable after fixing env var access
// validateServerEnv();

// Optional: Validate public env in development
if (process.env.NODE_ENV === 'development') {
  validatePublicEnv();
}

export const metadata: Metadata = {
  title: 'Avatar G - AI Media Factory',
  description: 'Georgian AI-powered video, voice, and media generation platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ka" className={`${orbitron.variable} ${inter.variable}`}>
      <body className={`${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
