export type Lang = "ka" | "en";

export type ServiceId =
  | "workspace"
  | "agent-g"
  | "avatar-builder"
  | "voice-lab"
  | "image-architect"
  | "music-studio"
  | "video-cine-lab"
  | "game-forge"
  | "ai-production"
  | "business-agent"
  | "prompt-builder"
  | "image-generator"
  | "video-generator"
  | "text-intelligence";

export type Project = {
  id: string;
  name: string;
  goal: "content" | "music" | "video" | "business" | "game";
  lang: Lang;
  createdAt: string;
  updatedAt: string;
};

export type Attachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  source: "upload" | "camera" | "mic";
  objectUrl: string;
  createdAt: string;
};

export type Preset = {
  id: string;
  name: string;
  serviceId: ServiceId;
  params: Record<string, any>;
  createdAt: string;
  updatedAt: string;
};

export type JobStatus = "idle" | "queued" | "running" | "done" | "error" | "canceled";

export type JobOutput =
  | { type: "text"; text: string }
  | { type: "image"; files: { name: string; url: string; type: string }[] }
  | { type: "video"; files: { name: string; url: string; type: string }[] }
  | { type: "audio"; files: { name: string; url: string; type: string }[] }
  | { type: "zip"; files: { name: string; url: string; type: string }[] };

export type JobRecord = {
  id: string;
  serviceId: ServiceId;
  projectId?: string;
  status: JobStatus;
  progress: number;
  prompt: string;
  params: Record<string, any>;
  attachments: Attachment[];
  output?: JobOutput;
  error?: { code?: string; message: string };
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
};

export type ChatTemplate = {
  id: string;
  serviceId: ServiceId;
  title: string;
  desc: string;
  tags: string[];
  prompt: string;
  params?: Record<string, any>;
};

export type HandoffPacket = {
  from: ServiceId;
  to: ServiceId;
  payload: {
    prompt: string;
    params: Record<string, any>;
    attachments: Attachment[];
    notes: string[];
  };
  createdAt: string;
};
