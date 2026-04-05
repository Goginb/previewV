import React, { useState, useEffect } from 'react'
import { useUiStore } from '../store/uiStore'
import { useCanvasStore } from '../store/canvasStore'
import { defaultVideoTileSizeForNew } from '../utils/tileSizing'
import type { CanvasItem } from '../types'

export const PrmImportModal: React.FC = () => {
  const {
    prmYear,
    prmProject,
    prmScene,
    setPrmYear,
    setPrmProject,
    setPrmScene,
    setPrmModalOpen,
  } = useUiStore()

  const [isScanning, setIsScanning] = useState(false)
  
  const [availableYears, setAvailableYears] = useState<string[]>([])
  const [availableProjects, setAvailableProjects] = useState<string[]>([])
  const [availableScenes, setAvailableScenes] = useState<string[]>([])

  useEffect(() => {
    window.electronAPI?.projectAPI.getPrmYears?.().then((res) => {
      setAvailableYears(res ?? [])
      if (res && res.length > 0 && !res.includes(useUiStore.getState().prmYear)) {
        setPrmYear(res[0])
      }
    }).catch(() => {})
  }, [setPrmYear])

  useEffect(() => {
    if (prmYear) {
      window.electronAPI?.projectAPI.getPrmProjects?.(prmYear).then((res) => {
        setAvailableProjects(res ?? [])
        if (res && res.length > 0 && !res.includes(useUiStore.getState().prmProject)) {
          setPrmProject(res[0])
        }
      }).catch(() => {})
    } else {
      setAvailableProjects([])
    }
  }, [prmYear, setPrmProject])

  useEffect(() => {
    if (prmYear && prmProject) {
      window.electronAPI?.projectAPI.getPrmScenes?.(prmYear, prmProject).then((res) => {
        setAvailableScenes(res ?? [])
        if (res && res.length > 0 && !res.includes(useUiStore.getState().prmScene)) {
          setPrmScene(res[0])
        }
      }).catch(() => {})
    } else {
      setAvailableScenes([])
    }
  }, [prmYear, prmProject, setPrmScene])

  const handleImport = async () => {
    try {
      setIsScanning(true)
      const api = window.electronAPI?.projectAPI
      if (!api) return

      const paths = await api.scanPrm({
        year: prmYear,
        project: prmProject,
        scene: prmScene,
        priorities: [],
      })

      if (paths.length === 0) {
        alert('PRM файлы не найдены.')
        setIsScanning(false)
        return
      }

      const state = useCanvasStore.getState()
      const { viewport } = state
      
      // Place new items below existing content, or at screen center if canvas is empty
      const ROW_GAP = 40
      let startX: number
      let startY: number

      if (state.items.length > 0) {
        let minX = Infinity
        let maxY = -Infinity
        for (const it of state.items) {
          minX = Math.min(minX, it.x)
          maxY = Math.max(maxY, it.y + it.height)
        }
        startX = minX
        startY = maxY + ROW_GAP
      } else {
        const cx = (-viewport.x + window.innerWidth / 2) / viewport.scale
        const cy = (-viewport.y + window.innerHeight / 2) / viewport.scale
        startX = cx
        startY = cy
      }

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
            x: startX + i * (dw + 40),
            y: startY,
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
              x: startX + i * (resolved.width + 40),
              y: startY,
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
      setPrmModalOpen(false)
    } catch (err: any) {
      alert(err?.message || String(err))
    } finally {
      setIsScanning(false)
    }
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
          <h2 className="text-lg font-semibold text-themeText-100">Import PRM</h2>
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-themeText-200 hover:bg-themeBg-hover"
            onClick={() => setPrmModalOpen(false)}
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
                  value={prmYear}
                  onChange={(e) => setPrmYear(e.target.value)}
                  className="rounded border border-[var(--menu-border)] bg-[var(--app-bg)] px-2 py-1.5 text-themeText-100"
                >
                  {!availableYears.includes(prmYear) && <option value={prmYear}>{prmYear}</option>}
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={prmYear}
                  onChange={(e) => setPrmYear(e.target.value)}
                  className="rounded border border-[var(--menu-border)] bg-[var(--app-bg)] px-2 py-1.5 text-themeText-100"
                />
              )}
            </label>
            <label className="flex flex-col gap-1 text-xs text-themeText-300">
              Проект (Project)
              {availableProjects.length > 0 ? (
                <select
                  value={prmProject}
                  onChange={(e) => setPrmProject(e.target.value)}
                  className="rounded border border-[var(--menu-border)] bg-[var(--app-bg)] px-2 py-1.5 text-themeText-100"
                >
                  {!availableProjects.includes(prmProject) && <option value={prmProject}>{prmProject}</option>}
                  {availableProjects.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={prmProject}
                  onChange={(e) => setPrmProject(e.target.value)}
                  className="rounded border border-[var(--menu-border)] bg-[var(--app-bg)] px-2 py-1.5 text-themeText-100"
                />
              )}
            </label>
            <label className="flex flex-col gap-1 text-xs text-themeText-300">
              Сцена (Scene)
              {availableScenes.length > 0 ? (
                <select
                  value={prmScene}
                  onChange={(e) => setPrmScene(e.target.value)}
                  className="rounded border border-[var(--menu-border)] bg-[var(--app-bg)] px-2 py-1.5 text-themeText-100"
                >
                  {!availableScenes.includes(prmScene) && <option value={prmScene}>{prmScene}</option>}
                  {availableScenes.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={prmScene}
                  onChange={(e) => setPrmScene(e.target.value)}
                  className="rounded border border-[var(--menu-border)] bg-[var(--app-bg)] px-2 py-1.5 text-themeText-100"
                />
              )}
            </label>
          </div>
          <div className="text-[10px] text-themeText-400 font-mono mt-1 break-all">
            Z:\_Projects\{prmYear || '2024'}\{prmProject || 'Project'}\episodes\{prmScene || 'SCN'}\_prm
          </div>
        </section>

        <p className="text-[11px] text-themeText-400 leading-tight mb-4">
          Будут импортированы все файлы из всех подпапок.
        </p>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--theme-divider)]">
          <button
            type="button"
            className="px-4 py-1.5 rounded border border-[var(--menu-border)] text-themeText-200 hover:bg-themeBg-hover disabled:opacity-50"
            onClick={() => setPrmModalOpen(false)}
            disabled={isScanning}
          >
            Отмена
          </button>
          <button
            type="button"
            className="px-4 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 font-medium"
            onClick={handleImport}
            disabled={isScanning || !prmYear || !prmProject || !prmScene}
          >
            {isScanning ? 'Поиск...' : 'Импортировать'}
          </button>
        </div>
      </div>
    </div>
  )
}
