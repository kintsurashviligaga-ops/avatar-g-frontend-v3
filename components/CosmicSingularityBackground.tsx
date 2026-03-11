'use client'

import { useEffect, useRef } from 'react'

interface Star {
  x: number
  y: number
  z: number
  size: number
  pulse: number
  hue: number
  speed: number
}

interface Veil {
  anchorX: number
  anchorY: number
  radius: number
  color: string
  drift: number
}

interface Comet {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
}

export default function CosmicSingularityBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    let animationId = 0
    let time = 0
    let viewportW = 0
    let viewportH = 0
    let dpr = 1
    let reducedMotion = false

    const stars: Star[] = []
    const veils: Veil[] = []
    const comets: Comet[] = []

    const initScene = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      viewportW = window.innerWidth
      viewportH = window.innerHeight
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      canvas.width = Math.floor(viewportW * dpr)
      canvas.height = Math.floor(viewportH * dpr)
      canvas.style.width = `${viewportW}px`
      canvas.style.height = `${viewportH}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const isSmall = viewportW < 900
      const starCount = isSmall ? 300 : 560
      const cometCount = isSmall ? 1 : 3
      const horizon = Math.max(viewportW, viewportH)

      stars.length = 0
      veils.length = 0
      comets.length = 0

      for (let i = 0; i < starCount; i++) {
        const warmBias = Math.random() > 0.82
        stars.push({
          x: (Math.random() - 0.5) * 3000,
          y: (Math.random() - 0.5) * 2100,
          z: Math.random() * 2500 + 140,
          size: Math.random() * 1.5 + 0.3,
          pulse: Math.random() * Math.PI * 2,
          hue: warmBias ? 38 + Math.random() * 12 : 188 + Math.random() * 22,
          speed: Math.random() * 7 + 3,
        })
      }

      veils.push(
        {
          anchorX: viewportW * 0.2,
          anchorY: viewportH * 0.18,
          radius: horizon * 0.34,
          color: 'rgba(64,169,191,0.16)',
          drift: 0.16,
        },
        {
          anchorX: viewportW * 0.72,
          anchorY: viewportH * 0.24,
          radius: horizon * 0.26,
          color: 'rgba(199,152,74,0.11)',
          drift: 0.22,
        },
        {
          anchorX: viewportW * 0.5,
          anchorY: viewportH * 0.76,
          radius: horizon * 0.42,
          color: 'rgba(45,95,141,0.16)',
          drift: 0.12,
        }
      )

      for (let i = 0; i < cometCount; i++) {
        comets.push({
          x: viewportW + Math.random() * viewportW * 0.45,
          y: Math.random() * viewportH * 0.55,
          vx: -(Math.random() * 2 + 1.2),
          vy: Math.random() * 0.28 + 0.05,
          life: Math.random() * 240,
          maxLife: Math.random() * 220 + 150,
        })
      }
    }

    const drawPerspectiveGrid = (tick: number) => {
      const horizonY = viewportH * 0.66
      const vanishX = viewportW * 0.5

      ctx.save()
      ctx.strokeStyle = 'rgba(122,186,198,0.08)'
      ctx.lineWidth = 1

      for (let i = 0; i < 7; i++) {
        const t = i / 6
        const y = horizonY + Math.pow(t, 1.75) * viewportH * 0.34
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(viewportW, y)
        ctx.stroke()
      }

      for (let i = -5; i <= 5; i++) {
        const drift = Math.sin(tick * 0.45 + i * 0.7) * 4
        ctx.beginPath()
        ctx.moveTo(vanishX + drift, horizonY)
        ctx.lineTo(vanishX + i * viewportW * 0.14, viewportH)
        ctx.stroke()
      }

      ctx.restore()
    }

    const draw = () => {
      time += reducedMotion ? 0.0018 : 0.0075

      const cx = viewportW * 0.5
      const cy = viewportH * 0.42
      const fov = 360

      const deepSpace = ctx.createLinearGradient(0, 0, viewportW, viewportH)
      deepSpace.addColorStop(0, '#03060b')
      deepSpace.addColorStop(0.42, '#07111a')
      deepSpace.addColorStop(1, '#020409')
      ctx.fillStyle = deepSpace
      ctx.fillRect(0, 0, viewportW, viewportH)

      for (const veil of veils) {
        const offsetX = Math.sin(time * veil.drift) * 22
        const offsetY = Math.cos(time * (veil.drift + 0.06)) * 18
        const glow = ctx.createRadialGradient(
          veil.anchorX + offsetX,
          veil.anchorY + offsetY,
          0,
          veil.anchorX + offsetX,
          veil.anchorY + offsetY,
          veil.radius
        )
        glow.addColorStop(0, veil.color)
        glow.addColorStop(0.45, veil.color.replace(/0\.\d+\)/, '0.08)'))
        glow.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = glow
        ctx.fillRect(0, 0, viewportW, viewportH)
      }

      const horizonGlow = ctx.createLinearGradient(0, viewportH * 0.55, 0, viewportH)
      horizonGlow.addColorStop(0, 'rgba(0,0,0,0)')
      horizonGlow.addColorStop(0.45, 'rgba(18,69,94,0.08)')
      horizonGlow.addColorStop(1, 'rgba(198,146,73,0.12)')
      ctx.fillStyle = horizonGlow
      ctx.fillRect(0, viewportH * 0.55, viewportW, viewportH * 0.45)

      for (const star of stars) {
        star.z -= reducedMotion ? 1.8 : star.speed
        if (star.z < 24) {
          star.x = (Math.random() - 0.5) * 3000
          star.y = (Math.random() - 0.5) * 2100
          star.z = 2500
          star.pulse = Math.random() * Math.PI * 2
        }

        const scale = fov / star.z
        const px = star.x * scale + cx
        const py = star.y * scale + cy
        if (px < -12 || px > viewportW + 12 || py < -12 || py > viewportH + 12) continue

        const lum = (0.62 + Math.sin(time * 2 + star.pulse) * 0.3) * Math.max(0.24, 1 - star.z / 2500)
        const radius = Math.max(0.35, star.size * scale * 1.6)
        const glow = ctx.createRadialGradient(px, py, 0, px, py, radius * 7)
        glow.addColorStop(0, `hsla(${star.hue}, 95%, 84%, ${lum})`)
        glow.addColorStop(0.55, `hsla(${star.hue}, 95%, 70%, ${lum * 0.34})`)
        glow.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.beginPath()
        ctx.arc(px, py, radius * 1.5, 0, Math.PI * 2)
        ctx.fillStyle = glow
        ctx.fill()

        ctx.beginPath()
        ctx.arc(px, py, radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.96, lum + 0.1)})`
        ctx.fill()
      }

      drawPerspectiveGrid(time)

      for (const comet of comets) {
        comet.life += reducedMotion ? 0.18 : 1
        if (comet.life > comet.maxLife) {
          comet.x = viewportW + Math.random() * viewportW * 0.45
          comet.y = Math.random() * viewportH * 0.55
          comet.vx = -(Math.random() * 2 + 1.2)
          comet.vy = Math.random() * 0.28 + 0.05
          comet.life = 0
          comet.maxLife = Math.random() * 220 + 150
        }

        comet.x += comet.vx * (reducedMotion ? 0.3 : 1)
        comet.y += comet.vy * (reducedMotion ? 0.3 : 1)
        const alpha = Math.max(0, 1 - comet.life / comet.maxLife)
        const tailLength = 110
        const trail = ctx.createLinearGradient(comet.x, comet.y, comet.x + tailLength, comet.y - tailLength * 0.12)
        trail.addColorStop(0, `rgba(239,250,255,${alpha * 0.8})`)
        trail.addColorStop(1, 'rgba(239,250,255,0)')

        ctx.strokeStyle = trail
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(comet.x, comet.y)
        ctx.lineTo(comet.x + tailLength, comet.y - tailLength * 0.12)
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(comet.x, comet.y, 1.6, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,250,240,${alpha})`
        ctx.fill()
      }

      const vignette = ctx.createRadialGradient(
        viewportW * 0.5,
        viewportH * 0.48,
        Math.min(viewportW, viewportH) * 0.24,
        viewportW * 0.5,
        viewportH * 0.48,
        Math.max(viewportW, viewportH) * 0.78
      )
      vignette.addColorStop(0, 'rgba(0,0,0,0)')
      vignette.addColorStop(1, 'rgba(0,0,0,0.54)')
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, viewportW, viewportH)

      if (!reducedMotion) {
        animationId = requestAnimationFrame(draw)
      }
    }

    initScene()
    draw()

    const onResize = () => {
      initScene()
      if (reducedMotion) draw()
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div className='fixed inset-0 z-0 pointer-events-none'>
      <canvas ref={canvasRef} className='block h-full w-full pointer-events-none' />
      <div className='absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(4,10,16,0.2)_54%,rgba(0,0,0,0.58)_100%)]' />
    </div>
  )
}
