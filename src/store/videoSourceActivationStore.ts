import { create } from 'zustand'

interface VideoSourceActivationState {
  activeSourceIds: Record<string, true>
  setActiveSourceIds: (ids: string[]) => void
  clearActiveSourceIds: () => void
}

function buildActiveSourceMap(ids: string[]): Record<string, true> {
  const next: Record<string, true> = {}

  for (const id of ids) {
    if (!id) continue
    next[id] = true
  }

  return next
}

function sameActiveSourceMap(
  current: Record<string, true>,
  next: Record<string, true>,
): boolean {
  const currentKeys = Object.keys(current)
  const nextKeys = Object.keys(next)

  if (currentKeys.length !== nextKeys.length) {
    return false
  }

  return currentKeys.every((key) => next[key] === true)
}

export const useVideoSourceActivationStore = create<VideoSourceActivationState>((set, get) => ({
  activeSourceIds: {},
  setActiveSourceIds: (ids) => {
    const next = buildActiveSourceMap(ids)
    if (sameActiveSourceMap(get().activeSourceIds, next)) {
      return
    }
    set({ activeSourceIds: next })
  },
  clearActiveSourceIds: () => {
    if (Object.keys(get().activeSourceIds).length === 0) {
      return
    }
    set({ activeSourceIds: {} })
  },
}))
