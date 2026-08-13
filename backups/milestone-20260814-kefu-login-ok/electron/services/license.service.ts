import * as crypto from 'crypto'
import { StorageService } from './storage.service'
import { DeviceService } from './device.service'
import { LoggerService } from './logger.service'

// 内嵌的 RSA 公钥（用于验证卡密签名）
// 实际部署时由 server/generate-key.ts 生成并替换
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtrF3ddxhuWJDT57b3TQJ
OuIcrT32hCdDHf7y+XmCoWhEeoDMzMhJSQD4E73SdysEwXnGiZVGKMXI97V5uDEL
hwz2IUuyqHxhf54HIgXr0lzVTipJtUkdpYmTNFMxouTQqswaF8dUI0PY7BELlTOu
c+mA11f6yet/ygIqW+rPV4/UovYTCenJTy7WlQNcYkCbXImwFIRc7X4Al7XcMBeW
5kLKPyheHKxTqZydOoy28a6b89M2O7VyGWf+tjwhROGBfqzpNcpF5qg5/N4kTNP7
k98fAVWv0vRPY/lbInhCM0zArQB3J5unoQTE3x56cAhzW9ZFx601mMivi1Z8hjWb
ywIDAQAB
-----END PUBLIC KEY-----`

export type LicenseEdition = 'basic' | 'pro' | 'enterprise' | 'trial'

export interface LicenseInfo {
  deviceCode: string
  licenseKey: string
  activatedAt: string
  expiresAt: string | null
  status: 'active' | 'expired' | 'trial' | 'unactivated'
  trialDaysLeft: number
  edition: LicenseEdition
  features: string[]
}

/**
 * 各版本功能权限矩阵
 */
export const EDITION_FEATURES: Record<LicenseEdition, string[]> = {
  trial: [
    'dashboard',
    'manual_ship'
  ],
  basic: [
    'dashboard',
    'manual_ship',
    'auto_ship_text',
    'reply_rules',
    'single_shop'
  ],
  pro: [
    'dashboard',
    'manual_ship',
    'auto_ship_text',
    'auto_ship_card',
    'auto_ship_link',
    'reply_rules',
    'auto_reply',
    'multi_shop',
    'sub_account',
    'ship_log_export'
  ],
  enterprise: [
    'dashboard',
    'manual_ship',
    'auto_ship_text',
    'auto_ship_card',
    'auto_ship_link',
    'reply_rules',
    'auto_reply',
    'multi_shop',
    'sub_account',
    'ship_log_export',
    'api_access',
    'white_label',
    'priority_support',
    'unlimited_shops'
  ]
}

/**
 * 各版本店铺数量限制
 */
export const EDITION_SHOP_LIMITS: Record<LicenseEdition, number> = {
  trial: 1,
  basic: 1,
  pro: 5,
  enterprise: 999
}

export interface ActivateResult {
  success: boolean
  message: string
  licenseInfo?: LicenseInfo
}

export class LicenseService {
  private TRIAL_DAYS = 3

  constructor(
    private storage: StorageService,
    private device: DeviceService,
    private logger: LoggerService
  ) {}

  /**
   * 检查授权状态
   */
  async checkLicense(): Promise<boolean> {
    const licenseData = this.storage.get('license')
    const trialStart = this.storage.get('trialStart')

    if (!licenseData) {
      // 无授权，检查试用期
      if (!trialStart) {
        // 开始试用
        this.storage.set('trialStart', Date.now())
        this.logger.info('试用期已开始')
        return true
      }

      const trialDays = this.getTrialDaysLeft(trialStart as number)
      if (trialDays <= 0) {
        this.logger.warn('试用期已过期')
        return false
      }

      this.logger.info(`试用期剩余 ${trialDays} 天`)
      return true
    }

    const info = licenseData as LicenseInfo

    // 检查过期
    if (info.expiresAt) {
      const expiresAt = new Date(info.expiresAt).getTime()
      if (Date.now() > expiresAt) {
        info.status = 'expired'
        this.storage.set('license', info)
        return false
      }
    }

    // 验证设备码
    const deviceCode = await this.device.getDeviceCode()
    if (info.deviceCode !== deviceCode) {
      this.logger.warn('设备码不匹配，可能更换了硬件')
      return false
    }

    return info.status === 'active'
  }

  /**
   * 激活卡密
   * 卡密格式：{设备码前8位}-{版本标记}-{过期时间戳}-{随机盐}-{RSA签名}
   * 版本标记：BAS=基础, PRO=专业, ENT=企业
   */
  async activate(licenseKey: string): Promise<ActivateResult> {
    try {
      // 1. 解析卡密
      const parts = licenseKey.split('-')
      if (parts.length < 5) {
        return { success: false, message: '卡密格式无效' }
      }

      const deviceCodePart = parts[0] // 设备码前8位
      const editionPart = parts[1]    // 版本标记 BAS/PRO/ENT
      const timestampPart = parts[2]  // 过期时间戳
      const saltPart = parts[3]       // 随机盐
      const signaturePart = parts.slice(4).join('-') // RSA 签名

      // 2. 验证设备码
      const currentDeviceCode = await this.device.getDeviceCode()
      if (deviceCodePart !== currentDeviceCode.substring(0, 8)) {
        return { success: false, message: '卡密与当前设备不匹配' }
      }

      // 3. 解析版本
      const editionMap: Record<string, LicenseEdition> = {
        BAS: 'basic',
        PRO: 'pro',
        ENT: 'enterprise'
      }
      const edition = editionMap[editionPart]
      if (!edition) {
        return { success: false, message: `未知版本标记: ${editionPart}` }
      }

      // 4. 验证签名
      const dataToSign = `${deviceCodePart}-${editionPart}-${timestampPart}-${saltPart}`
      const verify = crypto.createVerify('SHA256')
      verify.update(dataToSign)
      const isValid = verify.verify(PUBLIC_KEY, signaturePart, 'base64')

      if (!isValid) {
        return { success: false, message: '卡密签名验证失败' }
      }

      // 5. 检查过期时间
      const expiresAt = new Date(parseInt(timestampPart) * 1000)
      if (Date.now() > expiresAt.getTime()) {
        return { success: false, message: '卡密已过期' }
      }

      // 6. 保存激活信息
      const licenseInfo: LicenseInfo = {
        deviceCode: currentDeviceCode,
        licenseKey,
        activatedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        status: 'active',
        trialDaysLeft: 0,
        edition,
        features: EDITION_FEATURES[edition]
      }

      this.storage.set('license', licenseInfo)
      this.logger.info(`卡密激活成功 [版本: ${edition}]`)

      return {
        success: true,
        message: `激活成功 [${edition}]`,
        licenseInfo
      }
    } catch (error) {
      this.logger.error('激活失败:', error)
      return { success: false, message: '激活过程出错' }
    }
  }

  /**
   * 获取授权状态
   */
  async getStatus(): Promise<LicenseInfo> {
    const licenseData = this.storage.get('license')
    const trialStart = this.storage.get('trialStart')

    if (licenseData) {
      return licenseData as LicenseInfo
    }

    const trialDaysLeft = trialStart
      ? this.getTrialDaysLeft(trialStart as number)
      : this.TRIAL_DAYS

    const deviceCode = await this.device.getDeviceCode()

    return {
      deviceCode,
      licenseKey: '',
      activatedAt: '',
      expiresAt: null,
      status: trialDaysLeft > 0 ? 'trial' : 'unactivated',
      trialDaysLeft,
      edition: 'trial',
      features: EDITION_FEATURES.trial
    }
  }

  /**
   * 检查是否拥有某项功能权限
   */
  hasFeature(feature: string): boolean {
    const licenseData = this.storage.get('license') as LicenseInfo | null
    if (!licenseData) {
      // 试用版只允许基础功能
      return EDITION_FEATURES.trial.includes(feature)
    }
    return licenseData.features?.includes(feature) ?? false
  }

  /**
   * 获取当前版本可使用的店铺数量上限
   */
  getShopLimit(): number {
    const licenseData = this.storage.get('license') as LicenseInfo | null
    const edition = licenseData?.edition || 'trial'
    return EDITION_SHOP_LIMITS[edition]
  }

  /**
   * 获取当前版本
   */
  getEdition(): LicenseEdition {
    const licenseData = this.storage.get('license') as LicenseInfo | null
    return licenseData?.edition || 'trial'
  }

  private getTrialDaysLeft(trialStart: number): number {
    const elapsed = Date.now() - trialStart
    const daysElapsed = Math.floor(elapsed / (1000 * 60 * 60 * 24))
    return Math.max(0, this.TRIAL_DAYS - daysElapsed)
  }
}