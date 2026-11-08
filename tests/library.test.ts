import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, cp, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { LibraryService, friendlyError } from '../src/main/services/library'

async function setup() {
  const base = await mkdtemp(path.join(tmpdir(), 'inspiration-test-'))
  const root = path.join(base, 'library'), source = path.join(base, 'source')
  await mkdir(source)
  const library = await LibraryService.open(root, true)
  return { base, root, source, library }
}
async function picture(file: string, width = 80, height = 60, r = 120) {
  await sharp({ create: { width, height, channels: 4, background: { r, g: 80, b: 190, alpha: .5 } } }).toFile(file)
}
test('50 mixed images: copy intact, formats, dimensions, duplicates and same filenames', async () => {
  const { base, root, source, library } = await setup()
  try {
    await mkdir(path.join(source, 'nested'))
    for (let i = 0; i < 48; i++) await picture(path.join(source, i % 2 ? 'nested' : '', `image-${i}.${['png','jpg','webp','gif'][i % 4]}`), 80 + i, i % 2 ? 150 : 60, 50 + i)
    await picture(path.join(source, 'same.png'), 100, 80)
    await picture(path.join(source, 'nested', 'same.png'), 110, 80)
    library.importPaths([source]); const job = await library.waitForImport()
    assert.equal(job.imported, 50); assert.equal(job.failed, 0)
    const result = library.list({ limit: 120 }); assert.equal(result.total, 50)
    for (const a of result.items) {
      const original = a.filename === 'same.png' && a.width === 110 || Number(a.filename.match(/image-(\d+)/)?.[1]) % 2 ? path.join(source, 'nested', a.filename) : path.join(source, a.filename)
      assert.deepEqual(await readFile(library.filePath(a.id)), await readFile(original))
      const thumb = await sharp(library.filePath(a.id, 'thumbnail')).metadata(); assert.equal(thumb.format, 'webp')
      assert.equal(path.isAbsolute(a.relativePath), false)
    }
    library.importPaths([source]); const again = await library.waitForImport()
    assert.equal(again.duplicates, 50); assert.equal(library.info().count, 50)
    assert.equal((await readdir(path.join(root, '.library', 'staging'))).length, 0)
    library.importPaths([root]); assert.equal((await library.waitForImport()).failed, 1)
  } finally { await library.close(); await rm(base, { recursive: true, force: true }) }
})
test('metadata, collections, literal keyword AND search, restart and moved library', async () => {
  const { base, root, source, library } = await setup()
  const file = path.join(source, 'white space.png'); await picture(file)
  library.importPaths([file]); await library.waitForImport()
  const a = library.list().items[0], collection = library.createCollection('下一次改版')
  const patch = { title: '清新 UI', note: '奶白色的健康应用 100%', sourceUrl: 'https://example.com/reference', tags: ['薄荷绿', '圆角'], categories: ['UI 页面'] as const, collectionIds: [collection.id] }
  library.update(a.id, { ...patch, categories: [...patch.categories] })
  library.rememberSearch('清新 UI'); library.rememberAsset(a.id)
  assert.equal(library.list({ search: '清新 圆角', category: 'UI 页面', collectionId: collection.id }).total, 1)
  assert.equal(library.list({ search: '100%' }).total, 1)
  assert.equal(library.list({ search: "' OR 1=1 --" }).total, 0)
  assert.equal(library.list({ category: '未分类' }).total, 0)
  await library.close()
  const reopen = await LibraryService.open(root)
  assert.equal(reopen.get(a.id).note, patch.note); assert.equal(reopen.collections()[0].count, 1)
  assert.deepEqual(reopen.info().recentSearches, ['清新 UI']); assert.equal(reopen.info().recentAssets[0].id, a.id)
  reopen.renameCollection(collection.id, '新的灵感')
  reopen.update(a.id, { ...patch, categories: [...patch.categories], collectionIds: [] })
  assert.equal(reopen.collections()[0].count, 0)
  assert.ok((await readFile(reopen.filePath(a.id))).length)
  await reopen.close()
  const moved = path.join(base, 'moved'); await cp(root, moved, { recursive: true })
  const relocated = await LibraryService.open(moved)
  assert.ok(relocated.filePath(a.id).startsWith(moved)); assert.equal(relocated.collections()[0].name, '新的灵感')
  await relocated.close(); await rm(base, { recursive: true, force: true })
})
test('orientation, animated originals, unsupported and corrupted files fail independently', async () => {
  const { base, source, library } = await setup()
  try {
    const rotated = path.join(source, 'rotated.jpg')
    await sharp({ create: { width: 120, height: 60, channels: 3, background: '#ff8800' } }).withMetadata({ orientation: 6 }).jpeg().toFile(rotated)
    await writeFile(path.join(source, 'broken.png'), 'invalid image')
    const gif = path.join(source, 'motion.gif')
    const frame = Buffer.concat([Buffer.alloc(20 * 20 * 3, 40), Buffer.alloc(20 * 20 * 3, 220)])
    const animated = sharp(frame, { raw: { width: 20, height: 40, channels: 3, pageHeight: 20 } }).gif({ delay: [100, 100], loop: 0 })
    await animated.toFile(gif)
    library.importPaths([source, path.join(source, 'missing.png')]); const job = await library.waitForImport()
    assert.equal(job.imported, 2); assert.equal(job.failed, 2)
    const gifAsset = library.list().items.find(a => a.filename === 'motion.gif')!
    assert.equal((await sharp(library.filePath(gifAsset.id), { animated: true }).metadata()).pages, 2)
    assert.equal(gifAsset.height, 20)
    const a = library.list().items.find(a => a.filename === 'rotated.jpg')!
    assert.equal(a.width, 60); assert.equal(a.height, 120)
    const thumb = await sharp(library.filePath(a.id, 'thumbnail')).metadata(); assert.equal(thumb.width, 60); assert.equal(thumb.height, 120)
    await writeFile(path.join(source, 'text.txt'), 'text'); library.importPaths([path.join(source, 'text.txt')]); assert.equal((await library.waitForImport()).failed, 1)
  } finally { await library.close(); await rm(base, { recursive: true, force: true }) }
})
test('recovery cleans uncommitted copies, keeps committed assets and preserves completed imports', async () => {
  const { base, root, source, library } = await setup()
  const file = path.join(source, 'good.png'); await picture(file); library.importPaths([file]); await library.waitForImport()
  const asset = library.list().items[0]
  const stage = path.join(root, '.library', 'staging')
  await writeFile(path.join(stage, `${asset.id}.json`), JSON.stringify({ id: asset.id, relativePath: asset.relativePath, thumbnailPath: asset.thumbnailPath }))
  const orphan = '原图/orphan.png', orphanThumb = '.library/thumbnails/orphan.webp'
  await writeFile(path.join(root, orphan), 'unfinished'); await writeFile(path.join(root, orphanThumb), 'unfinished')
  await writeFile(path.join(stage, 'orphan.json'), JSON.stringify({ id: randomUUID(), relativePath: orphan, thumbnailPath: orphanThumb }))
  await writeFile(path.join(stage, 'partial'), 'partial')
  const interrupted = { ...library.job, status: 'running' }
  library.db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(interrupted), 'importJob')
  await library.close()
  const reopened = await LibraryService.open(root)
  assert.equal(reopened.info().count, 1); assert.ok((await readFile(reopened.filePath(asset.id))).length)
  assert.equal(reopened.importStatus()?.status, 'interrupted')
  assert.equal((await readdir(stage)).length, 0)
  await assert.rejects(readFile(path.join(root, orphan)))
  await reopened.close(); await rm(base, { recursive: true, force: true })
})
test('permission and disk-full errors are readable; partial disk-full imports never appear', async () => {
  const { base, root, source, library } = await setup()
  try {
    await picture(path.join(source, 'good.png'))
    library.importPaths([source]); await library.waitForImport()
    const count = library.info().count
    await picture(path.join(source, 'blocked.png'), 100, 100)
    const thumbDir = path.join(root, '.library', 'thumbnails')
    await chmod(thumbDir, 0o555)
    library.importPaths([path.join(source, 'blocked.png')]); const job = await library.waitForImport()
    assert.equal(job.failed, 1); assert.equal(library.info().count, count)
    await chmod(thumbDir, 0o755)
    assert.match(friendlyError(Object.assign(new Error(), { code: 'ENOSPC' })), /磁盘空间不足/)
    // Force a real SQLite disk-full error at the insert, after file copy/thumbnail work.
    const before = library.db.prepare.bind(library.db)
    library.db.prepare = ((sql: string) => {
      if (sql.startsWith('INSERT INTO assets')) throw new Error('database or disk is full')
      return before(sql)
    }) as typeof library.db.prepare
    library.importPaths([path.join(source, 'blocked.png')]); const full = await library.waitForImport()
    assert.equal(full.failed, 1); assert.match(full.errors[0].message, /磁盘空间不足/)
    library.db.prepare = before
    assert.equal(library.info().count, count)
    assert.equal((await readdir(thumbDir)).length, count)
  } finally { await library.close(); await rm(base, { recursive: true, force: true }) }
})
test('5,000 records paginate with stable ordering and combined filters', async () => {
  const { base, library } = await setup()
  try {
    library.db.exec('BEGIN')
    const insert = library.db.prepare('INSERT INTO assets (id,hash,filename,relativePath,thumbnailPath,title,width,height,bytes,format,createdAt,categories,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    for (let i = 0; i < 5000; i++) insert.run(String(i).padStart(5,'0'), `hash-${i}`, `${i}.png`, `原图/${i}.png`, `.library/thumbnails/${i}.webp`, `UI ${i}`, 100, 100, 200, 'png', '2026-09-16', JSON.stringify(i % 2 ? ['UI 页面'] : []), JSON.stringify(['清新']))
    library.db.exec('COMMIT')
    const start = performance.now(), first = library.list(), second = library.list({ offset: 80 })
    assert.equal(first.total, 5000); assert.equal(first.items.length, 80)
    assert.equal(new Set([...first.items, ...second.items].map(a => a.id)).size, 160)
    assert.equal(library.list({ search: '清新', category: 'UI 页面' }).total, 2500)
    assert.ok(performance.now() - start < 2000)
  } finally { await library.close(); await rm(base, { recursive: true, force: true }) }
})
