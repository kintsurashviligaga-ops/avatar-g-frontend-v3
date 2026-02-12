// Mock Provider for Testing
// Returns placeholder data when real APIs are unavailable

import type {
  IAvatarProvider,
  IOutfitFittingProvider,
  IVoiceProvider,
  ITalkingAvatarProvider,
  IFaceAnalysisProvider,
  AvatarProviderInput,
  OutfitFittingInput,
  OutfitFittingResult,
  VoiceTrainingInput,
  VoiceSynthesisInput,
  VoiceSynthesisResult,
  TalkingAvatarInput,
  FaceAnalysisInput,
  FaceAnalysisResult
} from './interfaces';

import type {
  AvatarGenerationResult,
  TalkClipResult,
  VoiceTrainingResult
} from '@/types/avatar-builder';

// Placeholder avatar images (base64 1x1 colored pixels for demo)
const MOCK_AVATAR_FRONT = 'data:image/svg+xml;base64,' + btoa(`
<svg width="512" height="768" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="768" fill="#1a1a2e"/>
  <text x="256" y="384" font-family="Arial" font-size="24" fill="#fff" text-anchor="middle">
    Mock Avatar (Front)
  </text>
  <text x="256" y="420" font-family="Arial" font-size="16" fill="#aaa" text-anchor="middle">
    Generated in mock mode
  </text>
</svg>
`);

const MOCK_AUDIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='; // Empty WAV

export class MockAvatarProvider implements IAvatarProvider {
  name = 'mock';

  isAvailable(): boolean {
    return true; // Always available
  }

  async generate(input: AvatarProviderInput): Promise<AvatarGenerationResult> {
    // Simulate generation delay
    await this.delay(2000 + Math.random() * 1000);

    const turnaroundUrls = input.enable_turnaround ? [
      this.generateMockImage('Side'),
      this.generateMockImage('Back'),
      this.generateMockImage('3/4 View')
    ] : undefined;

    return {
      image_url: MOCK_AVATAR_FRONT,
      turnaround_urls: turnaroundUrls,
      generation_time_ms: 2500,
      metadata: {
        mock: true,
        prompt: input.prompt.substring(0, 50)
      }
    };
  }

  async imageToImage(_input: AvatarProviderInput & { init_image: string }): Promise<AvatarGenerationResult> {
    void _input;
    await this.delay(2000);

    return {
      image_url: MOCK_AVATAR_FRONT,
      generation_time_ms: 2000,
      metadata: {
        mock: true,
        mode: 'image-to-image'
      }
    };
  }

  private generateMockImage(label: string): string {
    return 'data:image/svg+xml;base64,' + btoa(`
<svg width="512" height="768" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="768" fill="#2a2a3e"/>
  <text x="256" y="384" font-family="Arial" font-size="24" fill="#fff" text-anchor="middle">
    Mock Avatar (${label})
  </text>
</svg>
    `);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class MockOutfitFittingProvider implements IOutfitFittingProvider {
  name = 'mock';

  isAvailable(): boolean {
    return true;
  }

  async fitOutfit(input: OutfitFittingInput): Promise<OutfitFittingResult> {
    await this.delay(1500);

    return {
      image_url: input.base_image, // Return original for now
      generation_time_ms: 1500,
      metadata: {
        mock: true,
        category: input.category
      }
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class MockVoiceProvider implements IVoiceProvider {
  name = 'mock';

  isAvailable(): boolean {
    return true;
  }

  async trainVoice(input: VoiceTrainingInput): Promise<VoiceTrainingResult> {
    await this.delay(3000);

    return {
      model_ref: `mock_voice_${Date.now()}`,
      status: 'ready',
      metadata: {
        mock: true,
        language: input.language
      }
    };
  }

  async synthesize(input: VoiceSynthesisInput): Promise<VoiceSynthesisResult> {
    await this.delay(1000);

    return {
      audio_url: MOCK_AUDIO,
      duration_seconds: input.text.length * 0.1, // ~10 chars per second
      metadata: {
        mock: true,
        language: input.language
      }
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class MockTalkingAvatarProvider implements ITalkingAvatarProvider {
  name = 'mock';

  isAvailable(): boolean {
    return true;
  }

  async generateVideo(input: TalkingAvatarInput): Promise<TalkClipResult> {
    await this.delay(2000);

    return {
      audio_url: input.audio_url,
      video_url: undefined, // No video in mock mode
      duration_seconds: input.duration_seconds || 5,
      metadata: {
        mock: true
      }
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class MockFaceAnalysisProvider implements IFaceAnalysisProvider {
  name = 'mock';

  isAvailable(): boolean {
    return true;
  }

  async analyze(_input: FaceAnalysisInput): Promise<FaceAnalysisResult> {
    void _input;
    await this.delay(1000);

    return {
      detected: true,
      features: {
        face_shape: 'oval',
        age_estimate: 28,
        gender: 'neutral',
        ethnicity: 'mixed'
      },
      description: 'A portrait with balanced facial features, suitable for avatar generation'
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
