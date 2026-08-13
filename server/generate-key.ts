/**
 * RSA 密钥对生成器
 * 用于生成发卡系统的公钥和私钥
 *
 * 运行：npm run license:generate-key
 *
 * 生成后：
 * - private_key.pem 保存到服务器（用于签发卡密）
 * - public_key.pem 嵌入到客户端（用于验证卡密）
 */
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

const KEY_DIR = path.resolve(__dirname)

function generateKeyPair() {
  console.log('正在生成 RSA 密钥对...')

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  })

  // 保存私钥（服务器端）
  const privateKeyPath = path.join(KEY_DIR, 'private_key.pem')
  fs.writeFileSync(privateKeyPath, privateKey)
  console.log(`✅ 私钥已保存: ${privateKeyPath}`)
  console.log('   ⚠️  请妥善保管，不要泄露！')

  // 保存公钥（客户端）
  const publicKeyPath = path.join(KEY_DIR, 'public_key.pem')
  fs.writeFileSync(publicKeyPath, publicKey)
  console.log(`✅ 公钥已保存: ${publicKeyPath}`)
  console.log('   请将公钥内容嵌入到 electron/services/license.service.ts 中的 PUBLIC_KEY 常量')

  // 输出公钥内容（方便复制）
  console.log('\n=== 公钥内容（复制到客户端）===')
  console.log(publicKey)

  return { publicKey, privateKey }
}

generateKeyPair()
