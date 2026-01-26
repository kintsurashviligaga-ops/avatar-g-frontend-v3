```tsx
// app/page.tsx
import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-[#05070A] text-white">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/5 border-b border-white/10">
        <div className="max-w-[480px] mx-auto px-5 h-14 flex items-center justify-between">
          <button className="w-8 h-8 flex items-center justify-center text-white/60">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="font-orbitron text-sm font-bold tracking-[0.2em] bg-gradient-to-r from-[#C0C0C0] to-[#E8E8E8] bg-clip-text text-transparent">
            AVATAR G
          </h1>
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-white/50 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-[#00FF88] animate-pulse shadow-[0_0_8px_rgba(0,255,136,0.5)]" />
            <span>ACTIVE</span>
          </div>
        </div>
      </header>

      <main className="max-w-[480px] mx-auto px-5">
        <section className="pt-16 pb-12 text-center">
          <h2 className="font-orbitron text-5xl font-black tracking-wider mb-3 bg-gradient-to-br from-white to-[#C0C0C0] bg-clip-text text-transparent">
            AVATAR G
          </h2>
          <p className="text-sm font-medium text-white/60 mb-6">Your AI Media Factory</p>
          <p className="text-xs text-white/40 leading-relaxed mb-8 max-w-xs mx-auto">
            Text → Voice → Music → Video → Avatar<br />→ Final Cinematic Output
          </p>
          <Link
            href="/video-cine-lab"
            className="inline-block px-10 py-3.5 bg-white/8 backdrop-blur-xl border border-white/20 rounded-xl font-semibold text-sm shadow-[0_0_20px_rgba(192,192,192,0.1)] active:scale-[0.98] transition-transform"
          >
            Start Creating
          </Link>
        </section>

        <section className="py-10 border-y border-white/5 bg-white/[0.02]">
          <h3 className="text-[10px] uppercase tracking-[0.15em] text-white/40 text-center mb-6">
            Pipeline Architecture
          </h3>
          <div className="space-y-3">
            {[
              { icon: '📝', label: 'Script', desc: 'Geo / EN / RU' },
              { icon: '🎙', label: 'AI Voice', desc: 'Neural synthesis' },
              { icon: '🎵', label: 'Music Studio', desc: 'AI composition' },
              { icon: '🎞', label: 'Video Scenes', desc: 'Multi-clip generation' },
              { icon: '⚙', label: 'Cine-Lab Render Engine', desc: 'FFmpeg processing' },
              { icon: '✅', label: 'Final MP4', desc: '1080×1920 vertical' }
            ].map((step, idx, arr) => (
              <div key={idx} className="relative">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-white/5 border border-white/15 rounded-lg text-lg">
                    {step.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{step.label}</div>
                    <div className="text-xs text-white/40">{step.desc}</div>
                  </div>
                </div>
                {idx < arr.length - 1 && (
                  <div className="absolute left-5 top-10 w-px h-3 bg-white/10 flex items-center justify-center">
                    <span className="text-white/20 text-xs">↓</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="py-10">
          <div className="p-7 bg-white/6 backdrop-blur-xl border border-white/15 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
            <div className="text-3xl mb-4">🎬</div>
            <h3 className="font-orbitron text-xl font-bold mb-2 tracking-wide">Video Cine-Lab</h3>
            <p className="text-xs text-white/50 mb-5">Georgian AI video rendering</p>
            <ul className="space-y-2.5 mb-6 text-sm text-white/70">
              {[
                'Vertical 1080×1920 format',
                'Georgian subtitles (burned-in)',
                'AI voice + video mixing',
                'Production-quality MP4'
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-white/30 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/video-cine-lab"
              className="block w-full text-center px-8 py-3.5 bg-white/8 backdrop-blur-xl border border-white/20 rounded-xl font-semibold text-sm shadow-[0_0_20px_rgba(192,192,192,0.1)] active:scale-[0.98] transition-transform"
            >
              Generate Video
            </Link>
          </div>
        </section>

        <section className="pb-10">
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: '🧠', name: 'Script AI', desc: 'Story generation', href: '/ai-production' },
              { icon: '🎙', name: 'Voice Lab', desc: 'Neural synthesis', href: '/voice-lab' },
              { icon: '🎵', name: 'Music Studio', desc: 'AI composition', href: '/music-studio' },
              { icon: '🎞', name: 'Cine-Lab', desc: 'Video rendering', href: '/video-cine-lab' },
              { icon: '🧍', name: 'Avatar Builder', desc: '3D characters', href: '/avatar-builder' },
              { icon: '🖼', name: 'Image Architect', desc: 'AI generation', href: '/image-architect' },
              { icon: '🎮', name: 'Game Forge', desc: 'Interactive', href: '/game-forge' },
              { icon: '🏢', name: 'Business Agent', desc: 'Enterprise tools', href: '/business-agent' }
            ].map((service, i) => (
              <Link
                key={i}
                href={service.href}
                className="p-6 bg-white/4 backdrop-blur-xl border border-white/10 rounded-2xl text-center active:scale-[0.98] active:border-white/30 active:shadow-[0_0_20px_rgba(192,192,192,0.1)] transition-all"
              >
                <div className="text-3xl mb-3">{service.icon}</div>
                <div className="text-sm font-semibold mb-1">{service.name}</div>
                <div className="text-xs text-white/40">{service.desc}</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="pb-10">
          <div className="p-5 bg-white/4 backdrop-blur-xl border border-white/10 rounded-2xl">
            <h4 className="text-[10px] uppercase tracking-[0.15em] text-white/40 mb-4">System Status</h4>
            <div className="space-y-2.5 text-xs">
              {[
                { label: 'Render Worker', value: 'Online', online: true },
                { label: 'Queue', value: 'Processing', online: false },
                { label: 'Avg Render Time', value: '18 sec', online: false },
                { label: 'Region', value: 'Amsterdam (Fly.io)', online: false }
              ].map((item, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-white/60">{item.label}</span>
                  <span className="font-semibold flex items-center gap-1.5">
                    {item.online && <span className="w-1.5 h-1.5 rounded-full bg-[#00FF88]" />}
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 text-center pb-10">
          <h3 className="font-orbitron text-2xl font-bold mb-3">Create Your First AI Video</h3>
          <p className="text-sm text-white/50 mb-8 leading-relaxed">
            From text to cinematic output<br />in under 30 seconds
          </p>
          <Link
            href="/video-cine-lab"
            className="inline-flex items-center gap-2.5 px-12 py-4 bg-white/10 backdrop-blur-xl border border-white/25 rounded-2xl font-bold shadow-[0_8px_32px_rgba(192,192,192,0.15)] active:scale-[0.98] transition-transform"
          >
            <span className="text-xl">🚀</span>
            <span>Start Now</span>
          </Link>
        </section>
      </main>
    </div>
  )
}
```

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import { Orbitron, Inter } from 'next/font/google'
import './globals.css'

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  display: 'swap'
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap'
})

export const metadata: Metadata = {
  title: 'Avatar G - AI Media Factory',
  description: 'Georgian AI-powered video, voice, and media generation platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ka" className={orbitron.variable + ' ' + inter.variable}>
      <body className={inter.className + ' antialiased'}>
        {children}
      </body>
    </html>
  )
}
```

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-[#05070A] text-white;
  }
}

.font-orbitron {
  font-family: var(--font-orbitron);
}
```
