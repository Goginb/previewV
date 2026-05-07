export interface EstimatingSessionTask {
  key: string
  label: string
}

export interface EstimatingShotTask extends EstimatingSessionTask {
  originalValue: number | null
  currentValue: number | null
}

export interface EstimatingShotMedia {
  status: string
  path: string | null
  expectedDirectory: string | null
  message: string
}

export interface EstimatingSessionShot {
  id: string
  sheetName: string
  sceneName: string
  shotCode: string
  tcIn: string
  tcOut: string
  currentTotal: number
  media: EstimatingShotMedia
  tasks: EstimatingShotTask[]
}

export interface EstimatingSessionSnapshot {
  sessionId: string
  resumeShotId: string
  tasks: EstimatingSessionTask[]
  shots: EstimatingSessionShot[]
}

export interface EstimatingSaveShotValuesResponse {
  savedAt: string
  shot: EstimatingSessionShot
  workingCopyPath: string
  workingCopyMode: string
  workingCopyCreated: boolean
}
