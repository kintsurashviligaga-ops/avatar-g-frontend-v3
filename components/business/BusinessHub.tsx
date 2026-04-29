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
    <div className="hf-main-content">
      {/* Header */}
      <div className="hf-card px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="hf-heading text-2xl font-bold text-white">{t('hub_title')}</h1>
            <p className="mt-1 text-sm text-cyan-100/55">{t('hub_subtitle')}</p>
          </div>
        </div>
        <ComplianceNotice />
      </div>

      <div className="mt-4 flex h-[calc(100vh-220px)] gap-4">
        {/* Main content */}
        <div className="hf-card flex flex-1 flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-cyan-100/10 px-4 pb-0 pt-4">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  px-4 py-2 text-sm font-medium rounded-t-xl transition-all border-b-2
                  ${activeTab === tab.id
                    ? 'border-cyan-200 text-cyan-100 bg-cyan-200/[0.08]'
                    : 'border-transparent text-cyan-100/40 hover:text-cyan-100/70'}
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
        <div className="hf-card flex w-full flex-shrink-0 flex-col lg:w-[360px]">
          <BusinessChatPanel userId={userId} />
        </div>
      </div>
    </div>
  )
}

