import { Button } from '@/components/ui/button';

type CancelButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export function CancelButton({ onClick, disabled, loading }: CancelButtonProps) {
  return (
    <Button size="sm" variant="destructive" onClick={onClick} disabled={disabled || loading}>
      {loading ? 'Cancelling…' : 'Cancel'}
    </Button>
  );
}
