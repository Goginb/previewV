import { create } from 'zustand'
import {
  applyVideoColorCommand,
  DEFAULT_VIDEO_COLOR,
  type VideoColorCommand,
  type VideoColorSettings,
} from '../utils/videoColor'

interface VideoColorState extends VideoColorSettings {
  applyCommand: (command: VideoColorCommand) => void
}

/** Temporary viewing correction shared by every video tile in the window. */
export const useVideoColorStore = create<VideoColorState>((set) => ({
  ...DEFAULT_VIDEO_COLOR,
  applyCommand: (command) => set((state) => applyVideoColorCommand(state, command)),
}))
