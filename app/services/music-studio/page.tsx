'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TrackCard } from '@/components/music/TrackCard';
import { WaveformPlayer } from '@/components/music/WaveformPlayer';
import { LyricsEditor } from '@/components/music/LyricsEditor';
import { StyleSelector } from '@/components/music/StyleSelector';
import { VoiceSelector } from '@/components/music/VoiceSelector';
import { ChatWindow } from '@/components/ui/ChatWindow';
import { PromptBuilder } from '@/components/ui/PromptBuilder';
import { Loader2, Music, Sparkles, ChevronDown } from 'lucide-react';
import { useMusicStudio } from '@/store/useMusicStudio';
import { useStudioStore } from '@/store/useStudioStore';
import { useJob } from '@/lib/hooks/useJob';
import { useLanguage } from '@/lib/i18n/useLanguage';
import type { Track as MusicTrack } from '@/types/music-video';
import type { Track as PlatformTrack } from '@/types/platform';
import { getAccessToken } from '@/lib/auth/client';

const GEORGIAN_TEMPLATES = [
  {
    id: 1,
    title: '🎵 ქართული პოპი ჰიტი',
    prompt: 'ქართული პოპ სიმღერა ენერგიული მელოდიით და თანამედროვე პროდაქშენით, სიყვარულსა და სიხარულზე, ქართული ვოკალით, დასამახსოვრებელი რეფრენით, 3 წუთი'
  },
  {
    id: 2,
    title: '🎤 ქართული ჰიპ-ჰოპი',
    prompt: 'ქართული ჰიპ-ჰოპ ტრეკი ურბანული ბიტებით, რეპ-ვერსებით ქართულად, ძლიერი ბასით, მოტივაციის ტექსტით წარმატებაზე'
  },
  {
    id: 3,
    title: '🎸 ქართული აკუსტიკური ბალადა',
    prompt: 'ქართული აკუსტიკური ბალადა გიტარით, რბილი ვოკალით, ემოციური ტექსტით სიყვარულზე და მოგონებებზე'
  },
  {
    id: 4,
    title: '💃 ქართული საცეკვაო მუსიკა',
    prompt: 'ქართული საცეკვაო/კლუბური მუსიკა ენერგიული ბიტებით, სინთ-პროდაქშენით, წვეულების ვაიბით'
  }
];

const mapStatus = (status?: MusicTrack['status']): PlatformTrack['status'] => {
  if (status === 'failed') return 'error';
  if (status === 'completed') return 'completed';
  if (status === 'processing' || status === 'queued') return 'processing';
  return 'pending';
};

const mapToPlatformTrack = (track: MusicTrack, fallbackLanguage: PlatformTrack['language']): PlatformTrack => ({
  id: track.id,
  user_id: track.user_id || 'unknown',
  title: track.title,
  description: track.description,
  prompt: track.prompt || track.title || '',
  lyrics: track.lyrics,
  lyrics_mode: track.lyrics ? 'custom' : 'auto',
  genre: track.genre,
  mood: track.mood,
  era: track.era,
  tempo: track.tempo,
  language: (track.language as PlatformTrack['language']) || fallbackLanguage,
  style_tags: track.style_tags || [],
  use_custom_vocals: track.use_custom_vocals ?? false,
  voice_slots: undefined,
  provider: track.provider || 'mock',
  status: mapStatus(track.status),
  progress: track.progress || 0,
  error: track.error,
  audio_url: track.audio_url,
  cover_url: track.cover_url,
  waveform_data: track.waveform_data
    ? {
        peaks: track.waveform_data.peaks || [],
        duration: track.waveform_data.duration || 0,
        sample_rate: track.waveform_data.sample_rate || 44100
      }
    : undefined,
  duration_seconds: track.duration_seconds,
  is_favorite: track.is_favorite ?? false,
  play_count: track.play_count ?? 0,
  parent_track_id: track.parent_track_id,
  version_type: track.version_type as PlatformTrack['version_type'],
  created_at: track.created_at || new Date().toISOString(),
  updated_at: track.updated_at || new Date().toISOString()
});

export default function MusicStudioPage() {
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [voiceLabOpen, setVoiceLabOpen] = useState(true);
  const [mixLevel, setMixLevel] = useState(0.5);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [avatarRef, setAvatarRef] = useState<{ id: string | null; url: string | null } | null>(null);
  const [useAvatarVocals, setUseAvatarVocals] = useState(false);

  const {
    prompt,
    setPrompt,
    lyrics,
    setLyrics,
    lyricsMode,
    setLyricsMode,
    genre,
    setGenre,
    mood,
    setMood,
    era,
    setEra,
    tempo,
    setTempo,
    language,
    setLanguage,
    styleTags,
    useCustomVocals,
    toggleCustomVocals,
    selectedVoiceSlots,
    toggleVoiceSlot,
    duetMode,
    setDuetMode,
    harmonizationLevel,
    setHarmonizationLevel,
    generating,
    jobId,
    progress,
    updateProgress,
    startGeneration,
    completeGeneration,
    libraryTracks,
    loadLibrary,
    libraryFilter,
    setLibraryFilter,
    selectTrack,
    selectedTrack
  } = useMusicStudio();

  const { setSelectedTrack } = useStudioStore();

  useEffect(() => {
    const intent = searchParams.get('intent');
    const mood = searchParams.get('mood');
    const topic = searchParams.get('topic');
    const lang = searchParams.get('lang');

    if (intent || mood || topic) {
      const prefill = [
        topic ? `Topic: ${topic}` : null,
        intent ? `Intent: ${intent}` : null,
        mood ? `Mood: ${mood}` : null,
      ]
        .filter(Boolean)
        .join(' | ');
      setPrompt(prefill);
    }

    if (lang === 'ka' || lang === 'en' || lang === 'ru') {
      setLanguage(lang);
    }
  }, [searchParams, setLanguage, setPrompt]);

  const { job } = useJob({
    jobId,
    pollInterval: 2000,
    onComplete: async () => {
      const latest = await loadUserTracks();
      if (latest.length > 0) {
        completeGeneration(latest.slice(0, 2));
      }
    }
  });

  const loadUserTracks = useCallback(async (): Promise<MusicTrack[]> => {
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/music/list?limit=100', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const tracks = (data.tracks || []) as MusicTrack[];
        loadLibrary(tracks);
        return tracks;
      }
    } catch (error) {
      console.error('Failed to load tracks:', error);
    }
    return [];
  }, [loadLibrary]);

  useEffect(() => {
    loadUserTracks();
  }, [loadUserTracks]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedId = localStorage.getItem('avatar_g_latest_avatar_id');
    const storedUrl = localStorage.getItem('avatar_g_latest_avatar_url');
    if (storedId || storedUrl) {
      setAvatarRef({ id: storedId, url: storedUrl });
    }
  }, []);

  useEffect(() => {
    if (job?.progress !== undefined) {
      updateProgress(job.progress);
    }
  }, [job?.progress, updateProgress]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    try {
      const authToken = await getAccessToken();
      const response = await fetch('/api/music/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          prompt,
          lyrics: lyrics || undefined,
          lyrics_mode: lyricsMode,
          genre,
          mood,
          language,
          style_tags: styleTags,
          use_custom_vocals: useCustomVocals,
          voice_slots: useCustomVocals ? selectedVoiceSlots : undefined,
          use_avatar_voice: useAvatarVocals,
          avatar_id: useAvatarVocals ? avatarRef?.id || undefined : undefined
        })
      });

      if (response.ok) {
        const data = await response.json();
        const nextJobId = data.job?.id || data.job_id;
        if (nextJobId) {
          startGeneration(nextJobId);
        }
      }
    } catch (error) {
      console.error('Generation error:', error);
    }
  };

  const filteredLibrary = useMemo(() => {
    if (libraryFilter === 'favorites') {
      return libraryTracks.filter((track) => track.is_favorite);
    }

    if (libraryFilter === 'recent') {
      return [...libraryTracks].sort((a, b) =>
        (b.created_at || '').localeCompare(a.created_at || '')
      );
    }

    return libraryTracks;
  }, [libraryFilter, libraryTracks]);

  const resultTracks = (libraryTracks.length > 0 ? libraryTracks : filteredLibrary).slice(0, 2);

  const handleTrackSelect = (track: MusicTrack) => {
    selectTrack(track);
    setSelectedTrack(mapToPlatformTrack(track, language === 'instrumental' ? 'ka' : language));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950/30 to-black">
      {/* Animated background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full filter blur-3xl"
          animate={{
            x: [0, 100, 0],
            y: [0, 50, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/20 rounded-full filter blur-3xl"
          animate={{
            x: [0, -100, 0],
            y: [0, -50, 0]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/40 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
              <Music className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                {t('music.title')}
              </h1>
              <p className="text-white/60 text-sm mt-1">
                {t('music.description')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Create Panel */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-black/20 backdrop-blur-md rounded-xl border border-white/10 p-6">
              <label className="block text-sm font-semibold mb-3">
                {t('music.prompt')}
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t('music.prompt_placeholder')}
                rows={6}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:border-purple-400 focus:outline-none transition-colors resize-none"
              />
              <p className="text-xs text-white/40 mt-2">{t('music.prompt_help')}</p>

              <div className="mt-6 grid grid-cols-2 gap-2">
                {GEORGIAN_TEMPLATES.map((tmpl) => (
                  <motion.button
                    key={tmpl.id}
                    onClick={() => setPrompt(tmpl.prompt)}
                    className="text-left p-3 bg-black/20 border border-white/10 hover:border-purple-400 rounded-lg text-sm transition-colors group"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="font-medium text-purple-400 group-hover:text-pink-400 transition-colors">
                      {tmpl.title}
                    </div>
                    <div className="text-white/60 text-xs mt-1 line-clamp-2">
                      {tmpl.prompt}
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="bg-black/20 backdrop-blur-md rounded-xl border border-white/10 p-6">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Music className="w-4 h-4 text-purple-400" />
                {t('music.lyrics')}
              </h3>
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setLyricsMode('instrumental')}
                  className={`px-3 py-1 rounded border text-xs transition ${
                    lyricsMode === 'instrumental'
                      ? 'border-cyan-400/70 text-cyan-200 bg-cyan-500/10'
                      : 'border-white/10 text-white/50 hover:text-white'
                  }`}
                >
                  {t('music.instrumental')}
                </button>
                <button
                  onClick={() => setLyricsMode('auto')}
                  className={`px-3 py-1 rounded border text-xs transition ${
                    lyricsMode !== 'instrumental'
                      ? 'border-cyan-400/70 text-cyan-200 bg-cyan-500/10'
                      : 'border-white/10 text-white/50 hover:text-white'
                  }`}
                >
                  {t('music.vocals')}
                </button>
              </div>
              <LyricsEditor
                value={lyrics}
                onChange={setLyrics}
                mode={lyricsMode}
                onModeChange={setLyricsMode}
              />
            </div>

            <div className="bg-black/20 backdrop-blur-md rounded-xl border border-white/10 p-6">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-pink-400" />
                {t('music.style')}
              </h3>
              <StyleSelector
                selectedGenres={genre ? [genre] : []}
                selectedMoods={mood ? [mood] : []}
                selectedEras={era ? [era] : []}
                selectedTempos={tempo ? [tempo] : []}
                onGenreChange={(genres) => setGenre(genres[0])}
                onMoodChange={(moods) => setMood(moods[0])}
                onEraChange={(eras) => setEra(eras[0])}
                onTempoChange={(tempos) => setTempo(tempos[0])}
              />
            </div>

            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={handleGenerate}
                disabled={!prompt.trim() || generating}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold h-12 rounded-lg flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t('common.generating')} ({progress}%)
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    {t('common.generate')}
                  </>
                )}
              </Button>
            </motion.div>
          </div>

          {/* Center: Results */}
          <div className="lg:col-span-5 space-y-6">
            {selectedTrack && selectedTrack.audio_url && (
              <div className="bg-black/20 backdrop-blur-md rounded-xl border border-white/10 p-6">
                <WaveformPlayer
                  audioUrl={selectedTrack.audio_url}
                  waveformData={selectedTrack.waveform_data?.peaks}
                  duration={selectedTrack.duration_seconds || 0}
                  title={selectedTrack.title}
                />
              </div>
            )}

            <div className="bg-black/20 backdrop-blur-md rounded-xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">{t('music.results')}</h3>
                <div className="flex items-center gap-2">
                  {[{ key: 'all', label: t('music.all') }, { key: 'favorites', label: t('music.favorites') }, { key: 'recent', label: t('music.recent') }].map((filter) => (
                    <button
                      key={filter.key}
                      onClick={() => setLibraryFilter(filter.key as 'all' | 'favorites' | 'recent')}
                      className={`text-xs px-2 py-1 rounded border transition ${
                        libraryFilter === filter.key
                          ? 'border-cyan-400/60 text-cyan-200 bg-cyan-500/10'
                          : 'border-white/10 text-white/50 hover:text-white'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {resultTracks.length > 0 ? (
                  resultTracks.map((track) => (
                    <TrackCard
                      key={track.id}
                      track={mapToPlatformTrack(track, language === 'instrumental' ? 'ka' : language)}
                      onSelect={() => handleTrackSelect(track)}
                    />
                  ))
                ) : (
                  <div className="text-center py-10 text-white/40 text-sm">
                    {t('music.results.empty')}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-black/20 backdrop-blur-md rounded-xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">{t('music.library')}</h3>
                <span className="text-xs bg-white/10 px-2 py-1 rounded">
                  {filteredLibrary.length}
                </span>
              </div>

              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {filteredLibrary.length > 0 ? (
                  filteredLibrary.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => handleTrackSelect(track)}
                      className="w-full text-left p-2 rounded-lg border border-white/10 hover:border-cyan-400/60 bg-black/20 transition"
                    >
                      <div className="text-sm text-white truncate">{track.title || t('music.untitled')}</div>
                      <div className="text-xs text-white/50 truncate">{track.genre || t('music.track')}</div>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-6 text-white/40 text-sm">
                    {t('music.library.empty')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Voice Lab & Chat */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-black/20 backdrop-blur-md rounded-xl border border-white/10 p-6">
              <button
                onClick={() => setVoiceLabOpen((prev) => !prev)}
                className="w-full flex items-center justify-between"
              >
                <span className="text-sm font-semibold">{t('music.voice_lab')}</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${voiceLabOpen ? 'rotate-180' : ''}`}
                />
              </button>

              <AnimatePresence>
                {voiceLabOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 space-y-4"
                  >
                    <div className="flex items-center justify-between text-xs text-white/60">
                      <span>{t('music.avatar_vocals')}</span>
                      <button
                        onClick={() => setUseAvatarVocals((prev) => !prev)}
                        disabled={!avatarRef?.id}
                        className={`px-2 py-1 rounded border transition ${
                          useAvatarVocals
                            ? 'border-cyan-400/60 text-cyan-200'
                            : 'border-white/10 text-white/40'
                        } ${!avatarRef?.id ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {useAvatarVocals ? t('common.on') : t('common.off')}
                      </button>
                    </div>

                    {!avatarRef?.id && (
                      <p className="text-xs text-white/40">
                        {t('music.avatar_required')}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-xs text-white/60">
                      <span>{t('music.custom_vocals')}</span>
                      <button
                        onClick={toggleCustomVocals}
                        className={`px-2 py-1 rounded border ${
                          useCustomVocals
                            ? 'border-cyan-400/60 text-cyan-200'
                            : 'border-white/10 text-white/40'
                        }`}
                      >
                        {useCustomVocals ? t('common.on') : t('common.off')}
                      </button>
                    </div>

                    <VoiceSelector
                      voices={[]}
                      selectedSlots={useCustomVocals ? selectedVoiceSlots : []}
                      duetMode={duetMode}
                      onSlotToggle={toggleVoiceSlot}
                      onDuetToggle={setDuetMode}
                      mixLevel={mixLevel}
                      harmonyLevel={harmonizationLevel}
                      onMixLevelChange={setMixLevel}
                      onHarmonyLevelChange={setHarmonizationLevel}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Prompt Builder & Chat */}
            <div className="space-y-4">
              <PromptBuilder
                serviceType="music"
                onApplyPrompt={(prompt) => {
                  setPrompt(prompt);
                }}
              />
              <Card className="bg-black/40 border-white/10 overflow-hidden">
                <ChatWindow
                  title={t('music.assistant')}
                  serviceContext="music"
                  height="md"
                  minimizable
                  collapsible
                  onSendMessage={async (message, context) => {
                    setIsChatLoading(true);
                    try {
                      const response = await fetch('/api/chat', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          message,
                          context,
                          conversationId: `music_${Date.now()}`
                        })
                      });

                      if (!response.ok) {
                        throw new Error(`Chat API error: ${response.status}`);
                      }

                      const data = await response.json();
                      return data?.data
                        ? { response: data.data.response, provider: data.data.provider }
                        : null;
                    } catch (error) {
                      console.error('Chat error:', error);
                      return null;
                    } finally {
                      setIsChatLoading(false);
                    }
                  }}
                  isLoading={isChatLoading}
                />
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

