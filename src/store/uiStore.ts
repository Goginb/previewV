import { create } from 'zustand'

/** Window chrome / shell state mirrored from Electron main (e.g. always-on-top). */
export type AppTheme = 'default' | 'light' | 'pink' | 'camouflage' | 'greenFx'

interface UiState {
  alwaysOnTop: boolean
  theme: AppTheme
  gridSizeX: number
  gridSizeY: number
  autosaveEnabled: boolean
  lastAutosaveAt: string | null
  setAlwaysOnTop: (v: boolean) => void
  setTheme: (theme: AppTheme) => void
  setGridSize: (x: number, y: number) => void
  setAutosaveEnabled: (enabled: boolean) => void
  setLastAutosaveAt: (iso: string | null) => void
}

const UI_PREFS_KEY = 'previewv-ui-prefs-v1'

function clampGrid(v: number): number {
  if (!Number.isFinite(v)) return 32
  return Math.max(8, Math.min(256, Math.round(v)))
}

function readPrefs(): Partial<Pick<UiState, 'theme' | 'gridSizeX' | 'gridSizeY' | 'autosaveEnabled'>> {
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as {
      theme?: AppTheme
      gridSizeX?: number
      gridSizeY?: number
      autosaveEnabled?: boolean
    }
    return {
      theme: parsed.theme ?? 'default',
      gridSizeX: clampGrid(parsed.gridSizeX ?? 32),
      gridSizeY: clampGrid(parsed.gridSizeY ?? 32),
      autosaveEnabled: parsed.autosaveEnabled ?? true,
    }
  } catch {
    return {}
  }
}

function savePrefs(state: Pick<UiState, 'theme' | 'gridSizeX' | 'gridSizeY' | 'autosaveEnabled'>): void {
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

const boot = readPrefs()

export const useUiStore = create<UiState>((set) => ({
  alwaysOnTop: false,
  theme: boot.theme ?? 'default',
  gridSizeX: boot.gridSizeX ?? 32,
  gridSizeY: boot.gridSizeY ?? 32,
  autosaveEnabled: boot.autosaveEnabled ?? true,
  lastAutosaveAt: null,
  setAlwaysOnTop: (v) => set({ alwaysOnTop: v }),
  setTheme: (theme) =>
    set((state) => {
      const next = { ...state, theme }
      savePrefs(next)
      return { theme }
    }),
  setGridSize: (x, y) =>
    set((state) => {
      const gridSizeX = clampGrid(x)
      const gridSizeY = clampGrid(y)
      const next = { ...state, gridSizeX, gridSizeY }
      savePrefs(next)
      return { gridSizeX, gridSizeY }
    }),
  setAutosaveEnabled: (autosaveEnabled) =>
    set((state) => {
      const next = { ...state, autosaveEnabled }
      savePrefs(next)
      return { autosaveEnabled }
    }),
  setLastAutosaveAt: (lastAutosaveAt) => set({ lastAutosaveAt }),
}))
