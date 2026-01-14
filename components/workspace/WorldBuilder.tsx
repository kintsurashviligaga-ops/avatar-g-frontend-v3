'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { useWorkspace } from './WorkspaceProvider'

const WorldBuilder: React.FC = () => {
  const { addMessage, addAsset } = useWorkspace()
  const [worldGenre, setWorldGenre] = useState('fantasy')
  const [mapSize, setMapSize] = useState('medium')
  const [npcCount, setNpcCount] = useState('10')

  const handleGenerateSpec = () => {
    const spec = {
      genre: worldGenre,
      map: {
        size: mapSize,
        biomes: ['forest', 'mountain', 'plains'],
      },
      npcs: {
        count: parseInt(npcCount),
        behaviorSystem: 'AI-Driven',
      },
      physics: 'Arcade',
      generated: new Date().toISOString(),
    }

    const specText = JSON.stringify(spec, null, 2)

    addMessage({
      role: 'assistant',
      text: `Game specification generated:\n\`\`\`json\n${specText}\n\`\`\``,
      meta: { service: 'game' },
    })

    addAsset({
      type: 'project',
      title: `${worldGenre.charAt(0).toUpperCase() + worldGenre.slice(1)} World Project`,
      sizeLabel: '2 MB',
      meta: { service: 'game', spec },
    })
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-xl p-8 mb-6 bg-gradient-to-br from-violet-500/10 to-blue-500/10"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center">
              <span className="text-3xl">🎮</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-silver mb-1">Game Forge</h2>
              <p className="text-sm text-silver/50">World Builder • NPC • Logic</p>
            </div>
          </div>
          <p className="text-silver/70">
            Design interactive game worlds with AI-driven NPCs, procedural environments, and custom game logic.
          </p>
        </motion.div>

        <div className="space-y-6">
          <Card>
            <h3 className="text-sm font-semibold text-silver mb-4">World Configuration</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-silver/70 mb-2">World Genre</label>
                <select
                  value={worldGenre}
                  onChange={(e) => setWorldGenre(e.target.value)}
                  className="w-full glass-card px-3 py-2 text-sm text-silver rounded-lg focus:outline-none focus:ring-2 focus:ring-silver/20"
                >
                  <option value="fantasy">Fantasy</option>
                  <option value="scifi">Sci-Fi</option>
                  <option value="modern">Modern</option>
                  <option value="historical">Historical</option>
                  <option value="cyberpunk">Cyberpunk</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-silver/70 mb-2">Map Size</label>
                <div className="grid grid-cols-3 gap-2">
                  {['small', 'medium', 'large'].map((size) => (
                    <button
                      key={size}
                      onClick={() => setMapSize(size)}
                      className={`py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                        mapSize === size
                          ? 'bg-silver/90 text-obsidian'
                          : 'glass-card text-silver hover:bg-white/10'
                      }`}
                    >
                      {size.charAt(0).toUpperCase() + size.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-silver/70 mb-2">NPC Count</label>
                <input
                  type="number"
                  value={npcCount}
                  onChange={(e) => setNpcCount(e.target.value)}
                  min="1"
                  max="100"
                  className="w-full glass-card px-3 py-2 text-sm text-silver rounded-lg focus:outline-none focus:ring-2 focus:ring-silver/20"
                />
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-silver mb-4">Game Systems</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-card p-3 rounded-lg">
                <p className="text-xs text-silver/50 mb-1">Physics</p>
                <p className="text-sm font-medium text-silver">Arcade</p>
              </div>
              <div className="glass-card p-3 rounded-lg">
                <p className="text-xs text-silver/50 mb-1">AI System</p>
                <p className="text-sm font-medium text-silver">Behavioral</p>
              </div>
              <div className="glass-card p-3 rounded-lg">
                <p className="text-xs text-silver/50 mb-1">Rendering</p>
                <p className="text-sm font-medium text-silver">3D</p>
              </div>
              <div className="glass-card p-3 rounded-lg">
                <p className="text-xs text-silver/50 mb-1">Multiplayer</p>
                <p className="text-sm font-medium text-silver">Optional</p>
              </div>
            </div>
          </Card>

          <Button onClick={handleGenerateSpec} size="lg" className="w-full">
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Generate Game Specification
          </Button>
        </div>
      </div>
    </div>
  )
}

export default WorldBuilder
