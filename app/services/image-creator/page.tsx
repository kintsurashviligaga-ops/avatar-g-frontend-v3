'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Image as ImageIcon, Sparkles, Wand2, Palette, Loader2, ExternalLink } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';

type ServiceJob = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  error_message?: string | null;
  input_payload?: {
    prompt?: string;
    style?: string;
    resolution?: string;
  };
  output_payload?: {
    preview_url?: string;
  };
  created_at: string;
};

type ServiceOutput = {
  id: string;
  service_slug: string;
  external_url?: string | null;
  signed_url?: string | null;
  metadata?: {
    prompt?: string;
    style?: string;
    resolution?: string;
  };
  created_at: string;
};

const IMAGE_TEMPLATES = [
  'Luxury product shot on marble pedestal with studio lighting',
  'Cinematic sci-fi city street in neon rain at night',
  'Minimalist e-commerce hero banner with clean gradients',
  'Cozy coffee shop interior with warm morning sunlight',
  'High-fashion editorial portrait with dramatic shadows',
  'Modern startup office scene with collaborative team mood',
  'Fantasy castle landscape at golden hour with mist',
  'Food photography overhead shot with natural textures',
  'Futuristic UI concept render on floating holographic panels',
  'Premium brand packaging mockup on matte black background',
];

const SEND_TO_SERVICES = [
  { href: '/services/social-media', label: 'Send to Social Media' },
  { href: '/services/marketplace/listings/new', label: 'Send to Marketplace' },
  { href: '/services/video-studio', label: 'Send to Video Studio' },
];

export default function ImageCreatorPage() {
  const searchParams = useSearchParams();
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('photographic');
  const [selectedResolution, setSelectedResolution] = useState('768x768');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [currentJob, setCurrentJob] = useState<ServiceJob | null>(null);
  const [historyJobs, setHistoryJobs] = useState<ServiceJob[]>([]);
  const [historyOutputs, setHistoryOutputs] = useState<ServiceOutput[]>([]);
  const [latestPreview, setLatestPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const intent = searchParams.get('intent');
    const topic = searchParams.get('topic');
    const style = searchParams.get('style');
    const lang = searchParams.get('lang');

    if (!intent && !topic && !style) {
      return;
    }

    const prefill = [
      topic ? `Topic: ${topic}` : null,
      intent ? `Intent: ${intent}` : null,
      style ? `Style: ${style}` : null,
      lang ? `Language: ${lang}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    setPrompt(prefill || 'Generate social media post image');
  }, [searchParams]);

  const loadHistory = useCallback(async () => {
    const [jobsRes, outputsRes] = await Promise.all([
      fetch('/api/app/jobs?service=image-creator', { cache: 'no-store' }),
      fetch('/api/app/outputs', { cache: 'no-store' }),
    ]);

    if (jobsRes.ok) {
      const jobsData = await jobsRes.json() as { jobs?: ServiceJob[] };
      setHistoryJobs((jobsData.jobs ?? []).slice(0, 10));
    }

    if (outputsRes.ok) {
      const outputData = await outputsRes.json() as { outputs?: ServiceOutput[] };
      const filtered = (outputData.outputs ?? []).filter((output) => output.service_slug === 'image-creator');
      setHistoryOutputs(filtered.slice(0, 12));
      if (!latestPreview && filtered.length > 0) {
        setLatestPreview(filtered[0]?.signed_url || filtered[0]?.external_url || null);
      }
    }
  }, [latestPreview]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') {
      return;
    }

    const interval = window.setInterval(async () => {
      const res = await fetch(`/api/app/jobs/${currentJob.id}?autoProcess=1`, { cache: 'no-store' });
      if (!res.ok) {
        return;
      }

      const data = await res.json() as { job: ServiceJob };
      setCurrentJob(data.job);
      if (data.job.output_payload?.preview_url) {
        setLatestPreview(data.job.output_payload.preview_url);
      }

      if (data.job.status === 'completed') {
        setIsGenerating(false);
        void loadHistory();
      }

      if (data.job.status === 'failed') {
        setIsGenerating(false);
        setError(data.job.error_message || 'Generation failed');
      }
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [currentJob, loadHistory]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setError(null);
    setIsGenerating(true);
    const res = await fetch('/api/app/services/image-creator/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        inputPayload: {
          style: selectedStyle,
          resolution: selectedResolution,
          template: selectedTemplate || null,
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setIsGenerating(false);
      setError(
        data?.error?.message ||
          data?.error ||
          'Failed to start image generation'
      );
      return;
    }

    setCurrentJob(data.job);
  };

  const retryCurrent = async () => {
    if (!currentJob) return;
    setError(null);
    setIsGenerating(true);
    await fetch(`/api/app/jobs/${currentJob.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ retry: true }),
    });
    setCurrentJob({ ...currentJob, status: 'queued', progress: 0, error_message: null });
  };

  const cancelCurrent = async () => {
    if (!currentJob) return;
    await fetch(`/api/app/jobs/${currentJob.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancel: true }),
    });
    setIsGenerating(false);
    setCurrentJob({ ...currentJob, status: 'failed', progress: 100, error_message: 'Cancelled by user' });
  };

  return (
    <main className="relative min-h-screen bg-[#050510]">
      <SpaceBackground />
      
      <div className="relative z-10 pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-full mb-4">
              <ImageIcon className="w-4 h-4 text-amber-400" />
              <span className="text-amber-300 text-sm font-medium">Image Creator</span>
            </div>
            <h1 className="text-5xl font-bold text-white mb-4">
              Generate <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">Stunning AI Images</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Create professional images with AI-powered generation, upscaling, and style transfer
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
                <h2 className="text-xl font-semibold text-white mb-4">Describe Your Image</h2>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A majestic dragon flying over a medieval castle at sunset, highly detailed, fantasy art..."
                  className="w-full h-32 bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-amber-500/50"
                />
                
                <Button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isGenerating}
                  className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 mt-4"
                >
                  {isGenerating ? (
                    <>
                      <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 mr-2" />
                      Generate Image
                    </>
                  )}
                </Button>

                {currentJob && (
                  <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3">
                    <div className="flex items-center justify-between text-sm text-gray-300">
                      <span>Job: {currentJob.status}</span>
                      <span>{currentJob.progress}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-amber-500 transition-all" style={{ width: `${currentJob.progress}%` }} />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={retryCurrent} disabled={currentJob.status !== 'failed'}>
                        Retry
                      </Button>
                      <Button size="sm" variant="secondary" onClick={cancelCurrent} disabled={currentJob.status === 'completed' || currentJob.status === 'failed'}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
              </Card>

              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm mt-6">
                <h2 className="text-xl font-semibold text-white mb-4">Generated Images</h2>
                <div className="grid grid-cols-2 gap-4">
                  {latestPreview ? (
                    <div className="col-span-2 rounded-lg border border-white/10 bg-black/50 p-2">
                      <Image
                        src={latestPreview}
                        alt="Generated output"
                        width={1200}
                        height={1200}
                        unoptimized
                        className="h-auto w-full rounded-lg object-cover"
                      />
                    </div>
                  ) : (
                    [1, 2, 3, 4].map((i) => (
                      <div key={i} className="aspect-square bg-black/50 rounded-lg border border-white/10 flex items-center justify-center">
                        <div className="text-center">
                          <Palette className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                          <p className="text-xs text-gray-500">Image {i}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {historyOutputs.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-3 text-sm font-semibold text-white">History</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {historyOutputs.slice(0, 6).map((output) => {
                        const src = output.signed_url || output.external_url;
                        if (!src) return null;
                        return (
                          <button
                            key={output.id}
                            type="button"
                            onClick={() => setLatestPreview(src)}
                            className="overflow-hidden rounded-md border border-white/10"
                          >
                            <Image
                              src={src}
                              alt="History output"
                              width={320}
                              height={180}
                              unoptimized
                              className="h-24 w-full object-cover"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-white mb-4">Image Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Style</label>
                    <select
                      value={selectedStyle}
                      onChange={(event) => setSelectedStyle(event.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="photographic">Realistic</option>
                      <option value="cinematic">Cinematic</option>
                      <option value="fantasy-art">Fantasy Art</option>
                      <option value="digital-art">Digital Art</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Resolution (tier-gated)</label>
                    <select
                      value={selectedResolution}
                      onChange={(event) => setSelectedResolution(event.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="512x512">512x512 (all tiers)</option>
                      <option value="768x768">768x768 (FREE+)</option>
                      <option value="1024x1024">1024x1024 (PRO+)</option>
                      <option value="16:9 Landscape">16:9 Landscape (PRO+)</option>
                      <option value="9:16 Portrait">9:16 Portrait (PRO+)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Template</label>
                    <select
                      value={selectedTemplate}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSelectedTemplate(value);
                        if (value) setPrompt(value);
                      }}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="">Custom prompt</option>
                      {IMAGE_TEMPLATES.map((template) => (
                        <option key={template} value={template}>{template}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-white mb-2">Credits</h3>
                <p className="text-2xl font-bold text-amber-300 mb-1">8 credits</p>
                <p className="text-sm text-gray-400">per image</p>
                {isGenerating && (
                  <p className="mt-3 flex items-center text-sm text-amber-200">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing in background queue
                  </p>
                )}
              </Card>

              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-white mb-3">Send to another service</h3>
                <div className="space-y-2">
                  {SEND_TO_SERVICES.map((target) => (
                    <Link key={target.href} href={`${target.href}?source=image-creator`} className="block">
                      <Button variant="secondary" className="w-full justify-between">
                        <span>{target.label}</span>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </Link>
                  ))}
                </div>
              </Card>

              <Card className="p-6 bg-white/5 border-white/10 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-white mb-3">Recent Runs</h3>
                <div className="space-y-2 text-sm">
                  {historyJobs.length === 0 && <p className="text-gray-400">No runs yet.</p>}
                  {historyJobs.slice(0, 5).map((job) => (
                    <div key={job.id} className="rounded-lg border border-white/10 bg-black/20 p-2">
                      <p className="text-white">{job.input_payload?.prompt?.slice(0, 60) || 'Image run'}</p>
                      <p className="text-xs text-gray-400">{job.status} • {new Date(job.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
