import { create } from 'zustand'
import type { EstimatingLaunchContext } from '../../electron-api'
import type { VideoItem } from '../../types'
import { defaultVideoTileSizeForNew } from '../../utils/tileSizing'
import { localPathToMediaUrl } from '../../utils/projectSerializer'
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

interface ShotUiState {
  status: ShotSyncStatus
  message: string
}

interface EstimatingVideoBootstrapResult {
  items: VideoItem[]
  selectedItemId: string | null
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
  saveShot: (shotId: string) => Promise<void>
  selectShotBySourcePath: (sourcePath: string) => Promise<void>
}

const ROW_CAP = 6
const GAP = 20
const START_X = 80
const START_Y = 80
const VIDEO_UI_COLOR = '#14b8a6'

function normalizeSourceKey(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
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

function buildVideoItems(shots: EstimatingSessionShot[]): VideoItem[] {
  const size = defaultVideoTileSizeForNew()

  return shots.map((shot, index) => {
    const row = Math.floor(index / ROW_CAP)
    const column = index % ROW_CAP
    const x = START_X + column * (size.width + GAP)
    const y = START_Y + row * (size.height + 120)

    return {
      type: 'video',
      id: `estimating-video-${shot.id}`,
      srcUrl: localPathToMediaUrl(shot.media.path || ''),
      fileName: shot.media.path ? shot.media.path.split(/[/\\]/).filter(Boolean).at(-1) || shot.shotCode : shot.shotCode,
      sourceFilePath: shot.media.path || undefined,
      x,
      y,
      width: size.width,
      height: size.height,
      aspectApplied: true,
      uiColor: VIDEO_UI_COLOR,
    }
  })
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
    const writableTasks = buildWritableTasks(snapshot, context)
    const { shotsById, shotsBySourceKey } = buildShotMaps(readyShots)
    const draftsByShotId = buildDraftsByShotId(readyShots, writableTasks)
    const uiByShotId = buildUiByShotId(readyShots)
    const preferredShotId =
      (context.selectedShotId && shotsById[context.selectedShotId] && context.selectedShotId) ||
      (snapshot.resumeShotId && shotsById[snapshot.resumeShotId] && snapshot.resumeShotId) ||
      readyShots[0]?.id ||
      ''
    const items = buildVideoItems(readyShots)
    const selectedItemId = preferredShotId ? `estimating-video-${preferredShotId}` : null

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

    return { items, selectedItemId }
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

  saveShot: async (shotId) => {
    const state = get()
    const context = state.context
    const shot = state.shotsById[shotId]
    const draft = state.draftsByShotId[shotId]

    if (!context || !shot || !draft) {
      return
    }

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

      set((current) => ({
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
          [shotId]: nextDraft,
        },
        uiByShotId: {
          ...current.uiByShotId,
          [shotId]: {
            status: 'saved',
            message: '',
          },
        },
      }))
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
