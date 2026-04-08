import React from 'react'

interface CanvasCommonMenuSectionProps {
  clipboardAvailable: boolean
  alwaysOnTop: boolean
  onNewNote: () => void
  onAddBackdrop: () => void
  onPaste: () => void
  onGridAlign: () => void
  onLayoutMediaRow: () => void
  onFitAll: () => void
  onSettings: () => void
  onToggleAlwaysOnTop: () => void
  onQuit: () => void
}

export const CanvasCommonMenuSection: React.FC<CanvasCommonMenuSectionProps> = ({
  clipboardAvailable,
  alwaysOnTop,
  onNewNote,
  onAddBackdrop,
  onPaste,
  onGridAlign,
  onLayoutMediaRow,
  onFitAll,
  onSettings,
  onToggleAlwaysOnTop,
  onQuit,
}) => (
  <>
    <button
      type="button"
      className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
      onClick={onNewNote}
    >
      New note (N)
    </button>
    <button
      type="button"
      className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
      onClick={onAddBackdrop}
    >
      Add backdrop (B)
    </button>
    <div className="h-px my-1 mx-1" style={{ background: 'var(--theme-divider)' }} />

    <button
      type="button"
      className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors disabled:opacity-40"
      disabled={!clipboardAvailable}
      onClick={onPaste}
    >
      Paste (Ctrl+V)
    </button>
    <button
      type="button"
      className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
      onClick={onGridAlign}
    >
      Grid align (\)
    </button>
    <button
      type="button"
      className="w-full text-left px-2 py-1.5 text-sm text-themeText-100 hover:bg-themeBg-hover rounded transition-colors"
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
