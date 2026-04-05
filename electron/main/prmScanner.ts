import { promises as fs } from 'fs'
import path from 'path'

export interface ScanPrmOpts {
  year: string
  project: string
  scene: string
}

// Helpers for UI Dropdowns
async function getSubDirs(targetPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => e.name)
  } catch (err) {
    return []
  }
}

export async function getPrmYears(): Promise<string[]> {
  const years = await getSubDirs(`Z:\\_Projects`)
  return years.filter(y => y.match(/^\d{4}$/)).sort().reverse()
}

export async function getPrmProjects(year: string): Promise<string[]> {
  if (!year) return []
  const res = await getSubDirs(`Z:\\_Projects\\${year}`)
  return res.sort()
}

export async function getPrmScenes(year: string, project: string): Promise<string[]> {
  if (!year || !project) return []
  const res = await getSubDirs(`Z:\\_Projects\\${year}\\${project}\\episodes`)
  return res.sort()
}

export async function scanPrmFolder(opts: ScanPrmOpts): Promise<string[]> {
  const rootDir = `Z:\\_Projects\\${opts.year}\\${opts.project}\\episodes\\${opts.scene}\\_prm`
  const resultPaths: string[] = []

  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true })

    // Collect files directly in _prm folder
    for (const entry of entries) {
      if (entry.isFile()) {
        resultPaths.push(path.join(rootDir, entry.name))
      }
    }

    // Also collect files from subdirectories if any exist
    const shotDirs = entries.filter(e => e.isDirectory())
    for (const shotDir of shotDirs) {
      const shotPath = path.join(rootDir, shotDir.name)
      try {
        const files = await fs.readdir(shotPath, { withFileTypes: true })
        for (const f of files) {
          if (f.isFile()) {
            resultPaths.push(path.join(shotPath, f.name))
          }
        }
      } catch {
        continue
      }
    }
  } catch (err: any) {
    console.error('PRM scan error:', err)
    if (err.code === 'ENOENT') {
      throw new Error(`Directory not found: ${rootDir}`)
    }
    throw new Error(`Failed to scan PRM folder: ${err.message || String(err)}`)
  }

  // Natural sort for consistent ordering
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  resultPaths.sort((a, b) => collator.compare(a, b))

  return resultPaths
}
