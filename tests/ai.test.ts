import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type ServerResponse } from 'node:http'
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { LibraryService } from '../src/main/services/library'
import { AIService } from '../src/main/services/ai-service'
import { AIProvider } from '../src/main/services/ai-provider'
import { DEFAULT_AI, type DesignAnalysis } from '../src/shared/ai'
import { z } from 'zod'
const analysis: DesignAnalysis = {
  title:'薄荷绿健康 UI',description:'以薄荷绿、奶白和大面积留白构成的健康管理首页，圆角卡片与清晰的信息层级营造清新成熟的氛围。',categories:['UI 页面'],subjects:['健康首页'],styles:['极简','清新'],moods:['平静'],composition:['留白','圆角卡片'],typography:['无衬线'],materials:[],lighting:[],useCases:['健康管理'],industries:['健康'],colors:[{name:'薄荷绿',hex:'#88BB99'}],textInImage:'Hello',artist:'猜测作者',artistEvidence:'',styleReferences:[],tags:['薄荷绿','清新','成熟'],prompt:'薄荷绿健康管理首页，大留白。',uncertainties:[]
}
const complete = (res: ServerResponse, result: unknown) => {
  res.writeHead(200, {'content-type':'text/event-stream'})
  res.end(`data: ${JSON.stringify({type:'response.completed',response:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}],usage:{input_tokens:100,output_tokens:200}}})}\n\n`)
}
async function setup() {
  const dir=await mkdtemp(path.join(tmpdir(),'inspiration-ai-test-')),root=path.join(dir,'library'),source=path.join(dir,'source')
  await mkdir(source);await sharp({create:{width:100,height:100,channels:3,background:'#00aa88'}}).png().toFile(path.join(source,'image.png'))
  const library=await LibraryService.open(root,true),ai=new AIService(library)
  let fail=false, delay=false, calls=0
  const server=createServer(async(req,res)=>{
    calls++;const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk)
    const body=JSON.parse(Buffer.concat(chunks).toString())
    if(fail){res.writeHead(401);res.end('bad credential');return}
    if(delay){req.on('close',()=>{});setTimeout(()=>{if(!res.destroyed)complete(res,analysis)},300);return}
    const props=body.text?.format?.schema?.properties
    if(props?.color){complete(res,{color:'绿色'});return}
    if(props?.phrases){complete(res,{phrases:['薄荷绿','清新','成熟'],category:'UI 页面',intent:'清新但不幼稚的UI'});return}
    if(props?.matches){const input=JSON.parse(body.input[0].content[0].text);complete(res,{matches:[{id:input.candidates[0].id,score:95},{id:'not-real',score:100}]});return}
    complete(res,analysis)
  })
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  const port=(server.address() as any).port
  const config={...DEFAULT_AI,baseUrl:`http://127.0.0.1:${port}`,apiKey:'test-only-key',enabled:true}
  const close=async()=>{try { await ai.close(); await library.close() } catch {} finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true})}}
  return {dir,root,source,library,ai,config,close,setFail:(v:boolean)=>{fail=v},setDelay:(v:boolean)=>{delay=v},calls:()=>calls}
}
test('AI auto-analysis, labels, category filters, corrections and usage; no collection management required',async()=>{
  const t=await setup()
  try{
    await t.ai.configure(t.config)
    t.library.importPaths([t.source]);await t.library.waitForImport();await t.ai.waitUntilIdle()
    const asset=t.library.list().items[0]
    assert.equal(asset.ai?.status,'done');assert.equal(asset.ai.data?.artist,'');assert.equal(asset.displayTitle,analysis.title)
    assert.equal(t.library.list({category:'UI 页面'}).total,1)
    assert.equal(t.library.list({search:'薄荷绿 成熟'}).total,1)
    t.library.update(asset.id,{title:'我的标题',note:'不可覆盖',sourceUrl:'',tags:['个人标签'],categories:['品牌视觉'],collectionIds:[]})
    t.ai.enqueue('single',asset.id);await t.ai.waitUntilIdle()
    const updated=t.library.get(asset.id)
    assert.equal(updated.title,'我的标题');assert.equal(updated.note,'不可覆盖');assert.deepEqual(updated.tags,['个人标签']);assert.deepEqual(updated.effectiveCategories,['品牌视觉'])
    assert.equal(t.library.list({category:'UI 页面'}).total,0)
    t.library.update(asset.id,{title:updated.title,note:updated.note,sourceUrl:'',tags:updated.tags,categories:[],collectionIds:[],useAICategories:true})
    assert.equal(t.library.list({category:'UI 页面'}).total,1)
    const count=t.calls();t.ai.enqueue('unprocessed');await t.ai.waitUntilIdle();assert.equal(t.calls(),count)
    assert.equal(t.ai.status().usage.calls,2);assert.equal(t.ai.status().usage.inputTokens,200)
  }finally{await t.close()}
})
test('smart query expansion + ranking is cached, includes AI metadata, and never returns invented ids',async()=>{
  const t=await setup()
  try{
    await t.ai.configure(t.config);t.library.importPaths([t.source]);await t.library.waitForImport();await t.ai.waitUntilIdle()
    const result=await t.ai.list({search:'清新但不幼稚的界面',searchMode:'smart',category:'UI 页面'})
    assert.equal(result.items.length,1);assert.equal(result.items[0].id,t.library.list().items[0].id)
    const count=t.calls();await t.ai.list({search:'清新但不幼稚的界面',searchMode:'smart',category:'UI 页面'});assert.equal(t.calls(),count)
    assert.match(result.searchNotice!,/相关性/)
  }finally{await t.close()}
})
test('authorization failure pauses queue, manual retry works, pause does not overwrite existing data',async()=>{
  const t=await setup()
  try{
    await t.ai.configure(t.config);t.setFail(true);t.library.importPaths([t.source]);await t.library.waitForImport();await t.ai.waitUntilIdle()
    assert.equal(t.ai.status().failed,1);assert.equal(t.ai.status().paused,true);assert.match(t.ai.status().lastError,/401/)
    t.setFail(false);t.ai.enqueue('failed');await t.ai.waitUntilIdle();assert.equal(t.ai.status().completed,1)
    const id=t.library.list().items[0].id
    t.setDelay(true);t.ai.enqueue('single',id);await t.ai.pause(true);await t.ai.waitUntilIdle()
    assert.equal(t.library.get(id).ai?.status,'queued');assert.ok(t.library.get(id).ai?.data)
    t.setDelay(false);await t.ai.pause(false);await t.ai.waitUntilIdle();assert.equal(t.library.get(id).ai?.status,'done')
  }finally{await t.close()}
})
test('restart recovers queued analysis and migration preserves v1 metadata',async()=>{
  const t=await setup()
  try{
    t.library.importPaths([t.source]);await t.library.waitForImport()
    const id=t.library.list().items[0].id
    t.library.db.prepare("INSERT INTO asset_ai(assetId,status) VALUES (?,'running')").run(id)
    await t.ai.close()
    const restored=new AIService(t.library)
    assert.equal(restored.status().pending,1)
    await restored.configure(t.config);await restored.waitUntilIdle();assert.equal(t.library.get(id).ai?.status,'done');await restored.close()
    // Recreate the first-version schema around the existing real asset for migration verification.
    t.library.db.exec('DROP TABLE asset_ai; DROP TABLE ai_usage; ALTER TABLE assets DROP COLUMN categoryOverride; ALTER TABLE assets DROP COLUMN titleEdited; PRAGMA user_version=1;')
    await t.library.close()
    const reopened=await LibraryService.open(t.root)
    assert.equal(reopened.info().count,1);assert.ok((await readFile(reopened.filePath(id))).length)
    assert.equal((reopened.db.prepare('PRAGMA user_version').get() as any).user_version,2)
    await reopened.close()
  }finally{try{await t.close()}catch{/* Database deliberately reopened above. */}}
})
test('provider reads split SSE, validates schema, and blocks redirect credential forwarding',async()=>{
  let forwarded=0
  const target=createServer((_req,res)=>{forwarded++;res.end('{}')})
  await new Promise<void>(r=>target.listen(0,'127.0.0.1',r))
  const port=(target.address() as any).port
  const server=createServer(async(req,res)=>{
    for await(const _ of req){}
    if(req.url==='/redirect/responses'){res.writeHead(307,{location:`http://127.0.0.1:${port}`});res.end();return}
    res.writeHead(200,{'content-type':'text/event-stream'})
    const event=`data: ${JSON.stringify({type:'response.completed',response:{status:'completed',output:[{content:[{type:'output_text',text:'{"value":"ok"}'}]}]}})}\n\n`
    res.write(event.slice(0,20));res.end(event.slice(20))
  })
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r))
  const base=`http://127.0.0.1:${(server.address() as any).port}`
  try{
    const provider=new AIProvider({...DEFAULT_AI,baseUrl:base,apiKey:'test-only'})
    assert.deepEqual(await provider.structured('test','test','test',z.object({value:z.string()})),{value:'ok'})
    await assert.rejects(provider.structured('test','test','test',z.object({other:z.string()})),/结构不完整/)
    const redirect=new AIProvider({...DEFAULT_AI,baseUrl:base+'/redirect',apiKey:'test-only'})
    await assert.rejects(redirect.structured('test','test','test',z.object({value:z.string()})))
    assert.equal(forwarded,0)
  }finally{server.closeAllConnections();target.closeAllConnections();await Promise.all([new Promise<void>(r=>server.close(()=>r())),new Promise<void>(r=>target.close(()=>r()))])}
})
