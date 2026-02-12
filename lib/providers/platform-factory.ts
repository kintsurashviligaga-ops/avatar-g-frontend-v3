// Extended Provider Factory with Music & Video Support

import type {
  ProviderFactory,
  IAvatarProvider,
  IOutfitFittingProvider,
  IVoiceProvider,
  ITalkingAvatarProvider,
  IFaceAnalysisProvider
} from './interfaces';

import type {
  IMusicProvider,
  IVocalProvider,
  ICoverArtProvider,
  IAudioProcessor,
  IVideoProvider,
  IImageAnimationProvider
} from './music-interfaces';

import { StabilityAvatarProvider } from './stability';
import { ReplicateAvatarProvider } from './replicate';
import {
  MockAvatarProvider,
  MockOutfitFittingProvider,
  MockVoiceProvider,
  MockTalkingAvatarProvider,
  MockFaceAnalysisProvider
} from './mock';

import {
  MockMusicProvider,
  MockVocalProvider,
  MockCoverArtProvider,
  MockAudioProcessor,
  MockVideoProvider,
  MockImageAnimationProvider
} from './music-mock';

export interface ExtendedProviderFactory extends ProviderFactory {
  getMusicProvider(): IMusicProvider;
  getVocalProvider(): IVocalProvider;
  getCoverArtProvider(): ICoverArtProvider;
  getAudioProcessor(): IAudioProcessor;
  getVideoProvider(): IVideoProvider;
  getImageAnimationProvider(): IImageAnimationProvider;
}

export class CompletePlatformProviderFactory implements ExtendedProviderFactory {
  // Existing providers
  private avatarProvider: IAvatarProvider | null = null;
  private outfitProvider: IOutfitFittingProvider | null = null;
  private voiceProvider: IVoiceProvider | null = null;
  private talkingAvatarProvider: ITalkingAvatarProvider | null = null;
  private faceAnalysisProvider: IFaceAnalysisProvider | null = null;
  
  // Music & Video providers
  private musicProvider: IMusicProvider | null = null;
  private vocalProvider: IVocalProvider | null = null;
  private coverArtProvider: ICoverArtProvider | null = null;
  private audioProcessor: IAudioProcessor | null = null;
  private videoProvider: IVideoProvider | null = null;
  private imageAnimationProvider: IImageAnimationProvider | null = null;

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    const hasStability = !!process.env.STABILITY_API_KEY;
    const hasReplicate = !!process.env.REPLICATE_API_TOKEN;
    const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;
    const hasRunway = !!process.env.RUNWAY_API_KEY;

    // Avatar Generation: prefer Stability, fallback to Replicate, then Mock
    if (hasStability) {
      console.log('[ProviderFactory] Using Stability AI for avatar generation');
      this.avatarProvider = new StabilityAvatarProvider();
    } else if (hasReplicate) {
      console.log('[ProviderFactory] Using Replicate for avatar generation');
      this.avatarProvider = new ReplicateAvatarProvider();
    } else {
      console.warn('[ProviderFactory] No avatar generation API keys found, using mock provider');
      this.avatarProvider = new MockAvatarProvider();
    }

    // Outfit Fitting: use Mock for now
    this.outfitProvider = new MockOutfitFittingProvider();

    // Voice: use Mock for MVP
    this.voiceProvider = new MockVoiceProvider();

    // Talking Avatar: use Mock for MVP
    this.talkingAvatarProvider = new MockTalkingAvatarProvider();

    // Face Analysis: use Mock for MVP
    this.faceAnalysisProvider = new MockFaceAnalysisProvider();

    // Music Generation: use Mock (can add Replicate music models later)
    console.log('[ProviderFactory] Using Mock provider for music generation');
    this.musicProvider = new MockMusicProvider();

    // Vocal Provider: use Mock (can add singing voice synthesis later)
    this.vocalProvider = new MockVocalProvider();

    // Cover Art: prefer Stability for images, fall back to Mock
    if (hasStability) {
      console.log('[ProviderFactory] Using Stability AI for cover art');
      // Use same avatar provider for cover art (it's just image generation)
      this.coverArtProvider = new MockCoverArtProvider(); // TODO: Create StabilityCoverArtProvider
    } else {
      console.log('[ProviderFactory] Using Mock provider for cover art');
      this.coverArtProvider = new MockCoverArtProvider();
    }

    // Audio Processing: use Mock (server-side FFmpeg for real implementation)
    this.audioProcessor = new MockAudioProcessor();

    // Video Generation: use Mock (can add Runway or custom FFmpeg pipeline)
    if (hasRunway) {
      console.log('[ProviderFactory] Runway API detected but not yet implemented, using Mock');
      this.videoProvider = new MockVideoProvider();
    } else {
      console.log('[ProviderFactory] Using Mock provider for video generation');
      this.videoProvider = new MockVideoProvider();
    }

    // Image Animation: use Mock
    this.imageAnimationProvider = new MockImageAnimationProvider();
  }

  // Existing methods
  getAvatarProvider(): IAvatarProvider {
    if (!this.avatarProvider) {
      throw new Error('Avatar provider not initialized');
    }
    return this.avatarProvider;
  }

  getOutfitFittingProvider(): IOutfitFittingProvider {
    if (!this.outfitProvider) {
      throw new Error('Outfit fitting provider not initialized');
    }
    return this.outfitProvider;
  }

  getVoiceProvider(): IVoiceProvider {
    if (!this.voiceProvider) {
      throw new Error('Voice provider not initialized');
    }
    return this.voiceProvider;
  }

  getTalkingAvatarProvider(): ITalkingAvatarProvider {
    if (!this.talkingAvatarProvider) {
      throw new Error('Talking avatar provider not initialized');
    }
    return this.talkingAvatarProvider;
  }

  getFaceAnalysisProvider(): IFaceAnalysisProvider {
    if (!this.faceAnalysisProvider) {
      throw new Error('Face analysis provider not initialized');
    }
    return this.faceAnalysisProvider;
  }

  // New methods for music & video
  getMusicProvider(): IMusicProvider {
    if (!this.musicProvider) {
      throw new Error('Music provider not initialized');
    }
    return this.musicProvider;
  }

  getVocalProvider(): IVocalProvider {
    if (!this.vocalProvider) {
      throw new Error('Vocal provider not initialized');
    }
    return this.vocalProvider;
  }

  getCoverArtProvider(): ICoverArtProvider {
    if (!this.coverArtProvider) {
      throw new Error('Cover art provider not initialized');
    }
    return this.coverArtProvider;
  }

  getAudioProcessor(): IAudioProcessor {
    if (!this.audioProcessor) {
      throw new Error('Audio processor not initialized');
    }
    return this.audioProcessor;
  }

  getVideoProvider(): IVideoProvider {
    if (!this.videoProvider) {
      throw new Error('Video provider not initialized');
    }
    return this.videoProvider;
  }

  getImageAnimationProvider(): IImageAnimationProvider {
    if (!this.imageAnimationProvider) {
      throw new Error('Image animation provider not initialized');
    }
    return this.imageAnimationProvider;
  }
}

// Export singleton factory
export const platformProviders = new CompletePlatformProviderFactory();
