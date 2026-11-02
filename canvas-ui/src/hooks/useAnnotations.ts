import { useCallback, useEffect, useRef, useState } from 'react'

import type { CanvasAnnotation } from '../types/vibe'

export function useAnnotations() {
  const [annotations, setAnnotations] = useState<CanvasAnnotation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const annotationsRef = useRef(annotations)

  useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations])

  const add = useCallback((annotation: CanvasAnnotation) => {
    setAnnotations((current) => [...current, annotation])
    setSelectedId(annotation.id)
  }, [])

  const addMany = useCallback((items: CanvasAnnotation[]) => {
    setAnnotations((current) => [...current, ...items])
    setSelectedId(items.at(-1)?.id ?? null)
  }, [])

  const remove = useCallback((id: string) => {
    setAnnotations((current) => current.filter((item) => item.id !== id))
    setSelectedId((current) => (current === id ? null : current))
  }, [])

  const undo = useCallback(() => {
    // 用 ref 读取当前快照，避免在 setState updater 内产生副作用。
    const current = annotationsRef.current
    if (current.length === 0) return
    const next = current.slice(0, -1)
    const removedId = current.at(-1)?.id
    setAnnotations(next)
    setSelectedId((selected) =>
      selected === removedId ? (next.at(-1)?.id ?? null) : selected,
    )
  }, [])

  const clear = useCallback(() => {
    setAnnotations([])
    setSelectedId(null)
  }, [])

  return {
    annotations,
    selectedId,
    select: setSelectedId,
    add,
    addMany,
    remove,
    undo,
    clear,
  }
}
