import { videoRegistry } from './videoRegistry'

let hoverAudioEnabled = true
let hoveredVideo: HTMLVideoElement | null = null

function muteAllExcept(activeVideo: HTMLVideoElement | null): void {
  for (const video of videoRegistry.values()) {
    video.muted = video !== activeVideo
  }
}

export function beginVideoHoverAudio(video: HTMLVideoElement): void {
  hoveredVideo = video
  if (!hoverAudioEnabled) {
    video.muted = true
    return
  }
  muteAllExcept(video)
}

export function endVideoHoverAudio(video: HTMLVideoElement): void {
  video.muted = true
  if (hoveredVideo === video) hoveredVideo = null
}

export function toggleVideoHoverAudioEnabled(): boolean {
  hoverAudioEnabled = !hoverAudioEnabled
  const activeVideo =
    hoverAudioEnabled && hoveredVideo && Array.from(videoRegistry.values()).includes(hoveredVideo)
      ? hoveredVideo
      : null
  muteAllExcept(activeVideo)
  return hoverAudioEnabled
}
