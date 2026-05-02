import dynamic from 'next/dynamic'

const LandingPageClient = dynamic(
  () => import('@/components/landing/LandingPageClient'),
  { ssr: false },
)

export default function LandingPage() {
  return <LandingPageClient />
}
