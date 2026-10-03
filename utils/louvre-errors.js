export class LouvreError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = 'LouvreError';
    this.code = code;
  }
}
export const louvreErrorMessages = {
  SOURCE: '未能识别图片来源，请重新发送图片或使用 @头像。',
  ASSETS: '滤镜资源文件缺失或无法读取，请联系管理员检查安装是否完整。',
  DOWNLOAD: '图片下载失败，链接可能已失效或网络连接异常。',
  DOWNLOAD_TIMEOUT: '图片下载超时，请稍后重试或更换图片。',
  SIZE: '图片超过限制（文件15 MiB、原图4000万像素），请缩小后重试。',
  BROWSER: '无法获取或创建浏览器页面，请联系管理员检查 Yunzai 浏览器配置及版本兼容性。',
  DECODE: '无法读取输入图片，请转换为 JPG 或 PNG 后重试。',
  ASSET_DECODE: '滤镜纹理或水印无法解码，请联系管理员检查资源文件。',
  TIMEOUT: '图片处理超时，请缩小图片或稍后重试。',
  RENDER: '滤镜执行失败，请联系管理员查看后台日志。',
  SEND: '图片已生成，但发送失败，请稍后重试或联系管理员检查消息适配器。',
};
export function louvreErrorReply(error) {
  return louvreErrorMessages[error?.code] || '图片处理发生未知异常，请联系管理员查看后台日志。';
}
