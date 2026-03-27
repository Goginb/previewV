import React from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { useUiStore } from '../store/uiStore'

function fileNameFromPath(path: string | null): string {
  if (!path) return 'Untitled'
  const seg = path.split(/[/\\]/).filter(Boolean)
  return seg[seg.length - 1] ?? path
}

export const ProjectTitleBar: React.FC = () => {
  const path = useCanvasStore((s) => s.currentProjectPath)
  const isDirty = useCanvasStore((s) => s.isDirty)
  const alwaysOnTop = useUiStore((s) => s.alwaysOnTop)
  const name = fileNameFromPath(path)

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[2000] pointer-events-none select-none"
      aria-hidden
    >
      <div
        className="flex items-center justify-center px-4 py-2 backdrop-blur-sm border-b"
        style={{ background: 'color-mix(in oklab, var(--app-bg) 88%, black)', borderColor: 'var(--menu-border)' }}
      >
        <div
          className="text-xs sm:text-sm text-themeText-300 font-medium truncate max-w-[min(90vw,42rem)] text-center"
          title={path ?? 'Project not saved to disk'}
        >
          <span className="text-themeText-500 font-normal mr-2">Project:</span>
          <span className="font-mono text-themeText-100">{name}</span>
          {alwaysOnTop && (
            <span
              className="text-sky-400 ml-2 text-[10px] uppercase tracking-wide border border-sky-500/50 rounded px-1 py-0.5"
              title="Window pinned (always on top). Ctrl+Shift+A toggles pin."
            >
              Pinned
            </span>
          )}
          {isDirty && (
            <span className="text-amber-400 ml-1.5" title="Unsaved changes">
              •
            </span>
          )}
        </div>
        <button
           type="button"
           className="ml-4 px-3 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 text-xs font-semibold uppercase tracking-wider border border-indigo-500/40 pointer-events-auto transition-colors"
           onClick={() => useUiStore.getState().setDailiesModalOpen(true)}
        >
           Import Dailies
        </button>
      </div>
    </div>
  )
}
