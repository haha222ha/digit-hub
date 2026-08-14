/** 与 electron/services/auto-login.service.ts 保持一致 */
export const XHS_DASHBOARD_URL = 'https://walle.xiaohongshu.com/cstools/seller/dashboard'
export const XHS_CHAT_URL = 'https://walle.xiaohongshu.com/cstools/chat'
/**
 * 客服工作台登录页（阿奇锁 LoginUrl）
 * - 主界面只开这一套：会话 / 发激活码话术
 * - 订单探测走同域 API，不要打开 ark 商家后台页面给用户看
 */
export const XHS_LOGIN_URL = 'https://walle.xiaohongshu.com/cstools/login'
