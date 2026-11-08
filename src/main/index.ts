import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, Menu, nativeImage, net, protocol, shell } from 'electron'
import { Worker } from 'node:worker_threads'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { AISettingsStore } from './services/ai-settings'
import type { AIConfigInput } from '../shared/ai'
import type { ImportJob, LibraryInfo, ServiceMethod } from '../shared/types'

app.setName('灵感库')
if (process.env.LIBRARY_USER_DATA) app.setPath('userData', process.env.LIBRARY_USER_DATA)
protocol.registerSchemesAsPrivileged([{ scheme: 'library', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
let window: BrowserWindow | null = null, worker: Worker | null = null, root: string | null = null, initialError = ''
let aiSettings: AISettingsStore
let sequence = 0, switching = false, quitting = false
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
const defaultRoot = () => path.join(app.getPath('pictures'), '灵感库')
const preferencePath = () => path.join(app.getPath('userData'), 'library-settings.json')
function call<T = any>(method: ServiceMethod, ...args: any[]): Promise<T> {
  if (!worker) return Promise.reject(new Error('请先创建或打开素材库。'))
  return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); worker!.postMessage({ id, method, args }) })
}
function startWorker(newRoot: string, create: boolean): Promise<{ worker: Worker; info: LibraryInfo }> {
  return new Promise((resolve, reject) => {
    const w = new Worker(path.join(__dirname, 'library.js'), { workerData: { root: newRoot, create } })
    w.on('message', msg => {
      if ('ready' in msg) {
        if (msg.ready) resolve({ worker: w, info: msg.info })
        else { void w.terminate(); reject(new Error(msg.error)) }
      } else { const p = pending.get(msg.id); if (p) { pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result) } }
    })
    w.on('error', reject)
    w.on('exit', code => {
      if (worker === w) {
        worker = null; root = null
        for (const p of pending.values()) p.reject(new Error(`素材库服务已退出（${code}），请重新打开素材库。`))
        pending.clear()
      }
    })
  })
}
async function switchLibrary(newRoot: string, create: boolean) {
  if (switching) throw new Error('正在打开素材库，请稍候。')
  switching = true
  try {
    if (newRoot === root) return await call<LibraryInfo>('info')
    if (worker) {
      const job = await call<ImportJob | null>('importStatus')
      if (job && ['running', 'scanning'].includes(job.status)) throw new Error('请等待导入结束后再切换素材库。')
    }
    const next = await startWorker(newRoot, create)
    const old = worker
    if (old) { await call('close'); worker = null; await old.terminate() }
    worker = next.worker; root = next.info.root; initialError = ''
    if (aiSettings) await call('configureAI', aiSettings.getConnection())
    await mkdir(app.getPath('userData'), { recursive: true })
    const tmp = preferencePath() + '.tmp'
    await writeFile(tmp, JSON.stringify({ root }))
    await rename(tmp, preferencePath())
    return next.info
  } finally { switching = false }
}
async function chooseFolder(create: boolean, useDefault = false) {
  let selected = defaultRoot()
  if (!useDefault) {
    const result = await dialog.showOpenDialog(window!, { title: create ? '选择空文件夹作为素材库' : '打开已有素材库', properties: ['openDirectory', 'createDirectory'], defaultPath: defaultRoot(), buttonLabel: create ? '使用此目录' : '打开素材库' })
    if (result.canceled) return null
    selected = result.filePaths[0]
  }
  return switchLibrary(selected, create)
}
function createWindow() {
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 960, minHeight: 680, title: '灵感库', backgroundColor: '#ffffff', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 24 }, webPreferences: { preload: path.join(__dirname, '../preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', e => e.preventDefault())
  window.on('closed', () => { window = null })
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(path.join(__dirname, '../renderer/index.html'))
}
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { window?.show(); window?.focus() })
  app.whenReady().then(async () => {
    aiSettings = new AISettingsStore(); await aiSettings.load()
    protocol.handle('library', async request => {
      try {
        const url = new URL(request.url), [, id, kind] = url.pathname.split('/')
        if (url.hostname !== 'asset' || !id || !['original', 'thumbnail'].includes(kind)) return new Response(null, { status: 400 })
        const file = await call<string>('filePath', id, kind)
        return net.fetch(pathToFileURL(file).href)
      } catch { return new Response(null, { status: 404 }) }
    })
    const handlers: Record<string, (...args: any[]) => any> = {
      aiSettings: () => aiSettings.publicSettings(),
      saveAISettings: async (config: AIConfigInput) => {
        const saved = await aiSettings.save(config)
        if (worker) await call('configureAI', aiSettings.getConnection())
        return saved
      },
      settings: () => ({ root, defaultRoot: defaultRoot(), error: initialError || undefined }),
      createLibrary: (useDefault: boolean) => chooseFolder(true, useDefault),
      openLibrary: () => chooseFolder(false),
      importFiles: async (mode: string) => {
        if (!root) throw new Error('请先打开素材库。')
        const result = await dialog.showOpenDialog(window!, { properties: mode === 'directory' ? ['openDirectory'] : ['openFile', 'multiSelections'], filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }] })
        return result.canceled ? null : call('importPaths', result.filePaths)
      },
      reveal: async (id?: string) => {
        const file = id ? await call<string>('filePath', id) : root
        if (!file) throw new Error('请先打开素材库。')
        await access(file)
        if (id) shell.showItemInFolder(file)
        else { const error = await shell.openPath(file); if (error) throw new Error(error) }
      },
      copyImage: async (id: string) => {
        const file = await call<string>('filePath', id)
        // macOS clipboard receives a decoded static image, not the animated source file.
        const image = await nativeImage.createThumbnailFromPath(file, { width: 4096, height: 4096 })
        if (image.isEmpty()) throw new Error('无法复制这张图片，请在 Finder 中打开原文件。')
        await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' }) })])
      },
      openSource: async (id: string) => { const asset = await call('get', id); if (/^https?:\/\//i.test(asset.sourceUrl)) await shell.openExternal(asset.sourceUrl) },
    }
    const serviceMethods: ServiceMethod[] = ['info','list','get','update','collections','createCollection','renameCollection','importPaths','importStatus','rememberSearch','clearSearches','rememberAsset','testAIConnection','aiStatus','enqueueAI','pauseAI']
    for (const m of serviceMethods) handlers[m] = (...args) => {
      if (switching) throw new Error('素材库切换中，请稍候。')
      return call(m, ...args)
    }
    for (const [name, handler] of Object.entries(handlers)) ipcMain.handle('library:' + name, (event, ...args) => {
      if (event.sender !== window?.webContents) throw new Error('无效窗口。')
      return handler(...args)
    })
    try {
      const saved = process.env.LIBRARY_ROOT || JSON.parse(await readFile(preferencePath(), 'utf8')).root
      if (saved) await switchLibrary(saved, false)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') initialError = String(e)
      else if (process.env.LIBRARY_ROOT) initialError = '找不到指定素材库，请重新选择。'
    }
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '灵感库', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] },
      { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: '显示', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
      { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }] }
    ]))
    createWindow()
    app.on('activate', () => { if (!window) createWindow() })
  })
  app.on('before-quit', event => {
    if (!worker || quitting) return
    event.preventDefault(); quitting = true
    // Finish the active import before closing the database. macOS forced quit is recovered on next open.
    call('close').finally(() => { const old = worker; worker = null; void old?.terminate(); app.quit() })
  })
}
