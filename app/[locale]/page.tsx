import { redirect } from 'next/navigation'

type Props = { params: { locale: string } }

// Middleware handles this redirect, but SSR fallback keeps it safe
export default function LocaleRootPage({ params }: Props) {
  redirect(`/${params.locale}/dashboard`)
}
