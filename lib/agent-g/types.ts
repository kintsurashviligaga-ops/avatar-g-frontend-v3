export type AgentGTaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'partial';

export type AgentGTaskType = 'business' | 'social' | 'voice' | 'avatar' | 'marketplace' | 'hybrid';

export type AgentGSubtask = {
  id: string;
  agent: 'business-agent' | 'social-media' | 'voice-lab' | 'avatar-builder' | 'marketplace';
  action: string;
  status: AgentGTaskStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
};

export type AgentGTaskPlan = {
  main_goal: string;
  task_type: AgentGTaskType;
  sub_tasks: Array<{
    agent: AgentGSubtask['agent'];
    action: string;
    input: Record<string, unknown>;
  }>;
  expected_outputs: string[];
};

export type AgentGAggregatedResult = {
  summary: string;
  markdown: string;
  outputs: {
    text: boolean;
    pdf: boolean;
    zip: boolean;
    audio: boolean;
    video: boolean;
  };
  subtasks: AgentGSubtask[];
};

export type AgentGChannelType = 'web' | 'telegram' | 'whatsapp' | 'mobile';

export type AgentGChannelStatus = {
  type: AgentGChannelType;
  connected: boolean;
  ready: boolean;
  note?: string;
};
