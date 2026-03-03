'use client'

import { useEffect, useRef } from 'react'

/**
 * CinematicSpaceBackground
 * Deep noir canvas with parallax starfield, volumetric glow, vignette, and film grain.
 * Performance: uses single RAF loop, respects prefers-reduced-motion, reduces on mobile.
 */
export default function CinematicSpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isMobile = window.innerWidth < 768

    let w = 0
    let h = 0
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let animId = 0

    interface Star { x: number; y: number; z: number; size: number; speed: number }
    const starCount = isMobile ? 120 : 300
    const stars: Star[] = []

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas!.offsetWidth
      h = canvas!.offsetHeight
      canvas!.width = w * dpr
      canvas!.height = h * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function initStars() {
      stars.length = 0
      for (let i = 0; i < starCount; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          z: Math.random(), // 0 = far, 1 = near (parallax depth)
          size: Math.random() * 1.8 + 0.3,
          speed: Math.random() * 0.15 + 0.02,
        })
      }
    }

    resize()
    initStars()
    window.addEventListener('resize', () => { resize(); initStars() })

    let t = 0
    function draw() {
      if (!ctx) return
      t += 0.003

      // Background gradient
      const bg = ctx.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0, '#05060B')
      bg.addColorStop(0.5, '#070A12')
      bg.addColorStop(1, '#04050A')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      // Volumetric glow (center)
      const glow = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, w * 0.6)
      glow.addColorStop(0, 'rgba(34,211,238,0.04)')
      glow.addColorStop(0.3, 'rgba(124,92,252,0.025)')
      glow.addColorStop(1, 'transparent')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)

      // Stars
      for (const s of stars) {
        if (!prefersReduced) {
          s.y -= s.speed * (0.5 + s.z * 0.8)
          if (s.y < -5) { s.y = h + 5; s.x = Math.random() * w }
        }
        const alpha = 0.3 + s.z * 0.6 + Math.sin(t * 2 + s.x) * 0.15
        const sz = s.size * (0.5 + s.z * 0.8)
        ctx.beginPath()
        ctx.arc(s.x, s.y, sz, 0, Math.PI * 2)
        ctx.fillStyle = s.z > 0.7
          ? 'rgba(200,220,255,' + alpha + ')'
          : s.z > 0.4
            ? 'rgba(180,200,240,' + alpha + ')'
            : 'rgba(140,160,200,' + alpha + ')'
        ctx.fill()
      }

      // Vignette
      const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.8)
      vig.addColorStop(0, 'transparent')
      vig.addColorStop(1, 'rgba(0,0,0,0.5)')
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, w, h)

      // Film grain (very subtle)
      if (!isMobile && !prefersReduced) {
        const imgData = ctx.getImageData(0, 0, Math.min(w, 400), Math.min(h, 400))
        const d = imgData.data
        for (let i = 0; i < d.length; i += 16) {
          const noise = (Math.random() - 0.5) * 8
          d[i] = Math.max(0, Math.min(255, d[i]! + noise))
          d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! + noise))
          d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! + noise))
        }
        ctx.putImageData(imgData, 0, 0)
      }

      animId = requestAnimationFrame(draw)
    }

    if (!prefersReduced) {
      draw()
    } else {
      // Draw single frame
      draw()
      cancelAnimationFrame(animId)
    }

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full z-0 pointer-events-none"
      style={{ isolation: 'isolate' }}
      aria-hidden="true"
    />
  )
}
