import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testDir = path.join(repo, '.tmp-large-project-test')
fs.mkdirSync(testDir, { recursive: true })
app.setPath('userData', path.join(testDir, 'user-data'))
const projectPath = process.argv.find((arg) => arg.endsWith('.previewv'))
if (!projectPath) throw new Error('Pass a .previewv project path')
const originalHash = (await import('node:crypto')).createHash('sha256').update(fs.readFileSync(projectPath)).digest('hex')
const warnings = []
let win
app.on('browser-window-created', (_event, created) => {
  win = created
  win.hide()
  win.show = () => {}
  win.focus = () => {}
  win.webContents.setBackgroundThrottling(false)
  win.webContents.debugger.attach('1.3')
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) warnings.push(message)
  })
})
await import('../out/main/index.js')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const evaluate = (code) => win.webContents.executeJavaScript(code, true)
async function until(code, label) {
  for (let i = 0; i < 160; i++) { if (await evaluate(code)) return; await delay(50) }
  throw new Error(`Timed out: ${label}`)
}
async function pan(deltaY) {
  const fromY = deltaY < 0 ? 650 : 150
  await evaluate(`document.getElementById('previewv-canvas-root').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 1, buttons: 4, clientX: 10, clientY: ${fromY} }))`)
  await evaluate(`window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, button: 1, buttons: 4, clientX: 10, clientY: ${fromY + deltaY} }))`)
  await delay(30)
  await evaluate(`window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 1, buttons: 0, clientX: 10, clientY: ${fromY + deltaY} }))`)
}
async function clickPlayButton(label) {
  const p = await evaluate(`(() => {
    const root = window.__budgetVideo().closest('[data-item-id]');
    const r = root.querySelector('button[aria-label=${label}]').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`)
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...p })
  await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, ...p })
}
const timeout = setTimeout(() => { console.error('Large project test timed out'); app.exit(1) }, 55000)
app.whenReady().then(async () => {
  for (let i = 0; i < 200; i++) {
    if (win && await evaluate('document.querySelectorAll("video").length > 0')) break
    await delay(50)
  }
  await delay(8000)
  const summary = await evaluate(`(() => {
    const videos = [...document.querySelectorAll('video')];
    return {
      elements: videos.length,
      attachedSources: videos.filter(v => v.hasAttribute('src')).length,
      readyFrames: videos.filter(v => v.readyState >= 2).length,
      errors: videos.filter(v => v.error).length,
      playing: videos.filter(v => !v.paused).length,
      states: videos.reduce((out, v) => { const key = String(v.readyState); out[key] = (out[key] || 0) + 1; return out }, {}),
      errorMessages: [...new Set(videos.filter(v => v.error).map(v => v.error.message))].slice(0, 5),
    };
  })()`)
  console.log(JSON.stringify({ ...summary, warnings: warnings.slice(0, 8) }, null, 2))
  if (process.argv.includes('--expect-budget')) {
    if (summary.attachedSources > 24 || summary.attachedSources === 0) throw new Error('Video source budget failed')
    if (summary.readyFrames === 0 || summary.errors > 0) throw new Error('Visible video frames failed to load')
    await evaluate(`(() => {
      const video = [...document.querySelectorAll('video')].find(v => v.hasAttribute('src') && v.getBoundingClientRect().bottom < innerHeight);
      window.__budgetVideoId = video.closest('[data-item-id]').getAttribute('data-item-id');
      window.__budgetVideo = () => [...document.querySelectorAll('video')].find(v => v.closest('[data-item-id]').getAttribute('data-item-id') === window.__budgetVideoId);
      window.__budgetSeekTime = Math.min(0.8, video.duration / 2);
      video.currentTime = window.__budgetSeekTime;
      window.__maxVideoSources = 0;
      window.__budgetSampleTimer = setInterval(() => { window.__maxVideoSources = Math.max(window.__maxVideoSources, document.querySelectorAll('video[src]').length) }, 20);
    })()`)
    await until('!window.__budgetVideo().seeking && window.__budgetVideo().currentTime > 0', 'seeked frame')
    for (let i = 0; i < 4; i++) await pan(-500)
    await until('!window.__budgetVideo().hasAttribute("src")', 'off-screen source released')
    if (!await evaluate('window.__budgetVideo().poster.startsWith("data:image/jpeg")')) throw new Error('Last frame preview missing')
    await until('[...document.querySelectorAll("video[src]")].some(v => v.readyState >= 2)', 'new area frames loaded')
    for (let i = 0; i < 4; i++) await pan(500)
    await until('window.__budgetVideo().hasAttribute("src") && window.__budgetVideo().readyState >= 2 && !window.__budgetVideo().seeking', 'returned frame loaded')
    if (!await evaluate('Math.abs(window.__budgetVideo().currentTime - window.__budgetSeekTime) < 0.15')) throw new Error('Playback position lost after pan')
    console.log('PASS: pan releases off-screen sources, loads the new area, caches the last frame and restores playback position')
    await delay(350)
    await evaluate("document.getElementById('previewv-canvas-root').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 640, clientY: 400, deltaY: 1000 }))")
    await until('document.querySelectorAll("video[src]").length === 0', 'overview releases all sources')
    await delay(350)
    await evaluate("document.getElementById('previewv-canvas-root').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 640, clientY: 400, deltaY: -1000 }))")
    await until('window.__budgetVideo().hasAttribute("src") && window.__budgetVideo().readyState >= 2', 'zoom-in reloads visible sources')
    if (!await evaluate('Math.abs(window.__budgetVideo().currentTime - window.__budgetSeekTime) < 0.15')) throw new Error('Playback position lost after zoom')
    await clickPlayButton('Play')
    await delay(350)
    if (!await evaluate('!window.__budgetVideo().paused && window.__budgetVideo().currentTime > window.__budgetSeekTime')) throw new Error('Play button failed')
    await clickPlayButton('Pause')
    await until('window.__budgetVideo().paused', 'pause button')
    const peakSources = await evaluate('clearInterval(window.__budgetSampleTimer); window.__maxVideoSources')
    if (peakSources > 24) throw new Error(`Source cap exceeded during navigation: ${peakSources}`)
    console.log(`PASS: overview releases all sources, zoom-in restores frames, Play/Pause work, peak loaded sources ${peakSources}`)
  }
  fs.writeFileSync(path.join(testDir, process.argv.includes('--expect-budget') ? 'after.png' : 'before.png'), (await win.webContents.capturePage()).toPNG())
  const currentHash = (await import('node:crypto')).createHash('sha256').update(fs.readFileSync(projectPath)).digest('hex')
  if (currentHash !== originalHash) throw new Error('Original project changed')
  clearTimeout(timeout)
  app.exit(0)
}).catch(async (error) => {
  console.error(error)
  if (win) {
    console.error(await evaluate(`({ sources: document.querySelectorAll('video[src]').length,
      video: window.__budgetVideo?.() ? { src: window.__budgetVideo().getAttribute('src'), ready: window.__budgetVideo().readyState, time: window.__budgetVideo().currentTime, rect: window.__budgetVideo().getBoundingClientRect().toJSON() } : null,
      transforms: [...document.querySelectorAll('[style]')].filter(el => el.style.transform.includes('scale(')).slice(0,2).map(el => el.style.transform) })`))
    fs.writeFileSync(path.join(testDir, 'failed.png'), (await win.webContents.capturePage()).toPNG())
  }
  clearTimeout(timeout); app.exit(1)
})
