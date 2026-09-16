import React, { useEffect } from 'react'

const HOTKEY_GROUPS = [
  {
    title: 'Холст',
    accent: 'sky',
    items: [
      { keys: 'F11', action: 'Полноэкранный режим' },
      { keys: 'Стрелки', action: 'Плавное перемещение' },
      { keys: 'A', action: 'Вписать всё в окно' },
      { keys: 'Shift+A', action: 'Сбросить масштаб и позицию' },
      { keys: 'Ctrl+R', action: 'Заблокировать или разблокировать холст' },
    ],
  },
  {
    title: 'Объекты',
    accent: 'emerald',
    items: [
      { keys: 'L', action: 'Разложить медиа в ряд' },
      { keys: '\\', action: 'Выровнять плитки по сетке' },
      { keys: 'N', action: 'Создать заметку' },
      { keys: 'B', action: 'Создать backdrop' },
      { keys: 'Ctrl+V', action: 'Вставить скопированные плитки' },
      { keys: 'Alt+L', action: 'Закрепить или открепить выделение' },
    ],
  },
  {
    title: 'Видео',
    accent: 'fuchsia',
    items: [
      { keys: '. после Ю', action: 'Найти видео на холсте' },
      { keys: 'F3', action: 'Сохранить кадр выбранного видео' },
      { keys: 'H', action: 'Отразить по горизонтали' },
      { keys: 'V', action: 'Отразить по вертикали' },
      { keys: '` / Ё', action: 'Звук видео при наведении' },
    ],
  },
  {
    title: 'Проект и окно',
    accent: 'amber',
    items: [
      { keys: 'Q', action: 'Показать путь текущего проекта' },
      { keys: 'Ctrl+Shift+A', action: 'Закрепить окно поверх остальных' },
    ],
  },
] as const

const HOTKEY_COLUMNS = [
  [HOTKEY_GROUPS[0], HOTKEY_GROUPS[2]],
  [HOTKEY_GROUPS[1], HOTKEY_GROUPS[3]],
] as const

const ACCENT_CLASSES = {
  sky: {
    panel: 'border-sky-500/25',
    title: 'text-sky-300',
    key: 'border-sky-500/35 bg-sky-500/10 text-sky-200',
  },
  emerald: {
    panel: 'border-emerald-500/25',
    title: 'text-emerald-300',
    key: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200',
  },
  fuchsia: {
    panel: 'border-fuchsia-500/25',
    title: 'text-fuchsia-300',
    key: 'border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-200',
  },
  amber: {
    panel: 'border-amber-500/25',
    title: 'text-amber-300',
    key: 'border-amber-500/35 bg-amber-500/10 text-amber-200',
  },
} as const

export const ImportantHotkeysModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat) return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  return (
    <div
      data-previewv-modal="true"
      data-important-hotkeys-modal="true"
      className="fixed inset-0 z-[12500] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="important-hotkeys-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="flex max-h-[min(92vh,720px)] w-[min(96vw,900px)] flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: 'var(--menu-bg)', borderColor: 'var(--menu-border)' }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--menu-border)] px-5 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300">
              Быстрая подсказка
            </div>
            <h2 id="important-hotkeys-title" className="mt-1 text-xl font-semibold text-themeText-100">
              Важные хоткеи
            </h2>
            <p className="mt-1 text-sm text-themeText-400">Нажмите Shift+H или Esc, чтобы закрыть окно.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--menu-border)] bg-themeBg-active px-3 py-1.5 text-sm text-themeText-200 hover:bg-themeBg-hover"
          >
            Закрыть
          </button>
        </div>

        <div className="grid min-h-0 gap-3 overflow-y-auto p-4 md:grid-cols-2">
          {HOTKEY_COLUMNS.map((column, columnIndex) => (
            <div key={columnIndex} className="space-y-3">
              {column.map((group) => {
                const accent = ACCENT_CLASSES[group.accent]
                return (
                  <section
                    key={group.title}
                    className={[
                      'overflow-hidden rounded-xl border bg-black/10',
                      accent.panel,
                    ].join(' ')}
                  >
                    <div
                      className={[
                        'border-b border-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]',
                        accent.title,
                      ].join(' ')}
                    >
                      {group.title}
                    </div>
                    <div className="divide-y divide-white/5">
                      {group.items.map((item) => (
                        <div
                          key={item.keys}
                          className="grid grid-cols-[106px_minmax(0,1fr)] items-center gap-3 px-3 py-1.5"
                        >
                          <kbd
                            className={[
                              'flex min-h-7 items-center justify-center rounded-md border px-2 text-center text-[11px] font-semibold shadow-inner',
                              accent.key,
                            ].join(' ')}
                          >
                            {item.keys}
                          </kbd>
                          <span className="text-xs leading-4 text-themeText-200">{item.action}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
