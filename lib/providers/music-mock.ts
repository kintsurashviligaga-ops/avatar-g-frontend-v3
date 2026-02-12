// Mock Music & Video Providers
// Returns placeholder data for development/testing

import type {
  IMusicProvider,
  IVocalProvider,
  ICoverArtProvider,
  IAudioProcessor,
  IVideoProvider,
  IImageAnimationProvider,
  MusicProviderInput,
  MusicGenerationResult,
  VocalProviderInput,
  VocalResult,
  CoverArtInput,
  CoverArtResult,
  AudioMixInput,
  AudioMixResult,
  VideoGenerationInput,
  VideoGenerationResult,
  ImageAnimationInput,
  ImageAnimationResult
} from './music-interfaces';

// Mock audio (empty WAV file)
const MOCK_AUDIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

// Mock cover image
const MOCK_COVER = 'data:image/svg+xml;base64,' + btoa(`
<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#ec4899;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#grad)"/>
  <text x="200" y="180" font-family="Arial" font-size="32" fill="#fff" text-anchor="middle" font-weight="bold">
    MOCK
  </text>
  <text x="200" y="220" font-family="Arial" font-size="24" fill="#fff" text-anchor="middle">
    Album Cover
  </text>
  <text x="200" y="260" font-family="Arial" font-size="16" fill="#eee" text-anchor="middle">
    Generated in mock mode
  </text>
</svg>
`);

// Mock video thumbnail
const MOCK_VIDEO_THUMB = 'data:image/svg+xml;base64,' + btoa(`
<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
  <rect width="1280" height="720" fill="#0a0a1e"/>
  <circle cx="640" cy="360" r="80" fill="rgba(255,255,255,0.1)" stroke="#fff" stroke-width="4"/>
  <polygon points="600,320 680,360 600,400" fill="#fff"/>
  <text x="640" y="500" font-family="Arial" font-size="32" fill="#fff" text-anchor="middle">
    Mock Video Preview
  </text>
</svg>
`);

export class MockMusicProvider implements IMusicProvider {
  name = 'mock-music';

  isAvailable(): boolean {
    return true;
  }

  async generate(input: MusicProviderInput): Promise<MusicGenerationResult> {
    await this.delay(3000); // Simulate generation time

    // Generate mock waveform
    const peaks = Array.from({ length: 100 }, () => Math.random() * 0.8 + 0.2);

    return {
      audio_url: MOCK_AUDIO,
      duration_seconds: 180, // 3 minutes
      waveform_data: {
        peaks,
        duration: 180,
        sample_rate: 44100
      },
      metadata: {
        mock: true,
        genre: input.genre,
        mood: input.mood,
        prompt: input.prompt.substring(0, 50)
      }
    };
  }

  async extend(track_url: string, from_timestamp: number, target_duration: number): Promise<MusicGenerationResult> {
    await this.delay(2000);

    const peaks = Array.from({ length: 100 }, () => Math.random() * 0.8 + 0.2);

    return {
      audio_url: MOCK_AUDIO,
      duration_seconds: target_duration,
      waveform_data: {
        peaks,
        duration: target_duration,
        sample_rate: 44100
      },
      metadata: {
        mock: true,
        extended: true
      }
    };
  }

  async remix(track_url: string, new_prompt: string, keep_vocals: boolean): Promise<MusicGenerationResult> {
    await this.delay(3000);

    const peaks = Array.from({ length: 100 }, () => Math.random() * 0.8 + 0.2);

    return {
      audio_url: MOCK_AUDIO,
      duration_seconds: 180,
      waveform_data: {
        peaks,
        duration: 180,
        sample_rate: 44100
      },
      metadata: {
        mock: true,
        remixed: true,
        keep_vocals: keep_vocals
      }
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class MockVocalProvider implements IVocalProvider {
  name = 'mock-vocals';

  isAvailable(): boolean {
    return true;
  }

  async addVocals(input: VocalProviderInput): Promise<VocalResult> {
    await this.delay(2000);

    return {
      audio_url: MOCK_AUDIO,
      duration_seconds: 180,
      metadata: {
        mock: true,
        voices_used: input.voice_model_refs.length,
        duet_mode: input.duet_mode
      }
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class MockCoverArtProvider implements ICoverArtProvider {
  name = 'mock-cover';

  isAvailable(): boolean {
    return true;
  }

  async generateCover(input: CoverArtInput): Promise<CoverArtResult> {
    await this.delay(1500);

    return {
      image_url: MOCK_COVER,
      metadata: {
        mock: true,
        style: input.style,
        prompt: input.prompt.substring(0, 30)
      }
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class MockAudioProcessor implements IAudioProcessor {
  name = 'mock-audio-processor';

  isAvailable(): boolean {
    return true;
  }

  async mixTracks(input: AudioMixInput): Promise<AudioMixResult> {
    await this.delay(1000);

    return {
      audio_url: MOCK_AUDIO,
      duration_seconds: 180
    };
  }

  async extractWaveform(audio_url: string): Promise<number[]> {
    await this.delay(500);
    return Array.from({ length: 100 }, () => Math.random() * 0.8 + 0.2);
  }

  async trimAudio(audio_url: string, start: number, end: number): Promise<string> {
    await this.delay(500);
    return MOCK_AUDIO;
  }

  async fadeInOut(audio_url: string, fade_in: number, fade_out: number): Promise<string> {
    await this.delay(500);
    return MOCK_AUDIO;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class MockVideoProvider implements IVideoProvider {
  name = 'mock-video';

  isAvailable(): boolean {
    return true;
  }

  async generateVideo(input: VideoGenerationInput): Promise<VideoGenerationResult> {
    // Simulate longer rendering time
    await this.delay(5000);

    return {
      video_url: 'https://mock-video-url.com/video.mp4', // In real app, would be actual video
      thumbnail_url: MOCK_VIDEO_THUMB,
      duration_seconds: input.duration_seconds,
      file_size_mb: 25.5,
      resolution: input.resolution,
      render_time_ms: 5000
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class MockImageAnimationProvider implements IImageAnimationProvider {
  name = 'mock-image-animation';

  isAvailable(): boolean {
    return true;
  }

  async animateImage(input: ImageAnimationInput): Promise<ImageAnimationResult> {
    await this.delay(2000);

    return {
      video_url: 'https://mock-video-url.com/animated.mp4',
      duration_seconds: input.duration
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================
// WAVEFORM GENERATOR (Client-side utility)
// ============================================

export function generateMockWaveform(duration: number, sampleRate = 44100): number[] {
  const numSamples = Math.floor(duration * sampleRate / 1000); // 1 sample per 1000 audio samples
  const waveform: number[] = [];
  
  for (let i = 0; i < numSamples; i++) {
    // Create somewhat realistic waveform with varying amplitudes
    const progress = i / numSamples;
    const envelope = Math.sin(progress * Math.PI); // Fade in/out
    const randomVariation = Math.random() * 0.3 + 0.5;
    const amplitude = envelope * randomVariation * 0.8;
    
    waveform.push(amplitude);
  }
  
  return waveform;
}
