import React, { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Images, X } from '@phosphor-icons/react'
import { mediaUrl, type Asset } from '../shared/types'
export function IconButton({ label, children, onClick, className = '' }: { label: string; children: React.ReactNode; onClick: () => void; className?: string }) { return <button type="button" title={label} aria-label={label} className={`icon-button ${className}`} onClick={onClick}>{children}</button> }
export function Photo({ asset, original = false }: { asset: Asset; original?: boolean }) {
  const [failed, setFailed] = useState(false)
  return failed ? <div className="missing-image"><Images size={28}/><span>无法读取图片</span></div> : <img src={mediaUrl(asset.id, original ? 'original' : 'thumbnail')} alt={asset.displayTitle || asset.title} onError={() => setFailed(true)} draggable={false} />
}
export function Masonry({ assets, scrollRef, onOpen, onMore, hasMore }: { assets: Asset[]; scrollRef: React.RefObject<HTMLDivElement | null>; onOpen: (a: Asset) => void; onMore: () => void; hasMore: boolean }) {
  const [viewport, setViewport] = useState({ width: 1200, height: 800, top: 0 })
  useEffect(() => {
    const el = scrollRef.current; if (!el) return
    let frame = 0
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setViewport({ width: el.clientWidth, height: el.clientHeight, top: el.scrollTop })) }
    const observer = new ResizeObserver(update); observer.observe(el); el.addEventListener('scroll', update, { passive: true }); update()
    return () => { observer.disconnect(); el.removeEventListener('scroll', update); cancelAnimationFrame(frame) }
  }, [])
  const layout = useMemo(() => {
    const gap = 24, padding = 32, width = viewport.width - padding * 2
    const columns = Math.max(2, Math.floor((width + gap) / 260)), columnWidth = (width - gap * (columns - 1)) / columns
    const heights = new Array(columns).fill(0)
    const positions = assets.map(asset => {
      const col = heights.indexOf(Math.min(...heights)), height = columnWidth * asset.height / asset.width, top = heights[col]
      heights[col] += height + gap
      return { asset, left: padding + col * (columnWidth + gap), top, width: columnWidth, height }
    })
    return { positions, height: Math.max(...heights, 0) }
  }, [assets, viewport.width])
  useEffect(() => { if (hasMore && viewport.top + viewport.height + 1200 > layout.height) onMore() }, [viewport.top, viewport.height, layout.height, hasMore, onMore])
  const visible = layout.positions.filter(p => p.top + p.height > viewport.top - 700 && p.top < viewport.top + viewport.height + 700)
  return <div className="masonry" style={{ height: layout.height }} data-loaded={assets.length}>{visible.map(p => <button className="asset-tile" key={p.asset.id} aria-label={`打开 ${p.asset.displayTitle || p.asset.title}`} onClick={() => onOpen(p.asset)} style={{ left: p.left, top: p.top, width: p.width, height: p.height }}><Photo asset={p.asset}/><span className="tile-overlay"><span>{p.asset.displayTitle || p.asset.title}</span><ArrowUpRight size={18}/></span>{p.asset.format === 'gif' && <span className="gif-label">GIF</span>}</button>)}</div>
}
export function Modal({ title, children, onClose, className = '' }: { title: string; children: React.ReactNode; onClose: () => void; className?: string }) { return <div className="modal-backdrop" onClick={onClose}><section className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}><header><h2>{title}</h2><IconButton label="关闭" onClick={onClose}><X size={21}/></IconButton></header>{children}</section></div> }
