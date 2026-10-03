/* Exercise the built app with Electron mouse/keyboard input and its real preload/IPC. */
import { app, shell } from 'electron'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const testDir = path.resolve(__dirname, '../.tmp-note-links-test')
fs.mkdirSync(testDir, { recursive: true })
app.setPath('userData', path.join(testDir, 'user-data'))
const fixturePath = path.join(testDir, 'existing-note.previewv')
const webUrl = 'https://example.com/?previewv=note-links&encoded=%2f%252F'
const cerebroUrl = 'cerebro:/путь?tid=123&pid=456'
const noteText = `Ссылки\n${webUrl}\n${cerebroUrl}`
fs.writeFileSync(fixturePath, JSON.stringify({
  version: 1,
  viewport: { x: 0, y: 0, scale: 1 },
  meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  items: [{ type: 'note', id: 'link-note', x: 150, y: 120, width: 900, height: 350, fontSize: 20, text: noteText }],
}))
process.argv.push(fixturePath)

const openedUrls = []
const nativeOpen = shell.openExternal.bind(shell)
let forwardToSystem = false
shell.openExternal = async (url) => {
  openedUrls.push(url)
  if (forwardToSystem) await nativeOpen(url)
}

let testWindow
app.on('browser-window-created', (_event, win) => {
  testWindow = win
  // Keep the smoke test from taking focus from the user's working project.
  win.hide()
  win.show = () => {}
  win.focus = () => {}
  win.webContents.setBackgroundThrottling(false)
  win.webContents.debugger.attach('1.3')
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) console.error('Renderer:', message)
  })
})
await import('../out/main/index.js')

const pause = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))
const evaluate = (code) => testWindow.webContents.executeJavaScript(code, true)
async function until(check, label) {
  const deadline = Date.now() + 12000
  while (Date.now() < deadline) {
    if (await check()) return
    await pause()
  }
  throw new Error(`Timed out: ${label}`)
}
async function point(selector) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('Missing element: ' + ${JSON.stringify(selector)});
    const r = el.getClientRects()[0];
    return { x: Math.round(r.x + Math.min(r.width / 2, 100)), y: Math.round(r.y + r.height / 2) };
  })()`)
}
async function click(selector) {
  const p = await point(selector)
  await until(() => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    const hit = document.elementFromPoint(${p.x}, ${p.y});
    return el === hit || el.contains(hit);
  })()`), `click target available: ${selector}`)
  await mouse('mousePressed', p)
  await mouse('mouseReleased', p)
  await pause()
}
async function mouse(type, p) {
  await testWindow.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
    type, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: type === 'mouseMoved' ? 0 : 1, ...p,
  })
}
async function geometry() {
  return evaluate(`(() => {
    const el = document.querySelector('[data-item-id="link-note"]');
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`)
}
const timeout = setTimeout(() => { console.error('Note links smoke test timed out'); app.exit(1) }, 45000)

app.whenReady().then(async () => {
  await until(() => testWindow && evaluate('!!document.querySelector("[data-note-text-view]")'), 'existing note loaded')
  assert.equal(await evaluate('document.querySelector("[data-note-text-view]").textContent'), noteText)
  assert.equal(await evaluate('document.querySelectorAll("[data-note-text-view] a").length'), 2)
  assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-note-text-view] a")).cursor'), 'pointer')
  assert.match(await evaluate('getComputedStyle(document.querySelector("[data-note-text-view] a")).textDecorationLine'), /underline/)
  const beforeClick = await geometry()
  await evaluate('window.__noteDragStarts = 0; window.addEventListener("canvas-history-action", () => { window.__noteDragStarts++ })')
  await click('[data-note-text-view] a:nth-of-type(1)')
  await until(() => openedUrls.length === 1, 'web link reaches shell')
  assert.equal(openedUrls[0], webUrl)
  await click('[data-note-text-view] a:nth-of-type(2)')
  await until(() => openedUrls.length === 2, 'Cerebro link reaches shell')
  assert.equal(openedUrls[1], cerebroUrl)
  assert.deepEqual(await geometry(), beforeClick)
  assert.equal(await evaluate('window.__noteDragStarts'), 0)
  assert.equal(await evaluate('!!document.querySelector("[data-item-id=link-note] textarea")'), false)
  console.log('PASS: web/Cerebro links preserve exact URLs, open through preload/IPC/shell, underline/pointer, no tile movement')

  // A normal text click enters the same plain textarea used for editing.
  await evaluate(`(() => {
    const view = document.querySelector('[data-note-text-view]');
    const range = document.createRange(); range.selectNodeContents(view.firstChild);
    const r = range.getBoundingClientRect();
    window.__noteTextClickPoint = { x: Math.round(r.x + 15), y: Math.round(r.y + r.height / 2) };
  })()`)
  const textPoint = await evaluate('window.__noteTextClickPoint')
  await mouse('mousePressed', textPoint)
  await mouse('mouseReleased', textPoint)
  await until(() => evaluate('document.activeElement?.tagName === "TEXTAREA"'), 'plain-text editor focused')
  assert.equal(await evaluate('document.activeElement.value'), noteText)
  await evaluate('document.activeElement.setSelectionRange(0, 6)')
  assert.deepEqual(await evaluate('[document.activeElement.selectionStart, document.activeElement.selectionEnd]'), [0, 6])
  testWindow.webContents.insertText('Правка')
  await pause()
  const editedText = noteText.replace('Ссылки', 'Правка')
  assert.equal(await evaluate('document.activeElement.value'), editedText)
  assert.deepEqual(await geometry(), beforeClick)
  assert.equal(openedUrls.length, 2)
  await testWindow.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await testWindow.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await until(() => evaluate('!!document.querySelector("[data-note-text-view]")'), 'links restored after editing')
  assert.equal(await evaluate('document.querySelector("[data-note-text-view]").textContent'), editedText)
  await click('button[aria-label="Редактировать заметку"]')
  await until(() => evaluate('document.activeElement?.tagName === "TEXTAREA"'), 'edit button focused textarea')
  await evaluate('document.activeElement.blur()')
  await pause()
  console.log('PASS: text click and edit button, text selection/replacement, Escape/blur restore clickable links')

  const beforeDrag = await geometry()
  const root = await point('[data-item-id="link-note"]')
  const headerPoint = { x: root.x, y: Math.round(beforeDrag.y + 12) }
  await mouse('mousePressed', headerPoint)
  for (let i = 1; i <= 5; i++) {
    await mouse('mouseMoved', { x: headerPoint.x + i * 12, y: headerPoint.y + i * 8 })
    await pause(20)
  }
  await mouse('mouseReleased', { x: headerPoint.x + 60, y: headerPoint.y + 40 })
  await pause()
  const afterDrag = await geometry()
  assert.equal(Math.round(afterDrag.x - beforeDrag.x), 60)
  assert.equal(Math.round(afterDrag.y - beforeDrag.y), 40)
  assert.equal(openedUrls.length, 2)
  console.log('PASS: header drag moves note, preserves text and does not open links')

  // Selecting text on the URL in edit mode must not trigger the system handler.
  await click('button[aria-label="Редактировать заметку"]')
  const editorPoint = await point('[data-item-id="link-note"] textarea')
  await mouse('mousePressed', editorPoint)
  await mouse('mouseMoved', { x: editorPoint.x + 60, y: editorPoint.y })
  await mouse('mouseReleased', { x: editorPoint.x + 60, y: editorPoint.y })
  await pause()
  assert.equal(openedUrls.length, 2)
  assert.equal(await evaluate('document.activeElement.selectionStart !== document.activeElement.selectionEnd'), true)
  assert.deepEqual(await geometry(), afterDrag)
  await evaluate('document.activeElement.blur()')
  await pause()
  const invalidResult = await evaluate('window.electronAPI.windowAPI.openExternalLink("file:///C:/test.exe")')
  assert.equal(invalidResult, false)
  assert.equal(openedUrls.length, 2)
  console.log('PASS: editing mouse selection cannot drag note/open URL; unsupported protocol rejected')
  fs.writeFileSync(path.join(testDir, 'note-links.png'), (await testWindow.webContents.capturePage()).toPNG())
  if (process.argv.includes('--open-links')) {
    forwardToSystem = true
    for (const url of [webUrl, cerebroUrl]) {
      const opened = await evaluate(`window.electronAPI.windowAPI.openExternalLink(${JSON.stringify(url)})`)
      assert.equal(opened, true, `System handler failed: ${url}`)
      assert.equal(openedUrls.at(-1), url)
      console.log(`PASS: real Windows system handler accepted ${url}`)
    }
  }
  clearTimeout(timeout)
  app.exit(0)
}).catch((error) => {
  console.error(error)
  clearTimeout(timeout)
  app.exit(1)
})
