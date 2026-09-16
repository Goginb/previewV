import React from 'react'

export type CanvasProjectMenuAction =
  | 'open'
  | 'add-folder'
  | 'save'
  | 'save-as'
  | 'close-project'
  | 'open-recent'

interface CanvasCommonMenuSectionProps {
  alwaysOnTop: boolean
  canvasLocked: boolean
  showStudioImport: boolean
  onImportDailies: () => void
  onImportPrm: () => void
  onGenerateProxies: () => void
  onProjectAction: (action: CanvasProjectMenuAction, path?: string) => void
  onSettings: () => void
  onToggleAlwaysOnTop: () => void
  onQuit: () => void
}

export const CanvasCommonMenuSection: React.FC<CanvasCommonMenuSectionProps> = ({
  alwaysOnTop,
  canvasLocked,
  showStudioImport,
  onImportDailies,
  onImportPrm,
  onGenerateProxies,
  onProjectAction,
  onSettings,
  onToggleAlwaysOnTop,
  onQuit,
}) => {
  const [recentProjects, setRecentProjects] = React.useState<string[]>([])

  React.useEffect(() => {
    let active = true
    const projectAPI = window.electronAPI?.projectAPI
    if (!projectAPI?.getRecentProjects) return () => {
      active = false
    }
    void projectAPI
      .getRecentProjects()
      .then((paths) => {
        if (active) setRecentProjects(paths.slice(0, 6))
      })
      .catch(() => {
        if (active) setRecentProjects([])
      })
    return () => {
      active = false
    }
  }, [])

  const recentLabel = (path: string) => {
    const parts = path.split(/[/\\]/).filter(Boolean)
    return parts[parts.length - 1] ?? path
  }

  return (
    <>
      <section className="mb-1.5 rounded-lg border border-sky-500/25 bg-sky-950/20 p-1.5">
        <div className="flex items-center justify-between px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">
          <span>File</span>
          <span className="normal-case tracking-normal text-themeText-500">Project</span>
        </div>
        <div className="space-y-0.5">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded border border-sky-500/25 bg-sky-500/10 px-2.5 py-1.5 text-left text-xs font-medium text-sky-200 transition-colors hover:bg-sky-500/25"
            onClick={() => onProjectAction('open')}
          >
            <span>Open…</span>
            <span className="shrink-0 text-[10px] font-normal text-sky-300/65">Ctrl+O</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-1.5 text-left text-xs font-medium text-indigo-200 transition-colors hover:bg-indigo-500/25"
            onClick={() => onProjectAction('add-folder')}
          >
            <span>Add folder…</span>
            <span className="shrink-0 text-[10px] font-normal text-indigo-300/65">Media</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-left text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25"
            onClick={() => onProjectAction('save')}
          >
            <span>Save</span>
            <span className="shrink-0 text-[10px] font-normal text-emerald-300/65">Ctrl+S</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded border border-teal-500/25 bg-teal-500/10 px-2.5 py-1.5 text-left text-xs font-medium text-teal-200 transition-colors hover:bg-teal-500/25"
            onClick={() => onProjectAction('save-as')}
          >
            <span>Save as…</span>
            <span className="shrink-0 text-[10px] font-normal text-teal-300/65">Ctrl+Shift+S</span>
          </button>
        </div>
        {recentProjects.length > 0 && (
          <details className="mt-1 rounded border border-white/10 bg-black/15 open:bg-black/25">
            <summary className="cursor-pointer select-none px-2 py-1.5 text-xs text-themeText-300 hover:text-themeText-100">
              Open recent
            </summary>
            <div className="border-t border-white/10 p-1">
              {recentProjects.map((path) => (
                <button
                  key={path}
                  type="button"
                  title={path}
                  className="block w-full truncate rounded px-2 py-1.5 text-left text-xs text-themeText-300 transition-colors hover:bg-themeBg-hover hover:text-themeText-100"
                  onClick={() => onProjectAction('open-recent', path)}
                >
                  {recentLabel(path)}
                </button>
              ))}
            </div>
          </details>
        )}
        <button
          type="button"
          className="mt-1 w-full rounded border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-left text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/20"
          onClick={() => onProjectAction('close-project')}
        >
          Close project <span className="float-right text-[10px] font-normal text-amber-300/65">Ctrl+W</span>
        </button>
      </section>

      <section className="mb-1 rounded-lg border border-fuchsia-500/20 bg-fuchsia-950/10 p-1">
        <div className="flex items-center justify-between px-1 pb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-fuchsia-300">
          <span>Actions</span>
          <span className="normal-case tracking-normal text-themeText-500">Media</span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {showStudioImport && (
            <>
              <button
                type="button"
                disabled={canvasLocked}
                className="aspect-square rounded-md border border-indigo-500/40 bg-indigo-500/20 p-1 text-center text-[10px] font-semibold leading-3 text-indigo-200 transition-colors hover:bg-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-35"
                onClick={onImportDailies}
              >
                Import<br />Dailies
              </button>
              <button
                type="button"
                disabled={canvasLocked}
                className="aspect-square rounded-md border border-teal-500/40 bg-teal-500/20 p-1 text-center text-[10px] font-semibold leading-3 text-teal-200 transition-colors hover:bg-teal-500/40 disabled:cursor-not-allowed disabled:opacity-35"
                onClick={onImportPrm}
              >
                Import<br />PRM
              </button>
            </>
          )}
          <button
            type="button"
            className="aspect-square rounded-md border border-fuchsia-500/40 bg-fuchsia-500/20 p-1 text-center text-[10px] font-semibold leading-3 text-fuchsia-200 transition-colors hover:bg-fuchsia-500/40"
            onClick={onGenerateProxies}
          >
            Generate<br />proxies
          </button>
        </div>
      </section>

      <div
        className="sticky bottom-0 z-10 -mx-1 rounded-b-lg px-1 pb-0.5 pt-0.5"
        style={{ background: 'var(--menu-bg)' }}
      >
        <div className="mx-1 mb-0.5 h-px" style={{ background: 'var(--theme-divider)' }} />
        <button
          type="button"
          className="w-full rounded px-2 py-1 text-left text-xs text-themeText-100 transition-colors hover:bg-themeBg-hover"
          onClick={onSettings}
        >
          Settings
        </button>
        <button
          type="button"
          className="w-full rounded px-2 py-1 text-left text-xs text-themeText-100 transition-colors hover:bg-themeBg-hover"
          onClick={onToggleAlwaysOnTop}
        >
          {alwaysOnTop ? 'Disable always on top' : 'Enable always on top'}
        </button>
        <button
          type="button"
          className="mt-0.5 w-full rounded px-2 py-1 text-left text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10"
          onClick={onQuit}
        >
          Quit / Exit
        </button>
      </div>
    </>
  )
}
