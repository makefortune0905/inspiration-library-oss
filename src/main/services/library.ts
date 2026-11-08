import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { CATEGORIES, type Asset, type AssetPage, type AssetPatch, type AssetQuery, type Collection, type ImportJob, type LibraryInfo } from '../../shared/types'

const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const FORMATS = new Set(['jpeg', 'png', 'webp', 'gif'])
export function friendlyError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code
  if (code === 'ENOSPC' || String(error).includes('database or disk is full')) return '磁盘空间不足，请释放空间后重新导入。'
  if (code === 'EACCES' || code === 'EPERM' || String(error).includes('readonly')) return '无法写入此目录，请检查目录权限或选择其他位置。'
  if (code === 'ENOENT') return '文件或目录不存在，可能已被移动。'
  return error instanceof Error ? error.message : String(error)
}
const assertString = (s: unknown, max = 2000): string => {
  if (typeof s !== 'string' || s.length > max) throw new Error('输入内容无效或过长。')
  return s
}

export class LibraryService {
  db!: DatabaseSync
  job: ImportJob | null = null
  onImported?: (id: string) => void
  onEdited?: () => void
  private done: Promise<void> = Promise.resolve()
  private metaDir: string
  private constructor(public root: string) { this.metaDir = path.join(root, '.library') }
  static async open(root: string, create = false): Promise<LibraryService> {
    const service = new LibraryService(path.resolve(root))
    const dbPath = path.join(service.metaDir, 'library.sqlite')
    if (create) {
      await mkdir(service.root, { recursive: true })
      const existing = await readdir(service.root)
      if (existing.some(n => n !== '.DS_Store')) throw new Error('请选择一个空文件夹；已有素材库请使用“打开已有素材库”。')
      await mkdir(service.metaDir)
    } else {
      await access(dbPath)
    }
    await access(service.root, constants.W_OK)
    await access(service.metaDir, constants.W_OK)
    try {
      service.db = new DatabaseSync(dbPath)
      service.db.exec('PRAGMA busy_timeout=3000; PRAGMA foreign_keys=ON;')
      const version = service.db.prepare('PRAGMA user_version').get() as { user_version: number }
      if (!create && ![1, 2].includes(version.user_version)) throw new Error('该素材库版本不兼容，未进行修改。')
      if (create) service.initialize()
      service.migrateAI()
      service.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;')
      await mkdir(path.join(service.root, '原图'), { recursive: true })
      await mkdir(path.join(service.metaDir, 'thumbnails'), { recursive: true })
      await mkdir(path.join(service.metaDir, 'staging'), { recursive: true })
      await service.recover()
      return service
    } catch (e) { service.db?.close(); throw e }
  }
  private initialize() {
    this.db.exec(`
      CREATE TABLE assets (
        id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, filename TEXT NOT NULL,
        relativePath TEXT NOT NULL, thumbnailPath TEXT NOT NULL, title TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '', sourceUrl TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]', categories TEXT NOT NULL DEFAULT '[]',
        width INTEGER NOT NULL, height INTEGER NOT NULL, bytes INTEGER NOT NULL,
        format TEXT NOT NULL, createdAt TEXT NOT NULL
      );
      CREATE INDEX assets_created ON assets(createdAt DESC, id DESC);
      CREATE TABLE collections (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      CREATE TABLE asset_collections (assetId TEXT REFERENCES assets(id) ON DELETE CASCADE, collectionId TEXT REFERENCES collections(id) ON DELETE CASCADE, PRIMARY KEY(assetId, collectionId));
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version=1;
    `)
  }
  private migrateAI() {
    const version = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    if (version >= 2) return
    this.db.exec(`BEGIN IMMEDIATE;
      ALTER TABLE assets ADD COLUMN categoryOverride INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE assets ADD COLUMN titleEdited INTEGER NOT NULL DEFAULT 0;
      UPDATE assets SET categoryOverride=1 WHERE json_array_length(categories)>0;
      UPDATE assets SET titleEdited=1;
      CREATE TABLE asset_ai (assetId TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE, data TEXT, searchText TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'queued', error TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', updatedAt TEXT, revision TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX ai_status ON asset_ai(status);
      CREATE TABLE ai_usage (id INTEGER PRIMARY KEY, createdAt TEXT NOT NULL, kind TEXT NOT NULL, model TEXT NOT NULL, inputTokens INTEGER NOT NULL, outputTokens INTEGER NOT NULL, estimatedCost REAL);
      PRAGMA user_version=2; COMMIT;`)
  }
  private setting<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined
    return row ? JSON.parse(row.value) as T : fallback
  }
  private setSetting(key: string, value: unknown) {
    this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value))
  }
  decode(row: any): Asset {
    const ids = this.db.prepare('SELECT collectionId FROM asset_collections WHERE assetId=?').all(row.id) as { collectionId: string }[]
    const aiRow = this.db.prepare('SELECT * FROM asset_ai WHERE assetId=?').get(row.id) as any
    const data = aiRow?.data ? JSON.parse(aiRow.data) : null
    const categories = JSON.parse(row.categories)
    return { ...row, tags: JSON.parse(row.tags), categories, effectiveCategories: row.categoryOverride ? categories : data?.categories || categories,
      displayTitle: row.titleEdited ? row.title : data?.title || row.title,
      ai: { data, status: aiRow?.status || 'unprocessed', error: aiRow?.error || '', updatedAt: aiRow?.updatedAt || null, model: aiRow?.model || '', revision: aiRow?.revision || '' },
      collectionIds: ids.map(x => x.collectionId) }
  }
  info(): LibraryInfo {
    const count = (this.db.prepare('SELECT count(*) AS n FROM assets').get() as { n: number }).n
    const recentAssets = this.setting<string[]>('recentAssets', []).flatMap(id => {
      const row = this.db.prepare('SELECT * FROM assets WHERE id=?').get(id)
      return row ? [this.decode(row)] : []
    })
    return { root: this.root, count, recentSearches: this.setting('recentSearches', []), recentAssets }
  }
  list(query: AssetQuery = {}): AssetPage {
    const conditions: string[] = [], params: string[] = []
    if (query.search?.trim()) {
      const words = query.search.trim().split(/\s+/).slice(0, 10)
      for (const word of words) {
        conditions.push(`(instr(lower(title),lower(?))>0 OR instr(lower(filename),lower(?))>0 OR instr(lower(note),lower(?))>0 OR EXISTS (SELECT 1 FROM json_each(assets.tags) WHERE instr(lower(value),lower(?))>0) OR EXISTS (SELECT 1 FROM asset_ai WHERE assetId=assets.id AND instr(lower(searchText),lower(?))>0))`)
        params.push(word, word, word, word, word)
      }
    }
    const categoryExpression = `CASE WHEN categoryOverride=1 THEN categories ELSE coalesce((SELECT json_extract(data,'$.categories') FROM asset_ai WHERE assetId=assets.id),categories) END`
    if (query.category === '未分类') conditions.push(`json_array_length(${categoryExpression})=0`)
    else if (query.category) { conditions.push(`EXISTS (SELECT 1 FROM json_each(${categoryExpression}) WHERE value=?)`); params.push(query.category) }
    if (query.analysisStatus === 'unprocessed') conditions.push(`NOT EXISTS (SELECT 1 FROM asset_ai WHERE assetId=assets.id)`)
    else if (query.analysisStatus) { conditions.push('EXISTS (SELECT 1 FROM asset_ai WHERE assetId=assets.id AND status=?)'); params.push(query.analysisStatus) }
    if (query.collectionId) { conditions.push('EXISTS (SELECT 1 FROM asset_collections WHERE assetId=assets.id AND collectionId=?)'); params.push(query.collectionId) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const total = (this.db.prepare(`SELECT count(*) AS n FROM assets ${where}`).get(...params) as { n: number }).n
    const limit = Math.max(1, Math.min(120, Math.trunc(query.limit || 80)))
    const offset = Math.max(0, Math.trunc(query.offset || 0))
    const rows = this.db.prepare(`SELECT * FROM assets ${where} ORDER BY createdAt DESC,id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset)
    return { total, items: rows.map(x => this.decode(x)) }
  }
  get(id: string): Asset {
    const row = this.db.prepare('SELECT * FROM assets WHERE id=?').get(assertString(id))
    if (!row) throw new Error('没有找到这份素材。')
    return this.decode(row)
  }
  update(id: string, patch: AssetPatch): Asset {
    const original = this.get(id)
    const title = assertString(patch.title, 500).trim()
    if (!title) throw new Error('标题不能为空。')
    const note = assertString(patch.note, 20000)
    const source = assertString(patch.sourceUrl, 4000).trim()
    if (source && !/^https?:\/\//i.test(source)) throw new Error('来源链接需要以 https:// 或 http:// 开头。')
    if (source) { try { new URL(source) } catch { throw new Error('来源链接格式不正确。') } }
    if (!Array.isArray(patch.tags) || patch.tags.length > 100) throw new Error('最多支持 100 个标签。')
    const tags = [...new Set(patch.tags.map(t => assertString(t, 100).trim()).filter(Boolean))]
    if (!Array.isArray(patch.categories) || patch.categories.some(c => !CATEGORIES.includes(c))) throw new Error('分类无效。')
    if (!Array.isArray(patch.collectionIds) || patch.collectionIds.length > 100) throw new Error('收藏集无效。')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('UPDATE assets SET title=?,note=?,sourceUrl=?,tags=?,categories=? WHERE id=?').run(title, note, source, JSON.stringify(tags), JSON.stringify([...new Set(patch.categories)]), id)
      if (patch.useAICategories === true) this.db.prepare('UPDATE assets SET categoryOverride=0 WHERE id=?').run(id)
      else if (patch.useAICategories === false || JSON.stringify(patch.categories) !== JSON.stringify(original.categories)) this.db.prepare('UPDATE assets SET categoryOverride=1 WHERE id=?').run(id)
      if (title !== original.title) this.db.prepare('UPDATE assets SET titleEdited=1 WHERE id=?').run(id)
      this.db.prepare('DELETE FROM asset_collections WHERE assetId=?').run(id)
      for (const cid of new Set(patch.collectionIds)) this.db.prepare('INSERT INTO asset_collections VALUES (?,?)').run(id, assertString(cid))
      this.db.exec('COMMIT')
    } catch (e) { this.db.exec('ROLLBACK'); throw e }
    this.onEdited?.()
    return this.get(id)
  }
  collections(): Collection[] {
    return (this.db.prepare('SELECT id,name FROM collections ORDER BY rowid').all() as { id: string; name: string }[]).map(c => {
      const result = this.list({ collectionId: c.id, limit: 4 })
      return { ...c, count: result.total, covers: result.items }
    })
  }
  createCollection(name: string): Collection {
    name = assertString(name, 80).trim()
    if (!name) throw new Error('请输入收藏集名称。')
    const id = randomUUID()
    try { this.db.prepare('INSERT INTO collections VALUES (?,?)').run(id, name) }
    catch { throw new Error('已有同名收藏集，请换一个名称。') }
    return { id, name, count: 0, covers: [] }
  }
  renameCollection(id: string, name: string) {
    name = assertString(name, 80).trim()
    if (!name) throw new Error('请输入收藏集名称。')
    try { this.db.prepare('UPDATE collections SET name=? WHERE id=?').run(name, assertString(id)) }
    catch { throw new Error('已有同名收藏集，请换一个名称。') }
  }
  rememberSearch(search: string) {
    search = assertString(search, 500).trim()
    if (search) this.setSetting('recentSearches', [search, ...this.setting<string[]>('recentSearches', []).filter(s => s !== search)].slice(0, 8))
  }
  clearSearches() { this.setSetting('recentSearches', []) }
  rememberAsset(id: string) { this.get(id); this.setSetting('recentAssets', [id, ...this.setting<string[]>('recentAssets', []).filter(s => s !== id)].slice(0, 8)) }
  filePath(id: string, kind: 'original' | 'thumbnail' = 'original') {
    const asset = this.get(id)
    return this.safePath(kind === 'thumbnail' ? asset.thumbnailPath : asset.relativePath)
  }
  private safePath(relative: string) {
    const full = path.resolve(this.root, relative)
    if (!full.startsWith(this.root + path.sep)) throw new Error('无效的素材路径。')
    return full
  }
  importStatus() { return this.job }
  importPaths(paths: string[]): ImportJob {
    if (this.job && ['scanning', 'running'].includes(this.job.status)) throw new Error('正在导入，请等待当前任务结束。')
    if (!Array.isArray(paths) || !paths.length || paths.some(p => typeof p !== 'string' || !path.isAbsolute(p))) throw new Error('请选择有效的本地文件。')
    this.job = { id: randomUUID(), status: 'scanning', total: 0, processed: 0, imported: 0, duplicates: 0, failed: 0, current: '', errors: [] }
    this.setSetting('importJob', this.job)
    this.done = this.runImport(paths).catch(e => {
      if (this.job) { this.job.status = 'interrupted'; this.job.errors.push({ file: this.job.current, message: friendlyError(e) }) }
    })
    return { ...this.job }
  }
  async waitForImport() { await this.done; return this.job! }
  private async runImport(paths: string[]) {
    const job = this.job!, files: string[] = [], seen = new Set<string>()
    const canonicalRoot = await realpath(this.root)
    const addError = (file: string, e: unknown) => {
      job.failed++; job.processed++
      if (job.errors.length < 100) job.errors.push({ file: path.basename(file), message: friendlyError(e) })
    }
    const scan = async (p: string, explicit: boolean) => {
      try {
        const canonical = await realpath(p)
        if (seen.has(canonical)) return
        seen.add(canonical)
        if (canonical === canonicalRoot || canonical.startsWith(canonicalRoot + path.sep)) {
          if (explicit) { job.total++; addError(p, new Error('不能将当前素材库再次导入自身。')) }
          return
        }
        const s = await stat(p)
        if (s.isDirectory()) {
          for (const entry of await readdir(p, { withFileTypes: true })) {
            if (!entry.isSymbolicLink() && !entry.name.startsWith('.')) await scan(path.join(p, entry.name), false)
          }
        } else if (s.isFile() && SUPPORTED.has(path.extname(p).toLowerCase())) { files.push(p); job.total++ }
        else if (explicit) { job.total++; addError(p, new Error('暂不支持此格式，请导入 JPEG、PNG、WebP 或 GIF。')) }
      } catch (e) { job.total++; addError(p, e) }
    }
    for (const p of paths) await scan(p, true)
    job.status = 'running'
    for (const file of files) {
      job.current = path.basename(file)
      try {
        const imported = await this.importOne(file)
        if (imported) job.imported++; else job.duplicates++
        job.processed++
      } catch (e) { addError(file, e) }
      this.setSetting('importJob', job)
    }
    job.status = 'completed'; job.current = ''
    this.setSetting('importJob', job)
  }
  private async importOne(file: string): Promise<boolean> {
    const id = randomUUID(), stage = path.join(this.metaDir, 'staging', id), journal = stage + '.json'
    let finalPath = '', thumbPath = '', committed = false
    try {
      await copyFile(file, stage, constants.COPYFILE_EXCL)
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(stage)) hash.update(chunk)
      const digest = hash.digest('hex')
      if (this.db.prepare('SELECT id FROM assets WHERE hash=?').get(digest)) return false
      const meta = await sharp(stage).metadata()
      if (!meta.format || !FORMATS.has(meta.format) || !meta.width || !meta.height) throw new Error('图片无法解码或格式不受支持。')
      const createdAt = new Date().toISOString(), now = new Date()
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const base = path.basename(file, path.extname(file)).replace(/[\x00-\x1f/\\:]/g, '_').slice(0, 90) || '未命名'
      const ext = meta.format === 'jpeg' ? '.jpg' : `.${meta.format}`
      const relativePath = `原图/${month}/${base}-${id.slice(0, 8)}${ext}`
      const thumbnailPath = `.library/thumbnails/${id}.webp`
      finalPath = this.safePath(relativePath); thumbPath = this.safePath(thumbnailPath)
      await writeFile(journal, JSON.stringify({ id, relativePath, thumbnailPath }), { flag: 'wx' })
      await mkdir(path.dirname(finalPath), { recursive: true })
      await sharp(stage).rotate().resize({ width: 720, height: 1000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(thumbPath)
      const bytes = (await stat(stage)).size
      await rename(stage, finalPath)
      const rotated = [5, 6, 7, 8].includes(meta.orientation || 1)
      const width = rotated ? meta.height : meta.width, height = rotated ? meta.width : meta.height
      this.db.prepare('INSERT INTO assets (id,hash,filename,relativePath,thumbnailPath,title,width,height,bytes,format,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, digest, path.basename(file), relativePath, thumbnailPath, base, width, height, bytes, meta.format, createdAt)
      committed = true
      try { this.onImported?.(id) } catch { /* The original is already committed; AI errors must not turn a successful import into a failed file. */ }
      return true
    } catch (e) {
      if (!committed) {
        if (finalPath) await rm(finalPath, { force: true }).catch(() => {})
        if (thumbPath) await rm(thumbPath, { force: true }).catch(() => {})
      }
      throw new Error(friendlyError(e))
    } finally {
      await rm(stage, { force: true }).catch(() => {})
      await rm(journal, { force: true }).catch(() => {})
    }
  }
  private async recover() {
    const staging = path.join(this.metaDir, 'staging')
    for (const file of await readdir(staging)) {
      if (file.endsWith('.json')) {
        try {
          const journal = JSON.parse(await readFile(path.join(staging, file), 'utf8'))
          if (!this.db.prepare('SELECT id FROM assets WHERE id=?').get(journal.id)) {
            await rm(this.safePath(journal.relativePath), { force: true })
            await rm(this.safePath(journal.thumbnailPath), { force: true })
          }
        } catch { /* A damaged journal must never remove unrelated files. */ }
      }
    }
    for (const file of await readdir(staging)) await rm(path.join(staging, file), { force: true, recursive: true })
    this.job = this.setting<ImportJob | null>('importJob', null)
    if (this.job && ['scanning', 'running'].includes(this.job.status)) {
      this.job.status = 'interrupted'
      this.job.current = ''
      this.job.errors.push({ file: '', message: '上次导入被中断。已入库的素材已保留；重新导入原目录即可补齐，重复素材会自动跳过。' })
      this.setSetting('importJob', this.job)
    }
  }
  async close() { await this.done; this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); this.db.close() }
}
