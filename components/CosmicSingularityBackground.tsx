'use client'

import React, { useEffect, useRef } from 'react'

interface Star {
  x: number
  y: number
  z: number
  size: number
  twinkle: number
  hue: number
}

interface Dust {
  angle: number
  radius: number
  speed: number
  size: number
  alpha: number
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

    const stars: Star[] = []
    const dustParticles: Dust[] = []

    const initScene = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      viewportW = window.innerWidth
      viewportH = window.innerHeight
      canvas.width = Math.floor(viewportW * dpr)
      canvas.height = Math.floor(viewportH * dpr)
      canvas.style.width = `${viewportW}px`
      canvas.style.height = `${viewportH}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const isSmall = viewportW < 900
      const starCount = isSmall ? 320 : 520
      const dustCount = isSmall ? 90 : 170

      stars.length = 0
      dustParticles.length = 0

      for (let i = 0; i < starCount; i++) {
        stars.push({
          x: (Math.random() - 0.5) * 2600,
          y: (Math.random() - 0.5) * 1800,
          z: Math.random() * 2200 + 80,
          size: Math.random() * 1.7 + 0.4,
          twinkle: Math.random() * Math.PI * 2,
          hue: 190 + Math.random() * 90,
        })
      }

      for (let i = 0; i < dustCount; i++) {
        dustParticles.push({
          angle: Math.random() * Math.PI * 2,
          radius: Math.random() * 460 + 90,
          speed: (Math.random() * 0.003 + 0.0012) * (Math.random() > 0.5 ? 1 : -1),
          size: Math.random() * 24 + 10,
          alpha: Math.random() * 0.22 + 0.08,
        })
      }
    }

    const drawPlanet = (x: number, y: number, radius: number, tint: [string, string]) => {
      const glow = ctx.createRadialGradient(x - radius * 0.4, y - radius * 0.5, radius * 0.08, x, y, radius)
      glow.addColorStop(0, tint[0])
      glow.addColorStop(0.55, tint[1])
      glow.addColorStop(1, 'rgba(0,0,0,0)')

      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fillStyle = glow
      ctx.fill()
    }

    const draw = () => {
      time += 0.008

      const cx = viewportW * 0.52
      const cy = viewportH * 0.44
      const singularityRadius = Math.min(viewportW, viewportH) * 0.09

      const deepSpace = ctx.createLinearGradient(0, 0, viewportW, viewportH)
      deepSpace.addColorStop(0, '#01030b')
      deepSpace.addColorStop(0.5, '#040917')
      deepSpace.addColorStop(1, '#02030a')
      ctx.fillStyle = deepSpace
      ctx.fillRect(0, 0, viewportW, viewportH)

      const nebula = ctx.createRadialGradient(cx, cy, singularityRadius * 0.6, cx, cy, Math.max(viewportW, viewportH) * 0.7)
      nebula.addColorStop(0, 'rgba(42,225,255,0.27)')
      nebula.addColorStop(0.35, 'rgba(58,104,255,0.2)')
      nebula.addColorStop(0.7, 'rgba(148,72,255,0.15)')
      nebula.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = nebula
      ctx.fillRect(0, 0, viewportW, viewportH)

      drawPlanet(
        cx - viewportW * 0.34 + Math.cos(time * 0.23) * 24,
        cy + viewportH * 0.22 + Math.sin(time * 0.2) * 10,
        Math.max(36, viewportW * 0.03),
        ['rgba(255,234,196,0.86)', 'rgba(140,78,255,0.3)']
      )

      drawPlanet(
        cx + viewportW * 0.28 + Math.sin(time * 0.2 + 1.4) * 18,
        cy - viewportH * 0.26 + Math.cos(time * 0.24 + 0.8) * 14,
        Math.max(24, viewportW * 0.02),
        ['rgba(193,255,250,0.92)', 'rgba(29,143,222,0.28)']
      )

      ctx.globalCompositeOperation = 'screen'
      for (const dust of dustParticles) {
        dust.angle += dust.speed
        dust.radius -= 0.46
        if (dust.radius < singularityRadius * 1.6) {
          dust.radius = Math.random() * 440 + 260
          dust.alpha = Math.random() * 0.24 + 0.06
        }

        const swirlX = cx + Math.cos(dust.angle) * dust.radius * 1.35
        const swirlY = cy + Math.sin(dust.angle * 0.92) * dust.radius * 0.62
        const haze = ctx.createRadialGradient(swirlX, swirlY, 0, swirlX, swirlY, dust.size)
        haze.addColorStop(0, `rgba(120,229,255,${dust.alpha})`)
        haze.addColorStop(0.55, `rgba(113,102,255,${dust.alpha * 0.7})`)
        haze.addColorStop(1, 'rgba(0,0,0,0)')

        ctx.beginPath()
        ctx.arc(swirlX, swirlY, dust.size, 0, Math.PI * 2)
        ctx.fillStyle = haze
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'

      const diskOuter = singularityRadius * 4.8
      const disk = ctx.createRadialGradient(cx, cy, singularityRadius * 0.8, cx, cy, diskOuter)
      disk.addColorStop(0, 'rgba(255,255,255,0)')
      disk.addColorStop(0.2, 'rgba(88,240,255,0.34)')
      disk.addColorStop(0.45, 'rgba(80,136,255,0.28)')
      disk.addColorStop(0.68, 'rgba(173,107,255,0.2)')
      disk.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = disk
      ctx.beginPath()
      ctx.ellipse(cx, cy, diskOuter, diskOuter * 0.45, Math.sin(time * 0.18) * 0.12, 0, Math.PI * 2)
      ctx.fill()

      ctx.globalCompositeOperation = 'lighter'
      const lensing = ctx.createRadialGradient(cx, cy, singularityRadius * 0.5, cx, cy, singularityRadius * 2.1)
      lensing.addColorStop(0, 'rgba(255,255,255,0.68)')
      lensing.addColorStop(0.32, 'rgba(89,219,255,0.52)')
      lensing.addColorStop(0.68, 'rgba(94,92,255,0.3)')
      lensing.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = lensing
      ctx.beginPath()
      ctx.arc(cx, cy, singularityRadius * 2.1, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'

      // Event horizon: a dark core to keep the black-hole silhouette crisp and visible.
      ctx.beginPath()
      ctx.arc(cx, cy, singularityRadius * 0.74, 0, Math.PI * 2)
      ctx.fillStyle = '#010108'
      ctx.fill()

      ctx.beginPath()
      ctx.arc(cx, cy, singularityRadius * 0.9, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(145,242,255,${0.78 + Math.sin(time * 2.7) * 0.12})`
      ctx.lineWidth = Math.max(2.8, singularityRadius * 0.038)
      ctx.stroke()

      const fov = 320
      for (const star of stars) {
        star.z -= 12
        if (star.z < 12) {
          star.x = (Math.random() - 0.5) * 2600
          star.y = (Math.random() - 0.5) * 1800
          star.z = 2200
          star.twinkle = Math.random() * Math.PI * 2
        }

        const scale = fov / star.z
        const px = star.x * scale + cx
        const py = star.y * scale + cy
        if (px < -10 || px > viewportW + 10 || py < -10 || py > viewportH + 10) continue

        const prevScale = fov / (star.z + 12)
        const ppx = star.x * prevScale + cx
        const ppy = star.y * prevScale + cy
        const alpha = Math.max(0.2, 1 - star.z / 2200)
        const twinkle = 0.7 + Math.sin(time * 2.1 + star.twinkle) * 0.3

        ctx.strokeStyle = `hsla(${star.hue}, 95%, 80%, ${alpha * twinkle})`
        ctx.lineWidth = Math.max(0.4, star.size * scale * 1.35)
        ctx.beginPath()
        ctx.moveTo(ppx, ppy)
        ctx.lineTo(px, py)
        ctx.stroke()
      }

      const vignette = ctx.createRadialGradient(viewportW * 0.5, viewportH * 0.5, Math.min(viewportW, viewportH) * 0.25, viewportW * 0.5, viewportH * 0.5, Math.max(viewportW, viewportH) * 0.72)
      vignette.addColorStop(0, 'rgba(0,0,0,0)')
      vignette.addColorStop(1, 'rgba(0,0,0,0.38)')
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, viewportW, viewportH)

      animationId = requestAnimationFrame(draw)
    }

    initScene()
    draw()

    const onResize = () => initScene()
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div className='fixed inset-0 z-0 pointer-events-none'>
      <canvas ref={canvasRef} className='block h-full w-full' />
      <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(1,3,11,0.2)_58%,rgba(0,0,0,0.42)_100%)]' />
    </div>
  )
}
