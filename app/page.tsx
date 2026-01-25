// app/page.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Avatar G - AI Media Factory",
  description: "Avatar G Front Page",
};

export default function Page() {
  return (
    <main className="min-h-screen w-full bg-[#05070A] text-[#E8E8E8] overflow-x-hidden relative">
      {/* Animated Background */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(192,192,192,0.25)_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#05070A]/30 to-[#05070A]" />
      </div>

      {/* App Container (mobile-first 9:16 feel) */}
      <div className="relative z-10 mx-auto min-h-screen w-full max-w-[480px] pb-10">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between px-5 py-4 backdrop-blur-xl bg-white/[0.04] border-b border-[rgba(192,192,192,0.10)]">
          <span className="text-white/60 text-xl select-none">←</span>

          <div className="font-[var(--font-orbitron)] tracking-[0.2em] font-bold text-sm bg-gradient-to-br from-[#C0C0C0] to-[#E8E8E8] bg-clip-text text-transparent">
            AVATAR G
          </div>

          <div className="flex items-center gap-2 text-[11px] tracking-[0.12em] uppercase text-white/50">
            <span className="h-2 w-2 rounded-full bg-[#00FF88] shadow-[0_0_10px_rgba(0,255,136,0.5)] animate-pulse" />
            Active
          </div>
        </header>

        {/* Hero */}
        <section className="px-5 pt-14 pb-10 text-center">
          <h1 className="font-[var(--font-orbitron)] text-[44px] leading-[1.05] font-black tracking-[0.18em] bg-gradient-to-br from-white to-[#C0C0C0] bg-clip-text text-transparent">
            AVATAR G
          </h1>

          <p className="mt-3 text-[15px] font-medium text-white/60">
            Your AI Media Factory
          </p>

          <p className="mt-6 text-[13px] leading-7 text-white/40 font-light">
            Text → Voice → Music → Video → Avatar
            <br />→ Final Cinematic Output
          </p>

          <button
            className="mt-8 inline-flex items-center justify-center rounded-xl px-10 py-4 text-[15px] font-semibold text-white
                       bg-white/[0.06] border border-[rgba(192,192,192,0.20)] backdrop-blur-xl
                       shadow-[0_0_20px_rgba(192,192,192,0.10)] active:scale-[0.98]"
            onClick={() => {
              // later: route to workspace or open auth modal
              window.location.href = "/(workspace)/video-cine-lab";
            }}
          >
            Start Creating
          </button>
        </section>

        {/* Pipeline Flow */}
        <section className="px-5 py-10 bg-white/[0.02] border-y border-[rgba(192,192,192,0.08)]">
          <div className="text-center text-[12px] uppercase tracking-[0.2em] text-white/40 mb-6">
            Pipeline Architecture
          </div>

          <PipelineStep icon="📝" label="Script" desc="Geo / EN / RU" />
          <PipelineStep icon="🎙" label="AI Voice" desc="Neural synthesis" />
          <PipelineStep icon="🎵" label="AI Music" desc="Composition engine" />
          <PipelineStep icon="🎞" label="AI Video Scenes" desc="Multi-clip generation" />
          <PipelineStep icon="⚙" label="Cine-Lab Render Engine" desc="FFmpeg processing" last={false} />
          <PipelineStep icon="✅" label="Final MP4" desc="1080x1920 vertical" last />
        </section>

        {/* Feature Card */}
        <section className="mx-5 mt-10 rounded-[20px] p-7 bg-white/[0.06] border border-[rgba(192,192,192,0.15)] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.30)]">
          <div className="text-3xl mb-4">🎬</div>

          <h2 className="font-[var(--font-orbitron)] tracking-[0.06em] text-[22px] font-bold">
            Video Cine-Lab
          </h2>

          <p className="mt-2 text-[13px] text-white/50">
            Georgian AI Video Rendering
          </p>

          <ul className="mt-5 space-y-3 text-[13px] text-white/70">
            <li className="flex gap-2">
              <span className="text-white/50">•</span> Vertical 1080x1920 format
            </li>
            <li className="flex gap-2">
              <span className="text-white/50">•</span> Georgian subtitles (burned-in)
            </li>
            <li className="flex gap-2">
              <span className="text-white/50">•</span> AI voice + video mixing
            </li>
            <li className="flex gap-2">
              <span className="text-white/50">•</span> Production-quality MP4
            </li>
          </ul>

          <button
            className="mt-6 w-full rounded-xl py-4 text-[15px] font-semibold text-white
                       bg-white/[0.06] border border-[rgba(192,192,192,0.20)] backdrop-blur-xl
                       shadow-[0_0_20px_rgba(192,192,192,0.10)] active:scale-[0.98]"
            onClick={() => {
              window.location.href = "/(workspace)/video-cine-lab";
            }}
          >
            Generate Video
          </button>
        </section>

        {/* Services Grid */}
        <section className="px-5 pt-8">
          <div className="grid grid-cols-2 gap-3">
            <ServiceCard icon="🧠" name="Script AI" desc="Story generation" href="/(workspace)/ai-production" />
            <ServiceCard icon="🎙" name="Voice Lab" desc="Neural synthesis" href="/(workspace)/voice-lab" />
            <ServiceCard icon="🎵" name="Music Studio" desc="AI composition" href="/(workspace)/music-studio" />
            <ServiceCard icon="🎞" name="Cine-Lab" desc="Video rendering" href="/(workspace)/video-cine-lab" />
            <ServiceCard icon="🧍" name="Avatar Maker" desc="3D characters" href="/(workspace)/avatar-builder" />
            <ServiceCard icon="🏢" name="Business Suite" desc="Enterprise tools" href="/(workspace)/business-agent" />
          </div>
        </section>

        {/* Status Panel */}
        <section className="mx-5 mt-10 rounded-2xl p-5 bg-white/[0.04] border border-[rgba(192,192,192,0.10)] backdrop-blur-xl">
          <div className="text-[12px] uppercase tracking-[0.2em] text-white/40 mb-4">
            System Status
          </div>

          <StatusRow label="Render Worker" value="Online" ok />
          <StatusRow label="Queue" value="Processing" />
          <StatusRow label="Avg Render Time" value="18 sec" />
          <StatusRow label="Region" value="Amsterdam (Fly.io)" />
        </section>

        {/* Final CTA */}
        <section className="px-5 pt-14 pb-10 text-center">
          <h3 className="font-[var(--font-orbitron)] text-2xl font-bold">
            Create Your First AI Video
          </h3>
          <p className="mt-3 text-[14px] leading-6 text-white/50">
            From text to cinematic output
            <br />
            in under 30 seconds
          </p>

          <button
            className="mt-7 inline-flex items-center gap-2 rounded-[14px] px-12 py-[18px] text-[16px] font-extrabold text-white
                       bg-white/[0.08] border border-[rgba(192,192,192,0.25)] backdrop-blur-xl
                       shadow-[0_8px_32px_rgba(192,192,192,0.15)] active:scale-[0.98]"
            onClick={() => {
              window.location.href = "/(workspace)/video-cine-lab";
            }}
          >
            <span>🚀</span>
            <span>Start Now</span>
          </button>
        </section>
      </div>
    </main>
  );
}

function PipelineStep({
  icon,
  label,
  desc,
  last,
}: {
  icon: string;
  label: string;
  desc: string;
  last?: boolean;
}) {
  return (
    <div className="relative flex items-center gap-4 py-3">
      <div className="h-10 w-10 rounded-[10px] grid place-items-center text-lg bg-white/[0.04] border border-[rgba(192,192,192,0.15)]">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-[15px] font-semibold text-white">{label}</div>
        <div className="text-[12px] text-white/40">{desc}</div>
      </div>

      {!last && (
        <div className="absolute left-[18px] -bottom-1 text-[16px] text-[rgba(192,192,192,0.20)] select-none">
          ↓
        </div>
      )}
    </div>
  );
}

function ServiceCard({
  icon,
  name,
  desc,
  href,
}: {
  icon: string;
  name: string;
  desc: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="rounded-2xl px-4 py-6 text-center bg-white/[0.04] border border-[rgba(192,192,192,0.10)] backdrop-blur-xl
                 active:scale-[0.98] transition"
    >
      <div className="text-3xl mb-3">{icon}</div>
      <div className="text-[13px] font-semibold text-white">{name}</div>
      <div className="mt-1 text-[11px] text-white/40">{desc}</div>
    </a>
  );
}

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 text-[13px]">
      <div className="text-white/60">{label}</div>
      <div className="flex items-center gap-2 font-semibold text-white">
        {ok && <span className="h-1.5 w-1.5 rounded-full bg-[#00FF88]" />}
        {value}
      </div>
    </div>
  );
}
