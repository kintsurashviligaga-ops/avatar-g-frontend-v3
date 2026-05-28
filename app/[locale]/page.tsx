import { redirect } from 'next/navigation'

type Props = { params: { locale: string } }

// Middleware handles this redirect to the Unified Workspace, but SSR
// fallback keeps it safe and consistent with the same destination.
export default function LocaleRootPage({ params }: Props) {
  redirect(`/${params.locale}/chat`)
}
