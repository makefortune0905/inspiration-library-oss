import { app, safeStorage } from 'electron'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { configSchema, DEFAULT_AI, type AIConfigInput, type AIConnection, type AISettings } from '../../shared/ai'

export class AISettingsStore {
  private connection: AIConnection | null = null
  private error = ''
  private file = path.join(app.getPath('userData'), 'ai-settings.json')
  async load() {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8'))
      const config = configSchema.parse(saved.config)
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统密钥加密服务暂不可用。')
      const apiKey = saved.encryptedKey ? safeStorage.decryptString(Buffer.from(saved.encryptedKey, 'base64')) : ''
      this.connection = { ...config, apiKey }; this.error = ''
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') this.error = '无法读取 AI 配置或解密密钥，请重新配置。'
    }
  }
  publicSettings(): AISettings {
    if (!this.connection) return { ...DEFAULT_AI, hasKey: false, error: this.error || undefined }
    const { apiKey, ...config } = this.connection
    return { ...config, hasKey: !!apiKey, error: this.error || undefined }
  }
  getConnection() { return this.connection }
  async save(input: AIConfigInput) {
    const config = configSchema.parse(input)
    config.baseUrl = config.baseUrl.replace(/\/+$/, '')
    let apiKey = input.apiKey?.trim() || this.connection?.apiKey || ''
    if (input.apiKey === '') apiKey = ''
    if (input.apiKey == null && this.connection && new URL(config.baseUrl).origin !== new URL(this.connection.baseUrl).origin) throw new Error('更换服务域名时请重新输入密钥，避免把旧密钥发送给其他服务。')
    if (apiKey.length > 4096 || /[\r\n]/.test(apiKey)) throw new Error('API Key 格式无效。')
    if (config.enabled && !apiKey) throw new Error('开启 AI 前请填写 API Key。')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统密钥加密不可用，未保存明文密钥。')
    const encryptedKey = apiKey ? safeStorage.encryptString(apiKey).toString('base64') : ''
    await mkdir(app.getPath('userData'), { recursive: true })
    const temp = this.file + '.tmp'
    await writeFile(temp, JSON.stringify({ config, encryptedKey }), { mode: 0o600 })
    await rename(temp, this.file)
    this.connection = { ...config, apiKey }; this.error = ''
    return this.publicSettings()
  }
}
