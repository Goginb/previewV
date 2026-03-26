/**
 * While global playback is suspended (Stop all), these video ids are still
 * allowed to play because the user explicitly started them.
 */
const manualAllowedIds = new Set<string>()

export function setManualPlaybackAllowedInSuspended(id: string, allowed: boolean): void {
  if (allowed) manualAllowedIds.add(id)
  else manualAllowedIds.delete(id)
}

export function isManualPlaybackAllowedInSuspended(id: string): boolean {
  return manualAllowedIds.has(id)
}

export function clearManualPlaybackAllowedInSuspended(): void {
  manualAllowedIds.clear()
}

