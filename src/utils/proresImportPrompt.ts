import { usePreloadStore } from '../store/preloadStore'

declare global {
  interface WindowEventMap {
    'previewv-request-generate-proxy-confirmation': CustomEvent<{
      count: number
      unsavedProject: boolean
      resolve: (value: boolean) => void
    }>
  }
}

async function requestGenerateProxyConfirmation(
  count: number,
  unsavedProject: boolean,
): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    window.dispatchEvent(
      new CustomEvent('previewv-request-generate-proxy-confirmation', {
        detail: { count, unsavedProject, resolve },
      }),
    )
  })
}

export async function shouldGenerateProxiesForImport(
  videoPaths: string[],
  projectPath: string | null,
): Promise<boolean> {
  const api = window.electronAPI?.projectAPI
  if (!api?.inspectVideoSources) return false
  if (videoPaths.length === 0) return false

  const preload = usePreloadStore.getState()
  preload.setOpen(true)
  preload.setProgress(8, 'Checking imported videos (ProRes / MJPEG)...', 'Inspecting Videos')

  try {
    const inspected = await api.inspectVideoSources({ paths: videoPaths, projectPath })
    const missingProxyEntries = inspected.filter(
      (entry) => (entry.isProres || entry.isMjpeg) && !entry.hasProxy,
    )
    if (missingProxyEntries.length === 0) {
      preload.reset()
      return false
    }
    preload.reset()
    return await requestGenerateProxyConfirmation(missingProxyEntries.length, !projectPath)
  } catch {
    preload.reset()
    return false
  }
}
