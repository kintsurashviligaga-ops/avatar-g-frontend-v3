import { redirect } from 'next/navigation';

// SSR fallback for the bare root. Middleware normally handles this and
// redirects to /{locale}/chat (the Unified Workspace). If middleware is
// bypassed for any reason, this guarantees the same destination.
export default function RootPage() {
  redirect('/ka/chat');
}
