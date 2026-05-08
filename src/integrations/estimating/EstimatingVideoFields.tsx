import React from 'react'
import {
  ESTIMATING_TASK_ADJUST_STEP,
  useEstimatingIntegrationStore,
  getEstimatingStatusLabel,
} from './store'

interface EstimatingVideoFieldsProps {
  shotId: string
  sourcePath: string
  tileWidth: number
}

function getPlaceholderValue(
  currentValue: number | null | undefined,
  originalValue: number | null | undefined,
): string {
  const sourceValue = currentValue ?? originalValue
  if (sourceValue === null || sourceValue === undefined) {
    return ''
  }
  return Number(sourceValue.toFixed(4)).toString()
}

const PANEL_MIN_WIDTH_ONE_COLUMN = 220
const PANEL_MIN_WIDTH_TWO_COLUMNS = 300
const PANEL_MIN_WIDTH_THREE_COLUMNS = 380
const PANEL_MIN_WIDTH_FOUR_COLUMNS = 480
const PANEL_HEADER_HEIGHT = 14
const PANEL_HEADER_GAP = 6
const PANEL_VERTICAL_PADDING = 8
const PANEL_ROW_HEIGHT = 44
const PANEL_ROW_GAP = 6

export function getEstimatingVideoPanelColumnCount(taskCount: number, tileWidth: number): number {
  if (taskCount <= 1) return 1
  if (tileWidth >= PANEL_MIN_WIDTH_FOUR_COLUMNS && taskCount >= 4) return 4
  if (tileWidth >= PANEL_MIN_WIDTH_THREE_COLUMNS && taskCount >= 3) return 3
  if (tileWidth >= PANEL_MIN_WIDTH_TWO_COLUMNS && taskCount >= 2) return 2
  return 1
}

export function getEstimatingVideoMinimumWidth(taskCount: number): number {
  if (taskCount <= 1) return PANEL_MIN_WIDTH_ONE_COLUMN
  if (taskCount <= 4) return PANEL_MIN_WIDTH_TWO_COLUMNS
  if (taskCount <= 8) return PANEL_MIN_WIDTH_THREE_COLUMNS
  return PANEL_MIN_WIDTH_FOUR_COLUMNS
}

export function getEstimatingVideoPanelHeight(taskCount: number, tileWidth: number): number {
  if (taskCount <= 0) {
    return 0
  }

  const columns = getEstimatingVideoPanelColumnCount(taskCount, tileWidth)
  const rows = Math.ceil(taskCount / columns)

  return (
    PANEL_VERTICAL_PADDING * 2 +
    PANEL_HEADER_HEIGHT +
    PANEL_HEADER_GAP +
    rows * PANEL_ROW_HEIGHT +
    Math.max(0, rows - 1) * PANEL_ROW_GAP
  )
}

export const EstimatingVideoFields: React.FC<EstimatingVideoFieldsProps> = ({
  shotId,
  sourcePath,
  tileWidth,
}) => {
  const shot = useEstimatingIntegrationStore((state) => state.shotsById[shotId] ?? null)
  const writableTasks = useEstimatingIntegrationStore((state) => state.writableTasks)
  const drafts = useEstimatingIntegrationStore((state) => state.draftsByShotId[shotId] ?? {})
  const ui = useEstimatingIntegrationStore((state) => state.uiByShotId[shotId] ?? { status: 'idle', message: '' })
  const language = useEstimatingIntegrationStore((state) => state.context?.language ?? 'en')
  const setDraftValue = useEstimatingIntegrationStore((state) => state.setDraftValue)
  const queueSaveShot = useEstimatingIntegrationStore((state) => state.queueSaveShot)
  const adjustDraftValue = useEstimatingIntegrationStore((state) => state.adjustDraftValue)
  const saveShot = useEstimatingIntegrationStore((state) => state.saveShot)
  const selectShotBySourcePath = useEstimatingIntegrationStore((state) => state.selectShotBySourcePath)

  if (!shot || writableTasks.length === 0) {
    return null
  }

  const statusLabel = getEstimatingStatusLabel(language, ui.status)
  const columnCount = getEstimatingVideoPanelColumnCount(writableTasks.length, tileWidth)
  const panelHeight = getEstimatingVideoPanelHeight(writableTasks.length, tileWidth)

  return (
    <div
      className="video-no-drag absolute left-0 right-0 z-[25] border-t px-2"
      style={{
        bottom: 34,
        height: panelHeight,
        background:
          'linear-gradient(180deg, rgba(7, 10, 18, 0.94), rgba(15, 23, 42, 0.98))',
        borderColor: 'rgba(20, 184, 166, 0.28)',
        paddingTop: PANEL_VERTICAL_PADDING,
        paddingBottom: PANEL_VERTICAL_PADDING,
      }}
      onMouseDown={(event) => {
        event.stopPropagation()
        void selectShotBySourcePath(sourcePath)
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div
        className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em]"
        style={{ minHeight: PANEL_HEADER_HEIGHT, marginBottom: PANEL_HEADER_GAP }}
      >
        <span className="truncate text-teal-200/90">
          {shot.shotCode || shot.sceneName || shotId}
        </span>
        <span className="shrink-0 text-teal-100/70">{statusLabel}</span>
      </div>

      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
        }}
      >
        {writableTasks.map((task) => {
          const liveTask = shot.tasks.find((entry) => entry.key === task.key)
          const value = drafts[task.key] ?? ''
          const placeholder = getPlaceholderValue(liveTask?.currentValue, liveTask?.originalValue)

          return (
            <label
              key={`${shotId}:${task.key}`}
              className="flex min-w-0 flex-col gap-0.5 rounded border px-1.5 py-1"
              style={{
                borderColor: 'rgba(45, 212, 191, 0.18)',
                background: 'rgba(15, 23, 42, 0.74)',
                minHeight: PANEL_ROW_HEIGHT,
              }}
            >
              <span className="truncate text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-300">
                {task.label}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="shrink-0 rounded border px-1.5 py-[5px] text-[10px] font-semibold text-teal-100 transition hover:bg-teal-400/10"
                  style={{
                    borderColor: 'rgba(45, 212, 191, 0.22)',
                    background: 'rgba(2, 6, 23, 0.84)',
                  }}
                  title={`-${ESTIMATING_TASK_ADJUST_STEP} | Ctrl: -1 | Shift: -2`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    void selectShotBySourcePath(sourcePath)
                    adjustDraftValue(shotId, task.key, -1, {
                      ctrlKey: event.ctrlKey,
                      metaKey: event.metaKey,
                      shiftKey: event.shiftKey,
                    })
                    queueSaveShot(shotId)
                  }}
                >
                  -
                </button>
                <input
                  className="min-w-0 flex-1 rounded border px-1.5 py-[5px] text-[10px] text-slate-50 outline-none"
                  style={{
                    borderColor: 'rgba(45, 212, 191, 0.22)',
                    background: 'rgba(2, 6, 23, 0.84)',
                  }}
                  value={value}
                  placeholder={placeholder}
                  inputMode="decimal"
                  onChange={(event) => {
                    setDraftValue(shotId, task.key, event.target.value)
                    queueSaveShot(shotId)
                  }}
                  onFocus={() => {
                    void selectShotBySourcePath(sourcePath)
                  }}
                  onBlur={() => {
                    void saveShot(shotId)
                  }}
                  onKeyDown={(event) => {
                    const isMinusKey = event.code === 'Minus' || event.code === 'NumpadSubtract'
                    const isPlusKey =
                      event.code === 'NumpadAdd' || (event.code === 'Equal' && event.shiftKey)

                    if ((isMinusKey || isPlusKey) && (event.ctrlKey || event.metaKey || event.shiftKey)) {
                      event.preventDefault()
                      adjustDraftValue(shotId, task.key, isMinusKey ? -1 : 1, {
                        ctrlKey: event.ctrlKey,
                        metaKey: event.metaKey,
                        shiftKey: event.shiftKey,
                      })
                      queueSaveShot(shotId)
                      return
                    }

                    if (event.key !== 'Enter') {
                      return
                    }
                    event.preventDefault()
                    void saveShot(shotId)
                    ;(event.currentTarget as HTMLInputElement).blur()
                  }}
                />
                <button
                  type="button"
                  className="shrink-0 rounded border px-1.5 py-[5px] text-[10px] font-semibold text-teal-100 transition hover:bg-teal-400/10"
                  style={{
                    borderColor: 'rgba(45, 212, 191, 0.22)',
                    background: 'rgba(2, 6, 23, 0.84)',
                  }}
                  title={`+${ESTIMATING_TASK_ADJUST_STEP} | Ctrl: +1 | Shift: +2`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    void selectShotBySourcePath(sourcePath)
                    adjustDraftValue(shotId, task.key, 1, {
                      ctrlKey: event.ctrlKey,
                      metaKey: event.metaKey,
                      shiftKey: event.shiftKey,
                    })
                    queueSaveShot(shotId)
                  }}
                >
                  +
                </button>
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}
