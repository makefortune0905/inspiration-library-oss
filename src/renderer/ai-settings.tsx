import { useEffect, useState } from 'react'
import { Play, Pause, ArrowClockwise, CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { DEFAULT_AI, type AIConfigInput, type AISettings, type AIStatus } from '../shared/ai'
export function AISettingsPanel({ status, onChanged, report }: { status: AIStatus | null; onChanged: () => void; report: (e: unknown) => void }) {
  const [settings, setSettings] = useState<AISettings | null>(null)
  const [form, setForm] = useState<AIConfigInput>({ ...DEFAULT_AI })
  const [key, setKey] = useState(''), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('')
  useEffect(() => { window.library.aiSettings().then(s => { setSettings(s); setForm(s) }).catch(report) }, [])
  const save = async (test = false) => {
    setBusy(true); setFeedback('')
    try {
      const saved = await window.library.saveAISettings({ ...form, apiKey: key.trim() || undefined })
      setSettings(saved); setKey(''); onChanged()
      if (test) setFeedback((await window.library.testAIConnection()).message)
      else setFeedback('配置已加密保存在这台 Mac 上。')
    } catch (e) { report(e) } finally { setBusy(false) }
  }
  const queue = async (scope: 'unprocessed' | 'failed') => { try { await window.library.enqueueAI(scope); onChanged() } catch (e) { report(e) } }
  const field = <K extends keyof AIConfigInput>(name: K, value: AIConfigInput[K]) => setForm(f => ({ ...f, [name]: value }))
  return <section className="ai-settings-panel">
    <h3>AI 自动管理</h3>
    <p className="settings-help">图片入库后自动分类、打标并生成设计描述。智能搜索使用同一个模型理解需求并排序。</p>
    {settings?.error && <p className="inline-error">{settings.error}</p>}
    <label className="field-label" htmlFor="ai-url">Base URL</label>
    <input id="ai-url" value={form.baseUrl} placeholder="https://…/v1" onChange={e => field('baseUrl', e.target.value)}/>
    <div className="ai-form-row"><div><label className="field-label" htmlFor="ai-model">模型名</label><input id="ai-model" value={form.model} onChange={e => field('model',e.target.value)}/></div><div><label className="field-label" htmlFor="ai-protocol">接口类型</label><select id="ai-protocol" value={form.protocol} onChange={e => field('protocol', e.target.value as 'responses' | 'chat')}><option value="responses">Responses</option><option value="chat">Chat Completions</option></select></div></div>
    <label className="field-label" htmlFor="ai-key">API Key {settings?.hasKey && <span>已保存，留空保持不变</span>}</label>
    <input id="ai-key" type="password" autoComplete="off" value={key} placeholder={settings?.hasKey ? '••••••••（已加密保存）' : '输入服务商提供的 API Key'} onChange={e => setKey(e.target.value)}/>
    <label className="check-row"><input type="checkbox" checked={form.enabled} onChange={e => field('enabled', e.target.checked)}/><span>启用 AI 分析与智能搜索</span></label>
    <label className="check-row"><input type="checkbox" checked={form.autoAnalyze} onChange={e => field('autoAnalyze', e.target.checked)}/><span>自动分析新导入的图片</span></label>
    <p className="input-hint">分析时将发送图片的压缩预览、文件名与备注到上方服务；智能搜索发送查询和候选素材的文字分析。原图仍在本地。</p>
    <details className="pricing-details"><summary>用量与费用估算设置（可选）</summary><p className="settings-help">第三方代理价格以你的服务商账单为准。填写每百万 token 的美元单价后显示估算；留空只记录 token 用量。</p><div className="ai-form-row"><div><label className="field-label" htmlFor="input-price">输入 / 百万 tokens</label><input id="input-price" type="number" min="0" step="0.01" value={form.inputPrice ?? ''} onChange={e => field('inputPrice',e.target.value === '' ? null : Number(e.target.value))}/></div><div><label className="field-label" htmlFor="output-price">输出 / 百万 tokens</label><input id="output-price" type="number" min="0" step="0.01" value={form.outputPrice ?? ''} onChange={e => field('outputPrice',e.target.value === '' ? null : Number(e.target.value))}/></div></div></details>
    <div className="ai-button-row"><button className="button" disabled={busy} onClick={() => void save(true)}>{busy ? '连接处理中…' : '保存并测试图片识别'}</button><button className="button primary" disabled={busy} onClick={() => void save()}>保存配置</button></div>
    {feedback && <p className="ai-feedback"><CheckCircle size={16}/>{feedback}</p>}
    {status && <div className="ai-queue"><h3>分析队列</h3><div className="queue-counts"><span>未分析 <b>{status.unprocessed}</b></span><span>等待 <b>{status.pending}</b></span><span>已完成 <b>{status.completed}</b></span><span>失败 <b>{status.failed}</b></span></div>
      {status.running > 0 && <p className="settings-help">正在分析：{status.current}</p>}
      {status.paused && <p className="settings-help">队列已暂停。点击继续后处理等待中的素材。</p>}
      <div className="ai-button-row"><button className="button" disabled={!status.configured || !status.enabled || status.unprocessed === 0} onClick={() => void queue('unprocessed')}><Play size={15}/>补标已有图片</button><button className="button" disabled={!status.configured || !status.enabled} onClick={() => void window.library.pauseAI(!status.paused).then(onChanged).catch(report)}>{status.paused ? <Play size={15}/> : <Pause size={15}/>} {status.paused ? '继续队列' : '暂停队列'}</button>{status.failed > 0 && <button className="button" onClick={() => void queue('failed')}><ArrowClockwise size={15}/>重试失败</button>}</div>
      {status.lastError && <p className="inline-error">{status.lastError}</p>}
      {status.failures.length > 0 && <details className="pricing-details"><summary>失败详情</summary>{status.failures.map(f => <p className="settings-help" key={f.id}><WarningCircle size={12}/> {f.title}：{f.error}</p>)}</details>}
      <p className="usage-line">本库累计 {status.usage.calls} 次模型响应 · 输入 {status.usage.inputTokens.toLocaleString()} / 输出 {status.usage.outputTokens.toLocaleString()} tokens</p>
      <p className="input-hint">{status.usage.estimatedCost == null ? '未设置单价，费用请查看服务商账单。' : `已计价调用估算 $${status.usage.estimatedCost.toFixed(4)}${status.usage.unpricedCalls ? `，另有 ${status.usage.unpricedCalls} 次未计价调用` : ''}。`}中断且未返回用量的请求不计入此统计。</p>
    </div>}
  </section>
}
