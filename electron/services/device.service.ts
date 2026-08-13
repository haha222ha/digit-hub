import * as crypto from 'crypto'
import * as si from 'systeminformation'

export interface HardwareInfo {
  cpuId: string
  boardSerial: string
  diskSerial: string
  macAddress: string
}

export class DeviceService {
  private cachedDeviceCode: string | null = null

  /**
   * 采集硬件指纹信息
   */
  async getHardwareInfo(): Promise<HardwareInfo> {
    try {
      const [cpu, baseboard, disks, network] = await Promise.all([
        si.cpu(),
        si.baseboard(),
        si.diskLayout(),
        si.networkInterfaces()
      ])

      // CPU ID（systeminformation 的 CpuData 无 serial/processorId，使用品牌+核心数作为标识）
      const cpuId = (cpu as any).serial || (cpu as any).processorId || `${cpu.manufacturer}-${cpu.brand}-${cpu.cores}` || 'UNKNOWN_CPU'

      // 主板序列号
      const boardSerial = baseboard.serial || 'UNKNOWN_BOARD'

      // 磁盘序列号（取第一块物理磁盘）
      const diskSerial = disks.length > 0
        ? (disks[0].serialNum || 'UNKNOWN_DISK')
        : 'UNKNOWN_DISK'

      // MAC 地址（取第一个物理网卡）
      let macAddress = 'UNKNOWN_MAC'
      const defaultInterface = network.find(
        (n) => n.iface && n.mac && n.ip4 && !n.virtual
      )
      if (defaultInterface) {
        macAddress = defaultInterface.mac.replace(/:/g, '').toUpperCase()
      }

      return { cpuId, boardSerial, diskSerial, macAddress }
    } catch {
      return {
        cpuId: 'FALLBACK_CPU',
        boardSerial: 'FALLBACK_BOARD',
        diskSerial: 'FALLBACK_DISK',
        macAddress: 'FALLBACK_MAC'
      }
    }
  }

  /**
   * 生成设备码（16位大写）
   * 算法：SHA256(CPU_ID + Board_SN + Disk_SN + MAC) → 取前16位
   */
  async getDeviceCode(): Promise<string> {
    if (this.cachedDeviceCode) {
      return this.cachedDeviceCode
    }

    const info = await this.getHardwareInfo()
    const raw = `${info.cpuId}${info.boardSerial}${info.diskSerial}${info.macAddress}`

    const hash = crypto.createHash('sha256').update(raw).digest('hex')
    this.cachedDeviceCode = hash.substring(0, 16).toUpperCase()

    return this.cachedDeviceCode
  }

  /**
   * 验证设备码是否匹配
   */
  async verifyDeviceCode(deviceCode: string): Promise<boolean> {
    const currentCode = await this.getDeviceCode()
    return currentCode === deviceCode.toUpperCase()
  }
}