"use client";

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Film, Play, Pause, Download, Share2, Wand2, Loader2,
  Clock, Sliders, Zap, Image as ImageIcon, Type, Music,
  Scissors, Copy, Trash2, Plus, Settings, Grid3X3, Maximize2,
  Video, Sparkles, Upload, FileVideo, Palette, Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { ChatInterface } from '@/components/services/ChatInterface';

interface VideoProject {
  id: string;
  title: string;
  prompt: string;
  duration: number;
  url: string;
  thumbnail: string;
  style: string;
  resolution: string;
  createdAt: Date;
  isGenerating?: boolean;
}

const VIDEO_STYLES = [
  { id: 'cinematic', name: 'Cinematic', emoji: '🎬', desc: 'Movie-quality visuals', aspect: '16:9' },
  { id: 'realistic', name: 'Realistic', emoji: '📷', desc: 'Photo-realistic', aspect: '16:9' },
  { id: 'animated', name: 'Animated', emoji: '✨', desc: '3D animated style', aspect: '16:9' },
  { id: 'documentary', name: 'Documentary', emoji: '📹', desc: 'Professional doc style', aspect: '16:9' },
  { id: 'social', name: 'Social Media', emoji: '📱', desc: 'Vertical format', aspect: '9:16' },
  { id: 'commercial', name: 'Commercial', emoji: '💼', desc: 'Product showcase', aspect: '1:1' },
  { id: 'music', name: 'Music Video', emoji: '🎵', desc: 'Rhythm-synced', aspect: '16:9' },
  { id: 'abstract', name: 'Abstract', emoji: '🌀', desc: 'Artistic & surreal', aspect: '16:9' },
];

const DURATION_OPTIONS = [
  { id: '4', label: '4 sec', value: 4 },
  { id: '8', label: '8 sec', value: 8 },
  { id: '16', label: '16 sec', value: 16 },
  { id: '30', label: '30 sec', value: 30 },
];

const SUGGESTIONS = [
  "A drone shot flying over a futuristic cityscape at sunset",
  "Product showcase with smooth camera movements",
  "Close-up of coffee being poured in slow motion",
  "Person walking through a neon-lit street at night",
  "Nature scene with wildlife in 4K quality",
  "Abstract particles forming a logo animation"
];

export default function MediaProductionPage() {
  const [activeView, setActiveView] = useState<'create' | 'projects'>('create');
  const [selectedStyle, setSelectedStyle] = useState('cinematic');
  const [selectedDuration, setSelectedDuration] = useState(8);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [currentProject, setCurrentProject] = useState<VideoProject | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [motionStrength, setMotionStrength] = useState(5);
  const [resolution, setResolution] = useState('1080p');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSendMessage = async (message: string, attachments?: File[]) => {
    setIsGenerating(true);
    setGenerationProgress(0);

    // Handle image upload from attachments
    let imageData: string | null = null;
    if (attachments && attachments.length > 0) {
      const imageFile = attachments.find(f => f.type.startsWith('image/'));
      if (imageFile) {
        imageData = await fileToBase64(imageFile);
        setUploadedImage(imageData);
      }
    }

    // Create a placeholder project
    const newProject: VideoProject = {
      id: Date.now().toString(),
      title: message.split(' ').slice(0, 6).join(' ') || 'New Video',
      prompt: message,
      duration: selectedDuration,
      url: '',
      thumbnail: imageData || `https://placehold.co/1920x1080/000000/FFFFFF?text=${message.slice(0, 1)}`,
      style: selectedStyle,
      resolution: resolution,
      createdAt: new Date(),
      isGenerating: true
    };

    setProjects(prev => [newProject, ...prev]);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 3;
      });
    }, 1000);

    try {
      console.log('🎬 Generating video with prompt:', message);
      
      const response = await fetch('/api/generate/video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: message,
          imageUrl: imageData,
          duration: selectedDuration,
          style: selectedStyle,
          resolution: resolution,
          motionStrength: motionStrength,
          _identity: {
            avatarId: 'user-avatar',
            voiceId: 'user-voice'
          }
        }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate video');
      }

      const data = await response.json();
      console.log('✅ Video generated successfully!', data);

      setGenerationProgress(100);

      // Update the project with real data
      setProjects(prev => prev.map(p => 
        p.id === newProject.id 
          ? { ...p, url: data.videoUrl, thumbnail: data.previewUrl || p.thumbnail, isGenerating: false }
          : p
      ));

      // Auto-load the video
      setTimeout(() => {
        const updatedProject = projects.find(p => p.id === newProject.id);
        if (updatedProject && !updatedProject.isGenerating) {
          handleSelectProject(updatedProject);
        }
      }, 500);

    } catch (error: any) {
      console.error('💥 Video generation error:', error);
      
      // Remove the placeholder project on error
      setProjects(prev => prev.filter(p => p.id !== newProject.id));
      
      alert(error.message || 'Failed to generate video. Please check your API keys and try again.');
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
      setUploadedImage(null);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleSelectProject = (project: VideoProject) => {
    if (project.isGenerating) return;
    setCurrentProject(project);
    setIsPlaying(false);
  };

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleDownload = async (project: VideoProject) => {
    if (project.isGenerating) return;
    
    try {
      const response = await fetch(project.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.title.replace(/\s+/g, '-')}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download video');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-400 to-orange-500 flex items-center justify-center">
                <Film className="text-white" size={20} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Media Production</h1>
                <p className="text-sm text-gray-400">AI-Powered Video Creation</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={activeView === 'create' ? 'default' : 'outline'}
                onClick={() => setActiveView('create')}
                className={activeView === 'create' ? 'bg-gradient-to-r from-red-500 to-orange-500' : 'border-white/10'}
              >
                <Wand2 size={16} className="mr-2" />
                Create
              </Button>
              <Button
                variant={activeView === 'projects' ? 'default' : 'outline'}
                onClick={() => setActiveView('projects')}
                className={activeView === 'projects' ? 'bg-gradient-to-r from-red-500 to-orange-500' : 'border-white/10'}
              >
                <FileVideo size={16} className="mr-2" />
                Projects ({projects.length})
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
                {/* Style Selection */}
                <Card className="p-6 bg-black/40 border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="text-red-400" size={20} />
                    <h3 className="text-lg font-semibold text-white">Choose Your Style</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {VIDEO_STYLES.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setSelectedStyle(style.id)}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          selectedStyle === style.id
                            ? 'border-red-500 bg-red-500/10'
                            : 'border-white/10 bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <div className="text-3xl mb-2">{style.emoji}</div>
                        <div className="text-sm font-semibold text-white">{style.name}</div>
                        <div className="text-xs text-gray-400 mt-1">{style.desc}</div>
                        <Badge variant="outline" className="mt-2 text-xs border-white/20 text-gray-400">
                          {style.aspect}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </Card>

                {/* Settings */}
                <Card className="p-6 bg-black/40 border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <Settings className="text-orange-400" size={20} />
                    <h3 className="text-lg font-semibold text-white">Video Settings</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Duration */}
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Duration</label>
                      <div className="grid grid-cols-4 gap-2">
                        {DURATION_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => setSelectedDuration(opt.value)}
                            className={`p-2 rounded-lg border text-sm font-semibold transition-all ${
                              selectedDuration === opt.value
                                ? 'border-red-500 bg-red-500/10 text-red-400'
                                : 'border-white/10 text-gray-400 hover:border-white/20'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Resolution */}
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Resolution</label>
                      <select
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        className="w-full p-2 rounded-lg bg-black/20 border border-white/10 text-white focus:outline-none focus:border-red-500/50"
                      >
                        <option value="720p">720p (HD)</option>
                        <option value="1080p">1080p (Full HD)</option>
                        <option value="4k">4K (Ultra HD)</option>
                      </select>
                    </div>

                    {/* Motion Strength */}
                    <div className="md:col-span-2">
                      <label className="text-sm text-gray-400 mb-2 block">
                        Motion Strength: {motionStrength}
                      </label>
                      <Slider
                        value={[motionStrength]}
                        onValueChange={(v) => setMotionStrength(v[0])}
                        min={1}
                        max={10}
                        step={1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>Subtle</span>
                        <span>Dynamic</span>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Image Upload (Optional) */}
                <Card className="p-6 bg-black/40 border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <ImageIcon className="text-cyan-400" size={20} />
                    <h3 className="text-lg font-semibold text-white">Starting Image (Optional)</h3>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />

                  {uploadedImage ? (
                    <div className="relative group">
                      <img
                        src={uploadedImage}
                        alt="Starting frame"
                        className="w-full h-48 object-cover rounded-lg"
                      />
                      <button
                        onClick={() => setUploadedImage(null)}
                        className="absolute top-2 right-2 p-2 bg-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={16} className="text-white" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-48 border-2 border-dashed border-white/20 rounded-lg flex flex-col items-center justify-center hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all"
                    >
                      <Upload size={32} className="text-gray-600 mb-2" />
                      <p className="text-gray-400">Click to upload starting image</p>
                      <p className="text-xs text-gray-500 mt-1">Optional: Animate from this image</p>
                    </button>
                  )}
                </Card>

                {/* Generation Progress */}
                {isGenerating && (
                  <Card className="p-6 bg-gradient-to-r from-red-500/20 to-orange-500/20 border-red-500/30">
                    <div className="flex items-center gap-4">
                      <Loader2 className="animate-spin text-red-400" size={24} />
                      <div className="flex-1">
                        <div className="text-white font-semibold mb-2">Generating your video...</div>
                        <div className="w-full bg-black/20 rounded-full h-2">
                          <div 
                            className="bg-gradient-to-r from-red-400 to-orange-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${generationProgress}%` }}
                          />
                        </div>
                        <div className="text-sm text-gray-300 mt-2">
                          {generationProgress}% complete • Estimated time: {Math.ceil((100 - generationProgress) / 3)} seconds
                        </div>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Chat Interface */}
                <Card className="bg-black/40 border-white/10 h-[500px]">
                  <ChatInterface
                    onSendMessage={handleSendMessage}
                    placeholder={`Describe the ${VIDEO_STYLES.find(s => s.id === selectedStyle)?.name.toLowerCase()} video you want to create...`}
                    suggestions={SUGGESTIONS}
                    isGenerating={isGenerating}
                  />
                </Card>
              </>
            ) : (
              /* Projects View */
              <div className="space-y-4">
                {projects.length === 0 ? (
                  <Card className="p-12 bg-black/20 border-white/10 text-center">
                    <Film className="mx-auto text-gray-600 mb-4" size={48} />
                    <h3 className="text-lg font-semibold text-white mb-2">No projects yet</h3>
                    <p className="text-gray-400 mb-4">Create your first video to get started</p>
                    <Button
                      onClick={() => setActiveView('create')}
                      className="bg-gradient-to-r from-red-500 to-orange-500"
                    >
                      <Wand2 size={16} className="mr-2" />
                      Create Video
                    </Button>
                  </Card>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {projects.map((project) => (
                      <Card 
                        key={project.id} 
                        className="p-0 bg-black/40 border-white/10 hover:border-red-500/30 transition-all overflow-hidden group cursor-pointer"
                        onClick={() => handleSelectProject(project)}
                      >
                        <div className="relative aspect-video bg-black">
                          <img
                            src={project.thumbnail}
                            alt={project.title}
                            className="w-full h-full object-cover"
                          />
                          {project.isGenerating ? (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <Loader2 className="animate-spin text-red-400" size={32} />
                            </div>
                          ) : (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button className="bg-gradient-to-r from-red-500 to-orange-500">
                                <Play size={20} />
                              </Button>
                            </div>
                          )}
                          <div className="absolute bottom-2 right-2">
                            <Badge className="bg-black/60 text-white border-0">
                              {project.duration}s
                            </Badge>
                          </div>
                        </div>

                        <div className="p-4">
                          <h4 className="text-white font-semibold truncate mb-1">{project.title}</h4>
                          <p className="text-sm text-gray-400 truncate mb-2">{project.prompt}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex gap-2">
                              <Badge variant="outline" className="text-xs border-red-500/30 text-red-400">
                                {project.style}
                              </Badge>
                              <Badge variant="outline" className="text-xs border-white/20 text-gray-400">
                                {project.resolution}
                              </Badge>
                            </div>
                            {!project.isGenerating && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(project);
                                }}
                              >
                                <Download size={14} />
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar - Preview */}
          <div className="space-y-6">
            <Card className="p-6 bg-black/40 border-white/10">
              <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2">
                <Video size={16} />
                PREVIEW
              </h3>

              {currentProject ? (
                <>
                  <div className="relative aspect-video bg-black rounded-lg overflow-hidden mb-4">
                    {currentProject.isGenerating ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="animate-spin text-red-400" size={32} />
                      </div>
                    ) : currentProject.url ? (
                      <video
                        ref={videoRef}
                        src={currentProject.url}
                        className="w-full h-full object-cover"
                        loop
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                      />
                    ) : (
                      <img
                        src={currentProject.thumbnail}
                        alt={currentProject.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  <h4 className="text-white font-semibold mb-1">{currentProject.title}</h4>
                  <p className="text-sm text-gray-400 mb-4">{currentProject.prompt}</p>

                  {/* Controls */}
                  {!currentProject.isGenerating && currentProject.url && (
                    <div className="flex items-center justify-center gap-4 mb-4">
                      <Button
                        onClick={togglePlayPause}
                        className="w-12 h-12 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600"
                      >
                        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                      </Button>
                    </div>
                  )}

                  {/* Actions */}
                  {!currentProject.isGenerating && (
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleDownload(currentProject)}
                        className="flex-1 bg-gradient-to-r from-red-500 to-orange-500"
                      >
                        <Download size={16} className="mr-2" />
                        Download
                      </Button>
                      <Button variant="outline" size="icon" className="border-white/10">
                        <Share2 size={16} />
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <Film className="mx-auto text-gray-600 mb-4" size={48} />
                  <p className="text-gray-400">No video selected</p>
                </div>
              )}
            </Card>

            {/* Stats */}
            <Card className="p-6 bg-black/40 border-white/10">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">STATISTICS</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Total Videos</span>
                  <span className="text-white font-semibold">{projects.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">This Month</span>
                  <span className="text-white font-semibold">{projects.filter(p => {
                    const now = new Date();
                    return p.createdAt.getMonth() === now.getMonth() && 
                           p.createdAt.getFullYear() === now.getFullYear();
                  }).length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Total Duration</span>
                  <span className="text-white font-semibold">
                    {projects.reduce((sum, p) => sum + p.duration, 0)}s
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
