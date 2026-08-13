/**
 * 卡密生成器
 * 使用 RSA 私钥对设备码+过期时间进行签名，生成卡密
 *
 * 运行：npm run license:generate -- --device=ABCD1234EFGH5678 --days=30
 *   或：npm run license:generate -- --device=ABCD1234EFGH5678 --permanent
 *
 * 卡密格式：[设备码前8位]-[过期时间戳]-[随机盐]-[RSA签名]
 */
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

interface GenerateOptions {
  deviceCode: string  // 完整设备码（16位）
  days?: number       // 有效天数
  permanent?: boolean // 永久有效
}

function loadPrivateKey(): string {
  const keyPath = path.join(__dirname, 'private_key.pem')
  if (!fs.existsSync(keyPath)) {
    console.error('❌ 未找到私钥文件 private_key.pem')
    console.error('   请先运行: npm run license:generate-key')
    process.exit(1)
  }
  return fs.readFileSync(keyPath, 'utf8')
}

function generateLicense(options: GenerateOptions): string {
  const privateKey = loadPrivateKey()

  const deviceCode = options.deviceCode.toUpperCase()
  if (deviceCode.length !== 16) {
    console.error('❌ 设备码长度必须为16位')
    process.exit(1)
  }

  // 设备码前8位
  const devicePart = deviceCode.substring(0, 8)

  // 过期时间戳
  let expiresAt: Date
  if (options.permanent) {
    // 永久有效：设置为2099年
    expiresAt = new Date('2099-12-31T23:59:59Z')
  } else {
    expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + (options.days || 30))
  }
  const timestampPart = Math.floor(expiresAt.getTime() / 1000).toString()

  // 随机盐（4位）
  const saltPart = crypto.randomBytes(2).toString('hex').toUpperCase()

  // 待签名数据
  const dataToSign = `${devicePart}-${timestampPart}-${saltPart}`

  // RSA 签名
  const sign = crypto.createSign('SHA256')
  sign.update(dataToSign)
  const signature = sign.sign(privateKey, 'base64')

  // 组合卡密
  const licenseKey = `${devicePart}-${timestampPart}-${saltPart}-${signature}`

  return licenseKey
}

// 解析命令行参数
function parseArgs(): GenerateOptions {
  const args = process.argv.slice(2)
  const options: GenerateOptions = {
    deviceCode: '',
    days: 30,
    permanent: false
  }

  for (const arg of args) {
    if (arg.startsWith('--device=')) {
      options.deviceCode = arg.substring(9)
    } else if (arg.startsWith('--days=')) {
      options.days = parseInt(arg.substring(7))
    } else if (arg === '--permanent') {
      options.permanent = true
    }
  }

  if (!options.deviceCode) {
    console.log('用法: npm run license:generate -- --device=<16位设备码> [--days=30] [--permanent]')
    console.log('')
    console.log('示例:')
    console.log('  npm run license:generate -- --device=ABCD1234EFGH5678 --days=30')
    console.log('  npm run license:generate -- --device=ABCD1234EFGH5678 --permanent')
    process.exit(0)
  }

  return options
}

// 主函数
function main() {
  const options = parseArgs()

  console.log('=== 卡密生成器 ===')
  console.log(`设备码: ${options.deviceCode}`)
  console.log(`有效期: ${options.permanent ? '永久' : options.days + ' 天'}`)
  console.log('')

  const licenseKey = generateLicense(options)

  console.log('✅ 卡密生成成功！')
  console.log('')
  console.log('=== 卡密 ===')
  console.log(licenseKey)
  console.log('')

  // 保存到文件
  const savePath = path.join(__dirname, `license_${options.deviceCode.substring(0, 8)}_${Date.now()}.txt`)
  fs.writeFileSync(savePath, licenseKey)
  console.log(`卡密已保存到: ${savePath}`)
}

main()
