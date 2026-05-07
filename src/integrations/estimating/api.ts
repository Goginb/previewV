import type { EstimatingLaunchContext } from '../../electron-api'
import type {
  EstimatingSaveShotValuesResponse,
  EstimatingSessionSnapshot,
} from './types'

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`)
  }
  return payload as T
}

function buildJsonRequest(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

export async function fetchEstimatingSessionSnapshot(
  context: EstimatingLaunchContext,
): Promise<EstimatingSessionSnapshot> {
  const response = await buildJsonRequest(`${context.helperBaseUrl}/api/session/snapshot`, {
    sessionId: context.sessionId,
  })
  return parseJson<EstimatingSessionSnapshot>(response)
}

export async function saveEstimatingShotValues(
  context: EstimatingLaunchContext,
  shotId: string,
  values: Record<string, number | null>,
): Promise<EstimatingSaveShotValuesResponse> {
  const response = await buildJsonRequest(`${context.helperBaseUrl}/api/save-shot-values`, {
    sessionId: context.sessionId,
    shotId,
    values,
    savePreferences: {
      directory: context.saveDirectory,
    },
    writableTaskKeys: context.writableTaskKeys,
  })
  return parseJson<EstimatingSaveShotValuesResponse>(response)
}

export async function saveEstimatingActiveShot(
  context: EstimatingLaunchContext,
  shotId: string,
): Promise<void> {
  const response = await buildJsonRequest(`${context.helperBaseUrl}/api/session/active-shot`, {
    sessionId: context.sessionId,
    shotId,
  })
  await parseJson<{ savedAt: string; shotId: string }>(response)
}
