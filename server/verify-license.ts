/**
 * 卡密验证工具
 * 使用公钥验证卡密是否有效
 *
 * 运行：npm run license:verify -- --device=ABCD1234EFGH5678 --license="卡密内容"
 */
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

function loadPublicKey(): string {
  const keyPath = path.join(__dirname, 'public_key.pem')
  if (!fs.existsSync(keyPath)) {
    console.error('❌ 未找到公钥文件 public_key.pem')
    console.error('   请先运行: npm run license:generate-key')
    process.exit(1)
  }
  return fs.readFileSync(keyPath, 'utf8')
}

function verifyLicense(deviceCode: string, licenseKey: string): { valid: boolean; reason: string } {
  const publicKey = loadPublicKey()

  // 解析卡密
  const parts = licenseKey.split('-')
  if (parts.length < 4) {
    return { valid: false, reason: '卡密格式无效' }
  }

  const devicePart = parts[0]
  const timestampPart = parts[1]
  const saltPart = parts[2]
  const signaturePart = parts.slice(3).join('-')

  // 验证设备码
  const currentDevicePart = deviceCode.toUpperCase().substring(0, 8)
  if (devicePart !== currentDevicePart) {
    return { valid: false, reason: '设备码不匹配' }
  }

  // 验证过期时间
  const expiresAt = new Date(parseInt(timestampPart) * 1000)
  if (Date.now() > expiresAt.getTime()) {
    return { valid: false, reason: `卡密已过期（过期时间: ${expiresAt.toISOString()}）` }
  }

  // 验证签名
  const dataToSign = `${devicePart}-${timestampPart}-${saltPart}`
  const verify = crypto.createVerify('SHA256')
  verify.update(dataToSign)
  const isValid = verify.verify(publicKey, signaturePart, 'base64')

  if (!isValid) {
    return { valid: false, reason: '签名验证失败' }
  }

  return {
    valid: true,
    reason: `验证通过，有效期至 ${expiresAt.toISOString()}`
  }
}

function main() {
  const args = process.argv.slice(2)
  let deviceCode = ''
  let licenseKey = ''

  for (const arg of args) {
    if (arg.startsWith('--device=')) {
      deviceCode = arg.substring(9)
    } else if (arg.startsWith('--license=')) {
      licenseKey = arg.substring(10)
    }
  }

  if (!deviceCode || !licenseKey) {
    console.log('用法: npm run license:verify -- --device=<16位设备码> --license=<卡密>')
    process.exit(0)
  }

  console.log('=== 卡密验证 ===')
  console.log(`设备码: ${deviceCode}`)
  console.log('')

  const result = verifyLicense(deviceCode, licenseKey)

  if (result.valid) {
    console.log('✅ 验证成功')
  } else {
    console.log('❌ 验证失败')
  }
  console.log(`原因: ${result.reason}`)
}

main()
