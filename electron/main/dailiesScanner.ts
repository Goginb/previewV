import { promises as fs } from 'fs'
import path from 'path'

export interface ScanDailiesOpts {
  year: string
  project: string
  scene: string
  priorities: string[]
}

function parseKeywords(prioStr: string): string[] {
  return prioStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
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

export async function getDailiesYears(): Promise<string[]> {
  const years = await getSubDirs(`Z:\\_Projects`)
  return years.filter(y => y.match(/^\d{4}$/)).sort().reverse() // Show newest first
}

export async function getDailiesProjects(year: string): Promise<string[]> {
  if (!year) return []
  const res = await getSubDirs(`Z:\\_Projects\\${year}`)
  return res.sort()
}

export async function getDailiesScenes(year: string, project: string): Promise<string[]> {
  if (!year || !project) return []
  const res = await getSubDirs(`Z:\\_Projects\\${year}\\${project}\\episodes`)
  return res.sort()
}

export async function scanDailiesFolder(opts: ScanDailiesOpts): Promise<string[]> {
  const rootDir = `Z:\\_Projects\\${opts.year}\\${opts.project}\\episodes\\${opts.scene}\\_dailies`
  const resultPaths: string[] = []

  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true })
    const shotDirs = entries.filter(e => e.isDirectory())

    // Process all shot directories
    for (const shotDir of shotDirs) {
      const shotPath = path.join(rootDir, shotDir.name)
      let shotFiles: string[] = []
      try {
        const files = await fs.readdir(shotPath, { withFileTypes: true })
        shotFiles = files.filter(f => f.isFile()).map(f => f.name)
      } catch {
        continue
      }

      let bestFile: string | null = null
      let bestPriorityIndex = Infinity

      // Natural sort (e.g. v001, v002, v010)
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
      shotFiles.sort(collator.compare)

      for (const fileName of shotFiles) {
        const lowerName = fileName.toLowerCase()
        const tokens = lowerName.split(/[^a-z0-9]/) // Split by _, ., -, etc.

        let matchedPriorityIndex = -1
        for (let i = 0; i < opts.priorities.length; i++) {
          const keywords = parseKeywords(opts.priorities[i])
          if (keywords.length === 0) continue

          // Check if any keyword exactly matches one of the alphanumeric tokens in the filename
          if (keywords.some(kw => tokens.includes(kw))) {
            matchedPriorityIndex = i
            break
          }
        }

        if (matchedPriorityIndex !== -1) {
          // Found a match
          // If it's a better (lower index) priority, replace it
          if (matchedPriorityIndex < bestPriorityIndex) {
            bestPriorityIndex = matchedPriorityIndex
            bestFile = fileName
          } else if (matchedPriorityIndex === bestPriorityIndex) {
            // Same priority tier: since array is sorted naturally ascending,
            // later items are newer versions (e.g. v002 overrides v001).
            bestFile = fileName
          }
        }
      }

      if (bestFile) {
        resultPaths.push(path.join(shotPath, bestFile))
      }
    }
  } catch (err: any) {
    console.error('Dailies scan error:', err)
    if (err.code === 'ENOENT') {
      throw new Error(`Directory not found: ${rootDir}`)
    }
    throw new Error(`Failed to scan dailies folder: ${err.message || String(err)}`)
  }

  return resultPaths
}
