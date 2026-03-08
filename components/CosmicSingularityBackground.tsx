'use client'

import React, { useEffect, useRef } from 'react'

interface Star {
  x: number
  y: number
  z: number
  size: number
  pulse: number
  hue: number
  speed: number
}

interface Planet {
  phase: number
  orbitRadiusX: number
  orbitRadiusY: number
  orbitSpeed: number
  baseRadius: number
  hueA: string
  hueB: string
  z: number
  ring: boolean
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
    const planets: Planet[] = []
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
      const starCount = isSmall ? 400 : 720
      const cometCount = isSmall ? 2 : 4

      stars.length = 0
      planets.length = 0
      comets.length = 0

      for (let i = 0; i < starCount; i++) {
        stars.push({
          x: (Math.random() - 0.5) * 3200,
          y: (Math.random() - 0.5) * 2200,
          z: Math.random() * 2600 + 120,
          size: Math.random() * 1.8 + 0.35,
          pulse: Math.random() * Math.PI * 2,
          hue: 190 + Math.random() * 70,
          speed: Math.random() * 10 + 4,
        })
      }

      const scaleFactor = Math.min(viewportW, viewportH)
      planets.push(
        {
          phase: Math.random() * Math.PI * 2,
          orbitRadiusX: scaleFactor * 0.4,
          orbitRadiusY: scaleFactor * 0.2,
          orbitSpeed: 0.0008,
          baseRadius: Math.max(34, scaleFactor * 0.055),
          hueA: 'rgba(244,220,183,0.95)',
          hueB: 'rgba(157,119,255,0.45)',
          z: 980,
          ring: true,
        },
        {
          phase: Math.random() * Math.PI * 2,
          orbitRadiusX: scaleFactor * 0.31,
          orbitRadiusY: scaleFactor * 0.15,
          orbitSpeed: -0.0011,
          baseRadius: Math.max(20, scaleFactor * 0.035),
          hueA: 'rgba(173,239,255,0.95)',
          hueB: 'rgba(54,130,255,0.4)',
          z: 1250,
          ring: false,
        },
        {
          phase: Math.random() * Math.PI * 2,
          orbitRadiusX: scaleFactor * 0.47,
          orbitRadiusY: scaleFactor * 0.24,
          orbitSpeed: 0.00055,
          baseRadius: Math.max(18, scaleFactor * 0.03),
          hueA: 'rgba(251,212,255,0.9)',
          hueB: 'rgba(160,74,255,0.38)',
          z: 1450,
          ring: true,
        }
      )

      for (let i = 0; i < cometCount; i++) {
        comets.push({
          x: Math.random() * viewportW,
          y: Math.random() * viewportH * 0.6,
          vx: -(Math.random() * 2.2 + 1.4),
          vy: Math.random() * 0.35 + 0.08,
          life: Math.random() * 220,
          maxLife: Math.random() * 220 + 120,
        })
      }
    }

    const drawPlanet = (planet: Planet, cx: number, cy: number, tick: number, fov: number) => {
      const phase = planet.phase + tick * planet.orbitSpeed
      const px = cx + Math.cos(phase) * planet.orbitRadiusX
      const py = cy + Math.sin(phase * 1.08) * planet.orbitRadiusY
      const scale = fov / planet.z
      const radius = planet.baseRadius * (0.85 + scale * 1.75)
      if (radius < 5) return

      const halo = ctx.createRadialGradient(px, py, radius * 0.2, px, py, radius * 2.5)
      halo.addColorStop(0, 'rgba(255,255,255,0.17)')
      halo.addColorStop(0.5, 'rgba(175,210,255,0.08)')
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.beginPath()
      ctx.arc(px, py, radius * 2.5, 0, Math.PI * 2)
      ctx.fillStyle = halo
      ctx.fill()

      const sphere = ctx.createRadialGradient(px - radius * 0.34, py - radius * 0.42, radius * 0.12, px, py, radius)
      sphere.addColorStop(0, planet.hueA)
      sphere.addColorStop(0.55, planet.hueB)
      sphere.addColorStop(1, 'rgba(12,18,40,0.92)')

      ctx.beginPath()
      ctx.arc(px, py, radius, 0, Math.PI * 2)
      ctx.fillStyle = sphere
      ctx.fill()

      ctx.beginPath()
      ctx.arc(px - radius * 0.26, py - radius * 0.28, radius * 0.34, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.24)'
      ctx.fill()

      if (planet.ring) {
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(Math.sin(phase * 0.8) * 0.2 + 0.24)
        ctx.beginPath()
        ctx.ellipse(0, 0, radius * 1.75, radius * 0.38, 0, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,255,255,0.32)'
        ctx.lineWidth = Math.max(1, radius * 0.075)
        ctx.shadowBlur = radius * 0.5
        ctx.shadowColor = 'rgba(214,228,255,0.3)'
        ctx.stroke()
        ctx.restore()
      }
    }

    const draw = () => {
      time += reducedMotion ? 0.0022 : 0.009

      const cx = viewportW * 0.5
      const cy = viewportH * 0.45
      const fov = 360

      const deepSpace = ctx.createLinearGradient(0, 0, viewportW, viewportH)
      deepSpace.addColorStop(0, '#02040a')
      deepSpace.addColorStop(0.35, '#050911')
      deepSpace.addColorStop(1, '#010207')
      ctx.fillStyle = deepSpace
      ctx.fillRect(0, 0, viewportW, viewportH)

      const nebula = ctx.createRadialGradient(cx, cy, 40, cx, cy, Math.max(viewportW, viewportH) * 0.72)
      nebula.addColorStop(0, 'rgba(72,158,255,0.2)')
      nebula.addColorStop(0.35, 'rgba(93,117,255,0.16)')
      nebula.addColorStop(0.68, 'rgba(143,89,255,0.12)')
      nebula.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = nebula
      ctx.fillRect(0, 0, viewportW, viewportH)

      // Layered nebula clouds for classy depth.
      for (let i = 0; i < 3; i++) {
        const cloudX = viewportW * (0.2 + i * 0.31) + Math.sin(time * (0.25 + i * 0.08)) * 18
        const cloudY = viewportH * (0.24 + i * 0.2) + Math.cos(time * (0.2 + i * 0.06)) * 14
        const cloud = ctx.createRadialGradient(cloudX, cloudY, 30, cloudX, cloudY, Math.max(viewportW, viewportH) * 0.3)
        cloud.addColorStop(0, i % 2 === 0 ? 'rgba(132,203,255,0.12)' : 'rgba(197,161,255,0.11)')
        cloud.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = cloud
        ctx.fillRect(0, 0, viewportW, viewportH)
      }

      for (const star of stars) {
        star.z -= (reducedMotion ? 2.4 : star.speed)
        if (star.z < 20) {
          star.x = (Math.random() - 0.5) * 3200
          star.y = (Math.random() - 0.5) * 2200
          star.z = 2600
          star.pulse = Math.random() * Math.PI * 2
        }

        const scale = fov / star.z
        const px = star.x * scale + cx
        const py = star.y * scale + cy
        if (px < -12 || px > viewportW + 12 || py < -12 || py > viewportH + 12) continue

        const lum = (0.65 + Math.sin(time * 2.2 + star.pulse) * 0.35) * Math.max(0.28, 1 - star.z / 2600)
        const radius = Math.max(0.4, star.size * scale * 1.8)
        const glow = ctx.createRadialGradient(px, py, 0, px, py, radius * 7)
        glow.addColorStop(0, `hsla(${star.hue}, 100%, 84%, ${lum})`)
        glow.addColorStop(0.6, `hsla(${star.hue}, 100%, 74%, ${lum * 0.35})`)
        glow.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.beginPath()
        ctx.arc(px, py, radius * 1.6, 0, Math.PI * 2)
        ctx.fillStyle = glow
        ctx.fill()

        ctx.beginPath()
        ctx.arc(px, py, radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, lum + 0.12)})`
        ctx.fill()
      }

      planets.sort((a, b) => b.z - a.z)
      for (const planet of planets) {
        drawPlanet(planet, cx, cy, time * 1000, fov)
      }

      for (const comet of comets) {
        comet.life += reducedMotion ? 0.24 : 1
        if (comet.life > comet.maxLife) {
          comet.x = viewportW + Math.random() * viewportW * 0.35
          comet.y = Math.random() * viewportH * 0.65
          comet.vx = -(Math.random() * 2.2 + 1.4)
          comet.vy = Math.random() * 0.35 + 0.08
          comet.life = 0
          comet.maxLife = Math.random() * 220 + 120
        }

        comet.x += comet.vx * (reducedMotion ? 0.3 : 1)
        comet.y += comet.vy * (reducedMotion ? 0.3 : 1)
        const alpha = Math.max(0, 1 - comet.life / comet.maxLife)
        const tailLength = 120
        const trail = ctx.createLinearGradient(comet.x, comet.y, comet.x + tailLength, comet.y - tailLength * 0.14)
        trail.addColorStop(0, `rgba(255,255,255,${alpha * 0.85})`)
        trail.addColorStop(1, 'rgba(255,255,255,0)')

        ctx.strokeStyle = trail
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(comet.x, comet.y)
        ctx.lineTo(comet.x + tailLength, comet.y - tailLength * 0.14)
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(comet.x, comet.y, 1.8, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${alpha})`
        ctx.fill()
      }

      const vignette = ctx.createRadialGradient(
        viewportW * 0.5,
        viewportH * 0.5,
        Math.min(viewportW, viewportH) * 0.28,
        viewportW * 0.5,
        viewportH * 0.5,
        Math.max(viewportW, viewportH) * 0.74
      )
      vignette.addColorStop(0, 'rgba(0,0,0,0)')
      vignette.addColorStop(1, 'rgba(0,0,0,0.46)')
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
      <div className='absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(2,6,16,0.26)_56%,rgba(0,0,0,0.5)_100%)]' />
    </div>
  )
}
