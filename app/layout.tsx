import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Avatar G — Universal AI Assistant',
  description: 'პრემიუმ AI სივრცე ჩათისთვის, კონტენტისთვის და გადაწყვეტილებისთვის.',
  keywords: ['AI', 'Georgia', 'Chatbot', 'Premium', 'Agent G'],
  authors: [{ name: 'Avatar G Team' }],
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#05070A',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ka">
      <body className="antialiased bg-[#05070A] text-white overflow-hidden">
        {children}
      </body>
    </html>
  )
}
