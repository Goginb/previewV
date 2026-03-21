/**
 * Video tiles the user explicitly paused: playback manager must not call play()
 * until the user resumes (or scrubs end restores playback).
 */
export const videoUserPausedIds = new Set<string>()

export function setVideoUserPausedByUser(id: string, paused: boolean): void {
  if (paused) videoUserPausedIds.add(id)
  else videoUserPausedIds.delete(id)
}
