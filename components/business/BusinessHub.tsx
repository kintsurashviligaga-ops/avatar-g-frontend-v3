'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { PlanBuilder } from './PlanBuilder'
import { ProductAnalyzer } from './ProductAnalyzer'
import { PipelineBuilder } from './PipelineBuilder'
import { BusinessTracker } from './BusinessTracker'
import { BusinessChatPanel } from './BusinessChatPanel'
import { ComplianceNotice } from './ComplianceNotice'

type Tab = 'plan' | 'product' | 'pipeline' | 'tracker'

const TABS: { id: Tab; label: string }[] = [
  { id: 'plan', label: 'Plan Builder' },
  { id: 'product', label: 'Product Analyzer' },
  { id: 'pipeline', label: 'Pipeline Builder' },
  { id: 'tracker', label: 'Tracker' },
]

export function BusinessHub({ userId }: { userId: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('plan')
  const t = useTranslations('business')

  return (
    <div className="min-h-screen bg-[#050510] text-white">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('hub_title')}</h1>
            <p className="text-white/40 text-sm mt-1">{t('hub_subtitle')}</p>
          </div>
        </div>
        <ComplianceNotice />
      </div>

      <div className="flex h-[calc(100vh-180px)]">
        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex gap-1 px-4 pt-4 border-b border-white/[0.06] pb-0">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  px-4 py-2 text-sm font-medium rounded-t-xl transition-all border-b-2
                  ${activeTab === tab.id
                    ? 'text-white border-white bg-white/[0.05]'
                    : 'text-white/40 border-transparent hover:text-white/70'}
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'plan' && <PlanBuilder userId={userId} />}
            {activeTab === 'product' && <ProductAnalyzer userId={userId} />}
            {activeTab === 'pipeline' && <PipelineBuilder userId={userId} />}
            {activeTab === 'tracker' && <BusinessTracker userId={userId} />}
          </div>
        </div>

        {/* Chat panel */}
        <div className="w-full lg:w-[360px] flex-shrink-0 border-l border-white/[0.06] flex flex-col">
          <BusinessChatPanel userId={userId} />
        </div>
      </div>
    </div>
  )
}
