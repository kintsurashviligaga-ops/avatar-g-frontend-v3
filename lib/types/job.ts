export type JobStatus = 'queued' | 'processing' | 'uploading' | 'completed' | 'error';

export interface JobBase {
  id: string;
  status: JobStatus;
  progress: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_code?: string;
  error_message?: string;
}

export interface JobInput {
  prompt: string;
  params?: Record<string, any>;
  attachments?: Array<{
    name: string;
    type: string;
    url: string;
  }>;
}

export interface JobOutput {
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'game';
  url?: string;
  urls?: string[];
  text?: string;
  metadata?: Record<string, any>;
}

export interface Job<TInput = JobInput, TOutput = JobOutput> extends JobBase {
  input: TInput;
  output?: TOutput;
}

export type ServiceType = 
  | 'text-intelligence'
  | 'image-generator'
  | 'music-studio'
  | 'voice-lab'
  | 'video-generator'
  | 'game-forge'
  | 'business-agent'
  | 'prompt-builder'
  | 'ai-production';
