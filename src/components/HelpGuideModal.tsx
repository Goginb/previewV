import React from 'react'

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'Projects',
    body: [
      'Project files use the .previewv extension (JSON): tiles, pan/zoom, and viewport.',
      'Open: File → Open… or Ctrl+O. Recent files are under File.',
      'Add folder…: import all supported videos and images from a folder (subfolders included). If some files are already on the canvas, choose to add duplicates again or skip them.',
      'Save: Ctrl+S; Save As: Ctrl+Shift+S. Pick a filename on first save.',
      'Close project without quitting: File → Close project (Ctrl+W).',
      'When closing the window or switching projects, unsaved changes prompt Save / Don’t save / Cancel.',
    ],
  },
  {
    title: 'Video & images',
    body: [
      'Drop video or images on the canvas: JPEG, PNG, TIFF in-app; EXR/DPX via ffmpeg (needs a local file path when dragging).',
      'Tile sizes follow the aspect ratio of the source video or image.',
      'Video frame: select a video tile and press F3 to create an image tile.',
      'Drawing: select an image tile and press F4 (edit mode). The tile expands to the drawing area; F4 again or Done exits. Without F4, drawing is off.',
    ],
  },
  {
    title: 'Canvas & selection',
    body: [
      'Pan: hold Space and drag, or scroll / trackpad.',
      'Zoom: mouse wheel with Ctrl (or trackpad gestures).',
      'Select all tiles: Ctrl+A (in a note field, Ctrl+A selects text).',
      'Marquee: drag on empty canvas. Shift+click to add to selection.',
      'Fit everything: A (without Ctrl) or the Fit all button.',
      'Bottom-right HUD: Stop all / Play all — globally pause or resume video autoplay on the canvas.',
    ],
  },
  {
    title: 'Shortcuts',
    body: [
      'Ctrl+O — open · Ctrl+S — save · Ctrl+Shift+S — save as',
      'Ctrl+W — close project · Ctrl+A — select all tiles',
      'Ctrl+Z / Ctrl+Shift+Z — undo / redo · Ctrl+C / Ctrl+V — copy / paste tiles',
      'Delete — remove selection · Shift+D — duplicate · L — grid layout: all videos (up to 20 per row), then all images below (up to 20 per row), no overlap',
      '\\ (Backslash) or “Grid pack” — all tiles (video, image, note) into a non-overlapping grid, reading order, up to 20 per row',
      'Ctrl+N — new note · F3 — frame from video · F4 — draw on selected image',
      'Alt+Shift+A — pin window (always on top) · Alt+Shift+B — unpin (also View menu)',
    ],
  },
]

export const HelpGuideModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div
      className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-guide-title"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg max-h-[min(85vh,36rem)] flex flex-col rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
          <h2 id="help-guide-title" className="text-base font-semibold text-zinc-100">
            Help — PreviewV
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-600"
          >
            Close
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3 text-sm text-zinc-300 space-y-5">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h3 className="text-amber-400/95 font-medium mb-2">{s.title}</h3>
              <ul className="list-disc pl-5 space-y-1.5 text-zinc-400">
                {s.body.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
