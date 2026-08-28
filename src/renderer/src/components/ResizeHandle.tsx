import { useCallback, useRef } from 'react'

interface ResizeHandleProps {
  /** 'horizontal' = a vertical bar the user drags left/right (resizes a width).
   *  'vertical' = a horizontal bar the user drags up/down (resizes a height). */
  direction: 'horizontal' | 'vertical'
  /** Called on every pointer move with the delta (px) since the last move. */
  onResize: (delta: number) => void
}

// Thin, always-present drag handle for splitting two panels. Kept dependency-free
// (no react-resizable-panels/allotment) to match the rest of the app's hand-rolled,
// CSS-driven layout approach — see Sidebar/App width and QueryEditor height usage.
export default function ResizeHandle({ direction, onResize }: ResizeHandleProps): JSX.Element {
  const dragging = useRef(false)
  const lastPos = useRef(0)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      dragging.current = true
      lastPos.current = direction === 'horizontal' ? e.clientX : e.clientY
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [direction]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return
      const pos = direction === 'horizontal' ? e.clientX : e.clientY
      onResize(pos - lastPos.current)
      lastPos.current = pos
    },
    [direction, onResize]
  )

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  return (
    <div
      className={`resize-handle resize-handle-${direction}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="separator"
      aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
    />
  )
}
