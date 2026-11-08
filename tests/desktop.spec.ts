import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { LibraryService } from '../src/main/services/library'
import type { AppAPI } from '../src/shared/types'
declare global { interface Window { library: AppAPI } }

let base: string, root: string, source: string
async function launch(): Promise<ElectronApplication> {
  return electron.launch({ ...(process.env.PACKAGED_APP ? { executablePath: process.env.PACKAGED_APP } : {}), args: process.env.PACKAGED_APP ? [] : ['.'], env: { ...process.env, LIBRARY_ROOT: root, LIBRARY_USER_DATA: path.join(base, 'user-data') } })
}
test.beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'inspiration-desktop-')); root = path.join(base, 'library'); source = path.join(base, 'images')
  await mkdir(source)
  const library = await LibraryService.open(root, true); await library.close()
  // Synthetic image files exercise the real file pipeline in an isolated test library.
  for (let i = 0; i < 50; i++) {
    const w = 230 + i * 5, h = 220 + i % 4 * 110
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${['#e8ede1','#f0dac7','#b7c8cf','#e89b6e','#d9d2c1'][i%5]}"/><circle cx="${w/2}" cy="${h/2}" r="${w/4}" fill="${['#899876','#ae7353','#597580','#aa5435','#aaa089'][i%5]}"/><text x="24" y="40" font-size="18" font-family="sans-serif" fill="#ffffff">Reference ${String(i).padStart(2,'0')}</text></svg>`
    await sharp(Buffer.from(svg)).png().toFile(path.join(source, `reference-${String(i).padStart(2,'0')}.png`))
  }
})
test.afterAll(async () => { if (!process.env.KEEP_DESKTOP_FIXTURES) await rm(base, { recursive: true, force: true }) })
test('real desktop: import, browse, search, corrections, clipboard, restart', async () => {
  let app = await launch()
  try {
    let page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded')
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
    await expect(page.getByText('第一份灵感，从这里开始')).toBeVisible()
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }) }, source)
    await page.getByRole('button', { name: '导入素材', exact: true }).click()
    await page.getByRole('button', { name: '导入整个文件夹', exact: true }).click()
    await expect.poll(async () => page.evaluate(() => window.library.importStatus()), { timeout: 40000 }).toMatchObject({ status: 'completed', imported: 50, failed: 0 })
    await expect(page.locator('.asset-tile').first()).toBeVisible()
    expect(await page.locator('.asset-tile').count()).toBeLessThan(50)
    await expect.poll(() => page.locator('.asset-tile img').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    await page.screenshot({ path: 'test-results/library.png' })
    await page.locator('.asset-tile').first().click()
    await expect(page.getByRole('dialog', { name: '素材详情' })).toBeVisible()
    await page.getByText('纠正信息或补充标签', {exact:true}).click()
    await page.getByLabel('素材标题').fill('清新 UI 测试')
    await page.getByLabel('收藏时的想法').fill('薄荷绿、大留白，下一次改版参考')
    await page.getByLabel('补充标签').fill('圆角，健康应用')
    await page.locator('.tag-options').getByRole('button', { name: 'UI 页面', exact: true }).click()
    await page.getByRole('button', { name: '保存修改' }).click()
    await expect(page.getByRole('status')).toContainText('已保存')
    await page.screenshot({ path: 'test-results/detail.png' })
    await page.getByLabel('复制图片', { exact: true }).click()
    await expect(page.getByRole('status')).toContainText('图片已复制')
    await expect.poll(() => app.evaluate(async ({ clipboard }) => clipboard.has('image/png'))).toBe(true)
    await page.keyboard.press('Escape')
    await page.getByLabel('搜索素材', { exact: true }).fill('清新 圆角')
    await page.keyboard.press('Enter')
    await expect(page.locator('.asset-tile')).toHaveCount(1)
    await page.locator('.categories').getByRole('button', { name: 'UI 页面', exact: true }).click()
    await expect(page.locator('.asset-tile')).toHaveCount(1)
    await page.getByLabel('搜索素材', { exact: true }).click()
    await page.screenshot({ path: 'test-results/search.png' })
    await page.keyboard.press('Escape')
    await page.getByLabel('清空搜索').click()
    await page.locator('.categories').getByRole('button', { name: '全部', exact: true }).click()
    await expect(page.getByRole('button', {name:'收藏集',exact:true})).toHaveCount(0)
    await app.close(); app = await launch(); page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded')
    await page.getByLabel('搜索素材', { exact: true }).fill('清新 圆角'); await page.keyboard.press('Enter')
    await expect(page.locator('.asset-tile')).toHaveCount(1)
    await page.locator('.asset-tile').first().click()
    await page.getByText('纠正信息或补充标签', {exact:true}).click()
    await expect(page.getByLabel('素材标题')).toHaveValue('清新 UI 测试')
    const count = await page.evaluate(() => window.library.info().then(i => i.count)); expect(count).toBe(50)
    expect(errors).toEqual([])
  } finally { await app.close() }
})
test('empty launch supports library creation through native folder dialog', async () => {
  const isolated = path.join(base, 'onboarding-data'), fresh = path.join(base, 'fresh-library')
  await mkdir(fresh)
  const app = await electron.launch({ ...(process.env.PACKAGED_APP ? { executablePath: process.env.PACKAGED_APP } : {}), args: process.env.PACKAGED_APP ? [] : ['.'], env: { ...process.env, LIBRARY_ROOT: '', LIBRARY_USER_DATA: isolated } })
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: '给好想法一个去处。' })).toBeVisible()
    await page.screenshot({ path: 'test-results/welcome.png' })
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }) }, fresh)
    await page.getByRole('button', { name: '选择其他位置', exact: true }).click()
    await expect(page.getByText('第一份灵感，从这里开始')).toBeVisible()
    await page.getByLabel('设置', { exact: true }).click()
    await expect(page.getByRole('dialog', { name: '素材库设置' })).toContainText(fresh)
  } finally { await app.close() }
})
test('5,000 asset viewport remains virtualized; details preserve scroll position', async () => {
  const largeRoot = path.join(base, 'large-library'), library = await LibraryService.open(largeRoot, true)
  library.importPaths([path.join(source, 'reference-00.png')]); await library.waitForImport()
  const a = library.list().items[0]
  library.db.exec('BEGIN')
  const insert = library.db.prepare('INSERT INTO assets (id,hash,filename,relativePath,thumbnailPath,title,width,height,bytes,format,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
  for (let i = 1; i < 5000; i++) insert.run(`test-${i}`, `testhash-${i}`, `${i}.png`, a.relativePath, a.thumbnailPath, `素材 ${i}`, a.width, a.height, a.bytes, a.format, a.createdAt)
  library.db.exec('COMMIT'); await library.close()
  const app = await electron.launch({ ...(process.env.PACKAGED_APP ? { executablePath: process.env.PACKAGED_APP } : {}), args: process.env.PACKAGED_APP ? [] : ['.'], env: { ...process.env, LIBRARY_ROOT: largeRoot, LIBRARY_USER_DATA: path.join(base, 'large-user-data') } })
  try {
    const page = await app.firstWindow()
    await expect(page.locator('.asset-count')).toHaveText('5,000 份素材')
    expect(await page.locator('.asset-tile').count()).toBeLessThan(80)
    expect(Number(await page.locator('.masonry').getAttribute('data-loaded'))).toBe(80)
    await page.locator('.content-scroll').evaluate(el => { el.scrollTop = el.scrollHeight - el.clientHeight - 200 })
    await expect.poll(async () => Number(await page.locator('.masonry').getAttribute('data-loaded'))).toBeGreaterThan(80)
    const before = await page.locator('.content-scroll').evaluate(el => el.scrollTop)
    const visible = await page.locator('.asset-tile').evaluateAll(elements => {
      const match = elements.find(el => { const r = el.getBoundingClientRect(); return r.top > 185 && r.bottom < window.innerHeight })
      return match?.getAttribute('aria-label')
    })
    expect(visible).toBeTruthy()
    await page.getByLabel(visible!, { exact: true }).click()
    await page.getByLabel('收藏时的想法').fill('保留我的浏览位置')
    await page.getByRole('button', { name: '返回素材库' }).click()
    await expect.poll(() => page.locator('.content-scroll').evaluate(el => el.scrollTop)).toBe(before)
    expect(Number(await page.locator('.masonry').getAttribute('data-loaded'))).toBeGreaterThan(80)
    expect(await page.locator('.asset-tile').count()).toBeLessThan(80)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 740))
    await expect.poll(() => page.locator('.asset-tile').evaluateAll(tiles => tiles.every(t => t.getBoundingClientRect().right <= window.innerWidth))).toBe(true)
    await expect(page.locator('.brand .mark')).toBeVisible()
    await page.screenshot({ path: 'test-results/compact.png' })
  } finally { await app.close() }
})
test('AI settings encrypt credentials, auto analyze imports, smart search and remove collection UI',async()=>{
  const { createServer } = await import('node:http')
  const result = { title:'自动分析的薄荷绿设计',description:'清新的薄荷绿色 UI 页面，布局简洁且留白充足。',categories:['UI 页面'],subjects:['界面'],styles:['极简'],moods:['清新'],composition:['留白'],typography:['无衬线'],materials:[],lighting:[],useCases:['健康应用'],industries:['健康'],colors:[{name:'薄荷绿',hex:'#88BB99'}],textInImage:'',artist:'',artistEvidence:'',styleReferences:[],tags:['清新','留白'],prompt:'清新的薄荷绿界面设计。',uncertainties:[] }
  const server=createServer(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString())
    const props=body.text?.format?.schema?.properties
    let value:any=result
    if(props?.color)value={color:'绿色'}
    else if(props?.phrases)value={phrases:['薄荷绿','清新'],category:'UI 页面',intent:'清新界面'}
    else if(props?.matches){const input=JSON.parse(body.input[0].content[0].text);value={matches:input.candidates.map((c:any)=>({id:c.id,score:90}))}}
    res.writeHead(200,{'content-type':'text/event-stream'});res.end(`data: ${JSON.stringify({type:'response.completed',response:{status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}],usage:{input_tokens:100,output_tokens:200}}})}\n\n`)
  })
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${(server.address() as any).port}`
  const aiRoot=path.join(base,'ai-library'),userData=path.join(base,'ai-profile')
  const lib=await LibraryService.open(aiRoot,true);await lib.close()
  const app=await electron.launch({...process.env.PACKAGED_APP?{executablePath:process.env.PACKAGED_APP}:{},args:process.env.PACKAGED_APP?[]:['.'],env:{...process.env,LIBRARY_ROOT:aiRoot,LIBRARY_USER_DATA:userData}})
  try{
    const page=await app.firstWindow();await expect(page.getByText('第一份灵感，从这里开始')).toBeVisible()
    await page.getByLabel('设置',{exact:true}).click()
    await page.getByLabel('Base URL',{exact:true}).fill(url)
    await page.getByLabel('API Key',{exact:false}).fill('test-only-secret-782')
    await page.getByRole('checkbox',{name:'启用 AI 分析与智能搜索'}).check()
    await page.getByRole('button',{name:'保存并测试图片识别'}).click()
    await expect(page.getByText('连接成功，图片识别结果：绿色。支持图片分析与结构化输出。')).toBeVisible()
    const publicSettings=await page.evaluate(()=>window.library.aiSettings())
    expect(publicSettings.hasKey).toBe(true);expect(JSON.stringify(publicSettings)).not.toContain('test-only-secret')
    const {readFile}=await import('node:fs/promises');const disk=await readFile(path.join(userData,'ai-settings.json'),'utf8')
    expect(disk).not.toContain('test-only-secret');expect(JSON.parse(disk).encryptedKey).toBeTruthy()
    await page.getByLabel('关闭',{exact:true}).click()
    await page.evaluate(p=>window.library.importPaths([p]),path.join(source,'reference-00.png'))
    await expect.poll(()=>page.evaluate(()=>window.library.aiStatus())).toMatchObject({completed:1,failed:0})
    await expect(page.locator('.asset-tile').first()).toHaveAttribute('aria-label','打开 自动分析的薄荷绿设计')
    await page.locator('.categories').getByRole('button',{name:'UI 页面',exact:true}).click()
    await expect(page.locator('.asset-tile')).toHaveCount(1)
    await page.locator('.asset-tile').click()
    await expect(page.getByText(result.description,{exact:true})).toBeVisible()
    await expect(page.getByText('加入收藏集',{exact:true})).toHaveCount(0)
    await page.screenshot({path:'test-results/ai-detail.png'})
    await page.keyboard.press('Escape')
    await page.getByLabel('搜索素材',{exact:true}).fill('清新但不幼稚的界面');await page.keyboard.press('Enter')
    await expect(page.locator('.library-status-row')).toContainText('按相关性排序')
    await expect(page.locator('.asset-tile')).toHaveCount(1)
  }finally{await app.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
})
