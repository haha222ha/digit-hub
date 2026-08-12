/**
 * RPI 介绍页面逻辑
 * 完全独立的实现，不依赖任何外部框架
 */

import { hasTestResult } from './utils/storage.js';

// 全局状态
let completedTests = {
  self: false,
  partner: false
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initialize();
});

/**
 * 初始化介绍页面
 */
function initialize() {
  // 隐藏加载提示
  hideLoading();
  
  // 检查已完成的测试
  checkCompletedTests();
  
  // 初始化按钮事件
  initializeButtons();
  
  // 初始化弹窗事件
  initializeModals();
}

/**
 * 检查已完成的测试
 */
function checkCompletedTests() {
  completedTests.self = hasTestResult('self');
  completedTests.partner = hasTestResult('partner');
  
  console.log('checkCompletedTests:', {
    self: completedTests.self,
    partner: completedTests.partner,
    localStorageKeys: Object.keys(localStorage).filter(k => k.startsWith('rpi_test_'))
  });
  
  // 更新按钮显示
  updateButtonStates();
}

/**
 * 更新按钮状态
 */
function updateButtonStates() {
  // 更新给自己测按钮
  const selfTestButton = document.getElementById('selfTestButton');
  if (selfTestButton) {
    if (completedTests.self) {
      selfTestButton.innerHTML = `
        <span>✓ 查看自己报告</span>
        <span class="anticon anticon-arrow-right">
          <svg viewBox="64 64 896 896" focusable="false" data-icon="arrow-right" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M869 487.8L491.2 159.9c-2.9-2.5-6.6-3.9-10.5-3.9h-88.5c-7.4 0-10.8 9.2-5.2 14l350.2 304H152c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h585.1L386.9 854c-5.6 4.9-2.2 14 5.2 14h91.5c1.9 0 3.8-.7 5.2-2L869 536.2a32.07 32.07 0 000-48.4z"></path></svg>
        </span>
      `;
      selfTestButton.classList.add('rpi-test-completed');
    } else {
      selfTestButton.innerHTML = `
        <span>💖 给自己测</span>
        <span class="anticon anticon-arrow-right">
          <svg viewBox="64 64 896 896" focusable="false" data-icon="arrow-right" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M869 487.8L491.2 159.9c-2.9-2.5-6.6-3.9-10.5-3.9h-88.5c-7.4 0-10.8 9.2-5.2 14l350.2 304H152c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h585.1L386.9 854c-5.6 4.9-2.2 14 5.2 14h91.5c1.9 0 3.8-.7 5.2-2L869 536.2a32.07 32.07 0 000-48.4z"></path></svg>
        </span>
      `;
      selfTestButton.classList.remove('rpi-test-completed');
    }
  }
  
  // 更新为恋人测按钮
  const partnerTestButton = document.getElementById('partnerTestButton');
  if (partnerTestButton) {
    if (completedTests.partner) {
      partnerTestButton.innerHTML = `
        <span>✓ 查看恋人报告</span>
        <span class="anticon anticon-arrow-right">
          <svg viewBox="64 64 896 896" focusable="false" data-icon="arrow-right" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M869 487.8L491.2 159.9c-2.9-2.5-6.6-3.9-10.5-3.9h-88.5c-7.4 0-10.8 9.2-5.2 14l350.2 304H152c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h585.1L386.9 854c-5.6 4.9-2.2 14 5.2 14h91.5c1.9 0 3.8-.7 5.2-2L869 536.2a32.07 32.07 0 000-48.4z"></path></svg>
        </span>
      `;
      partnerTestButton.classList.add('rpi-test-completed');
    } else {
      partnerTestButton.innerHTML = `
        <span>💞 为恋人测</span>
        <span class="anticon anticon-arrow-right">
          <svg viewBox="64 64 896 896" focusable="false" data-icon="arrow-right" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M869 487.8L491.2 159.9c-2.9-2.5-6.6-3.9-10.5-3.9h-88.5c-7.4 0-10.8 9.2-5.2 14l350.2 304H152c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h585.1L386.9 854c-5.6 4.9-2.2 14 5.2 14h91.5c1.9 0 3.8-.7 5.2-2L869 536.2a32.07 32.07 0 000-48.4z"></path></svg>
        </span>
      `;
      partnerTestButton.classList.remove('rpi-test-completed');
    }
  }
  
  // 更新Hero区域的按钮
  const mainSelfTestButton = document.getElementById('mainSelfTestButton');
  if (mainSelfTestButton) {
    if (completedTests.self) {
      mainSelfTestButton.textContent = '✓ 查看自己报告';
      mainSelfTestButton.classList.add('rpi-btn-completed');
    } else {
      mainSelfTestButton.innerHTML = '<span class="rpi-btn-icon">💖</span> 给自己测';
      mainSelfTestButton.classList.remove('rpi-btn-completed');
    }
  }
  
  const mainPartnerTestButton = document.getElementById('mainPartnerTestButton');
  if (mainPartnerTestButton) {
    if (completedTests.partner) {
      mainPartnerTestButton.textContent = '✓ 查看恋人报告';
      mainPartnerTestButton.classList.add('rpi-btn-completed-secondary');
    } else {
      mainPartnerTestButton.innerHTML = '<span class="rpi-btn-icon">💞</span> 为恋人测';
      mainPartnerTestButton.classList.remove('rpi-btn-completed-secondary');
    }
  }
  
  // 更新卡片样式
  const selfTestCard = document.getElementById('selfTestCard');
  if (selfTestCard) {
    if (completedTests.self) {
      selfTestCard.classList.add('rpi-test-card-completed');
    } else {
      selfTestCard.classList.remove('rpi-test-card-completed');
    }
  }
  
  const partnerTestCard = document.getElementById('partnerTestCard');
  if (partnerTestCard) {
    if (completedTests.partner) {
      partnerTestCard.classList.add('rpi-test-card-completed');
    } else {
      partnerTestCard.classList.remove('rpi-test-card-completed');
    }
  }
}

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

/**
 * 初始化按钮事件
 */
function initializeButtons() {
  // Hero区域的主要行动按钮
  const mainSelfTestButton = document.getElementById('mainSelfTestButton');
  if (mainSelfTestButton) {
    mainSelfTestButton.addEventListener('click', () => {
      handleStartTest('self');
    });
  }
  
  const mainPartnerTestButton = document.getElementById('mainPartnerTestButton');
  if (mainPartnerTestButton) {
    mainPartnerTestButton.addEventListener('click', () => {
      handleStartTest('partner');
    });
  }
  
  // 卡片内的给自己测按钮
  const selfTestButton = document.getElementById('selfTestButton');
  if (selfTestButton) {
    selfTestButton.addEventListener('click', () => {
      handleStartTest('self');
    });
  }
  
  // 卡片内的为恋人测按钮
  const partnerTestButton = document.getElementById('partnerTestButton');
  if (partnerTestButton) {
    partnerTestButton.addEventListener('click', () => {
      handleStartTest('partner');
    });
  }
  
  // CTA按钮
  const ctaButton = document.getElementById('ctaButton');
  if (ctaButton) {
    ctaButton.addEventListener('click', () => {
      scrollToTestSelection();
    });
  }
}

/**
 * 滚动到测试选择区域
 */
function scrollToTestSelection() {
  const testSelection = document.getElementById('test-selection');
  if (testSelection) {
    testSelection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * 获取token（用于传递到其他页面）
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
    // 保存token到localStorage
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
          // 保存token到localStorage
          localStorage.setItem('rpi_test_token', token);
          return token;
        }
      }
    }
  } catch (e) {
    console.warn('从localStorage获取token失败:', e);
  }
  
  // 方法5：从SDK实例中获取（如果已初始化）
  if (window.linkValidator && window.linkValidator.token) {
    const token = window.linkValidator.token;
    // 保存token到localStorage
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

/**
 * 检测是否是无限测试
 * @param {string} token - 测试链接token
 * @returns {boolean} 是否是无限测试
 */
function isUnlimitedTest(token) {
  // 方法1：检查token是否以unlimited_开头
  if (token && token.startsWith('unlimited_')) {
    return true;
  }
  
  // 方法2：检查URL参数中是否有unlimited=true
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('unlimited') === 'true') {
    return true;
  }
  
  // 方法3：检查window.linkValidator
  if (window.linkValidator && window.linkValidator.unlimited) {
    return true;
  }
  
  return false;
}

/**
 * 调用startTest API记录测试开始
 * @param {string} token - 测试链接token
 * @param {string} perspective - 视角类型（'self'或'other'）
 * @returns {Promise<object>} API响应
 */
async function callStartTestAPI(token, perspective) {
  const API_BASE_URL = '/api/links/start-test';
  
  const response = await fetch(API_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token: token,
      perspective: perspective
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `API请求失败: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * 处理开始测试
 */
async function handleStartTest(type) {
  // 检查是否已完成测试
  if (completedTests[type]) {
    // 已完成，跳转到报告页（携带token）
    window.location.href = buildUrlWithToken(`report.html?type=${type}`);
    return;
  }
  
  // 如果有SDK，先验证token是否仍然有效（特别是无限测试模式）
  // 检查是否是无限测试模式
  const token = getToken();
  const isUnlimited = token ? isUnlimitedTest(token) : false;
  
  if (isUnlimited && window.linkValidator && typeof window.linkValidator.validateForUserAction === 'function') {
    try {
      console.log('RPI测试：无限测试模式，开始验证token...', {
        token: token ? token.substring(0, 10) + '...' : null,
        validatorExists: !!window.linkValidator,
        validatorUnlimited: window.linkValidator.unlimited
      });
      
      // 将testType转换为perspective：'self' -> 'self', 'partner' -> 'other'
      const perspective = type === 'self' ? 'self' : 'other';
      // 重新验证token（如果失效会显示弹窗）
      const isValid = await window.linkValidator.validateForUserAction(perspective);
      
      console.log('RPI测试：验证token结果:', { 
        isValid, 
        valid: window.linkValidator.valid,
        error: window.linkValidator.validationError,
        unlimited: window.linkValidator.unlimited
      });
      
      // 检查验证结果
      if (!isValid || window.linkValidator.valid === false) {
        // token已失效，已显示弹窗，阻止继续测试
        console.error('RPI测试：token验证失败，无法开始测试:', window.linkValidator.validationError);
        // 如果弹窗没有显示，手动显示错误提示
        if (!window.linkValidator.validationError || !window.linkValidator.validationError.includes('已失效')) {
          // 等待一下，看看弹窗是否会出现
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        return;
      }
      
      console.log('RPI测试：token验证通过，可以继续测试');
    } catch (error) {
      // 验证失败，已显示弹窗，阻止继续测试
      console.error('RPI测试：token验证过程出错:', error);
      if (window.linkValidator) {
        window.linkValidator.valid = false;
      }
      // 显示错误提示
      alert('测试链接验证失败：' + (error.message || '测试链接无效，请检查链接是否正确'));
      return;
    }
  } else if (isUnlimited && (!window.linkValidator || typeof window.linkValidator.validateForUserAction !== 'function')) {
    // 无限测试模式但SDK未初始化，这是异常情况
    console.error('RPI测试：无限测试模式但SDK未正确初始化');
    alert('测试验证服务未初始化，请刷新页面重试');
    return;
  }
  
  // 未完成，先调用startTest API记录测试开始（如果有token且不是无限测试）
  if (token) {
    // isUnlimited已在上面获取
    console.log('是否无限测试:', isUnlimited);
    
    // 如果是无限测试，跳过API调用
    if (!isUnlimited) {
      try {
        // 将testType转换为perspective：'self' -> 'self', 'partner' -> 'other'
        const perspective = type === 'self' ? 'self' : 'other';
        await callStartTestAPI(token, perspective);
        console.log('测试开始记录已保存到后台');
      } catch (apiError) {
        // 检查是否是次数用完的错误
        const errorMessage = apiError.message || String(apiError);
        if (errorMessage.includes('次数已用完') || errorMessage.includes('使用次数已用完')) {
          // 次数用完，显示错误提示并阻止继续测试
          alert('测试链接使用次数已用完，无法继续测试。');
          console.error('测试链接使用次数已用完，无法继续测试:', apiError);
          return; // 阻止继续测试
        }
        // 其他错误（如网络错误），记录警告但允许继续（可能是网络问题）
        console.warn('保存测试开始记录到后台失败（不影响测试流程）:', apiError);
      }
    } else {
      console.log('无限测试模式，跳过startTest API调用');
    }
  }
  
  // 保存测试类型到localStorage并跳转到知情同意书页面（携带token）
  localStorage.setItem('rpi_test_type', type);
  window.location.href = buildUrlWithToken(`consent.html?type=${type}`);
}

/**
 * 初始化弹窗事件
 */
function initializeModals() {
  // 使用指南链接
  const guideLink = document.getElementById('guideLink');
  if (guideLink) {
    guideLink.addEventListener('click', (e) => {
      e.preventDefault();
      showGuideModal();
    });
  }
  
  // 科学依据链接
  const scienceLink = document.getElementById('scienceLink');
  if (scienceLink) {
    scienceLink.addEventListener('click', (e) => {
      e.preventDefault();
      showScienceModal();
    });
  }
  
  // 关闭按钮
  const guideModalClose = document.getElementById('guideModalClose');
  if (guideModalClose) {
    guideModalClose.addEventListener('click', () => {
      hideGuideModal();
    });
  }
  
  const scienceModalClose = document.getElementById('scienceModalClose');
  if (scienceModalClose) {
    scienceModalClose.addEventListener('click', () => {
      hideScienceModal();
    });
  }
  
  // 点击遮罩层关闭弹窗
  const guideModal = document.getElementById('guideModal');
  if (guideModal) {
    guideModal.addEventListener('click', (e) => {
      if (e.target === guideModal) {
        hideGuideModal();
      }
    });
  }
  
  const scienceModal = document.getElementById('scienceModal');
  if (scienceModal) {
    scienceModal.addEventListener('click', (e) => {
      if (e.target === scienceModal) {
        hideScienceModal();
      }
    });
  }
}

/**
 * 显示使用指南弹窗
 */
function showGuideModal() {
  const modal = document.getElementById('guideModal');
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // 防止背景滚动
  }
}

/**
 * 隐藏使用指南弹窗
 */
function hideGuideModal() {
  const modal = document.getElementById('guideModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = ''; // 恢复背景滚动
  }
}

/**
 * 显示科学依据弹窗
 */
function showScienceModal() {
  const modal = document.getElementById('scienceModal');
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // 防止背景滚动
  }
}

/**
 * 隐藏科学依据弹窗
 */
function hideScienceModal() {
  const modal = document.getElementById('scienceModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = ''; // 恢复背景滚动
  }
}

