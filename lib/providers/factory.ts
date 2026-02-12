// Provider Factory
// Selects and instantiates the appropriate provider based on available API keys

import type {
  ProviderFactory,
  IAvatarProvider,
  IOutfitFittingProvider,
  IVoiceProvider,
  ITalkingAvatarProvider,
  IFaceAnalysisProvider
} from './interfaces';

import { StabilityAvatarProvider } from './stability';
import { ReplicateAvatarProvider } from './replicate';
import {
  MockAvatarProvider,
  MockOutfitFittingProvider,
  MockVoiceProvider,
  MockTalkingAvatarProvider,
  MockFaceAnalysisProvider
} from './mock';

export class DefaultProviderFactory implements ProviderFactory {
  private avatarProvider: IAvatarProvider | null = null;
  private outfitProvider: IOutfitFittingProvider | null = null;
  private voiceProvider: IVoiceProvider | null = null;
  private talkingAvatarProvider: ITalkingAvatarProvider | null = null;
  private faceAnalysisProvider: IFaceAnalysisProvider | null = null;

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // Check which API keys are available
    const hasStability = !!process.env.STABILITY_API_KEY;
    const hasReplicate = !!process.env.REPLICATE_API_TOKEN;
    // Avatar Generation: prefer Stability, fallback to Replicate, then Mock
    if (hasStability) {
      this.avatarProvider = new StabilityAvatarProvider();
    } else if (hasReplicate) {
      this.avatarProvider = new ReplicateAvatarProvider();
    } else {
      this.avatarProvider = new MockAvatarProvider();
    }

    // Outfit Fitting: use Mock for now (can add real provider later)
    this.outfitProvider = new MockOutfitFittingProvider();

    // Voice: use Mock for MVP (can add ElevenLabs later)
    this.voiceProvider = new MockVoiceProvider();

    // Talking Avatar: use Mock for MVP
    this.talkingAvatarProvider = new MockTalkingAvatarProvider();

    // Face Analysis: use Mock for MVP
    this.faceAnalysisProvider = new MockFaceAnalysisProvider();
  }

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
}

// Export singleton factory
export const providerFactory = new DefaultProviderFactory();
