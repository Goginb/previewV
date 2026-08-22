import React, { useEffect, useState } from 'react'
import flightImage from '../assets/help/user-refs/flight.png'
import goldGrabImage from '../assets/help/user-refs/gold-grab.png'
import robotControlsImage from '../assets/help/user-refs/robot-controls.png'
import robotVaultImage from '../assets/help/user-refs/robot-vault.png'
import robotWallImage from '../assets/help/user-refs/robot-wall.png'
import trainBridgeImage from '../assets/help/user-refs/train-bridge-generated.png'
import trainCurveImage from '../assets/help/user-refs/train-curve-generated.png'
import trainTunnelImage from '../assets/help/user-refs/train-tunnel-generated.png'
import trainValleyImage from '../assets/help/user-refs/train-valley-generated.png'
import trainViaductImage from '../assets/help/user-refs/train-viaduct.png'
import trainWheelsImage from '../assets/help/user-refs/train-wheels.png'
import vaultCorridorImage from '../assets/help/user-refs/vault-corridor-generated.png'
import vaultDestructionImage from '../assets/help/user-refs/vault-destruction.png'
import vaultFloorRobotImage from '../assets/help/user-refs/vault-floor-robot-generated.png'
import vaultGoldLiftImage from '../assets/help/user-refs/vault-gold-lift-generated.png'
import vaultOverviewImage from '../assets/help/user-refs/vault-overview-generated-v2.png'
import vaultWallActionImage from '../assets/help/user-refs/vault-wall-action-generated.png'
import vaultWideImage from '../assets/help/user-refs/vault-wide.png'

const WORKFLOW_STEPS = [
  {
    title: 'Добавьте мастер-шот',
    body: 'Перетащите рабочий видеофайл на холст — он станет центром анализа.',
  },
  {
    title: 'Разложите рефы вокруг',
    body: 'Добавьте видео, кадры и изображения с нужным светом, камерой, атмосферой или эффектом.',
  },
  {
    title: 'Сгруппируйте по смыслу',
    body: 'Соберите рефы в backdrops по сцене, задаче, визуальному решению или повторяющемуся паттерну.',
  },
  {
    title: 'Сравните и решите',
    body: 'Держите весь контекст перед глазами: проверяйте результат, оценивайте сложность и фиксируйте план.',
  },
]

const frameClass =
  'isolate overflow-hidden rounded-md border border-white/15 bg-[#020407] shadow-[0_8px_24px_rgba(0,0,0,0.42)] ring-1 ring-black/35'
const imageClass = 'block h-full w-full object-cover'

const ReferenceBoardLayout: React.FC = () => (
  <div className="relative h-full min-h-[260px] overflow-hidden bg-[radial-gradient(circle_at_50%_50%,rgba(25,78,110,0.2),transparent_45%),#05080d]">
    <div className="absolute inset-y-[5%] left-[2.5%] w-[23%] rounded-xl border border-cyan-500/20 bg-cyan-950/15" />
    <div className="absolute inset-y-[5%] right-[2.5%] w-[23%] rounded-xl border border-amber-500/20 bg-amber-950/15" />

    <div className={`${frameClass} absolute left-[4.5%] top-[8%] w-[19%] border-cyan-400/45`} style={{ aspectRatio: '12 / 5' }}>
      <img src={robotControlsImage} alt="Деталь механизмов" className={imageClass} draggable={false} />
    </div>
    <div className={`${frameClass} absolute left-[4.5%] top-[39%] w-[19%] border-cyan-400/45`} style={{ aspectRatio: '12 / 5' }}>
      <img src={robotWallImage} alt="Робот взаимодействует со стеной" className={imageClass} draggable={false} />
    </div>
    <div className={`${frameClass} absolute left-[4.5%] top-[70%] w-[19%] border-cyan-400/45`} style={{ aspectRatio: '12 / 5' }}>
      <img src={robotVaultImage} alt="Робот внутри хранилища" className={imageClass} draggable={false} />
    </div>

    <div className={`${frameClass} absolute left-[26%] top-[31%] z-10 w-[48%] border-sky-300/55 shadow-[0_14px_40px_rgba(14,116,144,0.16)]`} style={{ aspectRatio: '12 / 5' }}>
      <img src={vaultWideImage} alt="Главный кадр хранилища" className={imageClass} draggable={false} />
    </div>

    <div className={`${frameClass} absolute right-[4.5%] top-[18%] w-[19%] border-amber-400/45`} style={{ aspectRatio: '12 / 5' }}>
      <img src={goldGrabImage} alt="Крупный план золотого слитка" className={imageClass} draggable={false} />
    </div>
    <div className={`${frameClass} absolute right-[4.5%] top-[61%] w-[19%] border-amber-400/45`} style={{ aspectRatio: '12 / 5' }}>
      <img src={vaultDestructionImage} alt="Разрушение внутри хранилища" className={imageClass} draggable={false} />
    </div>

    <div className="absolute left-[23.5%] top-[49%] h-px w-[2.5%] border-t border-dashed border-cyan-400/60" />
    <div className="absolute right-[23.5%] top-[49%] h-px w-[2.5%] border-t border-dashed border-amber-400/60" />
  </div>
)

const SceneAnalysisLayout: React.FC = () => (
  <div className="grid h-full min-h-[310px] grid-rows-[1.18fr_0.82fr] gap-2 bg-[radial-gradient(circle_at_30%_25%,rgba(8,145,178,0.12),transparent_42%),#05080d] p-3">
    <div className="grid min-h-0 grid-cols-[1.35fr_0.65fr] gap-2">
      <div className={`${frameClass} border-cyan-400/45 shadow-[0_12px_34px_rgba(8,145,178,0.12)]`}>
        <img src={vaultOverviewImage} alt="Новый общий кадр хранилища" className={imageClass} draggable={false} />
      </div>
      <div className="grid min-h-0 grid-rows-2 gap-2 rounded-xl border border-cyan-500/15 bg-cyan-950/10 p-1.5">
        <div className={frameClass}>
          <img src={vaultFloorRobotImage} alt="Робот на разрушенном полу хранилища" className={imageClass} draggable={false} />
        </div>
        <div className={frameClass}>
          <img src={vaultCorridorImage} alt="Симметричный коридор хранилища" className={imageClass} draggable={false} />
        </div>
      </div>
    </div>
    <div className="grid min-h-0 grid-cols-2 gap-2">
      <div className={frameClass}>
        <img src={vaultWallActionImage} alt="Робот разбирает стену хранилища" className={imageClass} draggable={false} />
      </div>
      <div className={frameClass}>
        <img src={vaultGoldLiftImage} alt="Механический захват поднимает слитки" className={imageClass} draggable={false} />
      </div>
    </div>
  </div>
)

const EstimationPatternsLayout: React.FC = () => (
  <div className="grid h-full min-h-[330px] grid-rows-[1.1fr_0.7fr_1.1fr] gap-2 bg-[radial-gradient(circle_at_70%_30%,rgba(190,24,93,0.1),transparent_42%),#070806] p-3">
    <div className="grid min-h-0 grid-cols-2 gap-2">
      <div className={`${frameClass} border-rose-400/45 shadow-[0_12px_34px_rgba(244,63,94,0.1)]`}>
        <img src={trainViaductImage} alt="Главный железнодорожный кадр" className={imageClass} draggable={false} />
      </div>
      <div className={`${frameClass} border-amber-400/30`}>
        <img src={trainCurveImage} alt="Поезд на изгибе пути с высоты" className={imageClass} draggable={false} />
      </div>
    </div>
    <div className="grid min-h-0 grid-cols-3 gap-2">
      <div className={frameClass}>
        <img src={trainWheelsImage} alt="Повторяющийся паттерн движения колёс" className={imageClass} draggable={false} />
      </div>
      <div className={frameClass}>
        <img src={flightImage} alt="Референс скорости и движения камеры" className={imageClass} draggable={false} />
      </div>
      <div className={frameClass}>
        <img src={trainValleyImage} alt="Широкий кадр поезда в долине" className={imageClass} draggable={false} />
      </div>
    </div>
    <div className="grid min-h-0 grid-cols-2 gap-2 rounded-xl border border-rose-500/15 bg-rose-950/10 p-2">
      <div className={frameClass}>
        <img src={trainTunnelImage} alt="Поезд выходит из тоннеля" className={imageClass} draggable={false} />
      </div>
      <div className={frameClass}>
        <img src={trainBridgeImage} alt="Поезд пересекает железный мост" className={imageClass} draggable={false} />
      </div>
    </div>
  </div>
)

type HotkeyAccent = 'sky' | 'emerald' | 'amber' | 'violet' | 'rose'

interface HotkeyGroup {
  title: string
  accent: HotkeyAccent
  items: Array<{ keys: string; action: string }>
}

const HOTKEY_GROUPS: HotkeyGroup[] = [
  {
    title: 'Проекты и файлы',
    accent: 'sky',
    items: [
      { keys: 'Ctrl+O', action: 'Открыть проект' },
      { keys: 'Ctrl+S', action: 'Сохранить проект' },
      { keys: 'Ctrl+Shift+S', action: 'Сохранить проект как' },
      { keys: 'Ctrl+W', action: 'Закрыть проект' },
      { keys: 'Q', action: 'Показать путь к текущему проекту' },
      { keys: 'Ctrl+B', action: 'Открыть папку Prores_proxy_temp' },
    ],
  },
  {
    title: 'Редактирование',
    accent: 'emerald',
    items: [
      { keys: 'Ctrl+A', action: 'Выделить все плитки' },
      { keys: 'Ctrl+Z', action: 'Отменить последнее действие' },
      { keys: 'Ctrl+Shift+Z', action: 'Повторить отменённое действие' },
      { keys: 'Ctrl+C / X / V', action: 'Копировать / вырезать / вставить' },
      { keys: 'Shift+D', action: 'Дублировать выделенные плитки' },
      { keys: 'Delete', action: 'Удалить выделение' },
    ],
  },
  {
    title: 'Холст и навигация',
    accent: 'amber',
    items: [
      { keys: 'Space + drag', action: 'Перемещать холст' },
      { keys: 'MMB + drag', action: 'Перемещать холст средней кнопкой' },
      { keys: 'Ctrl + wheel', action: 'Изменять масштаб холста' },
      { keys: 'A', action: 'Показать весь холст' },
      { keys: 'B', action: 'Создать backdrop' },
      { keys: 'N', action: 'Создать заметку' },
      { keys: '/', action: 'Открыть поиск по видео' },
      { keys: '\\', action: 'Grid align без наложения' },
      { keys: 'L', action: 'Разложить выбранные медиа в ряд' },
    ],
  },
  {
    title: 'Видео и изображения',
    accent: 'violet',
    items: [
      { keys: 'Space', action: 'Play / pause выбранных видео' },
      { keys: 'H', action: 'Отразить выбранные медиа по горизонтали' },
      { keys: 'V', action: 'Отразить выбранные медиа по вертикали' },
      { keys: 'F3', action: 'Сохранить текущий кадр видео' },
      { keys: 'F4', action: 'Включить или выключить draw mode' },
    ],
  },
  {
    title: 'Окно и защита',
    accent: 'rose',
    items: [
      { keys: 'I', action: 'Открыть инструкцию и хоткеи' },
      { keys: 'ПКМ + drag', action: 'Перетащить окно приложения' },
      { keys: 'Alt+L', action: 'Закрепить или открепить выделение — работает с обоими Alt' },
      { keys: 'Ctrl+R', action: 'Заблокировать компоновку холста' },
      { keys: 'Ctrl+Shift+A', action: 'Переключить Always on top' },
      { keys: 'F11', action: 'Включить или выключить полный экран' },
      { keys: 'Esc', action: 'Закрыть справку или выйти из полного экрана' },
    ],
  },
]

const HOTKEY_ACCENTS: Record<HotkeyAccent, { heading: string; badge: string; line: string }> = {
  sky: {
    heading: 'text-sky-300',
    badge: 'border-sky-500/40 bg-sky-500/15 text-sky-200',
    line: 'bg-sky-500/35',
  },
  emerald: {
    heading: 'text-emerald-300',
    badge: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
    line: 'bg-emerald-500/35',
  },
  amber: {
    heading: 'text-amber-300',
    badge: 'border-amber-500/40 bg-amber-500/15 text-amber-200',
    line: 'bg-amber-500/35',
  },
  violet: {
    heading: 'text-violet-300',
    badge: 'border-violet-500/40 bg-violet-500/15 text-violet-200',
    line: 'bg-violet-500/35',
  },
  rose: {
    heading: 'text-rose-300',
    badge: 'border-rose-500/40 bg-rose-500/15 text-rose-200',
    line: 'bg-rose-500/35',
  },
}

export const HelpGuideModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [view, setView] = useState<'guide' | 'hotkeys'>('guide')

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

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
      <div className="flex max-h-[min(90vh,52rem)] w-full max-w-4xl flex-col rounded-xl border border-[var(--menu-border)] bg-[var(--menu-bg)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--menu-border)] px-4 py-3 shrink-0">
          <div>
            <h2 id="help-guide-title" className="text-base font-semibold text-themeText-100">
              {view === 'guide' ? 'PreviewV — визуальная инструкция' : 'PreviewV — горячие клавиши'}
            </h2>
            <div className="text-xs text-themeText-400">
              {view === 'guide'
                ? 'Зачем нужен холст и как превратить рефы в рабочее решение.'
                : 'Все сочетания сгруппированы по области применения.'}
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
        <div className="flex gap-2 border-b border-[var(--menu-border)] px-4 py-2.5">
          <button
            type="button"
            onClick={() => setView('guide')}
            className={[
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              view === 'guide'
                ? 'border-sky-500/50 bg-sky-500/20 text-sky-200'
                : 'border-[var(--menu-border)] bg-themeBg-active text-themeText-300 hover:bg-themeBg-hover',
            ].join(' ')}
          >
            Инструкция
          </button>
          <button
            type="button"
            onClick={() => setView('hotkeys')}
            className={[
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              view === 'hotkeys'
                ? 'border-violet-500/50 bg-violet-500/20 text-violet-200'
                : 'border-[var(--menu-border)] bg-themeBg-active text-themeText-300 hover:bg-themeBg-hover',
            ].join(' ')}
          >
            Хоткеи
          </button>
        </div>
        {view === 'guide' ? (
          <div className="max-h-[min(76vh,46rem)] overflow-y-auto px-4 py-4 md:px-5 md:py-5">
            <section className="overflow-hidden rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-950/45 via-black/15 to-amber-950/25 shadow-xl">
              <div className="grid md:grid-cols-[0.9fr_1.25fr]">
                <div className="flex flex-col justify-center px-5 py-6 md:px-7 md:py-8">
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300">
                    Цель PreviewV
                  </div>
                  <h3 className="text-2xl font-semibold leading-tight text-themeText-100 md:text-[28px]">
                    Увидеть шот не отдельно, а в системе решений
                  </h3>
                  <p className="mt-4 max-w-xl text-sm leading-6 text-themeText-300">
                    PreviewV — это визуальная коллекция рефов вокруг конкретного шота. Она помогает
                    собрать контекст сцены, сравнить похожие решения и понять объём работы до того,
                    как он превратится в список разрозненных задач.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-sky-200">
                      Контекст сцены
                    </span>
                    <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-violet-200">
                      Сравнение решений
                    </span>
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-amber-200">
                      Оценка и планирование
                    </span>
                  </div>
                </div>
                <figure className="relative min-h-[260px] overflow-hidden border-t border-sky-500/15 md:border-l md:border-t-0">
                  <ReferenceBoardLayout />
                </figure>
              </div>
            </section>

            <section className="mt-7">
              <div className="mb-3 flex items-end justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                    Рабочий процесс
                  </div>
                  <h3 className="mt-1 text-lg font-semibold text-themeText-100">От файла к решению — четыре шага</h3>
                </div>
                <div className="hidden text-xs text-themeText-500 md:block">Добавить → собрать → сгруппировать → сравнить</div>
              </div>
              <div className="overflow-hidden rounded-xl border border-[var(--menu-border)] bg-black/10 md:grid md:grid-cols-4 md:divide-x md:divide-white/5">
                {WORKFLOW_STEPS.map((step, index) => (
                  <div key={step.title} className="border-b border-white/5 px-4 py-4 last:border-b-0 md:border-b-0">
                    <div className="mb-3 flex h-7 w-7 items-center justify-center rounded-full border border-amber-500/35 bg-amber-500/15 text-xs font-bold text-amber-200">
                      {index + 1}
                    </div>
                    <h4 className="text-sm font-semibold text-themeText-100">{step.title}</h4>
                    <p className="mt-1.5 text-xs leading-5 text-themeText-400">{step.body}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-themeText-500">
                Быстро: перетащите файлы на холст · <span className="text-themeText-300">B</span> — сгруппировать ·{' '}
                <span className="text-themeText-300">A</span> — показать весь холст ·{' '}
                <span className="text-themeText-300">/</span> — найти видео
              </div>
            </section>

            <section className="mt-7 overflow-hidden rounded-2xl border border-cyan-500/20 bg-black/10">
              <div className="grid md:grid-cols-[1.2fr_0.8fr]">
                <figure className="relative min-h-[300px] overflow-hidden border-b border-cyan-500/15 md:border-b-0 md:border-r">
                  <SceneAnalysisLayout />
                </figure>
                <div className="flex flex-col justify-center px-5 py-6 md:px-6">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
                    Анализ результата
                  </div>
                  <h3 className="mt-2 text-xl font-semibold leading-tight text-themeText-100">
                    Проверяйте готовый шот в контексте сцены
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-themeText-300">
                    Положите готовый шот рядом с соседними кадрами и похожими решениями. Так сразу
                    видно, совпадают ли свет, атмосфера, масштаб, камера и качество эффекта — и что
                    действительно нужно доработать.
                  </p>
                  <div className="mt-4 space-y-2 text-xs text-themeText-400">
                    <div><span className="mr-2 text-cyan-300">●</span>Сцена показывает визуальную целостность работы.</div>
                    <div><span className="mr-2 text-cyan-300">●</span>Аналоги дают честную точку сравнения.</div>
                    <div><span className="mr-2 text-cyan-300">●</span>Контекст отделяет важные правки от случайных.</div>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-5 overflow-hidden rounded-2xl border border-rose-500/20 bg-black/10">
              <div className="grid md:grid-cols-[0.8fr_1.2fr]">
                <div className="flex flex-col justify-center px-5 py-6 md:px-6">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-300">
                    Оценка и планирование
                  </div>
                  <h3 className="mt-2 text-xl font-semibold leading-tight text-themeText-100">
                    Начинайте со сложнейшего шота
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-themeText-300">
                    Выберите самый сложный шот как верхнюю границу. Разберите его на повторяющиеся
                    элементы — окружение, FX, свет, материалы, композ — и рассчитывайте похожие шоты
                    на этой основе. Это делает оценку стоимости и сроков последовательной.
                  </p>
                  <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs leading-5 text-themeText-300">
                    Когда все шоты видны одновременно, повторяющиеся паттерны становятся общими
                    ассетами, сетапами и правилами — а планирование переходит с уровня отдельных задач
                    на уровень всей сцены.
                  </div>
                </div>
                <figure className="relative min-h-[300px] overflow-hidden border-t border-rose-500/15 md:border-l md:border-t-0">
                  <EstimationPatternsLayout />
                </figure>
              </div>
            </section>

            <section className="mt-5 rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-emerald-950/30 via-black/10 to-sky-950/25 px-5 py-5 text-center md:px-8">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Главная идея</div>
              <p className="mx-auto mt-2 max-w-3xl text-base font-medium leading-7 text-themeText-100">
                PreviewV — не папка с рефами, а карта визуальных и производственных решений проекта.
              </p>
              <p className="mx-auto mt-1 max-w-2xl text-sm leading-6 text-themeText-400">
                Один холст даёт общий контекст. Сложнейший шот даёт основу оценки. Повторяющиеся
                паттерны дают возможность планировать систему, а не каждый шот заново.
              </p>
            </section>
          </div>
        ) : (
          <div className="max-h-[min(72vh,44rem)] overflow-y-auto px-4 py-4 md:px-5">
            <div className="mb-4">
              <div className="text-sm font-semibold text-themeText-100">Горячие клавиши</div>
              <div className="mt-0.5 text-xs text-themeText-500">
                Команды сгруппированы по области применения.
              </div>
            </div>
            <div className="columns-1 gap-4 md:columns-2">
              {HOTKEY_GROUPS.map((group) => {
                const accent = HOTKEY_ACCENTS[group.accent]
                return (
                  <section
                    key={group.title}
                    className="mb-4 break-inside-avoid overflow-hidden rounded-xl border border-[var(--menu-border)] bg-black/10"
                  >
                    <div className="flex items-center gap-2 border-b border-[var(--menu-border)] px-3 py-2.5">
                      <span className={`h-4 w-1 rounded-full ${accent.line}`} />
                      <h3 className={`text-xs font-semibold uppercase tracking-[0.14em] ${accent.heading}`}>
                        {group.title}
                      </h3>
                    </div>
                    <div className="divide-y divide-white/5 px-3">
                      {group.items.map((item) => (
                        <div
                          key={`${group.title}-${item.keys}`}
                          className="grid grid-cols-[minmax(112px,auto)_1fr] items-center gap-3 py-2.5 text-sm"
                        >
                          <kbd
                            className={`w-fit whitespace-nowrap rounded-md border px-2 py-1 font-mono text-[11px] font-semibold shadow-sm ${accent.badge}`}
                          >
                            {item.keys}
                          </kbd>
                          <span className="leading-snug text-themeText-300">{item.action}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
