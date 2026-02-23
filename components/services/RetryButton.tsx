import { Button } from '@/components/ui/button';

type RetryButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export function RetryButton({ onClick, disabled, loading }: RetryButtonProps) {
  return (
    <Button size="sm" variant="secondary" onClick={onClick} disabled={disabled || loading}>
      {loading ? 'Retrying…' : 'Retry'}
    </Button>
  );
}
