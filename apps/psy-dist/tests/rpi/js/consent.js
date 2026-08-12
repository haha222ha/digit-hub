/**
 * RPI 知情同意书页面逻辑
 * 完全独立的实现，不依赖任何外部框架
 */

/**
 * 获取token
 */
function getToken() {
  // 方法1：从URL查询参数获取（优先，如果找到则保存到localStorage）
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromQuery = urlParams.get('token');
  if (tokenFromQuery) {
    // 保存token到localStorage，供后续页面使用
    localStorage.setItem('rpi_test_token', tokenFromQuery);
    return tokenFromQuery;
  }
  
  // 方法2：从localStorage获取（之前保存的token）
  try {
    const savedToken = localStorage.getItem('rpi_test_token');
    if (savedToken && savedToken.length > 10) {
      return savedToken;
    }
  } catch (e) {
    console.warn('从localStorage获取token失败:', e);
  }
  
  // 方法3：从URL路径中提取（/test/{test_code}/{token}格式）
  const path = window.location.pathname;
  const standardMatch = path.match(/^\/test\/([^\/]+)\/([^\/]+)$/);
  if (standardMatch) {
    const token = standardMatch[2];
    localStorage.setItem('rpi_test_token', token);
    return token;
  }
  
  // 方法4：从localStorage中查找（查找test_result_开头的key）
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('test_result_')) {
        const token = key.replace('test_result_', '').split('_')[0];
        if (token && token.length > 10) {
          localStorage.setItem('rpi_test_token', token);
          return token;
        }
      }
    }
  } catch (e) {
    console.warn('从localStorage获取token失败:', e);
  }
  
  // 方法5：从SDK实例中获取
  if (window.linkValidator && window.linkValidator.token) {
    const token = window.linkValidator.token;
    localStorage.setItem('rpi_test_token', token);
    return token;
  }
  
  return null;
}

/**
 * 构建带token的URL
 */
function buildUrlWithToken(baseUrl) {
  const token = getToken();
  if (token) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    let url = `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
    
    // 如果是无限测试token，同时添加unlimited=true参数
    // 检查token是否以unlimited_开头，或者URL参数中是否有unlimited=true
    const urlParams = new URLSearchParams(window.location.search);
    const isUnlimited = token.startsWith('unlimited_') || urlParams.get('unlimited') === 'true';
    
    // 检查URL中是否已有unlimited参数，避免重复添加
    if (isUnlimited) {
      const targetUrlParams = new URLSearchParams(baseUrl.includes('?') ? baseUrl.split('?')[1] : '');
      if (targetUrlParams.get('unlimited') !== 'true') {
        url += `&unlimited=true`;
      }
    }
    
    return url;
  }
  return baseUrl;
}

// 全局状态
let testType = null; // 'self' 或 'partner'
let agreed = false;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initialize();
});

/**
 * 初始化知情同意书页面
 */
function initialize() {
  try {
    // 从URL参数或localStorage获取测试类型
    const urlParams = new URLSearchParams(window.location.search);
    testType = urlParams.get('type') || localStorage.getItem('rpi_test_type') || 'self';
    
    // 如果没有测试类型，跳转回介绍页面
    if (!testType || (testType !== 'self' && testType !== 'partner')) {
      window.location.href = 'index.html';
      return;
    }
    
    // 保存测试类型
    localStorage.setItem('rpi_test_type', testType);
    
    // 更新测试类型指示器
    updateTestTypeIndicator();
    
    // 隐藏加载提示
    hideLoading();
    
  } catch (error) {
    console.error('初始化失败:', error);
    hideLoading();
    alert('加载失败，请刷新页面重试。');
  }
}

/**
 * 更新测试类型指示器
 */
function updateTestTypeIndicator() {
  const testTypeText = document.getElementById('testTypeText');
  const testTypeIcon = document.querySelector('#testTypeIndicator span');
  
  if (testType === 'self') {
    if (testTypeText) testTypeText.textContent = '给自己测';
    if (testTypeIcon) testTypeIcon.textContent = '💖';
  } else {
    if (testTypeText) testTypeText.textContent = '为恋人测';
    if (testTypeIcon) testTypeIcon.textContent = '💞';
  }
}

/**
 * 切换同意状态
 */
function toggleConsent() {
  agreed = !agreed;
  
  const consentRadio = document.getElementById('consentRadio');
  const consentDot = document.getElementById('consentDot');
  const agreeButton = document.getElementById('agreeButton');
  
  if (consentRadio) {
    if (agreed) {
      consentRadio.classList.add('checked');
      if (consentDot) consentDot.style.display = 'block';
    } else {
      consentRadio.classList.remove('checked');
      if (consentDot) consentDot.style.display = 'none';
    }
  }
  
  if (agreeButton) {
    agreeButton.disabled = !agreed;
  }
}

// 导出到全局作用域以便HTML调用
window.toggleConsent = toggleConsent;

/**
 * 处理同意
 */
function handleAgree() {
  if (!agreed) {
    alert('请先勾选同意条款');
    return;
  }
  
  // 保存同意状态
  localStorage.setItem(`rpi_consent_${testType}`, 'true');
  
  // 跳转到基本信息页面（携带token）
  window.location.href = buildUrlWithToken(`demographic.html?type=${testType}`);
}

// 导出到全局作用域以便HTML调用
window.handleAgree = handleAgree;

/**
 * 处理不同意
 */
function handleDisagree() {
  // 跳转回介绍页面
  window.location.href = 'index.html';
}

// 导出到全局作用域以便HTML调用
window.handleDisagree = handleDisagree;

/**
 * 显示/隐藏加载提示
 */
function showLoading() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = 'flex';
  }
}

function hideLoading() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = 'none';
  }
}

