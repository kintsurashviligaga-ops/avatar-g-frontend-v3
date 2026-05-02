import dynamic from 'next/dynamic'

const LandingPageClient = dynamic(
  () => import('@/components/landing/LandingPageClient'),
  { ssr: false },
)

type LocaleRootPageProps = {
  params: {
    locale: string
  }
}

export default function LocaleRootPage({ params: _params }: LocaleRootPageProps) {
  return <LandingPageClient />
}
