import Link from 'next/link';
import { SERVICE_META } from '@/lib/services/metadata';

const SERVICE_ORDER = [
  'avatar', 'video', 'editing', 'music', 'photo', 'image',
  'media', 'text', 'prompt', 'visual-intel', 'workflow', 'shop', 'agent-g',
] as const;

export default function ServicesIndexPage() {
  return (
    <section className="min-h-screen bg-[#050510] text-white py-24 px-4 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl md:text-5xl font-bold text-center mb-4">
          All Services
        </h1>
        <p className="text-center text-gray-400 max-w-2xl mx-auto mb-16">
          13 AI-powered modules — everything from avatar creation to video production,
          music generation, and automated workflows.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SERVICE_ORDER.map((id) => {
            const meta = SERVICE_META[id];
            if (!meta) return null;

            return (
              <Link
                key={id}
                href={`/services/${id}`}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 transition-all duration-300 hover:border-cyan-400/30 hover:bg-white/[0.06] hover:shadow-[0_0_30px_rgba(34,211,238,0.08)]"
              >
                <div className="text-3xl mb-4">{meta.icon}</div>
                <h2 className="text-lg font-semibold text-white mb-2 group-hover:text-cyan-300 transition-colors">
                  {meta.headline}
                </h2>
                <p className="text-sm text-gray-400 leading-relaxed mb-4">
                  {meta.description}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {meta.features.slice(0, 3).map((f) => (
                    <span
                      key={f}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-gray-400"
                    >
                      {f}
                    </span>
                  ))}
                </div>
                <div className="absolute bottom-6 right-6 text-xs text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  Open →
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
