import React from 'react'

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'Проекты',
    body: [
      'Файл проекта — с расширением .previewv (JSON). В нём сохраняются плитки на холсте, масштаб и панорамирование.',
      'Открыть: меню «Файл → Открыть…» или Ctrl+O. Недавние проекты — в том же меню.',
      'Сохранить: Ctrl+S; «Сохранить как…» — Ctrl+Shift+S. При первом сохранении укажите имя файла.',
      'Закрыть проект без выхода из приложения: «Файл → Закрыть проект» (Ctrl+W).',
      'При закрытии окна или смене проекта, если есть несохранённые изменения, будет запрос.',
    ],
  },
  {
    title: 'Видео и изображения',
    body: [
      'Перетащите видеофайлы (например .mp4) на холст или используйте системный диалог выбора файла.',
      'Кадр из видео: выберите плитку видео и нажмите F3 — рядом появится снимок (изображение).',
      'Рисование по изображению: откройте плитку, рисуйте; отмена штриха — Ctrl+Z в контексте плитки.',
    ],
  },
  {
    title: 'Холст и выделение',
    body: [
      'Панорамирование: зажмите пробел и тяните мышью, или колёсико/тачпад.',
      'Масштаб: колесо с Ctrl (или жесты тачпада).',
      'Выделить все плитки: Ctrl+A (в полях ввода заметки Ctrl+A выделяет текст).',
      'Рамка выделения: тяните мышью по пустому месту. Shift+клик — добавить к выделению.',
      'Подогнать все плитки в кадр: клавиша A (без Ctrl) или кнопка «Fit all».',
    ],
  },
  {
    title: 'Горячие клавиши (кратко)',
    body: [
      'Ctrl+O — открыть проект · Ctrl+S — сохранить · Ctrl+Shift+S — сохранить как',
      'Ctrl+W — закрыть проект · Ctrl+A — выделить всё на холсте',
      'Ctrl+Z / Ctrl+Shift+Z — отмена / повтор · Ctrl+C / Ctrl+V — копировать / вставить плитки',
      'Delete — удалить выделенное · Shift+D — дублировать выделение · L — выровнять выбранные видео/картинки в ряд',
      'Ctrl+N — новая заметка · F3 — кадр из выбранного видео',
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
            Справка — PreviewV
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
