import React from 'react'

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'Проекты',
    body: [
      'Файлы проекта используют расширение .previewv: на холсте сохраняются плитки, viewport, pan/zoom и метаданные.',
      'Открыть проект: File → Open… или Ctrl+O. Последние проекты доступны в меню File.',
      'Add folder… импортирует все поддерживаемые видео и изображения из папки вместе с подпапками.',
      'Сохранить: Ctrl+S. Сохранить как: Ctrl+Shift+S. При первом сохранении выберите имя файла.',
      'Закрыть проект без выхода из приложения: File → Close project или Ctrl+W.',
      'При закрытии окна и при переключении проекта приложение спрашивает: сохранить, не сохранять или отменить действие.',
    ],
  },
  {
    title: 'Видео и изображения',
    body: [
      'На холст можно перетаскивать локальные видео и изображения: MP4, WebM, MOV, JPEG, PNG, TIFF, EXR, DPX и другие поддерживаемые форматы.',
      'Размер плитки подстраивается под пропорции исходного видео или изображения.',
      'Кадр из видео: выделите video tile и нажмите F3.',
      'Рисование по изображению: выделите image tile и нажмите F4. Повторное F4 или кнопка Done завершает режим редактирования.',
    ],
  },
  {
    title: 'Холст и выделение',
    body: [
      'Перемещение по холсту: удерживайте Space и тяните мышью, либо используйте колесо мыши или тачпад.',
      'Масштаб: Ctrl + колесо мыши или жесты тачпада.',
      'Выделить всё: Ctrl+A. Внутри текстовой заметки Ctrl+A выделяет именно текст.',
      'Прямоугольное выделение: тяните по пустому месту холста. Shift или Ctrl добавляют элементы к текущему выделению.',
      'Показать весь холст: клавиша A без Ctrl или кнопка Fit all.',
      'HUD справа снизу: Stop all / Play all глобально останавливает или возвращает autoplay у видео на холсте.',
    ],
  },
  {
    title: 'Горячие клавиши',
    body: [
      'Ctrl+O — открыть · Ctrl+S — сохранить · Ctrl+Shift+S — сохранить как',
      'Ctrl+W — закрыть проект · Ctrl+A — выделить все плитки',
      'Ctrl+Z / Ctrl+Shift+Z — undo / redo · Ctrl+C / Ctrl+V — копировать / вставить плитки',
      'Delete — удалить выделение · Shift+D — дублировать · L — разложить медиа по сетке без наложения',
      '\\ или кнопка Grid pack — упаковать все плитки в общую сетку без наложения',
      'Ctrl+N — новая заметка · F3 — кадр из видео · F4 — рисование по выбранному изображению',
      'Alt+Shift+A — закрепить окно поверх всех · Alt+Shift+B — снять закрепление',
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
            Инструкция — PreviewV
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-600"
          >
            Закрыть
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
