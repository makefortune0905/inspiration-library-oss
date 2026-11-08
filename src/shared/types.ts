import type { AssetAnalysis, AIConfigInput, AISettings, AIStatus, ConnectionTest } from './ai'
export const CATEGORIES = ['UI 页面', '组件与交互', 'Banner 与运营', '海报与排版', '品牌视觉', '插画与 3D', '摄影与氛围'] as const
export type Category = typeof CATEGORIES[number]
export interface Asset {
  id: string; hash: string; filename: string; relativePath: string; thumbnailPath: string
  title: string; note: string; sourceUrl: string; tags: string[]; categories: Category[]
  width: number; height: number; bytes: number; format: string; createdAt: string
  collectionIds: string[]
  ai?: AssetAnalysis; effectiveCategories?: Category[]; displayTitle?: string
}
export type AssetPatch = Pick<Asset, 'title' | 'note' | 'sourceUrl' | 'tags' | 'categories' | 'collectionIds'> & { useAICategories?: boolean }
export interface Collection { id: string; name: string; count: number; covers: Asset[] }
export interface ImportJob {
  id: string; status: 'scanning' | 'running' | 'completed' | 'interrupted'
  total: number; processed: number; imported: number; duplicates: number; failed: number
  current: string; errors: { file: string; message: string }[]
}
export interface LibrarySettings { root: string | null; defaultRoot: string; error?: string }
export interface LibraryInfo { root: string; count: number; recentSearches: string[]; recentAssets: Asset[] }
export interface AssetQuery { search?: string; category?: string; collectionId?: string; offset?: number; limit?: number; searchMode?: 'keyword' | 'smart'; analysisStatus?: string }
export interface AssetPage { items: Asset[]; total: number; searchNotice?: string }
export interface AppAPI {
  aiSettings(): Promise<AISettings>
  saveAISettings(config: AIConfigInput): Promise<AISettings>
  testAIConnection(): Promise<ConnectionTest>
  aiStatus(): Promise<AIStatus>
  enqueueAI(scope: 'unprocessed' | 'failed' | 'all' | 'single', id?: string): Promise<AIStatus>
  pauseAI(paused: boolean): Promise<AIStatus>
  settings(): Promise<LibrarySettings>
  createLibrary(useDefault: boolean): Promise<LibraryInfo | null>
  openLibrary(): Promise<LibraryInfo | null>
  info(): Promise<LibraryInfo>
  list(query: AssetQuery): Promise<AssetPage>
  get(id: string): Promise<Asset>
  update(id: string, patch: AssetPatch): Promise<Asset>
  collections(): Promise<Collection[]>
  createCollection(name: string): Promise<Collection>
  renameCollection(id: string, name: string): Promise<void>
  importFiles(mode: 'files' | 'directory'): Promise<ImportJob | null>
  importPaths(paths: string[]): Promise<ImportJob>
  importStatus(): Promise<ImportJob | null>
  rememberSearch(search: string): Promise<void>
  clearSearches(): Promise<void>
  rememberAsset(id: string): Promise<void>
  reveal(id?: string): Promise<void>
  copyImage(id: string): Promise<void>
  openSource(id: string): Promise<void>
  pathsForFiles(files: File[]): string[]
}
export type ServiceMethod = 'info' | 'list' | 'get' | 'update' | 'collections' | 'createCollection' | 'renameCollection' | 'importPaths' | 'importStatus' | 'rememberSearch' | 'clearSearches' | 'rememberAsset' | 'filePath' | 'close' | 'configureAI' | 'testAIConnection' | 'aiStatus' | 'enqueueAI' | 'pauseAI'
export const mediaUrl = (id: string, kind: 'original' | 'thumbnail' = 'thumbnail') => `library://asset/${id}/${kind}`
