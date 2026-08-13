/**
 * AES-256-CBC 加密工具
 * 用于 Cookie、密码等敏感数据的加密存储
 */
import * as crypto from 'crypto'

const ALGORITHM = 'aes-256-cbc'
// 32 字节密钥（生产环境应从安全配置读取）
const SECRET_KEY = process.env.ENCRYPT_KEY || 'xhs-shipping-assistant-secret-k' // 32 chars
const IV_LENGTH = 16

// 确保密钥是 32 字节
function getKey(): Buffer {
  const key = Buffer.from(SECRET_KEY.padEnd(32, '0').slice(0, 32), 'utf8')
  return key
}

/**
 * 加密字符串
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

/**
 * 解密字符串
 */
export function decrypt(text: string): string {
  const parts = text.split(':')
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted text format')
  }
  const iv = Buffer.from(parts[0], 'hex')
  const encryptedText = parts[1]
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

/**
 * 生成 RSA 密钥对
 */
export function generateRSAKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })
  return { publicKey, privateKey }
}

/**
 * RSA 签名
 */
export function rsaSign(data: string, privateKey: string): string {
  const sign = crypto.createSign('SHA256')
  sign.update(data)
  return sign.sign(privateKey, 'base64')
}

/**
 * RSA 验签
 */
export function rsaVerify(data: string, signature: string, publicKey: string): boolean {
  try {
    const verify = crypto.createVerify('SHA256')
    verify.update(data)
    return verify.verify(publicKey, signature, 'base64')
  } catch {
    return false
  }
}

/**
 * 生成 MD5 哈希
 */
export function md5(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex')
}

/**
 * 生成 SHA256 哈希
 */
export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex')
}
