;(function () {
  const orderInput = document.getElementById('orderId')
  const claimBtn = document.getElementById('claimBtn')
  const statusMsg = document.getElementById('statusMsg')
  const resultBox = document.getElementById('resultBox')
  const resultUrl = document.getElementById('resultUrl')
  const copyBtn = document.getElementById('copyBtn')
  const openLink = document.getElementById('openLink')

  function setStatus(text, kind) {
    if (!text) {
      statusMsg.hidden = true
      statusMsg.textContent = ''
      statusMsg.className = 'status'
      return
    }
    statusMsg.hidden = false
    statusMsg.textContent = text
    statusMsg.className = 'status' + (kind ? ' is-' + kind : '')
  }

  function showResult(url) {
    resultBox.hidden = false
    resultUrl.value = url
    openLink.href = url
  }

  async function claim() {
    const orderId = String(orderInput.value || '').trim()
    if (!orderId) {
      setStatus('请输入订单号', 'error')
      orderInput.focus()
      return
    }
    claimBtn.disabled = true
    setStatus('正在领取…')
    resultBox.hidden = true
    try {
      const res = await fetch('/api/order-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      const body = await res.json().catch(() => ({}))
      const ok = body && Number(body.code) === 200
      const data = body && body.data != null ? body.data : body
      if (!ok) {
        setStatus((body && (body.message || body.msg)) || '领取失败，请稍后重试', 'error')
        return
      }
      const url = String((data && data.url) || '').trim()
      if (!url) {
        setStatus('未返回链接，请联系客服', 'error')
        return
      }
      showResult(url)
      setStatus((body && body.message) || '领取成功', 'ok')
    } catch (e) {
      setStatus('网络异常，请稍后重试', 'error')
    } finally {
      claimBtn.disabled = false
    }
  }

  async function copyUrl() {
    const url = String(resultUrl.value || '').trim()
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setStatus('已复制到剪贴板', 'ok')
    } catch {
      resultUrl.select()
      document.execCommand('copy')
      setStatus('已复制到剪贴板', 'ok')
    }
  }

  claimBtn.addEventListener('click', claim)
  copyBtn.addEventListener('click', copyUrl)
  orderInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      claim()
    }
  })

  const params = new URLSearchParams(location.search)
  const preset = params.get('orderId') || params.get('order_id') || ''
  if (preset) {
    orderInput.value = preset
  }
})()
