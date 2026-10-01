import React from 'react'

export const WindowTitleBar: React.FC<{ title: string }> = ({ title }) => {
  const windowAPI = window.electronAPI?.windowAPI

  return (
    <div
      className="previewv-titlebar absolute inset-x-0 top-0 z-[500] flex h-8 items-center border-b pl-3"
      style={{ background: 'var(--menu-bg)', borderColor: 'var(--menu-border)' }}
    >
      <span className="pointer-events-none min-w-0 flex-1 truncate text-xs text-themeText-200">
        {title}
      </span>
      <div className="previewv-titlebar-controls flex h-full shrink-0">
        <button
          type="button"
          className="h-full w-11 text-sm text-themeText-200 hover:bg-themeBg-hover"
          title="Свернуть"
          aria-label="Свернуть окно"
          onClick={() => void windowAPI?.minimize()}
        >
          −
        </button>
        <button
          type="button"
          className="h-full w-11 text-sm text-themeText-200 hover:bg-themeBg-hover"
          title="Развернуть или восстановить"
          aria-label="Развернуть или восстановить окно"
          onClick={() => void windowAPI?.toggleMaximize()}
        >
          □
        </button>
        <button
          type="button"
          className="h-full w-11 text-lg text-themeText-200 hover:bg-red-600 hover:text-white"
          title="Закрыть"
          aria-label="Закрыть окно"
          onClick={() => void windowAPI?.close()}
        >
          ×
        </button>
      </div>
    </div>
  )
}
