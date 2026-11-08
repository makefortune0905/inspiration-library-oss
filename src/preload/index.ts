import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppAPI } from '../shared/types'
const invoke = (name: string, ...args: unknown[]) => ipcRenderer.invoke('library:' + name, ...args)
const api: AppAPI = {
  aiSettings: () => invoke('aiSettings'), saveAISettings: config => invoke('saveAISettings', config),
  testAIConnection: () => invoke('testAIConnection'), aiStatus: () => invoke('aiStatus'),
  enqueueAI: (scope,id) => invoke('enqueueAI',scope,id), pauseAI: paused => invoke('pauseAI',paused),
  settings: () => invoke('settings'), createLibrary: value => invoke('createLibrary', value), openLibrary: () => invoke('openLibrary'),
  info: () => invoke('info'), list: q => invoke('list', q), get: id => invoke('get', id), update: (id, p) => invoke('update', id, p),
  collections: () => invoke('collections'), createCollection: n => invoke('createCollection', n), renameCollection: (id, n) => invoke('renameCollection', id, n),
  importFiles: mode => invoke('importFiles', mode), importPaths: p => invoke('importPaths', p), importStatus: () => invoke('importStatus'),
  rememberSearch: s => invoke('rememberSearch', s), clearSearches: () => invoke('clearSearches'), rememberAsset: id => invoke('rememberAsset', id),
  reveal: id => invoke('reveal', id), copyImage: id => invoke('copyImage', id), openSource: id => invoke('openSource', id),
  pathsForFiles: files => files.map(f => webUtils.getPathForFile(f)).filter(Boolean)
}
contextBridge.exposeInMainWorld('library', api)
