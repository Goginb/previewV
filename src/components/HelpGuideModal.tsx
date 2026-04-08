import React from 'react'

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'Проекты',
    body: [
      'Файлы проекта используют расширение .previewv: в них сохраняются плитки, заметки, бэкдропы, viewport, палитры и служебные настройки холста.',
      'Открыть проект: File -> Open... или Ctrl+O. Последние проекты доступны в меню File.',
      'Сохранить: Ctrl+S. Сохранить как: Ctrl+Shift+S. При первом сохранении выберите имя файла.',
      'Add folder... импортирует все поддерживаемые видео и изображения из папки вместе с подпапками.',
      'Закрыть проект без выхода из приложения: File -> Close project или Ctrl+W. При закрытии окна и смене проекта приложение предлагает сохранить изменения.',
    ],
  },
  {
    title: 'Навигация по холсту',
    body: [
      'Перемещение по холсту: удерживайте Space и тяните мышью, либо зажмите среднюю кнопку мыши и двигайте холст.',
      'Масштаб: Ctrl + колесо мыши или жесты тачпада. Крупность поиска и центровки плиток при этом не меняется сама по себе.',
      'Показать весь холст: клавиша A без Ctrl или команда Fit all.',
      'Клик по пустому месту холста сбрасывает выделение. То же работает и по пустой области внутри бэкдропа.',
      'Клавиша справа от Ю (/) открывает поиск по видео. Список фильтруется по имени файла, а клик переносит холст так, чтобы выбранное видео оказалось в центре.',
    ],
  },
  {
    title: 'Выделение и плитки',
    body: [
      'Обычные плитки выделяются кликом по всей площади, а не только по хедеру.',
      'Прямоугольное выделение работает по пустому холсту и внутри бэкдропов. Backdrop выделяется рамкой только когда он целиком попал в область выделения.',
      'Видео, изображения, заметки и бэкдропы можно ресайзить без предварительного выделения.',
      'Ctrl+C копирует выделенные плитки, Ctrl+X вырезает их, Ctrl+V вставляет. Shift+D дублирует выделение, Delete удаляет его.',
      'Ctrl+Z и Ctrl+Shift+Z работают по текущему контексту: если вы редактируете текст, undo/redo относится к тексту; если работаете с холстом, откатываются действия на холсте.',
      'Клавиша Q открывает окно с путём к выделенному файлу. Путь в поле уже выделен, поэтому его можно сразу скопировать.',
    ],
  },
  {
    title: 'Заметки',
    body: [
      'Клавиша N создаёт новую заметку возле курсора.',
      'Размер новой заметки и стартовый размер шрифта зависят от текущего zoom холста.',
      'Если вставить текст в холст вне поля ввода, создаётся новая заметка. Если фокус стоит в input или textarea, текст вставляется в само поле.',
      'Заметка, созданная из текста через Ctrl+V, сразу подстраивает размер под содержимое. Длинные строки и слова переносятся внутри заметки.',
      'Кнопки изменения размера текста в заметке не передают двойной клик наружу и не разворачивают плитку.',
    ],
  },
  {
    title: 'Видео и изображения',
    body: [
      'На холст можно перетаскивать локальные видео и изображения: MP4, WebM, MOV, JPEG, PNG, TIFF, EXR, DPX и другие поддерживаемые форматы.',
      'У видео через ПКМ доступна палитра UI-цветов: она перекрашивает рамку, хедер, нижнюю панель и элементы управления, не меняя сам видеокадр.',
      'Если видео остановлено, в нижней панели доступны кнопки шага по кадру влево и вправо.',
      'F3 сохраняет текущий кадр выделенного видео как отдельную image tile.',
      'F4 включает режим рисования у выделенного изображения. Повторное F4 или кнопка Done завершают режим редактирования.',
    ],
  },
  {
    title: 'Бэкдропы',
    body: [
      'Клавиша B создаёт новый backdrop: вокруг выделенных плиток или под курсором, если ничего не выделено.',
      'Вложенные бэкдропы поддерживаются по глубине. Можно выделять плитки внутри бэкдропа и создавать вокруг них новый внутренний backdrop.',
      'Заголовки вложенных бэкдропов учитывают глубину и остаются доступными поверх внутренних слоёв.',
      'Frame mode переключается через ПКМ по бэкдропу: вместо сплошного фона остаётся рамка, но внутренние правила бэкдропа продолжают работать.',
      'Бэкдроп по умолчанию таскается за хедер. Двойной клик по названию включает переименование.',
      'У каждого бэкдропа есть отдельная палитра, hue и прочие параметры оформления, которые применяются независимо даже у вложенных бэкдропов.',
    ],
  },
  {
    title: 'Контекстное меню',
    body: [
      'ПКМ по видео открывает контекстное меню видео, ПКМ по бэкдропу — меню бэкдропа, а ниже после разделителя идёт общий блок действий холста.',
      'В общем блоке доступны действия вроде New note, Add backdrop, Paste, Grid align, Fit all, Settings и Always on top.',
      'Контекстные меню автоматически сдвигаются внутрь окна приложения и не должны обрезаться у правого или нижнего края.',
    ],
  },
  {
    title: 'Hot Keys',
    body: [
      'Ctrl+O — открыть проект',
      'Ctrl+S — сохранить проект',
      'Ctrl+Shift+S — сохранить проект как',
      'Ctrl+W — закрыть проект',
      'Ctrl+A — выделить все плитки на холсте',
      'Ctrl+Z / Ctrl+Shift+Z — undo / redo',
      'Ctrl+C / Ctrl+X / Ctrl+V — copy / cut / paste',
      'Delete — удалить выделение',
      'Shift+D — дублировать выделенные плитки',
      'A — показать весь холст',
      'B — создать backdrop',
      'N — создать заметку',
      'Q — показать путь к выделенному файлу',
      '/ (клавиша справа от Ю) — поиск по видео',
      '\\ или IntlBackslash — grid align без наложения',
      'L — разложить выбранные видео и изображения в ряд',
      'F3 — сохранить кадр из выделенного видео',
      'F4 — включить или выключить draw mode у выделенного изображения',
      'Ctrl+Shift+A — переключить режим always on top',
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
      <div className="flex max-h-[min(88vh,48rem)] w-full max-w-3xl flex-col rounded-xl border border-[var(--menu-border)] bg-[var(--menu-bg)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--menu-border)] px-4 py-3 shrink-0">
          <div>
            <h2 id="help-guide-title" className="text-base font-semibold text-themeText-100">
              Инструкция — PreviewV
            </h2>
            <div className="text-xs text-themeText-400">
              Основные сценарии, новые возможности и горячие клавиши в одном месте.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--menu-border)] bg-themeBg-active px-3 py-1.5 text-sm text-themeText-200 hover:bg-themeBg-hover"
          >
            Закрыть
          </button>
        </div>
        <div className="grid gap-0 overflow-hidden md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="hidden border-r border-[var(--menu-border)] bg-black/10 md:block">
            <div className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-themeText-500">
              Разделы
            </div>
            <div className="px-3 pb-3">
              {SECTIONS.map((section) => {
                const anchorId = `help-${section.title.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-')}`
                return (
                  <a
                    key={section.title}
                    href={`#${anchorId}`}
                    className="block rounded-lg px-3 py-2 text-sm text-themeText-300 transition-colors hover:bg-themeBg-hover hover:text-themeText-100"
                  >
                    {section.title}
                  </a>
                )
              })}
            </div>
          </div>
          <div className="max-h-[min(88vh,48rem)] overflow-y-auto px-4 py-4 text-sm text-themeText-300 space-y-6">
            {SECTIONS.map((section) => {
              const anchorId = `help-${section.title.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-')}`
              return (
                <section key={section.title} id={anchorId} className="scroll-mt-6">
                  <h3 className="mb-2 text-base font-semibold text-themeText-100">{section.title}</h3>
                  <ul className="list-disc space-y-1.5 pl-5 text-themeText-400">
                    {section.body.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
