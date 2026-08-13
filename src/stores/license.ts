import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface LicenseInfo {
  deviceCode: string
  licenseKey: string
  activatedAt: string
  expiresAt: string | null
  status: 'active' | 'expired' | 'trial' | 'unactivated'
  trialDaysLeft: number
}

export const useLicenseStore = defineStore('license', () => {
  const info = ref<LicenseInfo | null>(null)
  const isValid = ref(false)

  async function checkStatus() {
    if (!window.electronAPI) return
    info.value = await window.electronAPI.getLicenseStatus()
    isValid.value = info.value?.status === 'active' ||
      (info.value?.status === 'trial' && info.value.trialDaysLeft > 0)
  }

  async function activate(licenseKey: string) {
    if (!window.electronAPI) return { success: false, message: 'Electron API 不可用' }
    const result = await window.electronAPI.activateLicense(licenseKey)
    if (result.success) {
      await checkStatus()
    }
    return result
  }

  async function getDeviceCode() {
    if (!window.electronAPI) return ''
    return await window.electronAPI.getDeviceCode()
  }

  return { info, isValid, checkStatus, activate, getDeviceCode }
})