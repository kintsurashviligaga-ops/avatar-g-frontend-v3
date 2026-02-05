// Central configuration for all AI services
export const config = {
  // Feature flags
  features: {
    identityVerification: true,
    voiceCloning: true,
    videoGeneration: true,
    musicGeneration: true,
    realTimePreview: true
  },

  // API Endpoints
  apis: {
    openai: {
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4",
      maxTokens: 2000,
      temperature: 0.7
    },
    elevenlabs: {
      baseUrl: "https://api.elevenlabs.io/v1",
      model: "eleven_multilingual_v2",
      stability: 0.75,
      similarityBoost: 0.85
    },
    stability: {
      baseUrl: "https://api.stability.ai/v1",
      engine: "stable-diffusion-xl-1024-v1-0",
      cfgScale: 7.5,
      steps: 50,
      width: 1024,
      height: 1024
    },
    runway: {
      baseUrl: "https://api.runwayml.com/v1",
      model: "gen2",
      maxDuration: 16,
      resolution: "1080p"
    },
    replicate: {
      baseUrl: "https://api.replicate.com/v1",
      musicModel: "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf298043f7c60f55056c40ae074096949",
      version: "671ac645ce5e552cc63a54a2bbff63fcf298043f7c60f55056c40ae074096949"
    }
  },

  // Identity constraints
  identity: {
    minAvatarConfidence: 98.7,
    minVoiceConfidence: 97.2,
    requiredForServices: ["video-lab", "image-generator", "voice-studio", "music-generator"],
    hashAlgorithm: "SHA-256"
  },

  // Rate limits
  rateLimits: {
    free: {
      text: 100,
      image: 10,
      voice: 20,
      video: 3,
      music: 5
    },
    premium: {
      text: 1000,
      image: 100,
      voice: 200,
      video: 50,
      music: 100
    }
  },

  // Storage
  storage: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    allowedTypes: ["image/png", "image/jpeg", "image/webp", "audio/wav", "audio/mp3", "video/mp4"],
    retentionDays: 30
  }
};

// Helper to check if service requires identity
export function requiresIdentity(serviceId: string): boolean {
  return config.identity.requiredForServices.includes(serviceId);
}

// Helper to get rate limit for user tier
export function getRateLimit(tier: "free" | "premium", serviceType: string): number {
  return config.rateLimits[tier][serviceType as keyof typeof config.rateLimits.free] || 0;
}
