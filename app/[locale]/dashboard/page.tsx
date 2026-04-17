import DashboardClient from './DashboardClient'

type DashboardPageProps = {
  params: Promise<{ locale: string }>
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale } = await params
  return <DashboardClient locale={locale} />
}
