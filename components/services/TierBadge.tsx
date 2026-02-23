import { Badge } from '@/components/ui/badge';

type TierBadgeProps = {
  plan?: 'FREE' | 'PRO' | 'PREMIUM' | 'ENTERPRISE';
};

const LABELS = {
  FREE: 'Free',
  PRO: 'Pro',
  PREMIUM: 'Premium',
  ENTERPRISE: 'Enterprise',
} as const;

export function TierBadge({ plan = 'FREE' }: TierBadgeProps) {
  const variant = plan === 'ENTERPRISE' ? 'accent' : plan === 'PREMIUM' ? 'primary' : plan === 'PRO' ? 'secondary' : 'outline';
  return <Badge variant={variant}>{LABELS[plan]}</Badge>;
}
