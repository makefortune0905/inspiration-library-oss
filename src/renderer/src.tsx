import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Check, CheckCircle, Folder, FolderOpen, GearSix, Images, MagnifyingGlass, Plus, SpinnerGap, UploadSimple, WarningCircle, X, Sparkle } from '@phosphor-icons/react'
import { CATEGORIES, type AppAPI, type Asset, type ImportJob, type LibraryInfo, type LibrarySettings } from '../shared/types'
import type { AIStatus } from '../shared/ai'
import { IconButton, Masonry, Modal, Photo } from './components'
import { Detail } from './detail'
import { AISettingsPanel } from './ai-settings'
import './style.css'
declare global { interface Window { library: AppAPI } }
const api = window.library
const message = (e: unknown) => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': Error: /, '')
function Mark({ large = false }: { large?: boolean }) { return <span className={`mark ${large ? 'large' : ''}`} aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i key={i} style={{ transform: `rotate(${i * 72}deg) translateY(-${large ? 16 : 9}px)` }} />)}</span> }
function App() {
  const [settings, setSettings] = useState<LibrarySettings | null>(null), [info,setInfo] = useState<LibraryInfo | null>(null)
  const [assets,setAssets] = useState<Asset[]>([]), [total,setTotal] = useState(0)
  const [search,setSearch] = useState(''), [query,setQuery] = useState(''), [category,setCategory] = useState('')
  const [searchMode,setSearchMode] = useState<'smart'|'keyword'>('smart'), [searchNotice,setSearchNotice] = useState('')
  const [analysisFilter,setAnalysisFilter] = useState(''), [focused,setFocused] = useState(false), [importMenu,setImportMenu] = useState(false)
  const [showSettings,setShowSettings] = useState(false), [detail,setDetail] = useState<Asset|null>(null), [ai,setAI] = useState<AIStatus|null>(null)
  const [job,setJob] = useState<ImportJob|null>(null), [jobHidden,setJobHidden] = useState(false), [jobExpanded,setJobExpanded] = useState(false)
  const [loading,setLoading] = useState(false), [busy,setBusy] = useState(false), [dragging,setDragging] = useState(false)
  const [toast,setToast] = useState<{ text:string; error:boolean }|null>(null), [revision,setRevision] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null), searchRef = useRef<HTMLInputElement>(null), dragDepth = useRef(0)
  const requestVersion = useRef(0), loadingMore = useRef(false), viewKeyRef = useRef(''), detailRef = useRef(detail)
  detailRef.current = detail
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const notify = useCallback((text:string,error=false) => {setToast({text,error});clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(null),error?8000:3500)},[])
  const report = useCallback((e:unknown)=>notify(message(e),true),[notify])
  const refresh = useCallback(async()=>{const i=await api.info();setInfo(i)},[])
  const updateAI = useCallback(async()=>{setAI(await api.aiStatus())},[])
  useEffect(()=>{api.settings().then(async s=>{setSettings(s);if(s.root){await refresh();await updateAI();const j=await api.importStatus();setJob(j);setJobHidden(j?.status==='completed')}}).catch(report)},[])
  useEffect(()=>{if(searchMode!=='keyword')return;const timer=setTimeout(()=>setQuery(search.trim()),220);return()=>clearTimeout(timer)},[search,searchMode])
  useEffect(()=>{
    if(!info)return
    const version=++requestVersion.current, key=JSON.stringify([info.root,query,category,analysisFilter,searchMode])
    const reset=viewKeyRef.current!==key;viewKeyRef.current=key;loadingMore.current=false;setLoading(true)
    void (async()=>{
      const q={search:query,category,analysisStatus:analysisFilter,searchMode}
      const wanted=reset?80:Math.max(80,assets.length),page=await api.list(q)
      while(page.items.length<Math.min(wanted,page.total)){const more=await api.list({...q,offset:page.items.length});if(!more.items.length)break;page.items.push(...more.items)}
      return page
    })().then(p=>{if(version===requestVersion.current){setAssets(p.items);setTotal(p.total);setSearchNotice(p.searchNotice||'');if(reset)scrollRef.current?.scrollTo(0,0)}}).catch(report).finally(()=>{if(version===requestVersion.current)setLoading(false)})
  },[info?.root,query,category,analysisFilter,searchMode,revision])
  const loadMore=useCallback(async()=>{
    if(loadingMore.current||loading||assets.length>=total)return
    loadingMore.current=true;const version=requestVersion.current
    try{const p=await api.list({search:query,category,analysisStatus:analysisFilter,searchMode,offset:assets.length});if(version===requestVersion.current)setAssets(a=>[...a,...p.items])}catch(e){report(e)}finally{if(version===requestVersion.current)loadingMore.current=false}
  },[assets.length,total,loading,query,category,analysisFilter,searchMode,report])
  useEffect(()=>{
    if(!info)return
    let live=true,lastImport='',lastAI=-1,inFlight=false
    const tick=async()=>{
      if(inFlight)return;inFlight=true
      try{
        const [j,a]=await Promise.all([api.importStatus(),api.aiStatus()]);if(!live)return
        setJob(j);setAI(a)
        const importKey=j?`${j.id}:${j.processed}:${j.status}`:''
        const changed=importKey!==lastImport||a.revision!==lastAI
        if(changed){
          lastImport=importKey;lastAI=a.revision;await refresh()
          // Do not issue paid semantic requests every time the analysis queue advances.
          if(!query||searchMode==='keyword')setRevision(r=>r+1)
          if(detailRef.current){const asset=await api.get(detailRef.current.id);if(live)setDetail(asset)}
        }
      }catch(e){if(live)report(e)}finally{inFlight=false}
    }
    void tick();const timer=setInterval(()=>void tick(),1200)
    return()=>{live=false;clearInterval(timer)}
  },[info?.root,query,searchMode])
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();searchRef.current?.focus()}if(e.key==='Escape'){setFocused(false);setImportMenu(false);setShowSettings(false)}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[])
  const openAsset=async(asset:Asset)=>{try{setDetail(await api.get(asset.id));await api.rememberAsset(asset.id);await refresh()}catch(e){report(e)}setFocused(false)}
  const submitSearch=async(value=search)=>{setQuery(value.trim());setFocused(false);if(value.trim())await api.rememberSearch(value.trim());await refresh();setRevision(r=>r+1)}
  const activate=async(action:()=>Promise<LibraryInfo|null>)=>{
    setBusy(true)
    try{const result=await action();if(!result)return;setInfo(result);setSettings(s=>({...s!,root:result.root,error:undefined}));setDetail(null);setAssets([]);setCategory('');setAnalysisFilter('');setSearch('');setQuery('');setShowSettings(false);setJob(null);await updateAI();setRevision(r=>r+1)}catch(e){report(e)}finally{setBusy(false)}
  }
  const beginImport=async(mode:'files'|'directory'|string[])=>{setImportMenu(false);try{const j=Array.isArray(mode)?await api.importPaths(mode):await api.importFiles(mode);if(j){setJob(j);setJobHidden(false);setJobExpanded(false)}}catch(e){report(e)}}
  const analyze=async(id:string)=>{try{setAI(await api.enqueueAI('single',id));setDetail(await api.get(id));notify('已加入 AI 分析队列')}catch(e){report(e);setShowSettings(true)}}
  const importing=job&&['scanning','running'].includes(job.status)
  return <div className="app" onDragEnter={e=>{if(e.dataTransfer.types.includes('Files')&&info){e.preventDefault();dragDepth.current++;setDragging(true)}}} onDragLeave={e=>{if(e.dataTransfer.types.includes('Files')){dragDepth.current--;if(dragDepth.current<=0)setDragging(false)}}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect=info?'copy':'none'}} onDrop={e=>{e.preventDefault();dragDepth.current=0;setDragging(false);if(info){const paths=api.pathsForFiles(Array.from(e.dataTransfer.files));if(paths.length)void beginImport(paths)}}}>
    <header className="topbar"><div className="brand" onClick={()=>{setCategory('');setAnalysisFilter('');setSearch('');setQuery('')}}><Mark/><span>灵感库</span></div>
      {info&&<button className="ai-header-status" onClick={()=>setShowSettings(true)}><Sparkle size={16}/>{!ai?.configured?'连接 AI':ai.paused?'AI 已暂停':ai.running?'AI 整理中':'AI 自动管理'}</button>}
      {info&&<div className={`search-wrap ${focused?'raised':''}`}><form className="search-box" onSubmit={e=>{e.preventDefault();void submitSearch().catch(report)}}><MagnifyingGlass size={20}/><input ref={searchRef} aria-label="搜索素材" value={search} placeholder={searchMode==='smart'?'描述你想找的灵感，按回车搜索':'搜索标题、描述或标签'} onChange={e=>{setSearch(e.target.value);if(!e.target.value)setQuery('')}} onFocus={()=>setFocused(true)}/>{search?<IconButton label="清空搜索" onClick={()=>{setSearch('');setQuery('')}}><X size={16}/></IconButton>:<kbd>⌘ K</kbd>}</form>
        {focused&&<div className="search-panel"><div className="search-mode"><button className={searchMode==='smart'?'selected':''} onClick={()=>setSearchMode('smart')}>AI 智能搜索</button><button className={searchMode==='keyword'?'selected':''} onClick={()=>setSearchMode('keyword')}>本地关键词</button></div><div className="panel-line"><span>最近搜索</span>{info.recentSearches.length>0&&<button onClick={()=>void api.clearSearches().then(refresh).catch(report)}>清除</button>}</div><div className="recent-searches">{info.recentSearches.length?info.recentSearches.map(s=><button key={s} onClick={()=>{setSearch(s);void submitSearch(s).catch(report)}}><MagnifyingGlass size={16}/>{s}</button>):<p className="subtle">试试“清新但不幼稚的 UI”</p>}</div><div className="panel-line"><span>最近浏览</span></div><div className="recent-images">{info.recentAssets.length?info.recentAssets.slice(0,5).map(a=><button key={a.id} title={a.displayTitle||a.title} onClick={()=>void openAsset(a)}><Photo asset={a}/></button>):<p className="subtle">打开一张素材，开始积累灵感</p>}</div><div className="search-foot">{searchMode==='smart'?'按回车搜索 · 使用 AI 理解需求并排序，消耗 API 用量':'本地关键词搜索 · 不调用模型'}</div></div>}
      </div>}
      <div className="header-actions">{info&&<div className="import-control"><button className="button import-button" onClick={()=>setImportMenu(!importMenu)} disabled={!!importing}><Plus size={19}/>导入素材</button>{importMenu&&<><div className="menu-dismiss" onClick={()=>setImportMenu(false)}/><div className="menu"><button onClick={()=>void beginImport('files')}><Images size={19}/>选择图片</button><button onClick={()=>void beginImport('directory')}><FolderOpen size={19}/>导入整个文件夹</button></div></>}</div>}<IconButton label="设置" onClick={()=>setShowSettings(true)}><GearSix size={21}/></IconButton></div>
    </header>
    {!settings?<div className="center-state"><SpinnerGap className="spin" size={24}/></div>:!info?<main className="welcome"><div className="welcome-art"><Mark large/></div><p className="welcome-eyebrow">属于你的灵感，留在你的 Mac。</p><h1>给好想法一个去处。</h1><p className="welcome-description">你负责收藏喜欢的画面。<br/>让 AI 理解、整理，帮你再次找到它们。</p><button className="button primary welcome-start" disabled={busy} onClick={()=>void activate(()=>api.createLibrary(true))}><Plus size={19}/>创建我的素材库</button><div className="welcome-path">默认保存至 {settings.defaultRoot.replace(/^\/Users\/[^/]+/,'~')}</div><div className="welcome-links"><button disabled={busy} onClick={()=>void activate(()=>api.createLibrary(false))}>选择其他位置</button><span>·</span><button disabled={busy} onClick={()=>void activate(api.openLibrary)}>打开已有素材库</button></div>{settings.error&&<div className="inline-error">{settings.error}</div>}<div className="welcome-note"><Folder size={16}/>原图独立保存，随时可在 Finder 中找到</div></main>:<>
      <div className="filterbar"><div className="categories">{['',...CATEGORIES,'未分类'].map(c=><button key={c} className={category===c?'selected':''} onClick={()=>setCategory(c)}>{c||'全部'}</button>)}</div><span className="asset-count">{total.toLocaleString()} 份素材</span></div>
      <div className="library-status-row"><select aria-label="分析状态筛选" value={analysisFilter} onChange={e=>setAnalysisFilter(e.target.value)}><option value="">全部状态</option><option value="unprocessed">尚未分析</option><option value="queued">等待分析</option><option value="running">正在分析</option><option value="done">已分析</option><option value="failed">分析失败</option></select><span>{loading&&query?(searchMode==='smart'?'AI 正在寻找匹配的灵感…':'正在搜索…'):query?searchNotice:ai?.configured?`AI 已整理 ${ai.completed} 份素材${ai.pending?` · ${ai.pending} 份等待中`:''}`:'连接 AI 后，自动整理你的素材'}</span>{ai&&ai.unprocessed>0&&<button onClick={()=>setShowSettings(true)}>为 {ai.unprocessed} 份已有素材补标</button>}</div>
      <main className="content-scroll" ref={scrollRef} aria-label="素材列表">{loading&&!assets.length?<div className="center-state"><SpinnerGap className="spin" size={26}/></div>:assets.length?<Masonry assets={assets} scrollRef={scrollRef} onOpen={a=>void openAsset(a)} onMore={loadMore} hasMore={assets.length<total}/>:<Empty filtered={!!(query||category||analysisFilter)} reset={()=>{setSearch('');setQuery('');setCategory('');setAnalysisFilter('')}} importFiles={()=>void beginImport('files')}/>}</main>
    </>}
    {focused&&<div className="search-backdrop" onClick={()=>setFocused(false)}/>}
    {job&&!jobHidden&&!detail&&<div className="import-progress"><div className="progress-heading"><span>{importing?<SpinnerGap className="spin" size={18}/>:job.failed||job.status==='interrupted'?<WarningCircle size={19}/>:<CheckCircle size={19}/>}<strong>{job.status==='scanning'?'正在查找图片':importing?'正在收进灵感库':job.status==='interrupted'?'上次导入未完成':'导入完成'}</strong></span>{!importing&&<IconButton label="关闭导入结果" onClick={()=>setJobHidden(true)}><X size={16}/></IconButton>}</div>{importing&&<><div className="progress-track"><i style={{width:`${job.total?job.processed/job.total*100:3}%`}}/></div><div className="progress-file">{job.current||'扫描文件夹…'}<span>{job.processed} / {job.total}</span></div></>}<div className="progress-counts"><span>已导入 {job.imported}</span><span>重复 {job.duplicates}</span><span>失败 {job.failed}</span>{job.errors.length>0&&<button onClick={()=>setJobExpanded(!jobExpanded)}>{jobExpanded?'收起':'查看原因'}</button>}</div>{jobExpanded&&<div className="job-errors">{job.errors.map((e,i)=><p key={i}><strong>{e.file}</strong>{e.message}</p>)}</div>}</div>}
    {dragging&&<div className="drop-overlay"><div><UploadSimple size={42}/><h2>放开，收藏这份灵感</h2><p>图片将复制到你的素材库，原文件保留。</p></div></div>}
    {detail&&<Detail key={detail.id} asset={detail} previous={assets.findIndex(a=>a.id===detail.id)>0} next={assets.findIndex(a=>a.id===detail.id)>=0&&assets.findIndex(a=>a.id===detail.id)<assets.length-1} onClose={()=>setDetail(null)} onMove={direction=>{const next=assets[assets.findIndex(a=>a.id===detail.id)+direction];if(next)void openAsset(next)}} onSaved={a=>{setDetail(a);setAssets(items=>items.map(x=>x.id===a.id?a:x));void refresh();if(!query||searchMode==='keyword')setRevision(r=>r+1)}} notify={notify} report={report} onAnalyze={()=>void analyze(detail.id)}/>}
    {showSettings&&<Modal title="素材库设置" className="wide-settings" onClose={()=>setShowSettings(false)}><div className="settings-label">当前素材库</div><div className="path-box"><Folder size={21}/><span>{info?.root||'尚未创建素材库'}</span></div>{info&&<button className="button full" onClick={()=>void api.reveal().catch(report)}><FolderOpen size={18}/>在 Finder 中打开</button>}<p className="settings-help">原图与分析结果保存在素材库中；API Key 使用系统加密保存在本机应用设置中。</p><div className="ai-button-row"><button className="button" disabled={busy||!!importing} onClick={()=>void activate(api.openLibrary)}>打开已有素材库</button><button className="button" disabled={busy||!!importing} onClick={()=>void activate(()=>api.createLibrary(false))}>创建其他素材库</button></div>{info?<AISettingsPanel status={ai} onChanged={()=>{void updateAI().catch(report);setRevision(r=>r+1)}} report={report}/>:<p className="settings-help">创建或打开素材库后即可配置 AI。</p>}</Modal>}
    {toast&&<div className={`toast ${toast.error?'error':''}`} role={toast.error?'alert':'status'}>{toast.error?<WarningCircle size={18}/>:<Check size={18}/>}<span>{toast.text}</span><IconButton label="关闭提示" onClick={()=>setToast(null)}><X size={15}/></IconButton></div>}
  </div>
}
function Empty({filtered,reset,importFiles}:{filtered:boolean;reset:()=>void;importFiles:()=>void}){return <div className="empty-state"><div className="empty-symbol"><Images size={44} weight="light"/></div><h2>{filtered?'还没有找到匹配的素材':'第一份灵感，从这里开始'}</h2><p>{filtered?'换个表达或调整分类；未分析图片可先补标。':'拖入图片或文件夹，AI 会自动整理你的视觉收藏。'}</p><button className={`button ${filtered?'':'primary'}`} onClick={filtered?reset:importFiles}>{filtered?'清除筛选':<><Plus size={19}/>导入第一批素材</>}</button></div>}
createRoot(document.getElementById('root')!).render(<App/> )
