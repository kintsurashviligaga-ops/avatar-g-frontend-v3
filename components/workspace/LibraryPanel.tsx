'use client'

import React from 'react'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { useWorkspace } from './WorkspaceProvider'
import { formatDate } from '@/lib/utils'
import type { AssetType } from '@/lib/types'

const assetTypeLabels: Record<AssetType, string> = {
  avatar: 'Avatar',
  voice: 'Voice',
  image: 'Image',
  music: 'Music',
  video: 'Video',
  project: 'Project',
}

const assetTypeIcons: Record<AssetType, string> = {
  avatar: '👤',
  voice: '🎙️',
  image: '🖼️',
  music: '🎵',
  video: '🎬',
  project: '📦',
}

const LibraryPanel: React.FC = () => {
  const { assets } = useWorkspace()

  const groupedAssets = assets.reduce((acc, asset) => {
    if (!acc[asset.type]) {
      acc[asset.type] = []
    }
    acc[asset.type].push(asset)
    return acc
  }, {} as Record<AssetType, typeof assets>)

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, assetId: string) => {
    e.dataTransfer.setData('assetId', assetId)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-silver mb-1">Asset Library</h3>
            <p className="text-sm text-silver/50">Drag assets to services to create pipeline jobs</p>
          </div>
          <Badge variant="info">{assets.length} Assets</Badge>
        </div>

        {assets.length === 0 ? (
          <div className="glass-card rounded-xl p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-silver/5 flex items-center justify-center">
              <svg className="w-10 h-10 text-silver/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h4 className="text-base font-semibold text-silver/70 mb-2">No Assets Yet</h4>
            <p className="text-sm text-silver/40 mb-6">Create content in any service to populate your library</p>
            <Button variant="secondary" onClick={() => {}}>
              Start Creating
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {(Object.keys(groupedAssets) as AssetType[]).map((type) => (
              <div key={type}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">{assetTypeIcons[type]}</span>
                  <h4 className="text-sm font-semibold text-silver uppercase tracking-wider">
                    {assetTypeLabels[type]}
                  </h4>
                  <Badge variant="default">{groupedAssets[type].length}</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groupedAssets[type].map((asset, index) => (
                    <motion.div
                      key={asset.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <div
                        draggable
                        onDragStart={(e) => handleDragStart(e, asset.id)}
                        className="cursor-move"
                      >
                        <Card hover>
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h5 className="text-sm font-medium text-silver mb-1">{asset.title}</h5>
                              <p className="text-xs text-silver/50">{formatDate(asset.createdAt)}</p>
                            </div>
                            <button className="text-silver/50 hover:text-silver transition-colors">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                              </svg>
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="default" className="text-xs">
                              {type}
                            </Badge>
                            {asset.sizeLabel && (
                              <span className="text-xs text-silver/40">{asset.sizeLabel}</span>
                            )}
                          </div>
                        </Card>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default LibraryPanel
