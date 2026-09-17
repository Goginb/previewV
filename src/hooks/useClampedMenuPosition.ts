import { useLayoutEffect, useRef, useState } from 'react'

interface MenuAnchor {
  x: number
  y: number
}

interface MenuPosition {
  left: number
  top: number
}

interface ViewportSize {
  width: number
  height: number
}

export function clampMenuPosition(
  anchor: MenuAnchor,
  width: number,
  height: number,
  padding: number,
  viewport: ViewportSize,
): MenuPosition {
  const maxLeft = Math.max(padding, viewport.width - width - padding)
  const maxTop = Math.max(padding, viewport.height - height - padding)
  return {
    left: Math.max(padding, Math.min(anchor.x, maxLeft)),
    top: Math.max(padding, Math.min(anchor.y, maxTop)),
  }
}

export function useClampedMenuPosition(anchor: MenuAnchor | null, padding = 8) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const anchorX = anchor?.x
  const anchorY = anchor?.y

  useLayoutEffect(() => {
    if (anchorX === undefined || anchorY === undefined) {
      setPosition((prev) => (prev === null ? prev : null))
      return
    }

    const update = () => {
      const menu = menuRef.current
      if (!menu) {
        setPosition((prev) =>
          prev && prev.left === anchorX && prev.top === anchorY
            ? prev
            : { left: anchorX, top: anchorY },
        )
        return
      }
      const rect = menu.getBoundingClientRect()
      const next = clampMenuPosition(
        { x: anchorX, y: anchorY },
        rect.width,
        rect.height,
        padding,
        { width: window.innerWidth, height: window.innerHeight },
      )
      setPosition((prev) =>
        prev && prev.left === next.left && prev.top === next.top ? prev : next,
      )
    }

    update()
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(update)
    if (menuRef.current) resizeObserver?.observe(menuRef.current)

    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [anchorX, anchorY, padding])

  return {
    menuRef,
    menuPosition: position ?? (anchor ? { left: anchor.x, top: anchor.y } : null),
  }
}
