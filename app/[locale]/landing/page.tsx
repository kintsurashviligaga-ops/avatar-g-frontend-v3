import { redirect } from 'next/navigation'

type Props = { params: { locale: string } }

// LEGACY LANDING RETIRED. The integrated cyber-black chat workspace is the only
// entrypoint. This route hard-redirects to the dashboard so the old marketing
// landing (full-bleed canvas + "საქართველოს AI ცივილიზაციური" banner) can never
// be served again — even for stale bookmarks or service-worker-cached navigations.
export default function RetiredLandingPage({ params }: Props) {
  redirect(`/${params.locale}/dashboard`)
}
