'use client'

import FullChatWorkspace from '@/components/dashboard/FullChatWorkspace'

interface DashboardClientProps {
  locale: string
}

export default function DashboardClient({ locale }: DashboardClientProps) {
  return <FullChatWorkspace locale={locale} />
}
