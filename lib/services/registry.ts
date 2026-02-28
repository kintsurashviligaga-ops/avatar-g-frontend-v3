// lib/services/registry.ts
// THIS IS THE SINGLE SOURCE OF TRUTH FOR SERVICE NAMES.
// ORBIT COMPONENT MUST READ FROM THIS REGISTRY.

export const SERVICE_REGISTRY = [
  { id: 'avatar',       name: 'Avatar Builder',      ring: 'inner', agentId: 'avatar-agent',       workerType: 'gpu' },
  { id: 'agent-g',      name: 'Agent G',             ring: 'inner', agentId: 'agent-g',            workerType: 'cpu' },
  { id: 'workflow',      name: 'Workflow Builder',    ring: 'inner', agentId: 'workflow-agent',     workerType: 'cpu' },
  { id: 'video',         name: 'Video Studio',        ring: 'inner', agentId: 'video-agent',        workerType: 'gpu' },
  { id: 'editing',       name: 'Universal Editing',   ring: 'mid',   agentId: 'editing-agent',      workerType: 'gpu' },
  { id: 'music',         name: 'Music Studio',        ring: 'mid',   agentId: 'music-agent',        workerType: 'gpu' },
  { id: 'media',         name: 'Media Production',    ring: 'mid',   agentId: 'media-agent',        workerType: 'gpu' },
  { id: 'photo',         name: 'Photo Studio',        ring: 'mid',   agentId: 'photo-agent',        workerType: 'gpu' },
  { id: 'image',         name: 'Image Creator',       ring: 'mid',   agentId: 'image-agent',        workerType: 'gpu' },
  { id: 'visual-intel',  name: 'Visual Intelligence', ring: 'outer', agentId: 'visual-intel-agent', workerType: 'gpu' },
  { id: 'text',          name: 'Text Intelligence',   ring: 'outer', agentId: 'text-agent',         workerType: 'cpu' },
  { id: 'prompt',        name: 'Prompt Builder',      ring: 'outer', agentId: 'prompt-agent',       workerType: 'cpu' },
  { id: 'shop',          name: 'Online Shop',         ring: 'outer', agentId: 'shop-agent',         workerType: 'cpu' },
] as const

// VERIFY at boot:
if (process.env.NODE_ENV === 'development') {
  console.assert(SERVICE_REGISTRY.length === 13, 'SERVICE_REGISTRY must have exactly 13 entries')
}

export type ServiceId = typeof SERVICE_REGISTRY[number]['id']
export type AgentId = typeof SERVICE_REGISTRY[number]['agentId']
