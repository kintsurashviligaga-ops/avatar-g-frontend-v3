'use client'

import React, { useEffect, useRef } from 'react'

export default function CosmicSingularityBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false }) // Optimize by disabling alpha on the canvas itself
    if (!ctx) return

    let animationId: number
    let time = 0

    // Resize handling
    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Configuration
    const numStars = 400
    const numNebulaDust = 150
    const speedMultiplier = 1.0

    // Stars data (3D projection)
    interface Star {
      x: number
      y: number
      z: number
      size: number
      color: string
    }
    const stars: Star[] = []
    const colors = ['#ffffff', '#00ffff', '#ff88ff', '#8888ff', '#ffffff']

    for (let i = 0; i < numStars; i++) {
      stars.push({
        x: (Math.random() - 0.5) * 2000,
        y: (Math.random() - 0.5) * 2000,
        z: Math.random() * 2000,
        size: Math.random() * 1.5 + 0.5,
        color: colors[Math.floor(Math.random() * colors.length)] || '#ffffff',
      })
    }

    // Nebula dust (orbiting the singularity)
    interface Dust {
      angle: number
      radius: number
      speed: number
      size: number
      hue: number
    }
    const dustParticles: Dust[] = []
    for (let i = 0; i < numNebulaDust; i++) {
      dustParticles.push({
        angle: Math.random() * Math.PI * 2,
        radius: Math.random() * 400 + 50,
        speed: (Math.random() * 0.002 + 0.001) * (Math.random() > 0.5 ? 1 : -1),
        size: Math.random() * 30 + 10,
        hue: Math.random() * 60 + 240, // Purple to cyan/blue range
      })
    }

    const draw = () => {
      time += 0.01

      const cx = canvas.width / 2
      const cy = canvas.height / 2

      // 1. Deep space background
      ctx.fillStyle = '#020008' // Very dark space color
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // 2. Andromeda Singularity Core (The destination)
      // Pulse effect on the core
      const pulse = Math.sin(time * 2) * 0.1 + 0.9

      const coreGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 500 * pulse)
      coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)')
      coreGradient.addColorStop(0.1, 'rgba(0, 255, 255, 0.2)')
      coreGradient.addColorStop(0.3, 'rgba(138, 43, 226, 0.1)')
      coreGradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
      
      ctx.fillStyle = coreGradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // 3. Draw Planets (Distant and beautiful)
      // Planet 1: Gas giant
      const p1x = cx + Math.cos(time * 0.2) * (canvas.width * 0.3)
      const p1y = cy + Math.sin(time * 0.2) * (canvas.height * 0.2)
      const planetGradient1 = ctx.createRadialGradient(
        p1x - 20, p1y - 20, 5, p1x, p1y, 60
      )
      planetGradient1.addColorStop(0, 'rgba(255, 182, 193, 0.8)') // pink-ish
      planetGradient1.addColorStop(0.5, 'rgba(75, 0, 130, 0.6)')  // indigo
      planetGradient1.addColorStop(1, 'rgba(0, 0, 0, 0)')
      
      ctx.beginPath()
      ctx.arc(p1x, p1y, 60, 0, Math.PI * 2)
      ctx.fillStyle = planetGradient1
      ctx.fill()
      
      // Planet 2: Small bright turquoise orb
      const p2x = cx + Math.cos(time * 0.3 + Math.PI) * (canvas.width * 0.4)
      const p2y = cy + Math.sin(time * 0.3 + Math.PI) * (canvas.height * 0.3)
      const planetGradient2 = ctx.createRadialGradient(
        p2x - 10, p2y - 10, 2, p2x, p2y, 30
      )
      planetGradient2.addColorStop(0, 'rgba(224, 255, 255, 0.9)')
      planetGradient2.addColorStop(0.4, 'rgba(0, 206, 209, 0.7)')
      planetGradient2.addColorStop(1, 'rgba(0, 0, 0, 0)')
      
      ctx.beginPath()
      ctx.arc(p2x, p2y, 30, 0, Math.PI * 2)
      ctx.fillStyle = planetGradient2
      ctx.fill()

      // 4. Nebula Dust (Swirling around the core)
      ctx.globalCompositeOperation = 'screen'
      dustParticles.forEach((dust) => {
        dust.angle += dust.speed
        // Slowly pull them into the singularity, then respawn
        dust.radius -= 0.5
        if (dust.radius < 10) {
            dust.radius = Math.random() * 400 + 300
        }

        const dx = cx + Math.cos(dust.angle) * dust.radius * 1.5 // elliptical
        const dy = cy + Math.sin(dust.angle) * dust.radius * 0.8

        const dustGrad = ctx.createRadialGradient(dx, dy, 0, dx, dy, dust.size)
        dustGrad.addColorStop(0, `hsla(${dust.hue}, 100%, 60%, 0.15)`)
        dustGrad.addColorStop(1, 'rgba(0,0,0,0)')

        ctx.beginPath()
        ctx.arc(dx, dy, dust.size, 0, Math.PI * 2)
        ctx.fillStyle = dustGrad
        ctx.fill()
      })
      ctx.globalCompositeOperation = 'source-over'

      // 5. Warp Speed Stars
      // The perspective projection
      const fov = 300
      
      stars.forEach((star) => {
        // Move star towards the viewer (decreasing z)
        star.z -= 15 * speedMultiplier
        
        // Wrap star back to distance if it passes behind the camera
        if (star.z < 1) {
          star.x = (Math.random() - 0.5) * 2000
          star.y = (Math.random() - 0.5) * 2000
          star.z = 2000
        }
        
        // Project 3D vector to 2D screen coordinates
        const scale = fov / star.z
        const px = star.x * scale + cx
        const py = star.y * scale + cy
        
        // Previous position for the warp streak line
        const pScale = fov / (star.z + 15 * speedMultiplier)
        const ppx = star.x * pScale + cx
        const ppy = star.y * pScale + cy
        
        // Don't draw if outside screen
        if (px >= 0 && px <= canvas.width && py >= 0 && py <= canvas.height) {
          // Opacity fades in as they get closer (z gets smaller)
          const opacity = Math.min(1, Math.max(0.1, 1 - (star.z / 2000)))
          
          ctx.beginPath()
          ctx.moveTo(ppx, ppy)
          ctx.lineTo(px, py)
          
          ctx.lineWidth = star.size * scale
          ctx.strokeStyle = star.color
          ctx.globalAlpha = opacity
          ctx.stroke()
          ctx.globalAlpha = 1.0
        }
      })

      // Frame text / cosmic layout contours
      // We can draw subtle tech/hud elements on the edges
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)'
      ctx.lineWidth = 1
      
      // Top left corner bracket
      ctx.beginPath()
      ctx.moveTo(30, 80)
      ctx.lineTo(30, 30)
      ctx.lineTo(80, 30)
      ctx.stroke()
      
      // Top right corner bracket
      ctx.beginPath()
      ctx.moveTo(canvas.width - 80, 30)
      ctx.lineTo(canvas.width - 30, 30)
      ctx.lineTo(canvas.width - 30, 80)
      ctx.stroke()
      
      // Bottom left corner bracket
      ctx.beginPath()
      ctx.moveTo(30, canvas.height - 80)
      ctx.lineTo(30, canvas.height - 30)
      ctx.lineTo(80, canvas.height - 30)
      ctx.stroke()
      
      // Bottom right corner bracket
      ctx.beginPath()
      ctx.moveTo(canvas.width - 80, canvas.height - 30)
      ctx.lineTo(canvas.width - 30, canvas.height - 30)
      ctx.lineTo(canvas.width - 30, canvas.height - 80)
      ctx.stroke()

      // Small tech decor lines
      ctx.beginPath()
      ctx.moveTo(canvas.width / 2 - 100, 20)
      ctx.lineTo(canvas.width / 2 + 100, 20)
      ctx.stroke()
      
      ctx.beginPath()
      ctx.moveTo(canvas.width / 2 - 100, canvas.height - 20)
      ctx.lineTo(canvas.width / 2 + 100, canvas.height - 20)
      ctx.stroke()

      animationId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[-1] pointer-events-none bg-[#020008]">
      <canvas 
        ref={canvasRef} 
        className="block w-full h-full"
      />
      {/* Decorative cosmic glass overlay/vignette to blend content nicely */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.6)_100%)] pointer-events-none" />
    </div>
  )
}
