import { notFound } from 'next/navigation';

import MatildaVoiceChat from '@/components/dashboard/MatildaVoiceChat';

type VoiceSmokePageProps = {
  params: {
    locale: string;
  };
};

export default function VoiceSmokePage({ params }: VoiceSmokePageProps) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <h1 className="text-lg font-semibold">Voice Realtime Smoke</h1>
      <p className="mt-2 max-w-2xl text-sm text-white/70">
        Test harness route for validating realtime voice panel state transitions and interruption behavior.
      </p>

      <div className="mt-6 rounded-2xl border border-cyan-300/20 bg-slate-900/60 p-4 text-sm text-white/75">
        Locale: {params.locale}
      </div>

      <MatildaVoiceChat locale={params.locale} />
    </main>
  );
}
