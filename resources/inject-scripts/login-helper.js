/**
 * 登录辅助 — 仅在被 auto-login 显式调用时工作，不自动干扰页面
 */
(function () {
  if (window.__xhsLoginHelper) return
  window.__xhsLoginHelper = { version: '1.3.0' }

  function findEmailInput() {
    return (
      document.querySelector('input[type="email"]') ||
      document.querySelector('input[name="email"]') ||
      document.querySelector('input[autocomplete="username"]') ||
      document.querySelector('input[placeholder*="邮箱"]') ||
      document.querySelector('input[placeholder*="账号"]') ||
      document.querySelector('input[placeholder*="手机"]') ||
      document.querySelector('.login-box input[type="text"]') ||
      document.querySelector('#app input[type="text"]')
    )
  }

  function clickAccountTab() {
    const tabSelectors = [
      '.login-box .login-tab div',
      '.login-tab-item',
      '.login-box [role="tab"]',
      '.ant-tabs-tab'
    ]
    for (const sel of tabSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        const text = (el.textContent || '').trim()
        if (/^(账号|邮箱|密码登录|账号登录|手机|验证码登录|短信登录)$/i.test(text) ||
          (/账号登录|密码登录|account/i.test(text) && text.length < 12)) {
          el.click()
          return true
        }
      }
    }
    return false
  }

  function hideScanPanelOnly() {
    const safeSelectors = [
      '.login-box .scan-login',
      '.login-box .warp-icon',
      '.login-box .qrcode-login',
      '.login-qrcode'
    ]
    for (const sel of safeSelectors) {
      document.querySelectorAll(sel).forEach((el) => {
        if (el.querySelector('input[type="email"], input[type="password"], input[type="text"]')) return
        el.style.display = 'none'
      })
    }
    document.querySelectorAll('.login-box .login-tab div, .login-tab-item, .ant-tabs-tab').forEach((tab) => {
      const text = (tab.textContent || '').trim()
      if (/^扫码|^二维码|^scan$/i.test(text)) {
        tab.style.display = 'none'
      }
    })
  }

  function hideSubLoginElements() {
    clickAccountTab()
    const emailInput = findEmailInput()
    if (emailInput) {
      hideScanPanelOnly()
      return { ok: true, hasEmail: true }
    }
    return { ok: false, hasEmail: false }
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
    const desc = Object.getOwnPropertyDescriptor(proto, 'value')
    if (desc && desc.set) desc.set.call(el, value)
    else el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function enterLoginInfo(email, password) {
    if (!email) return { ok: false, reason: 'no_email' }
    hideSubLoginElements()

    const emailInput = findEmailInput()
    if (!emailInput) return { ok: false, reason: 'no_email_input' }

    setNativeValue(emailInput, email)
    emailInput.focus()

    const pwdInput =
      document.querySelector('input[type="password"]') ||
      document.querySelector('input[name="password"]') ||
      document.querySelector('.login-box input[type="password"]')

    if (password && pwdInput) setNativeValue(pwdInput, password)
    return { ok: true, hasPassword: !!pwdInput && !!password }
  }

  function clickLoginButton() {
    const btn =
      document.querySelector('.login-box button[type="submit"]') ||
      document.querySelector('.login-box .login-btn') ||
      document.querySelector('button.ant-btn-primary') ||
      Array.from(document.querySelectorAll('button')).find((b) =>
        /登录|登 录|sign in|登陆/i.test(b.textContent || '')
      )
    if (!btn) return { ok: false, reason: 'no_button' }
    btn.click()
    return { ok: true }
  }

  function isDashboardRendered() {
    const app = document.querySelector('#app')
    if (!app) return false
    if (window.location.pathname.includes('/login')) return false
    if (document.querySelector('.login-box, form[action*="login"]')) return false

    const visible = Array.from(app.querySelectorAll('*')).filter((el) => {
      if (!(el instanceof HTMLElement)) return false
      const s = getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden') return false
      const r = el.getBoundingClientRect()
      return r.width > 10 && r.height > 10
    })
    return visible.length > 5
  }

  window.__xhsLoginHelper.hideSubLoginElements = hideSubLoginElements
  window.__xhsLoginHelper.enterLoginInfo = enterLoginInfo
  window.__xhsLoginHelper.clickLoginButton = clickLoginButton
  window.__xhsLoginHelper.isDashboardRendered = isDashboardRendered
})()
