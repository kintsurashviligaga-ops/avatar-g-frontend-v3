"use client";

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Music, Play, Pause, Download, Share2, Heart, Repeat, Shuffle,
  SkipBack, SkipForward, Volume2, VolumeX, List, Wand2, Loader2,
  Clock, User, Calendar, Mic2, Radio, Headphones, Activity, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { ChatInterface } from '@/components/services/ChatInterface';

interface Track {
  id: string;
  title: string;
  prompt: string;
  duration: number;
  url: string;
  coverArt: string;
  genre: string;
  createdAt: Date;
  isGenerating?: boolean;
}

const MUSIC_STYLES = [
  { id: 'pop', name: 'Pop', emoji: '🎵', desc: 'Catchy and upbeat' },
  { id: 'electronic', name: 'Electronic', emoji: '⚡', desc: 'Synth and beats' },
  { id: 'lofi', name: 'Lo-Fi', emoji: '🌙', desc: 'Chill and relaxed' },
  { id: 'rock', name: 'Rock', emoji: '🎸', desc: 'Electric energy' },
  { id: 'jazz', name: 'Jazz', emoji: '🎷', desc: 'Smooth and sophisticated' },
  { id: 'orchestral', name: 'Orchestral', emoji: '🎻', desc: 'Epic and cinematic' },
  { id: 'hiphop', name: 'Hip Hop', emoji: '🎤', desc: 'Beats and rap' },
  { id: 'ambient', name: 'Ambient', emoji: '🌊', desc: 'Atmospheric and chill' },
];

const SUGGESTIONS = [
  "Create an upbeat pop song about summer",
  "Epic orchestral battle music",
  "Chill lo-fi beats for studying",
  "Electronic dance anthem",
  "Emotional piano ballad",
  "Uplifting motivational track"
];

export default function MusicStudioPage() {
  const [activeView, setActiveView] = useState<'create' | 'library'>('create');
  const [selectedStyle, setSelectedStyle] = useState('pop');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Audio playback controls
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && audioRef.current) {
      interval = setInterval(() => {
        setCurrentTime(audioRef.current?.currentTime || 0);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleSendMessage = async (message: string, attachments?: File[]) => {
    setIsGenerating(true);
    setGenerationProgress(0);

    // Create a placeholder track
    const newTrack: Track = {
      id: Date.now().toString(),
      title: message.split(' ').slice(0, 5).join(' ') || 'New Track',
      prompt: message,
      duration: 180, // 3 minutes
      url: '', // Will be filled after generation
      coverArt: `https://placehold.co/400x400/${Math.floor(Math.random() * 16777215).toString(16)}/FFFFFF?text=${message.slice(0, 1)}`,
      genre: selectedStyle,
      createdAt: new Date(),
      isGenerating: true
    };

    setTracks(prev => [newTrack, ...prev]);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 5;
      });
    }, 500);

    try {
      // Call the music generation API
      console.log('🎵 Generating music with prompt:', message);
      
      const response = await fetch('/api/generate/music', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: message,
          genre: selectedStyle,
          duration: 180,
          vocals: true,
        }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate music');
      }

      const data = await response.json();
      console.log('✅ Music generated successfully!', data);

      setGenerationProgress(100);

      // Update the track with real data
      setTracks(prev => prev.map(t => 
        t.id === newTrack.id 
          ? { ...t, url: data.audioUrl || data.stems?.full, isGenerating: false }
          : t
      ));

      // Auto-play the new track
      setTimeout(() => {
        const updatedTrack = tracks.find(t => t.id === newTrack.id);
        if (updatedTrack && !updatedTrack.isGenerating) {
          handlePlayTrack(updatedTrack);
        }
      }, 500);

    } catch (error: any) {
      console.error('💥 Music generation error:', error);
      
      // Remove the placeholder track on error
      setTracks(prev => prev.filter(t => t.id !== newTrack.id));
      
      alert(error.message || 'Failed to generate music. Please try again.');
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const handlePlayTrack = (track: Track) => {
    if (track.isGenerating) return;

    if (currentTrack?.id === track.id) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current?.play();
        setIsPlaying(true);
      }
    } else {
      setCurrentTrack(track);
      if (audioRef.current) {
        audioRef.current.src = track.url;
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const togglePlayPause = () => {
    if (!currentTrack) return;
    handlePlayTrack(currentTrack);
  };

  const handleDownload = async (track: Track) => {
    if (track.isGenerating) return;
    
    try {
      const response = await fetch(track.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${track.title.replace(/\s+/g, '-')}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download track');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                <Music className="text-white" size={20} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Music Studio</h1>
                <p className="text-sm text-gray-400">AI-Powered Music Creation</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={activeView === 'create' ? 'default' : 'outline'}
                onClick={() => setActiveView('create')}
                className={activeView === 'create' ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'border-white/10'}
              >
                <Wand2 size={16} className="mr-2" />
                Create
              </Button>
              <Button
                variant={activeView === 'library' ? 'default' : 'outline'}
                onClick={() => setActiveView('library')}
                className={activeView === 'library' ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'border-white/10'}
              >
                <List size={16} className="mr-2" />
                Library ({tracks.length})
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {activeView === 'create' ? (
              <>
                {/* Genre Selection */}
                <Card className="p-6 bg-black/40 border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="text-green-400" size={20} />
                    <h3 className="text-lg font-semibold text-white">Choose Your Style</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {MUSIC_STYLES.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setSelectedStyle(style.id)}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          selectedStyle === style.id
                            ? 'border-green-500 bg-green-500/10'
                            : 'border-white/10 bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <div className="text-3xl mb-2">{style.emoji}</div>
                        <div className="text-sm font-semibold text-white">{style.name}</div>
                        <div className="text-xs text-gray-400 mt-1">{style.desc}</div>
                      </button>
                    ))}
                  </div>
                </Card>

                {/* Generation Progress */}
                {isGenerating && (
                  <Card className="p-6 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/30">
                    <div className="flex items-center gap-4">
                      <Loader2 className="animate-spin text-green-400" size={24} />
                      <div className="flex-1">
                        <div className="text-white font-semibold mb-2">Generating your music...</div>
                        <div className="w-full bg-black/20 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-green-400 to-emerald-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${generationProgress}%` }}
                          />
                        </div>
                        <div className="text-sm text-gray-300 mt-2">{generationProgress}% complete</div>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Chat Interface */}
                <Card className="bg-black/40 border-white/10 h-[500px]">
                  <ChatInterface
                    onSendMessage={handleSendMessage}
                    placeholder={`Describe the ${MUSIC_STYLES.find(s => s.id === selectedStyle)?.name.toLowerCase()} music you want to create...`}
                    suggestions={SUGGESTIONS}
                    isGenerating={isGenerating}
                  />
                </Card>
              </>
            ) : (
              /* Library View */
              <div className="space-y-4">
                {tracks.length === 0 ? (
                  <Card className="p-12 bg-black/20 border-white/10 text-center">
                    <Music className="mx-auto text-gray-600 mb-4" size={48} />
                    <h3 className="text-lg font-semibold text-white mb-2">No tracks yet</h3>
                    <p className="text-gray-400 mb-4">Create your first track to get started</p>
                    <Button
                      onClick={() => setActiveView('create')}
                      className="bg-gradient-to-r from-green-500 to-emerald-500"
                    >
                      <Wand2 size={16} className="mr-2" />
                      Create Track
                    </Button>
                  </Card>
                ) : (
                  tracks.map((track) => (
                    <Card key={track.id} className="p-4 bg-black/40 border-white/10 hover:border-green-500/30 transition-all">
                      <div className="flex items-center gap-4">
                        {/* Cover Art */}
                        <div className="relative group">
                          <img
                            src={track.coverArt}
                            alt={track.title}
                            className="w-20 h-20 rounded-lg object-cover"
                          />
                          {track.isGenerating ? (
                            <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                              <Loader2 className="animate-spin text-green-400" size={24} />
                            </div>
                          ) : (
                            <button
                              onClick={() => handlePlayTrack(track)}
                              className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              {currentTrack?.id === track.id && isPlaying ? (
                                <Pause className="text-white" size={24} />
                              ) : (
                                <Play className="text-white" size={24} />
                              )}
                            </button>
                          )}
                        </div>

                        {/* Track Info */}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-white font-semibold truncate">{track.title}</h4>
                          <p className="text-sm text-gray-400 truncate">{track.prompt}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <Badge variant="outline" className="text-xs border-green-500/30 text-green-400">
                              {track.genre}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {formatTime(track.duration)}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        {!track.isGenerating && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleDownload(track)}
                              className="border-white/10 hover:border-green-500/50 hover:bg-green-500/10"
                            >
                              <Download size={16} />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="border-white/10 hover:border-green-500/50 hover:bg-green-500/10"
                            >
                              <Heart size={16} />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="border-white/10 hover:border-green-500/50 hover:bg-green-500/10"
                            >
                              <Share2 size={16} />
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Sidebar - Now Playing */}
          <div className="space-y-6">
            <Card className="p-6 bg-black/40 border-white/10">
              <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
                <Headphones size={16} />
                NOW PLAYING
              </h3>

              {currentTrack ? (
                <>
                  <img
                    src={currentTrack.coverArt}
                    alt={currentTrack.title}
                    className="w-full aspect-square rounded-lg object-cover mb-4"
                  />

                  <h4 className="text-white font-semibold mb-1">{currentTrack.title}</h4>
                  <p className="text-sm text-gray-400 mb-4">{currentTrack.prompt}</p>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="w-full bg-white/10 rounded-full h-1 mb-2">
                      <div 
                        className="bg-gradient-to-r from-green-400 to-emerald-500 h-1 rounded-full"
                        style={{ width: `${(currentTime / currentTrack.duration) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(currentTrack.duration)}</span>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-center gap-4 mb-4">
                    <Button variant="outline" size="icon" className="border-white/10">
                      <Shuffle size={16} />
                    </Button>
                    <Button variant="outline" size="icon" className="border-white/10">
                      <SkipBack size={16} />
                    </Button>
                    <Button
                      onClick={togglePlayPause}
                      className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                    >
                      {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    </Button>
                    <Button variant="outline" size="icon" className="border-white/10">
                      <SkipForward size={16} />
                    </Button>
                    <Button variant="outline" size="icon" className="border-white/10">
                      <Repeat size={16} />
                    </Button>
                  </div>

                  {/* Volume */}
                  <div className="flex items-center gap-3">
                    <button onClick={() => setIsMuted(!isMuted)}>
                      {isMuted || volume === 0 ? (
                        <VolumeX size={18} className="text-gray-400" />
                      ) : (
                        <Volume2 size={18} className="text-gray-400" />
                      )}
                    </button>
                    <Slider
                      value={[volume]}
                      onValueChange={(v) => setVolume(v[0])}
                      max={100}
                      step={1}
                      className="flex-1"
                    />
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <Music className="mx-auto text-gray-600 mb-4" size={48} />
                  <p className="text-gray-400">No track playing</p>
                </div>
              )}
            </Card>

            {/* Stats */}
            <Card className="p-6 bg-black/40 border-white/10">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">STATISTICS</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Total Tracks</span>
                  <span className="text-white font-semibold">{tracks.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">This Month</span>
                  <span className="text-white font-semibold">{tracks.filter(t => {
                    const now = new Date();
                    return t.createdAt.getMonth() === now.getMonth() && 
                           t.createdAt.getFullYear() === now.getFullYear();
                  }).length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Total Duration</span>
                  <span className="text-white font-semibold">
                    {formatTime(tracks.reduce((sum, t) => sum + t.duration, 0))}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
      />
    </div>
  );
}
