import { create } from 'zustand'

/** Оверлей «предзагрузка медиа» — короткий текст + прогресс 0–100. */
interface PreloadState {
  open: boolean
  pct: number
  line: string
  setOpen: (open: boolean) => void
  setProgress: (pct: number, line: string) => void
  reset: () => void
}

export const usePreloadStore = create<PreloadState>((set) => ({
  open: false,
  pct: 0,
  line: '',
  setOpen: (open) => set({ open }),
  setProgress: (pct, line) => set({ pct: Math.min(100, Math.max(0, Math.round(pct))), line }),
  reset: () => set({ open: false, pct: 0, line: '' }),
}))
