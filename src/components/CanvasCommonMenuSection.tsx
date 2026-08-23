import React from 'react'

export type CanvasProjectMenuAction =
  | 'open'
  | 'add-folder'
  | 'save'
  | 'save-as'
  | 'close-project'
  | 'open-recent'

interface CanvasCommonMenuSectionProps {
  clipboardAvailable: boolean
  alwaysOnTop: boolean
  playbackSuspended: boolean
  canvasLocked: boolean
  selectionLockState: 'none' | 'locked' | 'unlocked' | 'mixed'
  showStudioImport: boolean
  onImportDailies: () => void
  onImportPrm: () => void
  onRestartPlayingVideos: () => void
  onTogglePlayback: () => void
  onGenerateProxies: () => void
  onNewNote: () => void
  onAddBackdrop: () => void
  onPaste: () => void
  onGridAlign: () => void
  onLayoutMediaRow: () => void
  onFitAll: () => void
  onResetView: () => void
  onToggleSelectionLock: () => void
  onToggleCanvasLock: () => void
  onProjectAction: (action: CanvasProjectMenuAction, path?: string) => void
  onSettings: () => void
  onToggleAlwaysOnTop: () => void
  onQuit: () => void
}

export const CanvasCommonMenuSection: React.FC<CanvasCommonMenuSectionProps> = ({
  clipboardAvailable,
  alwaysOnTop,
  playbackSuspended,
  canvasLocked,
  selectionLockState,
  showStudioImport,
  onImportDailies,
  onImportPrm,
  onRestartPlayingVideos,
  onTogglePlayback,
  onGenerateProxies,
  onNewNote,
  onAddBackdrop,
  onPaste,
  onGridAlign,
  onLayoutMediaRow,
  onFitAll,
  onResetView,
  onToggleSelectionLock,
  onToggleCanvasLock,
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
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            className="rounded border border-sky-500/35 bg-sky-500/15 px-2 py-1.5 text-left text-xs font-medium text-sky-200 transition-colors hover:bg-sky-500/30"
            onClick={() => onProjectAction('open')}
          >
            <span className="block">Open…</span>
            <span className="text-[10px] font-normal text-sky-300/65">Ctrl+O</span>
          </button>
          <button
            type="button"
            className="rounded border border-indigo-500/35 bg-indigo-500/15 px-2 py-1.5 text-left text-xs font-medium text-indigo-200 transition-colors hover:bg-indigo-500/30"
            onClick={() => onProjectAction('add-folder')}
          >
            <span className="block">Add folder…</span>
            <span className="text-[10px] font-normal text-indigo-300/65">Media</span>
          </button>
          <button
            type="button"
            className="rounded border border-emerald-500/35 bg-emerald-500/15 px-2 py-1.5 text-left text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/30"
            onClick={() => onProjectAction('save')}
          >
            <span className="block">Save</span>
            <span className="text-[10px] font-normal text-emerald-300/65">Ctrl+S</span>
          </button>
          <button
            type="button"
            className="rounded border border-teal-500/35 bg-teal-500/15 px-2 py-1.5 text-left text-xs font-medium text-teal-200 transition-colors hover:bg-teal-500/30"
            onClick={() => onProjectAction('save-as')}
          >
            <span className="block">Save as…</span>
            <span className="text-[10px] font-normal text-teal-300/65">Ctrl+Shift+S</span>
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

    {showStudioImport && (
      <>
        <button
          type="button"
          disabled={canvasLocked}
          className="mb-0.5 w-full rounded border border-indigo-500/40 bg-indigo-500/20 px-2 py-1.5 text-left text-sm font-medium text-indigo-300 transition-colors hover:bg-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-35"
          onClick={onImportDailies}
        >
          Import Dailies
        </button>
        <button
          type="button"
          disabled={canvasLocked}
          className="mb-0.5 w-full rounded border border-teal-500/40 bg-teal-500/20 px-2 py-1.5 text-left text-sm font-medium text-teal-300 transition-colors hover:bg-teal-500/40 disabled:cursor-not-allowed disabled:opacity-35"
          onClick={onImportPrm}
        >
          Import PRM
        </button>
      </>
    )}
    <button
      type="button"
      className="mb-0.5 w-full rounded border border-fuchsia-500/40 bg-fuchsia-500/20 px-2 py-1.5 text-left text-sm font-medium text-fuchsia-300 transition-colors hover:bg-fuchsia-500/40"
      onClick={onGenerateProxies}
    >
      Generate proxies
    </button>
    <button
      type="button"
      className="mb-0.5 w-full rounded border border-amber-500/40 bg-amber-500/20 px-2 py-1.5 text-left text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/40"
      onClick={onRestartPlayingVideos}
    >
      Restart playing videos
    </button>
    <button
      type="button"
      className={[
        'w-full rounded border px-2 py-1.5 text-left text-sm font-medium transition-colors',
        playbackSuspended
          ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/40'
          : 'border-rose-500/40 bg-rose-500/20 text-rose-300 hover:bg-rose-500/40',
      ].join(' ')}
      onClick={onTogglePlayback}
    >
      {playbackSuspended ? 'Play all videos' : 'Stop all videos'}
    </button>
    <div className="h-px my-1 mx-1" style={{ background: 'var(--theme-divider)' }} />

    <button
      type="button"
      disabled={canvasLocked}
      className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors disabled:cursor-not-allowed disabled:opacity-35"
      onClick={onNewNote}
    >
      New note (N)
    </button>
    <button
      type="button"
      disabled={canvasLocked}
      className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors disabled:cursor-not-allowed disabled:opacity-35"
      onClick={onAddBackdrop}
    >
      Add backdrop (B)
    </button>
    <div className="h-px my-1 mx-1" style={{ background: 'var(--theme-divider)' }} />

    <button
      type="button"
      className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors disabled:opacity-40"
      disabled={!clipboardAvailable || canvasLocked}
      onClick={onPaste}
    >
      Paste (Ctrl+V)
    </button>
    <button
      type="button"
      disabled={canvasLocked}
      className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors disabled:cursor-not-allowed disabled:opacity-35"
      onClick={onGridAlign}
    >
      Grid align (\)
    </button>
    <button
      type="button"
      disabled={canvasLocked}
      className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors disabled:cursor-not-allowed disabled:opacity-35"
      onClick={onLayoutMediaRow}
    >
      Layout media row (L)
    </button>
    <button
      type="button"
      className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
      onClick={onFitAll}
    >
      Fit all (A)
    </button>
    <button
      type="button"
      className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
      onClick={onResetView}
    >
      Reset view
    </button>
    <div className="h-px my-1 mx-1" style={{ background: 'var(--theme-divider)' }} />

    {selectionLockState !== 'none' && (
      <button
        type="button"
        className="mb-0.5 w-full rounded border border-amber-500/40 bg-amber-500/15 px-2 py-1.5 text-left text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/30"
        onClick={onToggleSelectionLock}
      >
        {selectionLockState === 'locked' ? 'Unlock selected' : 'Lock selected'} (Alt+L)
      </button>
    )}
    <button
      type="button"
      className="w-full rounded border border-sky-500/40 bg-sky-500/15 px-2 py-1.5 text-left text-sm font-medium text-sky-300 transition-colors hover:bg-sky-500/30"
      onClick={onToggleCanvasLock}
    >
      {canvasLocked ? 'Unlock canvas layout' : 'Lock canvas layout'} (Ctrl+R)
    </button>
    <div className="h-px my-1 mx-1" style={{ background: 'var(--theme-divider)' }} />

    <button
      type="button"
      className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
      onClick={onSettings}
    >
      Settings
    </button>
    <button
      type="button"
      className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
      onClick={onToggleAlwaysOnTop}
    >
      {alwaysOnTop ? 'Disable always on top' : 'Enable always on top'}
    </button>
    <button
      type="button"
      className="w-full text-left px-2 py-1.5 text-sm text-red-500 hover:bg-red-500/10 rounded transition-colors font-medium mt-1"
      onClick={onQuit}
    >
      Quit / Exit
    </button>
    </>
  )
}
