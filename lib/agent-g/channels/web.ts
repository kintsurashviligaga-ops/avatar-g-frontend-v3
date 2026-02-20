import type { AgentGChannelStatus } from '@/lib/agent-g/types';

export function getWebChannelStatus(): AgentGChannelStatus {
  return {
    type: 'web',
    connected: true,
    ready: true,
    note: 'Primary channel',
  };
}
