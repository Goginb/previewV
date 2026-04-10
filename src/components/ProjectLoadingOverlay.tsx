import React from 'react'
import { usePreloadStore } from '../store/preloadStore'

export const ProjectLoadingOverlay: React.FC = () => {
  const open = usePreloadStore((s) => s.open)
  const pct = usePreloadStore((s) => s.pct)
  const line = usePreloadStore((s) => s.line)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <div
        className="w-[min(92vw,540px)] rounded-2xl border px-5 py-4 shadow-2xl"
        style={{ background: 'var(--menu-bg)', borderColor: 'var(--menu-border)' }}
      >
        <div className="text-sm font-semibold text-themeText-100">Loading project</div>
        <div className="mt-1 text-xs text-themeText-400">{line || 'Preparing project...'}</div>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full"
          style={{ background: 'color-mix(in oklab, var(--app-bg) 86%, black)' }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-200 ease-out"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #14b8a6 0%, #22c55e 100%)',
            }}
          />
        </div>
        <div className="mt-2 text-right text-[11px] tabular-nums text-themeText-400">{pct}%</div>
      </div>
    </div>
  )
}
