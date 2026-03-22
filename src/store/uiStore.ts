import { create } from 'zustand'

/** Window chrome / shell state mirrored from Electron main (e.g. always-on-top). */
interface UiState {
  alwaysOnTop: boolean
  setAlwaysOnTop: (v: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  alwaysOnTop: false,
  setAlwaysOnTop: (v) => set({ alwaysOnTop: v }),
}))
