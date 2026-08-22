import React from 'react'

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
  onSettings,
  onToggleAlwaysOnTop,
  onQuit,
}) => (
  <>
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
