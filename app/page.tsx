// app/page.tsx
import Link from 'next/link'

export const dynamic = 'force-static'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#05070A] text-white">
      <div className="max-w-[480px] mx-auto px-5">
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/5 border-b border-white/10">
          <div className="h-14 flex items-center justify-between">
            <span className="text-white/60">☰</span>
            <h1 className="text-sm font-bold tracking-[0.2em] text-[#C0C0C0]">AVATAR G</h1>
            <div className="flex items-center gap-1.5 text-[10px] text-white/50">
              <span className="w-2 h-2 rounded-full bg-[#00FF88]"></span>
              <span>ACTIVE</span>
            </div>
          </div>
        </header>

        <main className="py-16">
          <section className="text-center mb-16">
            <h2 className="text-5xl font-black tracking-wider mb-3 text-white">AVATAR G</h2>
            <p className="text-sm text-white/60 mb-6">Your AI Media Factory</p>
            <p className="text-xs text-white/40 mb-8">
              Text → Voice → Music → Video → Avatar
              <br />→ Final Cinematic Output
            </p>
            <Link href="/video-cine-lab" className="inline-block px-10 py-3.5 bg-white/8 border border-white/20 rounded-xl font-semibold text-sm">
              Start Creating
            </Link>
          </section>

          <section className="mb-16">
            <div className="p-7 bg-white/6 border border-white/15 rounded-2xl">
              <div className="text-3xl mb-4">🎬</div>
              <h3 className="text-xl font-bold mb-2">Video Cine-Lab</h3>
              <p className="text-xs text-white/50 mb-5">Georgian AI video rendering</p>
              <ul className="space-y-2.5 mb-6 text-sm text-white/70">
                <li>• Vertical 1080×1920 format</li>
                <li>• Georgian subtitles (burned-in)</li>
                <li>• AI voice + video mixing</li>
                <li>• Production-quality MP4</li>
              </ul>
              <Link href="/video-cine-lab" className="block w-full text-center px-8 py-3.5 bg-white/8 border border-white/20 rounded-xl font-semibold text-sm">
                Generate Video
              </Link>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 mb-16">
            <Link href="/ai-production" className="p-6 bg-white/4 border border-white/10 rounded-2xl text-center">
              <div className="text-3xl mb-3">🧠</div>
              <div className="text-sm font-semibold mb-1">Script AI</div>
              <div className="text-xs text-white/40">Story generation</div>
            </Link>
            <Link href="/voice-lab" className="p-6 bg-white/4 border border-white/10 rounded-2xl text-center">
              <div className="text-3xl mb-3">🎙</div>
              <div className="text-sm font-semibold mb-1">Voice Lab</div>
              <div className="text-xs text-white/40">Neural synthesis</div>
            </Link>
            <Link href="/music-studio" className="p-6 bg-white/4 border border-white/10 rounded-2xl text-center">
              <div className="text-3xl mb-3">🎵</div>
              <div className="text-sm font-semibold mb-1">Music Studio</div>
              <div className="text-xs text-white/40">AI composition</div>
            </Link>
            <Link href="/video-cine-lab" className="p-6 bg-white/4 border border-white/10 rounded-2xl text-center">
              <div className="text-3xl mb-3">🎞</div>
              <div className="text-sm font-semibold mb-1">Cine-Lab</div>
              <div className="text-xs text-white/40">Video rendering</div>
            </Link>
            <Link href="/avatar-builder" className="p-6 bg-white/4 border border-white/10 rounded-2xl text-center">
              <div className="text-3xl mb-3">🧍</div>
              <div className="text-sm font-semibold mb-1">Avatar Builder</div>
              <div className="text-xs text-white/40">3D characters</div>
            </Link>
            <Link href="/business-agent" className="p-6 bg-white/4 border border-white/10 rounded-2xl text-center">
              <div className="text-3xl mb-3">🏢</div>
              <div className="text-sm font-semibold mb-1">Business Agent</div>
              <div className="text-xs text-white/40">Enterprise tools</div>
            </Link>
          </section>

          <section className="text-center pb-10">
            <h3 className="text-2xl font-bold mb-3">Create Your First AI Video</h3>
            <p className="text-sm text-white/50 mb-8">From text to cinematic output in under 30 seconds</p>
            <Link href="/video-cine-lab" className="inline-flex items-center gap-2.5 px-12 py-4 bg-white/10 border border-white/25 rounded-2xl font-bold">
              <span className="text-xl">🚀</span>
              <span>Start Now</span>
            </Link>
          </section>
        </main>
      </div>
    </div>
  )
}
