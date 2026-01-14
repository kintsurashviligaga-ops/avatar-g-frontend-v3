'use client'

import React from 'react'
import { motion } from 'framer-motion'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { useWorkspace } from './WorkspaceProvider'
import { services } from './Sidebar'
import type { ChatTab } from '@/lib/types'

const TopControlPanel: React.FC = () => {
  const { activeService, chatTab, setChatTab, setActiveService, dropdownSelections, setDropdownSelection } = useWorkspace()

  const currentService = services.find(s => s.key === activeService)

  const tabs: { key: ChatTab; label: string }[] = [
    { key: 'chat', label: 'Chat' },
    { key: 'library', label: 'Library' },
    { key: 'pipeline', label: 'Pipeline' },
  ]

  return (
    <div className="glass-panel border-b border-silver/10">
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setActiveService(null)}>
            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Services
          </Button>
          <div className="w-px h-5 bg-silver/10"></div>
          <span className="text-2xl">{currentService?.icon}</span>
          <div>
            <h2 className="text-sm font-semibold text-silver">{currentService?.title}</h2>
            <p className="text-xs text-silver/50">{currentService?.subtitle}</p>
          </div>
          <Badge variant="info">Active</Badge>
        </div>
      </div>

      {currentService && chatTab === 'chat' && currentService.key !== 'game' && currentService.key !== 'business' && (
        <div className="px-6 pb-4 flex gap-3 flex-wrap">
          {currentService.dropdowns.map((dropdown) => (
            <div key={dropdown.key} className="flex-1 min-w-[160px]">
              <label className="block text-xs font-medium text-silver/50 mb-1.5">
                {dropdown.label}
              </label>
              <select
                value={dropdownSelections[dropdown.key] || ''}
                onChange={(e) => setDropdownSelection(dropdown.key, e.target.value)}
                className="w-full glass-card px-3 py-2 text-sm text-silver rounded-lg focus:outline-none focus:ring-2 focus:ring-silver/20 cursor-pointer"
              >
                <option value="">Select...</option>
                {dropdown.options.map((option) => (
                  <option key={option} value={option} className="bg-obsidian">
                    {option}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="px-6 flex gap-1 border-t border-silver/10">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setChatTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              chatTab === tab.key
                ? 'text-silver border-silver'
                : 'text-silver/50 border-transparent hover:text-silver/70'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default TopControlPanel
