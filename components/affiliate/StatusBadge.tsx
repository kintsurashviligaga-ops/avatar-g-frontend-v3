/**
 * Status Badge Component
 * 
 * Colored badge for displaying status
 */

'use client';

import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: 'active' | 'disabled' | 'pending' | 'eligible' | 'available' | 'paid' | 'reversed' | 'failed' | 'completed' | 'processing';
  label: string;
}

const statusColors = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  eligible: 'bg-green-500/20 text-green-400 border-green-500/30',
  available: 'bg-green-500/20 text-green-400 border-green-500/30',
  paid: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  processing: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  disabled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  reversed: 'bg-red-500/20 text-red-400 border-red-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const colorClass = statusColors[status] || statusColors.pending;

  return (
    <Badge
      variant="outline"
      className={`${colorClass} font-medium px-2.5 py-0.5 text-xs`}
    >
      {label}
    </Badge>
  );
}
