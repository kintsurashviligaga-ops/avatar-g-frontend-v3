import { redirect } from 'next/navigation'

type Props = { params: { locale: string } }

// The old /{lang}/landing route. The landing lives at /{lang} now (docs/DESIGN.md §9); stale bookmarks and
// service-worker-cached navigations land there.
export default function RetiredLandingPage({ params }: Props) {
  redirect(`/${params.locale}`)
}
