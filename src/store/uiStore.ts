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

  prmYear: string
  prmProject: string
  prmScene: string
  prmPriorities: string[]
  isPrmModalOpen: boolean

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

  setPrmYear: (year: string) => void
  setPrmProject: (project: string) => void
  setPrmScene: (scene: string) => void
  setPrmPriorities: (priorities: string[]) => void
  setPrmModalOpen: (open: boolean) => void
}

const UI_PREFS_KEY = 'previewv-ui-prefs-v1'

function clampGrid(v: number): number {
  if (!Number.isFinite(v)) return 32
  return Math.max(8, Math.min(256, Math.round(v)))
}

function readPrefs(): Partial<Pick<UiState, 'theme' | 'gridSizeX' | 'gridSizeY' | 'autosaveEnabled' | 'dailiesYear' | 'dailiesProject' | 'dailiesScene' | 'dailiesPriorities' | 'prmYear' | 'prmProject' | 'prmScene' | 'prmPriorities'>> {
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
      prmYear?: string
      prmProject?: string
      prmScene?: string
      prmPriorities?: string[]
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
      prmYear: parsed.prmYear ?? new Date().getFullYear().toString(),
      prmProject: parsed.prmProject ?? 'Volchok',
      prmScene: parsed.prmScene ?? 'JMP',
      prmPriorities: parsed.prmPriorities ?? ['comp', 'cln, clnp', '', '', ''],
    }
  } catch {
    return {}
  }
}

function savePrefs(state: Pick<UiState, 'theme' | 'gridSizeX' | 'gridSizeY' | 'autosaveEnabled' | 'dailiesYear' | 'dailiesProject' | 'dailiesScene' | 'dailiesPriorities' | 'prmYear' | 'prmProject' | 'prmScene' | 'prmPriorities'>): void {
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

  prmYear: boot.prmYear ?? new Date().getFullYear().toString(),
  prmProject: boot.prmProject ?? 'Volchok',
  prmScene: boot.prmScene ?? 'JMP',
  prmPriorities: boot.prmPriorities ?? ['comp', 'cln, clnp', '', '', ''],
  isPrmModalOpen: false,
  
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

  setPrmYear: (prmYear) => set((s) => { savePrefs({ ...s, prmYear }); return { prmYear } }),
  setPrmProject: (prmProject) => set((s) => { savePrefs({ ...s, prmProject }); return { prmProject } }),
  setPrmScene: (prmScene) => set((s) => { savePrefs({ ...s, prmScene }); return { prmScene } }),
  setPrmPriorities: (prmPriorities) => set((s) => { savePrefs({ ...s, prmPriorities }); return { prmPriorities } }),
  setPrmModalOpen: (isPrmModalOpen) => set({ isPrmModalOpen }),
}))
