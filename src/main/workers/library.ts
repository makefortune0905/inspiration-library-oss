import { parentPort, workerData } from 'node:worker_threads'
import { LibraryService, friendlyError } from '../services/library'
import { AIService } from '../services/ai-service'
import type { ServiceMethod } from '../../shared/types'
const allowed = new Set<ServiceMethod>(['info','list','get','update','collections','createCollection','renameCollection','importPaths','importStatus','rememberSearch','clearSearches','rememberAsset','filePath','close','configureAI','testAIConnection','aiStatus','enqueueAI','pauseAI'])
LibraryService.open(workerData.root, workerData.create).then(service => {
  const ai = new AIService(service)
  const methods: Record<string, (...args: any[]) => any> = {
    configureAI: config => ai.configure(config), testAIConnection: () => ai.testConnection(), aiStatus: () => ai.status(),
    enqueueAI: (scope, id) => ai.enqueue(scope,id), pauseAI: paused => ai.pause(paused), list: query => ai.list(query || {}),
    close: async () => { await ai.close(); await service.close() }
  }
  parentPort!.on('message', async ({ id, method, args }: { id: number; method: ServiceMethod; args: any[] }) => {
    try {
      if (!allowed.has(method)) throw new Error('未知操作。')
      const result = methods[method] ? await methods[method](...args) : await (service[method as keyof LibraryService] as Function).apply(service, args)
      parentPort!.postMessage({ id, result })
    } catch (e) { parentPort!.postMessage({ id, error: friendlyError(e) }) }
  })
  parentPort!.postMessage({ ready: true, info: service.info() })
}).catch(e => parentPort!.postMessage({ ready: false, error: friendlyError(e) }))
