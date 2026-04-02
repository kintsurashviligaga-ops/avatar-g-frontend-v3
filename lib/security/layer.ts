import { z } from 'zod';

// Rate limiting configuration
export const RATE_LIMITS = {
  free: {
    'avatar-creation': { requests: 5, windowMs: 3600000 }, // 5/hour
    'image-generation': { requests: 10, windowMs: 3600000 }, // 10/hour
    'video-generation': { requests: 2, windowMs: 3600000 }, // 2/hour
    'music-composition': { requests: 5, windowMs: 3600000 }, // 5/hour
    'workflow-execution': { requests: 3, windowMs: 3600000 }, // 3/hour
    'chat-messages': { requests: 100, windowMs: 3600000 }, // 100/hour
  },
  creator: {
    'avatar-creation': { requests: 50, windowMs: 3600000 },
    'image-generation': { requests: 100, windowMs: 3600000 },
    'video-generation': { requests: 20, windowMs: 3600000 },
    'music-composition': { requests: 50, windowMs: 3600000 },
    'workflow-execution': { requests: 30, windowMs: 3600000 },
    'chat-messages': { requests: 1000, windowMs: 3600000 },
  },
  pro: {
    'avatar-creation': { requests: 200, windowMs: 3600000 },
    'image-generation': { requests: 500, windowMs: 3600000 },
    'video-generation': { requests: 100, windowMs: 3600000 },
    'music-composition': { requests: 200, windowMs: 3600000 },
    'workflow-execution': { requests: 150, windowMs: 3600000 },
    'chat-messages': { requests: 5000, windowMs: 3600000 },
  },
  enterprise: {
    'avatar-creation': { requests: 1000, windowMs: 3600000 },
    'image-generation': { requests: 2500, windowMs: 3600000 },
    'video-generation': { requests: 500, windowMs: 3600000 },
    'music-composition': { requests: 1000, windowMs: 3600000 },
    'workflow-execution': { requests: 750, windowMs: 3600000 },
    'chat-messages': { requests: 25000, windowMs: 3600000 },
  },
};

// Input validation schemas
export const VALIDATION_SCHEMAS = {
  avatarCreation: z.object({
    sourceImage: z.string().url().optional(),
    description: z.string().min(1).max(500),
    style: z.enum(['realistic', 'artistic', 'anime', '3d']).optional(),
  }),
  imageGeneration: z.object({
    prompt: z.string().min(1).max(1000),
    style: z.enum(['photorealistic', 'artistic', 'anime', 'abstract']).optional(),
    resolution: z.enum(['512x512', '1024x1024', '2048x2048']).optional(),
  }),
  videoGeneration: z.object({
    prompt: z.string().min(1).max(1000),
    lengthSeconds: z.number().min(1).max(180),
    style: z.enum(['cinematic', 'animation', 'documentary']).optional(),
  }),
  musicComposition: z.object({
    mood: z.string().min(1).max(100),
    durationSeconds: z.number().min(10).max(600),
    genre: z.enum(['electronic', 'classical', 'rock', 'jazz', 'ambient']).optional(),
  }),
  workflowExecution: z.object({
    workflowId: z.string().uuid(),
    inputs: z.record(z.any()),
  }),
  chatMessage: z.object({
    message: z.string().min(1).max(10000),
    attachments: z.array(z.object({
      type: z.enum(['image', 'video', 'audio', 'file']),
      url: z.string().url(),
      size: z.number().max(50 * 1024 * 1024), // 50MB max
    })).optional(),
  }),
};

// Security middleware
export class SecurityLayer {
  static validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
    try {
      return schema.parse(input);
    } catch (error) {
      throw new Error(`Input validation failed: ${(error as Error).message}`);
    }
  }

  static sanitizeString(input: string): string {
    // Remove potentially dangerous characters
    return input.replace(/[<>\"'&]/g, '');
  }

  static checkFileType(filename: string, allowedTypes: string[]): boolean {
    const extension = filename.split('.').pop()?.toLowerCase();
    return extension ? allowedTypes.includes(extension) : false;
  }

  static checkFileSize(size: number, maxSize: number): boolean {
    return size <= maxSize;
  }
}

// Rate limiting implementation
export class RateLimiter {
  private static requests = new Map<string, { count: number; resetTime: number }>();

  static checkLimit(userId: string, action: string, tier: keyof typeof RATE_LIMITS): boolean {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const limit = RATE_LIMITS[tier][action as keyof typeof RATE_LIMITS.free];

    if (!limit) return true; // No limit defined

    const record = this.requests.get(key);

    if (!record || now > record.resetTime) {
      // Reset or new record
      this.requests.set(key, { count: 1, resetTime: now + limit.windowMs });
      return true;
    }

    if (record.count >= limit.requests) {
      return false; // Rate limit exceeded
    }

    record.count++;
    return true;
  }

  static getRemainingRequests(userId: string, action: string, tier: keyof typeof RATE_LIMITS): number {
    const key = `${userId}:${action}`;
    const limit = RATE_LIMITS[tier][action as keyof typeof RATE_LIMITS.free];
    const record = this.requests.get(key);

    if (!limit || !record) return limit?.requests || 0;
    return Math.max(0, limit.requests - record.count);
  }
}