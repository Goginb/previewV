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
  
  dailiesYear: string
  dailiesProject: string
  dailiesScene: string
  dailiesPriorities: string[]
  isDailiesModalOpen: boolean

  setAlwaysOnTop: (v: boolean) => void
  setTheme: (theme: AppTheme) => void
  setGridSize: (x: number, y: number) => void
  setAutosaveEnabled: (enabled: boolean) => void
  setLastAutosaveAt: (iso: string | null) => void
  
  setDailiesYear: (year: string) => void
  setDailiesProject: (project: string) => void
  setDailiesScene: (scene: string) => void
  setDailiesPriorities: (priorities: string[]) => void
  setDailiesModalOpen: (open: boolean) => void
}

const UI_PREFS_KEY = 'previewv-ui-prefs-v1'

function clampGrid(v: number): number {
  if (!Number.isFinite(v)) return 32
  return Math.max(8, Math.min(256, Math.round(v)))
}

function readPrefs(): Partial<Pick<UiState, 'theme' | 'gridSizeX' | 'gridSizeY' | 'autosaveEnabled' | 'dailiesYear' | 'dailiesProject' | 'dailiesScene' | 'dailiesPriorities'>> {
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as {
      theme?: AppTheme
      gridSizeX?: number
      gridSizeY?: number
      autosaveEnabled?: boolean
      dailiesYear?: string
      dailiesProject?: string
      dailiesScene?: string
      dailiesPriorities?: string[]
    }
    return {
      theme: parsed.theme ?? 'default',
      gridSizeX: clampGrid(parsed.gridSizeX ?? 32),
      gridSizeY: clampGrid(parsed.gridSizeY ?? 32),
      autosaveEnabled: parsed.autosaveEnabled ?? true,
      dailiesYear: parsed.dailiesYear ?? new Date().getFullYear().toString(),
      dailiesProject: parsed.dailiesProject ?? 'Volchok',
      dailiesScene: parsed.dailiesScene ?? 'JMP',
      dailiesPriorities: parsed.dailiesPriorities ?? ['comp', 'cln, clnp', '', '', ''],
    }
  } catch {
    return {}
  }
}

function savePrefs(state: Pick<UiState, 'theme' | 'gridSizeX' | 'gridSizeY' | 'autosaveEnabled' | 'dailiesYear' | 'dailiesProject' | 'dailiesScene' | 'dailiesPriorities'>): void {
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
  dailiesYear: boot.dailiesYear ?? new Date().getFullYear().toString(),
  dailiesProject: boot.dailiesProject ?? 'Volchok',
  dailiesScene: boot.dailiesScene ?? 'JMP',
  dailiesPriorities: boot.dailiesPriorities ?? ['comp', 'cln, clnp', '', '', ''],
  isDailiesModalOpen: false,
  
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
  
  setDailiesYear: (dailiesYear) => set((s) => { savePrefs({ ...s, dailiesYear }); return { dailiesYear } }),
  setDailiesProject: (dailiesProject) => set((s) => { savePrefs({ ...s, dailiesProject }); return { dailiesProject } }),
  setDailiesScene: (dailiesScene) => set((s) => { savePrefs({ ...s, dailiesScene }); return { dailiesScene } }),
  setDailiesPriorities: (dailiesPriorities) => set((s) => { savePrefs({ ...s, dailiesPriorities }); return { dailiesPriorities } }),
  setDailiesModalOpen: (isDailiesModalOpen) => set({ isDailiesModalOpen }),
}))
