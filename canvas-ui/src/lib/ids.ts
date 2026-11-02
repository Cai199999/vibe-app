/** 生成协议要求的带前缀 ID；全部使用内存态，不写入 localStorage。 */

function randomBase64Url(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function createSessionToken(): string {
  return `st_${randomBase64Url(18)}`
}

export function createMessageId(): string {
  return `msg_${randomBase64Url(12)}`
}

export function createAnnotationId(): string {
  return `ann_${randomBase64Url(12)}`
}

export function createRequestId(): string {
  return `req_${randomBase64Url(12)}`
}
