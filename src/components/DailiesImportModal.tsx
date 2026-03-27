import React, { useState, useEffect } from 'react'
import { useUiStore } from '../store/uiStore'
import { useCanvasStore } from '../store/canvasStore'
import { defaultVideoTileSizeForNew } from '../utils/tileSizing'
import type { CanvasItem } from '../types'

export const DailiesImportModal: React.FC = () => {
  const {
    dailiesYear,
    dailiesProject,
    dailiesScene,
    dailiesPriorities,
    setDailiesYear,
    setDailiesProject,
    setDailiesScene,
    setDailiesPriorities,
    setDailiesModalOpen,
  } = useUiStore()

  const [isScanning, setIsScanning] = useState(false)
  
  const [availableYears, setAvailableYears] = useState<string[]>([])
  const [availableProjects, setAvailableProjects] = useState<string[]>([])
  const [availableScenes, setAvailableScenes] = useState<string[]>([])

  useEffect(() => {
    window.electronAPI?.projectAPI.getDailiesYears?.().then((res) => {
      setAvailableYears(res ?? [])
      // Auto-select if current is invalid, or if first load
      if (res && res.length > 0 && !res.includes(useUiStore.getState().dailiesYear)) {
        setDailiesYear(res[0])
      }
    }).catch(() => {})
  }, [setDailiesYear])

  useEffect(() => {
    if (dailiesYear) {
      window.electronAPI?.projectAPI.getDailiesProjects?.(dailiesYear).then((res) => {
        setAvailableProjects(res ?? [])
        if (res && res.length > 0 && !res.includes(useUiStore.getState().dailiesProject)) {
          setDailiesProject(res[0])
        }
      }).catch(() => {})
    } else {
      setAvailableProjects([])
    }
  }, [dailiesYear, setDailiesProject])

  useEffect(() => {
    if (dailiesYear && dailiesProject) {
      window.electronAPI?.projectAPI.getDailiesScenes?.(dailiesYear, dailiesProject).then((res) => {
        setAvailableScenes(res ?? [])
        if (res && res.length > 0 && !res.includes(useUiStore.getState().dailiesScene)) {
          setDailiesScene(res[0])
        }
      }).catch(() => {})
    } else {
      setAvailableScenes([])
    }
  }, [dailiesYear, dailiesProject, setDailiesScene])

  const handleImport = async () => {
    try {
      setIsScanning(true)
      const api = window.electronAPI?.projectAPI
      if (!api) return

      const paths = await api.scanDailies({
        year: dailiesYear,
        project: dailiesProject,
        scene: dailiesScene,
        priorities: dailiesPriorities,
      })

      if (paths.length === 0) {
        alert('По заданным критериям дейлизы не найдены.')
        setIsScanning(false)
        return
      }

      const state = useCanvasStore.getState()
      const { viewport } = state
      
      // Calculate center of screen in world coordinates
      const cx = (-viewport.x + window.innerWidth / 2) / viewport.scale
      const cy = (-viewport.y + window.innerHeight / 2) / viewport.scale

      const newItems: CanvasItem[] = []
      let i = 0

      for (const p of paths) {
        const isVid = /\.(mp4|webm|mov|mkv|avi|m4v|ogv)$/i.test(p)
        const fileName = p.split(/[/\\]/).pop() || 'Media'
        if (isVid) {
          const resolved = await api.resolveVideoSource(p)
          const dim = defaultVideoTileSizeForNew()
          const dw = dim.width
          const dh = dim.height
          newItems.push({
            type: 'video',
            id: `tile-${Date.now()}-${i}`,
            srcUrl: resolved.srcUrl,
            fileName,
            x: cx - dw / 2 + i * (dw + 40),
            y: cy - dh / 2,
            width: dw,
            height: dh,
          })
        } else {
          try {
            const resolved = await api.resolveImageSource(p)
            newItems.push({
              type: 'image',
              id: `img-${Date.now()}-${i}`,
              srcUrl: resolved.srcUrl,
              storage: resolved.storage,
              sourceVideoId: '',
              fileName,
              sourceFilePath: resolved.sourceFilePath,
              projectAssetPath: resolved.projectAssetPath,
              naturalWidth: resolved.naturalWidth,
              naturalHeight: resolved.naturalHeight,
              x: cx - resolved.width / 2 + i * (resolved.width + 40),
              y: cy - resolved.height / 2,
              width: resolved.width,
              height: resolved.height,
            })
          } catch (err) {
            console.error('Failed to resolve image:', p, err)
          }
        }
        i++
      }

      state.addItems(newItems)
      state.setSelection(newItems.map((it) => it.id))
      setDailiesModalOpen(false)
    } catch (err: any) {
      alert(err?.message || String(err))
    } finally {
      setIsScanning(false)
    }
  }

  const handlePriorityChange = (index: number, val: string) => {
    const nextArr = [...dailiesPriorities]
    nextArr[index] = val
    setDailiesPriorities(nextArr)
  }

  return (
    <div
      className="fixed inset-0 z-[6000] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-[min(92vw,500px)] max-h-[85vh] overflow-y-auto rounded-xl border p-4 shadow-2xl"
        style={{ background: 'var(--menu-bg)', borderColor: 'var(--menu-border)', boxShadow: 'var(--menu-shadow)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-themeText-100">Import Dailies</h2>
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-themeText-200 hover:bg-themeBg-hover"
            onClick={() => setDailiesModalOpen(false)}
          >
            Close
          </button>
        </div>

        <section className="mb-4 space-y-3">
          <h3 className="text-sm border-b border-[var(--theme-divider)] pb-1 font-semibold text-themeText-200">Путь</h3>
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-xs text-themeText-300">
              Год (Year)
              {availableYears.length > 0 ? (
                <select
                  value={dailiesYear}
                  onChange={(e) => setDailiesYear(e.target.value)}
                  className="rounded border border-[var(--menu-border)] bg-[var(--app-bg)] px-2 py-1.5 text-themeText-100"
                >
                  {!availableYears.includes(dailiesYear) && <option value={dailiesYear}>{dailiesYear}</option>}
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={dailiesYear}
                  onChange={(e) => setDailiesYear(e.target.value)}
                  className="rounded border border-[var(--menu-border)] bg-[var(--app-bg)] px-2 py-1.5 text-themeText-100"
                />
              )}
            </label>
            <label className="flex flex-col gap-1 text-xs text-themeText-300">
              Проект (Project)
              {availableProjects.length > 0 ? (
                <select
                  value={dailiesProject}
                  onChange={(e) => setDailiesProject(e.target.value)}
                  className="rounded border border-[var(--menu-border)] bg-[var(--app-bg)] px-2 py-1.5 text-themeText-100"
                >
                  {!availableProjects.includes(dailiesProject) && <option value={dailiesProject}>{dailiesProject}</option>}
                  {availableProjects.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={dailiesProject}
                  onChange={(e) => setDailiesProject(e.target.value)}
                  className="rounded border border-[var(--menu-border)] bg-[var(--app-bg)] px-2 py-1.5 text-themeText-100"
                />
              )}
            </label>
            <label className="flex flex-col gap-1 text-xs text-themeText-300">
              Сцена (Scene)
              {availableScenes.length > 0 ? (
                <select
                  value={dailiesScene}
                  onChange={(e) => setDailiesScene(e.target.value)}
                  className="rounded border border-[var(--menu-border)] bg-[var(--app-bg)] px-2 py-1.5 text-themeText-100"
                >
                  {!availableScenes.includes(dailiesScene) && <option value={dailiesScene}>{dailiesScene}</option>}
                  {availableScenes.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={dailiesScene}
                  onChange={(e) => setDailiesScene(e.target.value)}
                  className="rounded border border-[var(--menu-border)] bg-[var(--app-bg)] px-2 py-1.5 text-themeText-100"
                />
              )}
            </label>
          </div>
          <div className="text-[10px] text-themeText-400 font-mono mt-1 break-all">
            Z:\_Projects\{dailiesYear || '2024'}\{dailiesProject || 'Project'}\episodes\{dailiesScene || 'SCN'}\_dailies
          </div>
        </section>

        <section className="mb-4 space-y-2">
          <h3 className="text-sm border-b border-[var(--theme-divider)] pb-1 font-semibold text-themeText-200">Приоритеты имен (через запятую)</h3>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-themeText-400 w-4">{i + 1}.</span>
              <input
                type="text"
                value={dailiesPriorities[i] || ''}
                onChange={(e) => handlePriorityChange(i, e.target.value)}
                placeholder={i === 0 ? "Например: comp" : i === 1 ? "Например: cln, clnp" : ""}
                className="flex-1 rounded border border-[var(--menu-border)] bg-[var(--app-bg)] px-2 py-1 text-sm text-themeText-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          ))}
          <p className="text-[11px] text-themeText-400 mt-2 leading-tight">
            Скрипт зайдёт в папку каждой сцены, отфильтрует файлы по этим совпадениям (от 1 до 5) и возьмёт новейшую версию из самого высокого найденного приоритета.
          </p>
        </section>

        <div className="mt-5 flex justify-end gap-2 pt-2 border-t border-[var(--theme-divider)]">
          <button
            type="button"
            className="px-4 py-1.5 rounded border border-[var(--menu-border)] text-themeText-200 hover:bg-themeBg-hover disabled:opacity-50"
            onClick={() => setDailiesModalOpen(false)}
            disabled={isScanning}
          >
            Отмена
          </button>
          <button
            type="button"
            className="px-4 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 font-medium"
            onClick={handleImport}
            disabled={isScanning || !dailiesYear || !dailiesProject || !dailiesScene}
          >
            {isScanning ? 'Поиск...' : 'Импортировать'}
          </button>
        </div>
      </div>
    </div>
  )
}
