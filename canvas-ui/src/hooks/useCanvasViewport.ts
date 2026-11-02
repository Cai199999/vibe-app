import { useCallback, useEffect, useRef, useState } from 'react'

import { ARTBOARD_HEIGHT, ARTBOARD_WIDTH } from '../lib/constants'
import { clamp } from '../lib/geometry'
import type { Viewport } from '../types/vibe'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 2.5

export function useCanvasViewport() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState<Viewport>({
    zoom: 0.8,
    pan: { x: 80, y: 40 },
  })
  const viewportRef = useRef(viewport)

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  const panBy = useCallback((dx: number, dy: number) => {
    setViewport((current) => ({
      ...current,
      pan: { x: current.pan.x + dx, y: current.pan.y + dy },
    }))
  }, [])

  const setPan = useCallback((x: number, y: number) => {
    setViewport((current) => ({ ...current, pan: { x, y } }))
  }, [])

  const fit = useCallback(() => {
    const element = canvasRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    const padding = 72
    const zoom = clamp(
      Math.min(
        (rect.width - padding * 2) / ARTBOARD_WIDTH,
        (rect.height - padding * 2) / ARTBOARD_HEIGHT,
      ),
      MIN_ZOOM,
      1.15,
    )
    setViewport({
      zoom,
      pan: {
        x: (rect.width - ARTBOARD_WIDTH * zoom) / 2,
        y: (rect.height - ARTBOARD_HEIGHT * zoom) / 2,
      },
    })
  }, [])

  const resetZoom = useCallback(() => {
    const element = canvasRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    setViewport({
      zoom: 1,
      pan: {
        x: (rect.width - ARTBOARD_WIDTH) / 2,
        y: (rect.height - ARTBOARD_HEIGHT) / 2,
      },
    })
  }, [])

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const element = canvasRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const current = viewportRef.current
    const worldX = (clientX - rect.left - current.pan.x) / current.zoom
    const worldY = (clientY - rect.top - current.pan.y) / current.zoom
    const nextZoom = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM)

    setViewport({
      zoom: nextZoom,
      pan: {
        x: clientX - rect.left - worldX * nextZoom,
        y: clientY - rect.top - worldY * nextZoom,
      },
    })
  }, [])

  const zoomBy = useCallback(
    (factor: number) => {
      const element = canvasRef.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
    },
    [zoomAt],
  )

  useEffect(() => {
    const frame = requestAnimationFrame(fit)
    return () => cancelAnimationFrame(frame)
  }, [fit])

  return {
    canvasRef,
    viewport,
    panBy,
    setPan,
    fit,
    resetZoom,
    zoomAt,
    zoomBy,
  }
}
