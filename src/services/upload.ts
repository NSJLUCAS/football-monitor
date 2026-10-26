import { safeImageUrl } from '../domain/config'
import { record } from '../domain/normalize'
import { inspectImage } from '../../shared/image-content'
export interface ImageUploader {
  upload(blob: Blob, nodeId: number): Promise<string>
}
export class WorkerUploader implements ImageUploader {
  constructor(
    private endpoint: string,
    private fetcher: typeof fetch = fetch,
  ) {
    if (!safeImageUrl(endpoint)) throw new Error('上传服务必须使用公开 HTTPS 地址')
  }
  async upload(blob: Blob, nodeId: number): Promise<string> {
    const info = inspectImage(new Uint8Array(await blob.arrayBuffer()))
    if (!Number.isSafeInteger(nodeId) || nodeId < 1) throw new Error('节点 ID 无效')
    const response = await this.fetcher(this.endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': info.mime, 'x-node-id': String(nodeId) },
      body: blob,
      signal: AbortSignal.timeout(45000),
      redirect: 'error',
    })
    if (!response.ok)
      throw new Error(
        response.status === 401 || response.status === 403
          ? '上传身份验证失败，请先打开上传服务完成 Cloudflare Access 登录'
          : response.status === 429
            ? '上传过于频繁，请稍后重试'
            : `图片上传失败（HTTP ${response.status}）`,
      )
    const result = record(await response.json())
    if (typeof result.url !== 'string' || !safeImageUrl(result.url))
      throw new Error('上传服务没有返回合法的持久 HTTPS 图片地址')
    return result.url
  }
}
