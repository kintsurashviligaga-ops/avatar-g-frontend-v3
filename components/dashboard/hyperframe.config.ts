import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Bot,
  UserCircle2,
  ImageIcon,
  Video,
  Music2,
  FileText,
  Workflow,
  BarChart3,
  Building2,
  TrendingUp,
  Sparkles,
  Layers,
  MessageSquare,
} from 'lucide-react';

export interface DashboardNavItem {
  id: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
  href: string;
  color: string;
}

export interface DashboardNavSection {
  section: string;
  items: DashboardNavItem[];
}

export interface DashboardMetric {
  id: string;
  label: string;
  value: string;
  sub: string;
  trend: string;
  icon: LucideIcon;
  color: string;
}

export interface DashboardQuickCard {
  id: string;
  label: string;
  desc: string;
  href: string;
  icon: LucideIcon;
  color: string;
}

export interface DashboardActivity {
  id: string;
  text: string;
  time: string;
  status: 'done' | 'running';
  icon: LucideIcon;
  color: string;
}

export const DASHBOARD_NAV_SECTIONS: DashboardNavSection[] = [
  {
    section: 'Overview',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        subtitle: 'One Window command center',
        icon: LayoutDashboard,
        href: '/dashboard',
        color: '#22d3ee',
      },
    ],
  },
  {
    section: 'Agents',
    items: [
      {
        id: 'agent-g',
        label: 'Agent G',
        subtitle: 'AI orchestrator',
        icon: Bot,
        href: '/dashboard/agent-g',
        color: '#22d3ee',
      },
      {
        id: 'business-agent',
        label: 'Business Agent',
        subtitle: 'Growth strategist',
        icon: Building2,
        href: '/dashboard/business-agent',
        color: '#34d399',
      },
      {
        id: 'executive-agent',
        label: 'Executive Agent',
        subtitle: 'Executive decisions',
        icon: TrendingUp,
        href: '/dashboard/executive-agent',
        color: '#fb7185',
      },
    ],
  },
  {
    section: 'Create',
    items: [
      {
        id: 'avatar',
        label: 'Avatar Studio',
        subtitle: 'Persona generation',
        icon: UserCircle2,
        href: '/dashboard/avatar',
        color: '#38bdf8',
      },
      {
        id: 'image',
        label: 'Image Generation',
        subtitle: 'Campaign visuals',
        icon: ImageIcon,
        href: '/dashboard/image',
        color: '#f59e0b',
      },
      {
        id: 'video',
        label: 'Video Generation',
        subtitle: 'Motion stories',
        icon: Video,
        href: '/dashboard/video',
        color: '#f97316',
      },
      {
        id: 'music',
        label: 'Music Production',
        subtitle: 'Audio direction',
        icon: Music2,
        href: '/dashboard/music',
        color: '#34d399',
      },
      {
        id: 'copy',
        label: 'Text & Copy',
        subtitle: 'Narrative engine',
        icon: FileText,
        href: '/dashboard/copy',
        color: '#06b6d4',
      },
    ],
  },
  {
    section: 'Intelligence',
    items: [
      {
        id: 'workflows',
        label: 'Workflow Builder',
        subtitle: 'Automation graph',
        icon: Workflow,
        href: '/dashboard/workflows',
        color: '#84cc16',
      },
      {
        id: 'analytics',
        label: 'Analytics',
        subtitle: 'System telemetry',
        icon: BarChart3,
        href: '/dashboard/analytics',
        color: '#60a5fa',
      },
    ],
  },
];

export const DASHBOARD_METRICS: DashboardMetric[] = [
  {
    id: 'credits',
    label: 'Credits Remaining',
    value: '4,200',
    sub: 'of 10,000 monthly stack',
    trend: '-580 this week',
    icon: Sparkles,
    color: '#22d3ee',
  },
  {
    id: 'sessions',
    label: 'AI Sessions',
    value: '127',
    sub: 'cross-service orchestration chats',
    trend: '+23 this week',
    icon: MessageSquare,
    color: '#34d399',
  },
  {
    id: 'outputs',
    label: 'Generated Assets',
    value: '48',
    sub: 'images, video, and text outputs',
    trend: '+12 this week',
    icon: Layers,
    color: '#f59e0b',
  },
  {
    id: 'pipelines',
    label: 'Active Pipelines',
    value: '3',
    sub: 'always-on automations',
    trend: '2 completed today',
    icon: Workflow,
    color: '#60a5fa',
  },
];

export const DASHBOARD_QUICK_CARDS: DashboardQuickCard[] = [
  {
    id: 'agent-g',
    label: 'Agent G',
    desc: 'AI ორკესტრატორი',
    href: '/dashboard/agent-g',
    icon: Bot,
    color: '#22d3ee',
  },
  {
    id: 'business-agent',
    label: 'Business Agent',
    desc: 'ბიზნეს ზრდის სტრატეგია',
    href: '/dashboard/business-agent',
    icon: Building2,
    color: '#34d399',
  },
  {
    id: 'executive-agent',
    label: 'Executive Agent',
    desc: 'CEO დონის გადაწყვეტილებები',
    href: '/dashboard/executive-agent',
    icon: TrendingUp,
    color: '#fb7185',
  },
  {
    id: 'avatar',
    label: 'Avatar Studio',
    desc: 'ავატარის შექმნა',
    href: '/dashboard/avatar',
    icon: UserCircle2,
    color: '#38bdf8',
  },
  {
    id: 'image',
    label: 'Image Generation',
    desc: 'AI სურათები',
    href: '/dashboard/image',
    icon: ImageIcon,
    color: '#f59e0b',
  },
  {
    id: 'video',
    label: 'Video Generation',
    desc: 'ვიდეო სკრიპტები',
    href: '/dashboard/video',
    icon: Video,
    color: '#f97316',
  },
  {
    id: 'music',
    label: 'Music Production',
    desc: 'AI მუსიკა',
    href: '/dashboard/music',
    icon: Music2,
    color: '#34d399',
  },
  {
    id: 'copy',
    label: 'Text & Copy',
    desc: 'მარკეტინგ ტექსტი',
    href: '/dashboard/copy',
    icon: FileText,
    color: '#06b6d4',
  },
  {
    id: 'workflows',
    label: 'Workflow Builder',
    desc: 'ავტომატიზაცია',
    href: '/dashboard/workflows',
    icon: Workflow,
    color: '#84cc16',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    desc: 'მონაცემთა ანალიზი',
    href: '/dashboard/analytics',
    icon: BarChart3,
    color: '#60a5fa',
  },
];

export const DASHBOARD_ACTIVITY: DashboardActivity[] = [
  {
    id: 'a1',
    text: 'Agent G - campaign strategy draft completed',
    time: '2 min ago',
    status: 'done',
    icon: Bot,
    color: '#22d3ee',
  },
  {
    id: 'a2',
    text: 'Business Agent - CAC/LTV plan exported',
    time: '19 min ago',
    status: 'done',
    icon: Building2,
    color: '#34d399',
  },
  {
    id: 'a3',
    text: 'Workflow Builder - content pipeline running',
    time: '1 h ago',
    status: 'running',
    icon: Workflow,
    color: '#84cc16',
  },
  {
    id: 'a4',
    text: 'Executive Agent - KPI board brief generated',
    time: '3 h ago',
    status: 'done',
    icon: TrendingUp,
    color: '#fb7185',
  },
  {
    id: 'a5',
    text: 'Avatar Studio - profile persona rendered',
    time: 'yesterday',
    status: 'done',
    icon: UserCircle2,
    color: '#38bdf8',
  },
];
