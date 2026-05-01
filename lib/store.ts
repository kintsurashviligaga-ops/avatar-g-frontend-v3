import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// Types
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  tier: 'free' | 'creator' | 'pro' | 'enterprise';
  credits: number;
}

export interface Avatar {
  id: string;
  url: string;
  thumbnail: string;
  createdAt: Date;
}

export type ServiceType =
  | 'avatar'
  | 'video'
  | 'image'
  | 'music'
  | 'game-creation'
  | 'interior-design'
  | 'prompt-builder'
  | 'terminal-coding'
  | 'text'
  | 'workflow'
  | 'interior'
  | 'game'
  | 'agent-g'
  | 'business-strategy'
  | 'executive-ops'
  | 'avatar-studio'
  | 'image-gen'
  | 'video-gen'
  | 'voice-synth'
  | 'music-lab'
  | 'copy-engine'
  | 'workflow-automation'
  | 'analytics-hub'
  | 'commerce-pilot'
  | 'fulfillment-hq';

export interface WorkflowState {
  activeWorkflow: string | null;
  steps: WorkflowStep[];
  status: 'idle' | 'running' | 'completed' | 'error';
}

export interface WorkflowStep {
  id: string;
  service: ServiceType;
  config: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'error';
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'paused';
  progress: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  price: number;
  installed: boolean;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  price: number;
  installed: boolean;
}

interface GlobalState {
  user: User | null;
  avatar: Avatar | null;
  activeService: ServiceType;
  workflowState: WorkflowState;
  goals: Goal[];
  credits: number;
  tier: 'free' | 'creator' | 'pro' | 'enterprise';
  installedSkills: Skill[];
  installedAgents: Agent[];
  // Actions
  setUser: (user: User | null) => void;
  setAvatar: (avatar: Avatar | null) => void;
  setActiveService: (service: ServiceType) => void;
  updateWorkflowState: (state: Partial<WorkflowState>) => void;
  addGoal: (goal: Goal) => void;
  updateGoal: (id: string, updates: Partial<Goal>) => void;
  setCredits: (credits: number) => void;
  setTier: (tier: 'free' | 'creator' | 'pro' | 'enterprise') => void;
  installSkill: (skill: Skill) => void;
  uninstallSkill: (skillId: string) => void;
  installAgent: (agent: Agent) => void;
  uninstallAgent: (agentId: string) => void;
}

export const useGlobalStore = create<GlobalState>()(
  subscribeWithSelector((set, _get) => ({
    user: null,
    avatar: null,
    activeService: 'avatar',
    workflowState: {
      activeWorkflow: null,
      steps: [],
      status: 'idle',
    },
    goals: [],
    credits: 100, // Free tier default
    tier: 'free',
    installedSkills: [],
    installedAgents: [],
    setUser: (user) => set({ user }),
    setAvatar: (avatar) => set({ avatar }),
    setActiveService: (activeService) => set({ activeService }),
    updateWorkflowState: (updates) => set((state) => ({
      workflowState: { ...state.workflowState, ...updates }
    })),
    addGoal: (goal) => set((state) => ({ goals: [...state.goals, goal] })),
    updateGoal: (id, updates) => set((state) => ({
      goals: state.goals.map(g => g.id === id ? { ...g, ...updates } : g)
    })),
    setCredits: (credits) => set({ credits }),
    setTier: (tier) => set({ tier }),
    installSkill: (skill) => set((state) => ({
      installedSkills: [...state.installedSkills, { ...skill, installed: true }]
    })),
    uninstallSkill: (skillId) => set((state) => ({
      installedSkills: state.installedSkills.filter(s => s.id !== skillId)
    })),
    installAgent: (agent) => set((state) => ({
      installedAgents: [...state.installedAgents, { ...agent, installed: true }]
    })),
    uninstallAgent: (agentId) => set((state) => ({
      installedAgents: state.installedAgents.filter(a => a.id !== agentId)
    })),
  }))
);

// Legacy store for backward compatibility
interface ServiceState {
  currentService: string | null
  setCurrentService: (service: string | null) => void
  isChatOpen: boolean
  setIsChatOpen: (open: boolean) => void
}

export const useStore = create<ServiceState>((set) => ({
  currentService: null,
  setCurrentService: (service) => set({ currentService: service }),
  isChatOpen: false,
  setIsChatOpen: (open) => set({ isChatOpen: open }),
}));
