import { z } from 'zod'
import { CATEGORIES } from './types'
const labels = z.array(z.string().max(100)).max(20)
export const analysisSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(3000),
  categories: z.array(z.enum(CATEGORIES)).max(4),
  subjects: labels, styles: labels, moods: labels, composition: labels, typography: labels,
  materials: labels, lighting: labels, useCases: labels, industries: labels,
  colors: z.array(z.object({ name: z.string().max(40), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).max(8),
  textInImage: z.string().max(2000),
  artist: z.string().max(100), artistEvidence: z.string().max(300),
  styleReferences: labels, tags: z.array(z.string().max(100)).max(60),
  prompt: z.string().max(3000), uncertainties: labels
})
export type DesignAnalysis = z.infer<typeof analysisSchema>
export interface AssetAnalysis {
  data: DesignAnalysis | null; status: 'unprocessed' | 'queued' | 'running' | 'done' | 'failed'
  error: string; updatedAt: string | null; model: string; revision: string
}
export const configSchema = z.object({
  baseUrl: z.string().max(2000).url().refine(value => {
    const u = new URL(value)
    return !u.username && !u.password && !u.search && !u.hash && (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))
  }, '服务地址需使用 HTTPS，不含查询参数或内嵌密码。'),
  model: z.string().trim().min(1).max(150),
  protocol: z.enum(['responses','chat']),
  enabled: z.boolean(), autoAnalyze: z.boolean(),
  inputPrice: z.number().min(0).max(10000).nullable(), outputPrice: z.number().min(0).max(10000).nullable()
})
export type AIConfig = z.infer<typeof configSchema>
export interface AISettings extends AIConfig { hasKey: boolean; error?: string }
export interface AIConfigInput extends AIConfig { apiKey?: string }
export interface AIConnection extends AIConfig { apiKey: string }
export const DEFAULT_AI: AIConfig = { baseUrl: 'https://api.openai.com/v1', model: 'gpt-6-astra', protocol: 'responses', enabled: false, autoAnalyze: true, inputPrice: null, outputPrice: null }
export interface AIStatus {
  configured: boolean; enabled: boolean; paused: boolean; pending: number; running: number; completed: number; failed: number; unprocessed: number
  current: string; revision: number; lastError: string
  usage: { calls: number; inputTokens: number; outputTokens: number; estimatedCost: number | null; unpricedCalls: number }
  failures: { id: string; title: string; error: string }[]
}
export interface ConnectionTest { ok: boolean; message: string; inputTokens: number; outputTokens: number }
export const DIMENSIONS: [keyof DesignAnalysis, string][] = [
  ['subjects','画面内容'], ['styles','视觉风格'], ['moods','情绪氛围'], ['composition','布局构图'], ['typography','字体排版'],
  ['materials','材质质感'], ['lighting','光影'], ['useCases','适用场景'], ['industries','行业'], ['styleReferences','风格参考']
]
