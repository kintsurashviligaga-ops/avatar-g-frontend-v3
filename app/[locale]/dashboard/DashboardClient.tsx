'use client'

import { OneWindowWorkspace } from '@/components/dashboard/OneWindowWorkspace'

interface DashboardClientProps {
  locale: string
}

export default function DashboardClient({ locale }: DashboardClientProps) {
  return <OneWindowWorkspace locale={locale} />
}
