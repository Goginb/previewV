import React from 'react'
import { useUiStore, type AppTheme } from '../store/uiStore'

export const SettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const gridSizeX = useUiStore((s) => s.gridSizeX)
  const gridSizeY = useUiStore((s) => s.gridSizeY)
  const setGridSize = useUiStore((s) => s.setGridSize)
  const autosaveEnabled = useUiStore((s) => s.autosaveEnabled)
  const setAutosaveEnabled = useUiStore((s) => s.setAutosaveEnabled)
  const lastAutosaveAt = useUiStore((s) => s.lastAutosaveAt)

  return (
    <div
      className="fixed inset-0 z-[6000] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-[min(92vw,680px)] max-h-[85vh] overflow-auto rounded-xl border p-4"
        style={{ background: 'var(--menu-bg)', borderColor: 'var(--menu-border)', boxShadow: 'var(--menu-shadow)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-themeText-100">Settings</h2>
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-themeText-200 hover:bg-themeBg-hover"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <section className="mb-4 border border-[var(--menu-border)] rounded-lg p-3">
          <h3 className="text-sm font-semibold text-themeText-200 mb-2">Visual</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm text-themeText-300">
              Theme
              <select
                className="rounded border border-[var(--menu-border)] bg-[var(--app-bg)] px-2 py-1 text-themeText-100"
                value={theme}
                onChange={(e) => setTheme(e.target.value as AppTheme)}
              >
                <option value="default">Default</option>
                <option value="light">Light</option>
                <option value="pink">Pink</option>
                <option value="camouflage">Camouflage</option>
                <option value="greenFx">Green Fx style</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm text-themeText-300">
              Grid size X (px)
              <input
                type="number"
                min={8}
                max={256}
                value={gridSizeX}
                onChange={(e) => setGridSize(Number(e.target.value), gridSizeY)}
                className="rounded border border-[var(--menu-border)] bg-[var(--app-bg)] px-2 py-1 text-themeText-100"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-themeText-300">
              Grid size Y (px)
              <input
                type="number"
                min={8}
                max={256}
                value={gridSizeY}
                onChange={(e) => setGridSize(gridSizeX, Number(e.target.value))}
                className="rounded border border-[var(--menu-border)] bg-[var(--app-bg)] px-2 py-1 text-themeText-100"
              />
            </label>
          </div>
        </section>

        <section className="border border-[var(--menu-border)] rounded-lg p-3">
          <h3 className="text-sm font-semibold text-themeText-200 mb-2">General</h3>
          <label className="flex items-center gap-2 text-sm text-themeText-200">
            <input
              type="checkbox"
              checked={autosaveEnabled}
              onChange={(e) => setAutosaveEnabled(e.target.checked)}
            />
            Enable autosave
          </label>
          <div className="mt-2 text-xs text-themeText-400">
            Interval: 20 min (fixed)
          </div>
          <div className="mt-1 text-xs text-themeText-400">
            Last autosave: {lastAutosaveAt ? new Date(lastAutosaveAt).toLocaleString() : '—'}
          </div>
        </section>
      </div>
    </div>
  )
}

