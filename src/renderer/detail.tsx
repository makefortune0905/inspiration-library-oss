import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Copy, FolderOpen, ArrowClockwise } from '@phosphor-icons/react'
import { CATEGORIES, type Asset, type AssetPatch } from '../shared/types'
import { DIMENSIONS } from '../shared/ai'
import { IconButton, Photo } from './components'
const api = window.library
const bytes = (v: number) => v < 1048576 ? `${Math.round(v/1024)} KB` : `${(v/1048576).toFixed(1)} MB`
export function Detail({ asset, previous, next, onClose, onMove, onSaved, notify, report, onAnalyze }: { asset: Asset; previous: boolean; next: boolean; onClose: () => void; onMove: (n: number) => void; onSaved: (a: Asset) => void; notify: (s: string) => void; report: (e: unknown) => void; onAnalyze: () => void }) {
  const [draft, setDraft] = useState<AssetPatch>({ title: asset.title, note: asset.note, sourceUrl: asset.sourceUrl, tags: asset.tags, categories: asset.categories, collectionIds: asset.collectionIds })
  const [tagText, setTagText] = useState(asset.tags.join('，')), [saving, setSaving] = useState(false)
  const initial = useRef(JSON.stringify(draft)), draftRef = useRef(draft), tagsRef = useRef(tagText)
  draftRef.current = draft; tagsRef.current = tagText
  const save = async () => {
    const patch = { ...draftRef.current, tags: tagsRef.current.split(/[,，\n]/).map(t => t.trim()).filter(Boolean) }
    if (JSON.stringify(patch) === initial.current) return true
    setSaving(true)
    try { const a = await api.update(asset.id,patch); initial.current = JSON.stringify(patch); onSaved(a); return true } catch (e) { report(e); return false } finally { setSaving(false) }
  }
  const finish = async (action: () => void) => { if (!saving && await save()) action() }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-backdrop')) return
      if (e.key === 'Escape') { e.preventDefault(); void finish(onClose) }
      if (['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName)) return
      if (e.key === 'ArrowLeft' && previous) { e.preventDefault(); void finish(() => onMove(-1)) }
      if (e.key === 'ArrowRight' && next) { e.preventDefault(); void finish(() => onMove(1)) }
    }
    window.addEventListener('keydown',key); return () => window.removeEventListener('keydown',key)
  },[saving,previous,next])
  const data = asset.ai?.data
  return <div className="detail" role="dialog" aria-modal="true" aria-label="素材详情">
    <div className="detail-top"><button className="text-button" onClick={() => void finish(onClose)}><ArrowLeft size={20}/>返回素材库</button><span>{asset.filename}</span><div className="detail-navigation"><button aria-label="上一张" disabled={!previous || saving} onClick={() => void finish(() => onMove(-1))}><ArrowLeft size={18}/></button><button aria-label="下一张" disabled={!next || saving} onClick={() => void finish(() => onMove(1))}><ArrowRight size={18}/></button></div></div>
    <div className="detail-body"><div className="detail-image"><Photo asset={asset} original/></div><aside className="detail-sidebar"><div className="detail-fields">
      <h2 className="analysis-title">{asset.displayTitle || asset.title}</h2><div className="file-meta">{asset.width} × {asset.height}<span>·</span>{asset.format.toUpperCase()}<span>·</span>{bytes(asset.bytes)}</div>
      <div className="ai-detail-heading"><span>AI 设计分析</span><button disabled={['queued','running'].includes(asset.ai?.status || '')} onClick={() => void finish(onAnalyze)}><ArrowClockwise size={14}/>{data ? '重新分析' : '开始分析'}</button></div>
      {asset.ai?.status !== 'done' && <p className={`ai-state ${asset.ai?.status === 'failed' ? 'inline-error' : ''}`}>{({ unprocessed:'尚未分析，AI 将自动生成分类、标签和描述。', queued:'已加入分析队列', running:'正在理解这张素材…', failed:asset.ai?.error || '分析失败' } as Record<string,string>)[asset.ai?.status || 'unprocessed']}</p>}
      {data && <>
        <div className="analysis-categories">{asset.effectiveCategories?.map(c => <span key={c}>{c}</span>)}</div>
        <p className="analysis-description">{data.description}</p>
        {data.colors.length > 0 && <div className="analysis-colors">{data.colors.map((c,i) => <span key={i} title={`${c.name} ${c.hex}`}><i style={{ background:c.hex }}/>{c.name}</span>)}</div>}
        {DIMENSIONS.map(([key,label]) => { const value = data[key]; return Array.isArray(value) && value.length > 0 && <div className="analysis-dimension" key={key}><span>{label}</span><p>{(value as string[]).join(' · ')}</p></div> })}
        {data.artist && <div className="analysis-dimension"><span>可见署名</span><p>{data.artist} · {data.artistEvidence}</p></div>}
        {data.tags.length > 0 && <div className="analysis-tags">{data.tags.map(t => <span key={t}>{t}</span>)}</div>}
        <details className="analysis-extra"><summary>视觉提示词与画面文字</summary><label className="field-label" htmlFor="visual-prompt">视觉提示词（可选中复制）</label><textarea id="visual-prompt" readOnly value={data.prompt} rows={6}/>{data.textInImage && <p className="settings-help">画面文字：{data.textInImage}</p>}{data.uncertainties.length > 0 && <p className="settings-help">不确定的判断：{data.uncertainties.join('；')}</p>}</details>
        <p className="input-hint">{asset.ai?.model} · {asset.ai?.updatedAt ? new Date(asset.ai.updatedAt).toLocaleString('zh-CN') : ''}</p>
      </>}
      <label className="field-label" htmlFor="note">收藏时的想法（可选）</label><textarea id="note" value={draft.note} rows={3} maxLength={20000} placeholder="例如：喜欢这个标题排版" onChange={e => setDraft(d => ({...d,note:e.target.value}))}/>
      <details className="manual-corrections"><summary>纠正信息或补充标签</summary>
        <label className="field-label" htmlFor="title">自定义标题</label><input id="title" aria-label="素材标题" value={draft.title} onChange={e => setDraft(d => ({...d,title:e.target.value}))}/>
        <label className="field-label" htmlFor="source">来源链接</label><div className="source-field"><input id="source" value={draft.sourceUrl} placeholder="https://" onChange={e => setDraft(d => ({...d,sourceUrl:e.target.value}))}/>{draft.sourceUrl && <IconButton label="打开来源" onClick={() => void finish(() => {void api.openSource(asset.id).catch(report)})}><ArrowUpRight size={18}/></IconButton>}</div>
        <div className="field-label">分类纠正（优先于 AI 分类）</div><div className="tag-options">{CATEGORIES.map(c => <button key={c} className={draft.categories.includes(c) ? 'checked' : ''} onClick={() => setDraft(d => ({...d,useAICategories:false,categories:d.categories.includes(c) ? d.categories.filter(x => x!==c) : [...d.categories,c]}))}>{c}</button>)}</div><button className="text-button" onClick={() => setDraft(d => ({...d,useAICategories:true,categories:[]}))}>恢复使用 AI 分类</button>
        <label className="field-label" htmlFor="tags">补充标签</label><textarea id="tags" rows={2} value={tagText} onChange={e => setTagText(e.target.value)} placeholder="逗号分隔"/><p className="input-hint">手动信息优先保留；重新分析不会覆盖这些内容。</p>
      </details>
      <div className="saved-date">收藏于 {new Date(asset.createdAt).toLocaleDateString('zh-CN')}</div>
    </div><footer className="detail-actions"><div><IconButton label="复制图片" onClick={() => void api.copyImage(asset.id).then(() => notify('图片已复制到剪贴板')).catch(report)}><Copy size={20}/></IconButton><IconButton label="在 Finder 中显示" onClick={() => void api.reveal(asset.id).catch(report)}><FolderOpen size={20}/></IconButton></div><button className="button primary" disabled={saving} onClick={() => void save().then(ok => {if(ok) notify('已保存')})}>{saving ? '保存中…' : '保存修改'}</button></footer></aside></div>
  </div>
}
