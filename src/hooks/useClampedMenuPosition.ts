import { useLayoutEffect, useRef, useState } from 'react'

interface MenuAnchor {
  x: number
  y: number
}

interface MenuPosition {
  left: number
  top: number
}

function clampMenuPosition(anchor: MenuAnchor, width: number, height: number, padding: number): MenuPosition {
  return {
    left: Math.max(padding, Math.min(anchor.x, window.innerWidth - width - padding)),
    top: Math.max(padding, Math.min(anchor.y, window.innerHeight - height - padding)),
  }
}

export function useClampedMenuPosition(anchor: MenuAnchor | null, padding = 8) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<MenuPosition | null>(null)

  useLayoutEffect(() => {
    if (!anchor) {
      setPosition(null)
      return
    }

    const update = () => {
      const menu = menuRef.current
      if (!menu) {
        setPosition({ left: anchor.x, top: anchor.y })
        return
      }
      const rect = menu.getBoundingClientRect()
      const next = clampMenuPosition(anchor, rect.width, rect.height, padding)
      setPosition((prev) =>
        prev && prev.left === next.left && prev.top === next.top ? prev : next,
      )
    }

    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [anchor, padding])

  return {
    menuRef,
    menuPosition: position ?? (anchor ? { left: anchor.x, top: anchor.y } : null),
  }
}
