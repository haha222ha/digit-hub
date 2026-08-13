/**
 * 千帆 Eva 客户端身份（walle-eva 会读 csBridge.appInfo.appVersion 做 semver 校验）
 * 官方 D:\eva 当前 package version = 1.2.6；低于 1.1.35 会弹「版本较低」强更框
 */
export const EVA_CLIENT_VERSION = '1.2.6'
/** 与官方千帆 Electron 25 对齐，避免额外环境检测异常 */
export const EVA_ELECTRON_VERSION = '25.9.8'
