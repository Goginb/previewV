import React from 'react'
import { useCanvasStore } from '../store/canvasStore'

function fileNameFromPath(path: string | null): string {
  if (!path) return 'Без названия'
  const seg = path.split(/[/\\]/).filter(Boolean)
  return seg[seg.length - 1] ?? path
}

export const ProjectTitleBar: React.FC = () => {
  const path = useCanvasStore((s) => s.currentProjectPath)
  const isDirty = useCanvasStore((s) => s.isDirty)
  const name = fileNameFromPath(path)

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[2000] pointer-events-none select-none"
      aria-hidden
    >
      <div className="flex items-center justify-center px-4 py-2 bg-zinc-950/85 backdrop-blur-sm border-b border-zinc-800/80">
        <div
          className="text-xs sm:text-sm text-zinc-300 font-medium truncate max-w-[min(90vw,42rem)] text-center"
          title={path ?? 'Проект не сохранён на диск'}
        >
          <span className="text-zinc-500 font-normal mr-2">Проект:</span>
          <span className="font-mono text-zinc-100">{name}</span>
          {isDirty && (
            <span className="text-amber-400 ml-1.5" title="Есть несохранённые изменения">
              •
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
