import { Badge } from '@/components/ui/badge';

type CostBadgeProps = {
  credits: number;
  compact?: boolean;
};

export function CostBadge({ credits, compact = false }: CostBadgeProps) {
  const label = compact ? `${credits} cr` : `${credits} credits`;
  return <Badge variant="secondary">{label}</Badge>;
}
