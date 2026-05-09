import { create } from 'zustand'
import type { EstimatingLaunchContext } from '../../electron-api'
import {
  fetchEstimatingSessionSnapshot,
  saveEstimatingActiveShot,
  saveEstimatingShotValues,
} from './api'
import type {
  EstimatingSessionShot,
  EstimatingSessionSnapshot,
  EstimatingSessionTask,
} from './types'

type ShotSyncStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
export const ESTIMATING_TASK_ADJUST_STEP = 0.25
const ESTIMATING_SHOT_AUTOSAVE_DELAY_MS = 240

interface TaskAdjustModifierState {
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

interface ShotUiState {
  status: ShotSyncStatus
  message: string
}

interface EstimatingVideoBootstrapResult {
  folderPaths: string[]
  mediaPaths: string[]
  preferredMediaPath: string | null
}

interface EstimatingIntegrationState {
  active: boolean
  loading: boolean
  context: EstimatingLaunchContext | null
  writableTasks: EstimatingSessionTask[]
  shotsById: Record<string, EstimatingSessionShot>
  shotsBySourceKey: Record<string, EstimatingSessionShot>
  draftsByShotId: Record<string, Record<string, string>>
  uiByShotId: Record<string, ShotUiState>
  selectedShotId: string
  initializeFromLaunchContext: (
    context: EstimatingLaunchContext,
  ) => Promise<EstimatingVideoBootstrapResult>
  setDraftValue: (shotId: string, taskKey: string, value: string) => void
  queueSaveShot: (shotId: string, options?: { immediate?: boolean }) => void
  acceptOriginalValue: (shotId: string, taskKey: string) => Promise<void>
  adjustDraftValue: (
    shotId: string,
    taskKey: string,
    direction: -1 | 1,
    modifiers?: TaskAdjustModifierState,
  ) => void
  saveShot: (shotId: string) => Promise<void>
  saveDirtyShots: () => Promise<void>
  flushPendingShotSync: () => Promise<void>
  selectShotBySourcePath: (sourcePath: string) => Promise<void>
}

function normalizeSourceKey(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
}

function parentDirectoryFromPath(value: string): string {
  const trimmed = value.trim().replace(/[\\/]+$/, '')
  const separatorIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return separatorIndex > 0 ? trimmed.slice(0, separatorIndex) : ''
}

function collectUniquePaths(values: Array<string | null | undefined>): string[] {
  const uniquePaths = new Map<string, string>()

  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }

    const trimmed = value.trim()
    if (!trimmed) {
      continue
    }

    const key = normalizeSourceKey(trimmed)
    if (!uniquePaths.has(key)) {
      uniquePaths.set(key, trimmed)
    }
  }

  return [...uniquePaths.values()]
}

function formatDraftValue(value: number | null): string {
  if (value === null || value === undefined) {
    return ''
  }
  return Number(value.toFixed(4)).toString()
}

function parseDraftValue(value: string): number | null {
  const trimmed = value.replace(',', '.').trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function clampTaskValue(value: number): number {
  return Number(Math.max(0, value).toFixed(4))
}

function getTaskAdjustStep(modifiers?: TaskAdjustModifierState): number {
  if (modifiers?.ctrlKey || modifiers?.metaKey) {
    return 1
  }
  if (modifiers?.shiftKey) {
    return 2
  }
  return ESTIMATING_TASK_ADJUST_STEP
}

function resolveAdjustableTaskValue(
  shot: EstimatingSessionShot,
  taskKey: string,
  draftValue?: string,
): number {
  const draft = draftValue === undefined ? null : parseDraftValue(draftValue)
  if (draft !== null) {
    return draft
  }

  const task = shot.tasks.find((entry) => entry.key === taskKey)
  if (!task) {
    return 0
  }
  if (task.currentValue !== null) {
    return task.currentValue
  }
  if (task.originalValue !== null) {
    return task.originalValue
  }
  return 0
}

function buildWritableTasks(
  snapshot: EstimatingSessionSnapshot,
  context: EstimatingLaunchContext,
): EstimatingSessionTask[] {
  const requested = new Set(context.writableTaskKeys.map((entry) => entry.trim()).filter(Boolean))
  if (requested.size === 0) {
    return snapshot.tasks
  }
  const filtered = snapshot.tasks.filter((task) => requested.has(task.key))
  return filtered.length > 0 ? filtered : snapshot.tasks
}

function buildShotMaps(shots: EstimatingSessionShot[]) {
  const shotsById: Record<string, EstimatingSessionShot> = {}
  const shotsBySourceKey: Record<string, EstimatingSessionShot> = {}

  for (const shot of shots) {
    shotsById[shot.id] = shot
    if (shot.media.path) {
      shotsBySourceKey[normalizeSourceKey(shot.media.path)] = shot
    }
  }

  return { shotsById, shotsBySourceKey }
}

function buildDraftsByShotId(
  shots: EstimatingSessionShot[],
  writableTasks: EstimatingSessionTask[],
): Record<string, Record<string, string>> {
  const drafts: Record<string, Record<string, string>> = {}

  for (const shot of shots) {
    const nextDraft: Record<string, string> = {}
    for (const task of writableTasks) {
      const liveTask = shot.tasks.find((entry) => entry.key === task.key)
      nextDraft[task.key] = formatDraftValue(liveTask?.currentValue ?? null)
    }
    drafts[shot.id] = nextDraft
  }

  return drafts
}

function buildUiByShotId(shots: EstimatingSessionShot[]): Record<string, ShotUiState> {
  return Object.fromEntries(shots.map((shot) => [shot.id, { status: 'idle', message: '' }]))
}

const pendingShotSaveTimeouts = new Map<string, number>()
const inFlightShotSaves = new Set<string>()

function clearQueuedShotSave(shotId: string) {
  const timeoutId = pendingShotSaveTimeouts.get(shotId)
  if (typeof timeoutId === 'number') {
    window.clearTimeout(timeoutId)
    pendingShotSaveTimeouts.delete(shotId)
  }
}

function collectDirtyShotIds(state: Pick<EstimatingIntegrationState, 'draftsByShotId' | 'uiByShotId'>) {
  return Object.entries(state.uiByShotId)
    .filter(
      ([shotId, ui]) =>
        !!state.draftsByShotId[shotId] && (ui.status === 'dirty' || ui.status === 'error'),
    )
    .map(([shotId]) => shotId)
}

function collectPendingShotIds(
  state: Pick<EstimatingIntegrationState, 'draftsByShotId' | 'uiByShotId'>,
): string[] {
  const pending = new Set<string>(collectDirtyShotIds(state))

  for (const shotId of pendingShotSaveTimeouts.keys()) {
    pending.add(shotId)
  }

  for (const shotId of inFlightShotSaves) {
    pending.add(shotId)
  }

  for (const [shotId, ui] of Object.entries(state.uiByShotId)) {
    if (ui.status === 'saving' && state.draftsByShotId[shotId]) {
      pending.add(shotId)
    }
  }

  return [...pending]
}

async function waitForShotSyncIdle(timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (pendingShotSaveTimeouts.size === 0 && inFlightShotSaves.size === 0) {
      return
    }

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 40)
    })
  }

  throw new Error('Timed out while waiting for estimating shot sync to finish.')
}

function labelForStatus(language: 'en' | 'ru', status: ShotSyncStatus): string {
  if (status === 'saving') {
    return language === 'ru' ? 'сохр.' : 'saving'
  }
  if (status === 'saved') {
    return language === 'ru' ? 'сохранено' : 'saved'
  }
  if (status === 'error') {
    return language === 'ru' ? 'ошибка' : 'error'
  }
  if (status === 'dirty') {
    return language === 'ru' ? 'черновик' : 'draft'
  }
  return ''
}

export function getEstimatingStatusLabel(language: 'en' | 'ru', status: ShotSyncStatus): string {
  return labelForStatus(language, status)
}

export const useEstimatingIntegrationStore = create<EstimatingIntegrationState>((set, get) => ({
  active: false,
  loading: false,
  context: null,
  writableTasks: [],
  shotsById: {},
  shotsBySourceKey: {},
  draftsByShotId: {},
  uiByShotId: {},
  selectedShotId: '',

  initializeFromLaunchContext: async (context) => {
    set({ loading: true, context })
    const snapshot = await fetchEstimatingSessionSnapshot(context)
    const readyShots = snapshot.shots.filter((shot) => shot.media.status === 'ready' && !!shot.media.path)
    const folderPaths = collectUniquePaths(
      snapshot.shots.flatMap((shot) => [
        shot.media.expectedDirectory,
        shot.media.path ? parentDirectoryFromPath(shot.media.path) : null,
      ]),
    )
    const mediaPaths = collectUniquePaths(readyShots.map((shot) => shot.media.path))
    const writableTasks = buildWritableTasks(snapshot, context)
    const { shotsById, shotsBySourceKey } = buildShotMaps(readyShots)
    const draftsByShotId = buildDraftsByShotId(readyShots, writableTasks)
    const uiByShotId = buildUiByShotId(readyShots)
    const preferredShotId =
      (context.selectedShotId && shotsById[context.selectedShotId] && context.selectedShotId) ||
      (snapshot.resumeShotId && shotsById[snapshot.resumeShotId] && snapshot.resumeShotId) ||
      readyShots[0]?.id ||
      ''
    const preferredMediaPath = preferredShotId ? shotsById[preferredShotId]?.media.path ?? null : mediaPaths[0] ?? null

    set({
      active: true,
      loading: false,
      context,
      writableTasks,
      shotsById,
      shotsBySourceKey,
      draftsByShotId,
      uiByShotId,
      selectedShotId: preferredShotId,
    })

    if (preferredShotId) {
      void saveEstimatingActiveShot(context, preferredShotId).catch(() => {})
    }

    return { folderPaths, mediaPaths, preferredMediaPath }
  },

  setDraftValue: (shotId, taskKey, value) =>
    set((state) => ({
      draftsByShotId: {
        ...state.draftsByShotId,
        [shotId]: {
          ...(state.draftsByShotId[shotId] ?? {}),
          [taskKey]: value,
        },
      },
      uiByShotId: {
        ...state.uiByShotId,
        [shotId]: {
          status: 'dirty',
          message: '',
        },
      },
    })),

  queueSaveShot: (shotId, options) => {
    clearQueuedShotSave(shotId)

    const state = get()
    if (!state.context || !state.shotsById[shotId] || !state.draftsByShotId[shotId]) {
      return
    }

    if (options?.immediate) {
      void get().saveShot(shotId)
      return
    }

    const timeoutId = window.setTimeout(() => {
      pendingShotSaveTimeouts.delete(shotId)
      void get().saveShot(shotId)
    }, ESTIMATING_SHOT_AUTOSAVE_DELAY_MS)

    pendingShotSaveTimeouts.set(shotId, timeoutId)
  },

  acceptOriginalValue: async (shotId, taskKey) => {
    const state = get()
    const shot = state.shotsById[shotId]
    if (!shot) {
      return
    }

    const task = shot.tasks.find((entry) => entry.key === taskKey)
    if (!task || task.originalValue === null || task.originalValue === undefined) {
      return
    }

    const nextValue = formatDraftValue(task.originalValue)
    const currentDraftValue = state.draftsByShotId[shotId]?.[taskKey] ?? ''
    const currentLiveValue = formatDraftValue(task.currentValue)
    if (currentDraftValue === nextValue && currentLiveValue === nextValue) {
      return
    }

    clearQueuedShotSave(shotId)
    set((current) => ({
      draftsByShotId: {
        ...current.draftsByShotId,
        [shotId]: {
          ...(current.draftsByShotId[shotId] ?? {}),
          [taskKey]: nextValue,
        },
      },
      uiByShotId: {
        ...current.uiByShotId,
        [shotId]: {
          status: 'dirty',
          message: '',
        },
      },
    }))

    await get().saveShot(shotId)
  },

  adjustDraftValue: (shotId, taskKey, direction, modifiers) =>
    set((state) => {
      const shot = state.shotsById[shotId]
      if (!shot) {
        return state
      }

      const currentDraftValue = state.draftsByShotId[shotId]?.[taskKey]
      const nextValue = clampTaskValue(
        resolveAdjustableTaskValue(shot, taskKey, currentDraftValue) +
          getTaskAdjustStep(modifiers) * direction,
      )

      return {
        draftsByShotId: {
          ...state.draftsByShotId,
          [shotId]: {
            ...(state.draftsByShotId[shotId] ?? {}),
            [taskKey]: Number(nextValue.toFixed(4)).toString(),
          },
        },
        uiByShotId: {
          ...state.uiByShotId,
          [shotId]: {
            status: 'dirty',
            message: '',
          },
        },
      }
    }),

  saveShot: async (shotId) => {
    clearQueuedShotSave(shotId)

    const state = get()
    const context = state.context
    const shot = state.shotsById[shotId]
    const draft = state.draftsByShotId[shotId]
    const ui = state.uiByShotId[shotId]

    if (!context || !shot || !draft) {
      return
    }

    if (ui?.status === 'saving' || inFlightShotSaves.has(shotId)) {
      get().queueSaveShot(shotId)
      return
    }

    const submittedDraft = { ...draft }
    inFlightShotSaves.add(shotId)

    set((current) => ({
      uiByShotId: {
        ...current.uiByShotId,
        [shotId]: {
          status: 'saving',
          message: '',
        },
      },
    }))

    try {
      const values = Object.fromEntries(
        state.writableTasks.map((task) => [task.key, parseDraftValue(draft[task.key] ?? '')]),
      )
      const result = await saveEstimatingShotValues(context, shotId, values)
      const nextShot = result.shot
      const nextDraft = Object.fromEntries(
        state.writableTasks.map((task) => {
          const liveTask = nextShot.tasks.find((entry) => entry.key === task.key)
          return [task.key, formatDraftValue(liveTask?.currentValue ?? null)]
        }),
      )
      let shouldResave = false

      set((current) => {
        const latestDraft = current.draftsByShotId[shotId] ?? {}
        const hasDraftChanged = state.writableTasks.some(
          (task) => (latestDraft[task.key] ?? '') !== (submittedDraft[task.key] ?? ''),
        )
        shouldResave = hasDraftChanged

        return {
          shotsById: {
            ...current.shotsById,
            [shotId]: nextShot,
          },
          shotsBySourceKey: {
            ...current.shotsBySourceKey,
            ...(nextShot.media.path ? { [normalizeSourceKey(nextShot.media.path)]: nextShot } : {}),
          },
          draftsByShotId: {
            ...current.draftsByShotId,
            [shotId]: hasDraftChanged ? latestDraft : nextDraft,
          },
          uiByShotId: {
            ...current.uiByShotId,
            [shotId]: {
              status: hasDraftChanged ? 'dirty' : 'saved',
              message: '',
            },
          },
        }
      })

      if (shouldResave) {
        get().queueSaveShot(shotId)
      }
    } catch (error) {
      set((current) => ({
        uiByShotId: {
          ...current.uiByShotId,
          [shotId]: {
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          },
        },
      }))
    } finally {
      inFlightShotSaves.delete(shotId)
    }
  },

  saveDirtyShots: async () => {
    const dirtyShotIds = collectDirtyShotIds(get())

    dirtyShotIds.forEach((shotId) => {
      clearQueuedShotSave(shotId)
    })

    await Promise.all(dirtyShotIds.map((shotId) => get().saveShot(shotId)))
  },

  flushPendingShotSync: async () => {
    const kickPendingSaves = async () => {
      const pendingShotIds = collectPendingShotIds(get())

      pendingShotIds.forEach((shotId) => {
        clearQueuedShotSave(shotId)
      })

      if (pendingShotIds.length > 0) {
        await Promise.all(pendingShotIds.map((shotId) => get().saveShot(shotId)))
      }
    }

    await kickPendingSaves()
    await waitForShotSyncIdle()

    const remainingDirtyShotIds = collectDirtyShotIds(get())
    if (remainingDirtyShotIds.length > 0) {
      await Promise.all(remainingDirtyShotIds.map((shotId) => get().saveShot(shotId)))
      await waitForShotSyncIdle()
    }
  },

  selectShotBySourcePath: async (sourcePath) => {
    const state = get()
    const normalizedSourceKey = normalizeSourceKey(sourcePath)
    const shot = state.shotsBySourceKey[normalizedSourceKey]
    const context = state.context

    if (!shot) {
      return
    }

    set({ selectedShotId: shot.id })

    if (!context) {
      return
    }

    try {
      await saveEstimatingActiveShot(context, shot.id)
    } catch {
      // Renderer keeps local selection even if helper update failed.
    }
  },
}))
