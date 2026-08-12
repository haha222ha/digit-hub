/**
 * 心理测评验证SDK
 * 用于测试页面验证链接有效性、记录测试开始和完成
 * 
 * 使用方法：
 * 1. 在HTML页面中引入此文件：<script src="/static/js/link-validator.js"></script>
 * 2. 调用初始化方法：PsyTestValidator.init(testCode, options)
 * 
 * 支持的URL格式：/test/{test_code}/{token}
 * 支持的URL参数：?unlimited=true&token={unlimited_token}（无限测试模式）
 */

(function() {
  'use strict';

  /**
   * 检测是否为移动设备
   * 结合User-Agent和屏幕宽度判断
   */
  function isMobileDevice() {
    // 方法1：检测User-Agent
    const ua = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    // 方法2：检测屏幕宽度（≤768px视为移动端）
    const screenWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
    const isSmallScreen = screenWidth <= 768;
    // 方法3：检测触摸支持
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // 如果满足任一条件，视为移动设备
    return ua || (isSmallScreen && hasTouch);
  }

  /**
   * 配置
   */
  const config = {
    // API基础URL（从当前域名获取）
    apiBaseUrl: window.location.origin,
    // 验证API端点
    validateEndpoint: '/api/links/validate',
    // 测试开始API端点
    startTestEndpoint: '/api/links/start-test',
    // 测试完成API端点
    completeTestEndpoint: '/api/links/complete-test',
    // 无限测试验证API端点
    unlimitedTestValidateEndpoint: '/api/admin/unlimited-test/validate',
    // 移动端检测函数（动态检测，支持窗口大小变化）
    isMobile: isMobileDevice
  };

  /**
   * 从URL中提取test_code和token
   * 支持的URL格式：
   * 1. /test/{test_code}/{token} - 标准格式
   * 2. /tests/{test_code}/index.html?token={token} - 静态文件格式（从查询参数提取token）
   * 3. /tests/{test_code}/report.html?token={token} - 报告页面格式（从查询参数提取token）
   * 4. /tests/{test_code}/result.html?token={token} - 结果页面格式（从查询参数提取token）
   */
  function extractParamsFromUrl() {
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    
    // 检查是否是无限测试模式
    const unlimited = searchParams.get('unlimited') === 'true';
    const unlimitedToken = searchParams.get('token');
    
    if (unlimited && unlimitedToken) {
      // 无限测试模式：从URL路径获取test_code，从查询参数获取token
      // 支持两种格式：
      // 1. /test/{test_code}?unlimited=true&token={token}
      // 2. /tests/{test_code}/index.html?unlimited=true&token={token}
      const testMatch = path.match(/^\/test\/([^\/]+)/);
      if (testMatch) {
        return {
          testCode: testMatch[1],
          token: unlimitedToken,
          unlimited: true
        };
      }
      
      // 尝试静态文件格式
      const staticFileMatch = path.match(/^\/tests\/([^\/]+)\/index\.html$/);
      if (staticFileMatch) {
        return {
          testCode: staticFileMatch[1],
          token: unlimitedToken,
          unlimited: true
        };
      }
      
      // 尝试测试页面格式 /tests/{test_code}/test.html?unlimited=true&token={token}（CMT测试使用）
      const testFileMatch = path.match(/^\/tests\/([^\/]+)\/test\.html$/);
      if (testFileMatch) {
        return {
          testCode: testFileMatch[1],
          token: unlimitedToken,
          unlimited: true
        };
      }
      
      // 尝试报告页面格式 /tests/{test_code}/report.html?unlimited=true&token={token} 或 /tests/{test_code}/result.html?unlimited=true&token={token}
      const reportFileMatch = path.match(/^\/tests\/([^\/]+)\/(?:report|result)\.html$/);
      if (reportFileMatch) {
        return {
          testCode: reportFileMatch[1],
          token: unlimitedToken,
          unlimited: true
        };
      }
      
      // 尝试问卷页面格式 /tests/{test_code}/questionnaire.html?unlimited=true&token={token}
      const questionnaireFileMatch = path.match(/^\/tests\/([^\/]+)\/questionnaire\.html$/);
      if (questionnaireFileMatch) {
        return {
          testCode: questionnaireFileMatch[1],
          token: unlimitedToken,
          unlimited: true
        };
      }
      
      // 尝试同意页面格式 /tests/{test_code}/consent.html?unlimited=true&token={token}
      const consentFileMatch = path.match(/^\/tests\/([^\/]+)\/consent\.html$/);
      if (consentFileMatch) {
        return {
          testCode: consentFileMatch[1],
          token: unlimitedToken,
          unlimited: true
        };
      }
      
      // 尝试人口统计页面格式 /tests/{test_code}/demographic.html?unlimited=true&token={token}
      const demographicFileMatch = path.match(/^\/tests\/([^\/]+)\/demographic\.html$/);
      if (demographicFileMatch) {
        return {
          testCode: demographicFileMatch[1],
          token: unlimitedToken,
          unlimited: true
        };
      }
      
      // 尝试分析页面格式 /tests/{test_code}/analysis.html?unlimited=true&token={token}
      const analysisFileMatch = path.match(/^\/tests\/([^\/]+)\/analysis\.html$/);
      if (analysisFileMatch) {
        return {
          testCode: analysisFileMatch[1],
          token: unlimitedToken,
          unlimited: true
        };
      }

      // 通用格式：/tests/{test_code}/*.html?unlimited=true&token={token}（支持任意HTML文件名）
      const genericFileMatch = path.match(/^\/tests\/([^\/]+)\/[^\/]+\.html$/);
      if (genericFileMatch) {
        return {
          testCode: genericFileMatch[1],
          token: unlimitedToken,
          unlimited: true
        };
      }
    } else {
      // 普通模式：先尝试标准格式 /test/{test_code}/{token}
      const standardMatch = path.match(/^\/test\/([^\/]+)\/([^\/]+)$/);
      if (standardMatch) {
        return {
          testCode: standardMatch[1],
          token: standardMatch[2],
          unlimited: false
        };
      }
      
      // 如果标准格式不匹配，尝试静态文件格式 /tests/{test_code}/index.html?token={token}
      const staticFileMatch = path.match(/^\/tests\/([^\/]+)\/index\.html$/);
      const tokenFromQuery = searchParams.get('token');
      if (staticFileMatch && tokenFromQuery) {
        return {
          testCode: staticFileMatch[1],
          token: tokenFromQuery,
          unlimited: false
        };
      }
      
      // 尝试测试页面格式 /tests/{test_code}/test.html?token={token}（CMT测试使用）
      const testFileMatch = path.match(/^\/tests\/([^\/]+)\/test\.html$/);
      if (testFileMatch && tokenFromQuery) {
        return {
          testCode: testFileMatch[1],
          token: tokenFromQuery,
          unlimited: false
        };
      }
      
      // 尝试报告页面格式 /tests/{test_code}/report.html?token={token} 或 /tests/{test_code}/result.html?token={token}
      const reportFileMatch = path.match(/^\/tests\/([^\/]+)\/(?:report|result)\.html$/);
      if (reportFileMatch && tokenFromQuery) {
        return {
          testCode: reportFileMatch[1],
          token: tokenFromQuery,
          unlimited: false
        };
      }
      
      // 尝试问卷页面格式 /tests/{test_code}/questionnaire.html?token={token}
      const questionnaireFileMatch = path.match(/^\/tests\/([^\/]+)\/questionnaire\.html$/);
      if (questionnaireFileMatch && tokenFromQuery) {
        return {
          testCode: questionnaireFileMatch[1],
          token: tokenFromQuery,
          unlimited: false
        };
      }
      
      // 尝试同意页面格式 /tests/{test_code}/consent.html?token={token}
      const consentFileMatch = path.match(/^\/tests\/([^\/]+)\/consent\.html$/);
      if (consentFileMatch && tokenFromQuery) {
        return {
          testCode: consentFileMatch[1],
          token: tokenFromQuery,
          unlimited: false
        };
      }
      
      // 尝试人口统计页面格式 /tests/{test_code}/demographic.html?token={token}
      const demographicFileMatch = path.match(/^\/tests\/([^\/]+)\/demographic\.html$/);
      if (demographicFileMatch && tokenFromQuery) {
        return {
          testCode: demographicFileMatch[1],
          token: tokenFromQuery,
          unlimited: false
        };
      }
      
      // 尝试分析页面格式 /tests/{test_code}/analysis.html?token={token}
      const analysisFileMatch = path.match(/^\/tests\/([^\/]+)\/analysis\.html$/);
      if (analysisFileMatch && tokenFromQuery) {
        return {
          testCode: analysisFileMatch[1],
          token: tokenFromQuery,
          unlimited: false
        };
      }

      // 通用格式：/tests/{test_code}/*.html?token={token}（支持任意HTML文件名，如zhanu_test.html、zhanu_result.html等）
      const genericFileMatch = path.match(/^\/tests\/([^\/]+)\/[^\/]+\.html$/);
      if (genericFileMatch && tokenFromQuery) {
        return {
          testCode: genericFileMatch[1],
          token: tokenFromQuery,
          unlimited: false
        };
      }
    }
    
    return null;
  }

  /**
   * 创建并添加推广链接到指定的footer
   * @param {HTMLElement} footer - 目标footer元素
   */
  function createAndAddPromotionLink(footer) {
    // 检查这个footer是否已经有推广链接
    if (footer.querySelector('#link-validator-promotion-link')) {
      return; // 已经存在，不重复添加
    }

    // 创建推广链接容器
    const promotionContainer = document.createElement('div');
    promotionContainer.id = 'link-validator-promotion-link';
    promotionContainer.style.cssText = `
      color: #666;
      font-size: 14px;
      line-height: 1.6;
      margin: 0;
    `;

    // 创建推广链接文本和链接
    const promotionText = document.createTextNode('如果您也想为他人提供测试服务，');
    const promotionLink = document.createElement('a');
    promotionLink.href = '/';
    promotionLink.target = '_blank';
    promotionLink.rel = 'noopener noreferrer';
    promotionLink.textContent = '点击这里了解更多';
    promotionLink.style.cssText = `
      color: #1890ff;
      text-decoration: none;
      cursor: pointer;
    `;
    
    // 添加链接悬停效果
    promotionLink.addEventListener('mouseenter', function() {
      this.style.textDecoration = 'underline';
    });
    promotionLink.addEventListener('mouseleave', function() {
      this.style.textDecoration = 'none';
    });

    // 移动端适配：调整字体大小和间距
    if (config.isMobile()) {
      promotionContainer.style.fontSize = '13px';
      promotionContainer.style.padding = '15px 10px';
    }

    // 组装推广链接
    promotionContainer.appendChild(promotionText);
    promotionContainer.appendChild(promotionLink);

    // 添加到底部区域
    footer.appendChild(promotionContainer);

    console.log('推广链接已添加到页面底部', {
      footerClass: footer.className,
      footerId: footer.id,
      footerTag: footer.tagName,
      footerVisible: footer.offsetParent !== null,
      footerDisplay: window.getComputedStyle(footer).display,
      footerVisibility: window.getComputedStyle(footer).visibility
    });
  }

  /**
   * 添加推广链接到页面底部
   * 根据需求文档，在所有测试页面（首页和报告页）底部自动显示推广链接
   */
  function addPromotionLink() {
    // 检查全局标志，如果设置了禁用标志，则不添加推广链接
    if (window.__RPI_DISABLE_SDK_PROMOTION) {
      console.log('SDK的addPromotionLink已被禁用（RPI测试标志）');
      return;
    }
    
    // 对于单页应用（如AAT），需要为每个可见的页面都添加推广链接
    // 检查当前可见的页面，为其footer添加推广链接
    
    // 检查是否已有推广链接
    const existingLinks = document.querySelectorAll('#link-validator-promotion-link');
    
    // 获取所有可能的footer
    const welcomeFooter = document.querySelector('.welcome-footer');
    const reportFooter = document.querySelector('.report-footer');
    const testFooter = document.querySelector('.test-footer');
    const generalFooter = document.querySelector('footer:not(.welcome-footer):not(.report-footer):not(.test-footer)');
    
    // 检查每个footer是否可见，如果可见且没有推广链接，则添加
    const footersToAdd = [];
    
    // 检查welcome-footer
    if (welcomeFooter) {
      const welcomePage = welcomeFooter.closest('#welcome-page, .welcome-page, [id*="welcome"]');
      const welcomePageStyle = welcomePage ? window.getComputedStyle(welcomePage) : null;
      const isWelcomeFooterVisible = welcomeFooter.offsetParent !== null || 
                                      (welcomePage && welcomePageStyle && welcomePageStyle.display !== 'none') ||
                                      (welcomePage && welcomePage.classList.contains('active')) ||
                                      window.getComputedStyle(welcomeFooter).display !== 'none';
      
      // 检查这个footer是否已经有推广链接
      const hasPromotionLink = welcomeFooter.querySelector('#link-validator-promotion-link') !== null;
      
      if (isWelcomeFooterVisible && !hasPromotionLink) {
        footersToAdd.push(welcomeFooter);
      }
    }
    
    // 检查report-footer
    if (reportFooter) {
      const reportPage = reportFooter.closest('#result-page, .result-page, [id*="result"]');
      const reportPageStyle = reportPage ? window.getComputedStyle(reportPage) : null;
      const isReportFooterVisible = reportFooter.offsetParent !== null || 
                                     (reportPage && reportPageStyle && reportPageStyle.display !== 'none') ||
                                     (reportPage && reportPage.classList.contains('active')) ||
                                     window.getComputedStyle(reportFooter).display !== 'none';
      
      // 检查这个footer是否已经有推广链接
      const hasPromotionLink = reportFooter.querySelector('#link-validator-promotion-link') !== null;
      
      if (isReportFooterVisible && !hasPromotionLink) {
        footersToAdd.push(reportFooter);
      }
    }
    
    // 如果所有可见的footer都已经有推广链接，直接返回
    if (footersToAdd.length === 0) {
      // 如果没有找到任何可见的footer，但页面中有其他footer，至少添加一个
      if (!welcomeFooter && !reportFooter && !testFooter && generalFooter) {
        const hasPromotionLink = generalFooter.querySelector('#link-validator-promotion-link') !== null;
        if (!hasPromotionLink) {
          footersToAdd.push(generalFooter);
        }
      } else if (testFooter) {
        const hasPromotionLink = testFooter.querySelector('#link-validator-promotion-link') !== null;
        if (!hasPromotionLink) {
          footersToAdd.push(testFooter);
        }
      } else {
        // 所有footer都已有推广链接，返回
        return;
      }
    }
    
    // 为所有需要添加的footer创建并添加推广链接
    if (footersToAdd.length > 0) {
      // 为每个footer都添加推广链接
      footersToAdd.forEach(function(footer) {
        createAndAddPromotionLink(footer);
      });
      return;
    }
    
    // 如果没有找到任何需要添加的footer，使用传统方法查找footer
    let footer = testFooter || generalFooter;

    // 如果没有底部区域，创建底部区域
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'link-validator-promotion-footer';
      // 检查是否是移动端，移动端需要更多的底部间距
      const isMobile = config.isMobile();
      const bottomPadding = isMobile ? '100px' : '80px';
      footer.style.cssText = `
        text-align: center;
        padding: 20px;
        padding-bottom: ${bottomPadding};
        margin-top: 40px;
        margin-bottom: 0;
        border-top: 1px solid #eee;
        background-color: #fafafa;
        position: relative;
        z-index: 1;
        width: 100%;
        box-sizing: border-box;
      `;
      document.body.appendChild(footer);
    }

    // 创建推广链接容器
    const promotionContainer = document.createElement('div');
    promotionContainer.id = 'link-validator-promotion-link';
    promotionContainer.style.cssText = `
      color: #666;
      font-size: 14px;
      line-height: 1.6;
      margin: 0;
    `;

    // 创建推广链接文本和链接
    const promotionText = document.createTextNode('如果您也想为他人提供测试服务，');
    const promotionLink = document.createElement('a');
    promotionLink.href = '/';
    promotionLink.target = '_blank';
    promotionLink.rel = 'noopener noreferrer';
    promotionLink.textContent = '点击这里了解更多';
    promotionLink.style.cssText = `
      color: #1890ff;
      text-decoration: none;
      cursor: pointer;
    `;
    
    // 添加链接悬停效果
    promotionLink.addEventListener('mouseenter', function() {
      this.style.textDecoration = 'underline';
    });
    promotionLink.addEventListener('mouseleave', function() {
      this.style.textDecoration = 'none';
    });

    // 移动端适配：调整字体大小和间距
    if (config.isMobile()) {
      promotionContainer.style.fontSize = '13px';
      promotionContainer.style.padding = '15px 10px';
    }

    // 组装推广链接
    promotionContainer.appendChild(promotionText);
    promotionContainer.appendChild(promotionLink);

    // 添加到底部区域
    footer.appendChild(promotionContainer);

    console.log('推广链接已添加到页面底部', {
      footerClass: footer.className,
      footerId: footer.id,
      footerTag: footer.tagName,
      footerVisible: footer.offsetParent !== null,
      footerDisplay: window.getComputedStyle(footer).display,
      footerVisibility: window.getComputedStyle(footer).visibility,
      promotionLinkVisible: promotionContainer.offsetParent !== null,
      promotionLinkDisplay: window.getComputedStyle(promotionContainer).display
    });
  }

  /**
   * 显示弹窗消息（支持HTML内容，移动端适配）
   */
  function showModal(message, title, onClose) {
    // 移除已存在的弹窗
    const existingModal = document.getElementById('link-validator-modal');
    if (existingModal) {
      existingModal.remove();
    }

    // 动态检测移动端（每次显示弹窗时重新检测）
    const isMobile = config.isMobile();
    const screenWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;

    // 创建弹窗背景
    const modal = document.createElement('div');
    modal.id = 'link-validator-modal';
    Object.assign(modal.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      zIndex: '9999',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: isMobile ? '10px' : '20px',
      boxSizing: 'border-box',
      // 移动端优化：防止背景滚动
      overflow: 'auto',
      WebkitOverflowScrolling: 'touch'
    });

    // 创建弹窗内容
    const content = document.createElement('div');
    Object.assign(content.style, {
      backgroundColor: '#fff',
      borderRadius: isMobile ? '12px' : '8px',
      padding: isMobile ? '20px' : '30px',
      maxWidth: isMobile ? '90%' : '500px',
      maxHeight: isMobile ? '90vh' : '90vh',
      width: isMobile ? '90%' : '100%',
      textAlign: 'center',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
      position: 'relative',
      // 移动端优化：内容可滚动
      overflow: 'auto',
      WebkitOverflowScrolling: 'touch',
      // 移动端优化：防止内容溢出
      boxSizing: 'border-box'
    });

    // 标题
    if (title) {
      const titleEl = document.createElement('h2');
      titleEl.textContent = title;
      titleEl.style.margin = '0 0 15px 0';
      titleEl.style.fontSize = isMobile ? '18px' : '24px';
      titleEl.style.fontWeight = '600';
      titleEl.style.color = '#333';
      titleEl.style.lineHeight = '1.4';
      content.appendChild(titleEl);
    }

    // 消息内容
    const messageEl = document.createElement('div');
    // 支持HTML内容（用于显示超链接）
    messageEl.innerHTML = message;
    messageEl.style.margin = '0 0 20px 0';
    messageEl.style.fontSize = isMobile ? '14px' : '16px';
    messageEl.style.color = '#666';
    messageEl.style.lineHeight = '1.6';
    messageEl.style.wordWrap = 'break-word';
    messageEl.style.overflowWrap = 'break-word';
    // 移动端优化：链接样式
    if (isMobile) {
      messageEl.style.padding = '0 5px';
      // 确保链接在移动端可点击
      const links = messageEl.querySelectorAll('a');
      links.forEach(function(link) {
        link.style.display = 'inline-block';
        link.style.padding = '4px 8px';
        link.style.minHeight = '44px';
        link.style.lineHeight = '36px';
        link.style.color = '#409eff';
        link.style.textDecoration = 'underline';
      });
    }
    content.appendChild(messageEl);

    // 确定按钮
    const button = document.createElement('button');
    button.textContent = '确定';
    // 移动端优化：按钮有足够的触摸区域（至少44px高度）
    const buttonPadding = isMobile ? '12px 24px' : '12px 30px';
    const buttonFontSize = isMobile ? '16px' : '16px';
    const buttonMinHeight = isMobile ? '44px' : 'auto';
    Object.assign(button.style, {
      padding: buttonPadding,
      fontSize: buttonFontSize,
      minHeight: buttonMinHeight,
      backgroundColor: '#4CAF50',
      color: '#fff',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      marginTop: '10px',
      width: isMobile ? '100%' : 'auto',
      fontWeight: '500',
      // 移动端优化：触摸反馈
      WebkitTapHighlightColor: 'transparent',
      userSelect: 'none',
      // 移动端优化：按钮点击效果
      transition: 'background-color 0.2s, transform 0.1s'
    });
    
    // 移动端按钮触摸反馈
    if (isMobile) {
      button.addEventListener('touchstart', function() {
        button.style.backgroundColor = '#45a049';
        button.style.transform = 'scale(0.98)';
      });
      button.addEventListener('touchend', function() {
        button.style.backgroundColor = '#4CAF50';
        button.style.transform = 'scale(1)';
      });
    } else {
      button.addEventListener('mouseenter', function() {
        button.style.backgroundColor = '#45a049';
      });
      button.addEventListener('mouseleave', function() {
        button.style.backgroundColor = '#4CAF50';
      });
    }
    
    content.appendChild(button);
    modal.appendChild(content);

    const originalOverflow = document.body.style.overflow;

    function closeModal() {
      if (modal.parentNode) {
        modal.remove();
      }
      if (isMobile) {
        document.body.style.overflow = originalOverflow;
      }
      if (escHandler) {
        document.removeEventListener('keydown', escHandler);
        escHandler = null;
      }
      if (onClose) {
        onClose();
      }
    }

    button.onclick = function() {
      closeModal();
    };

    document.body.appendChild(modal);

    if (isMobile) {
      document.body.style.overflow = 'hidden';
    }

    modal.onclick = function(e) {
      if (e.target === modal) {
        closeModal();
      }
    };

    let escHandler = function(e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        closeModal();
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  /**
   * 调用API
   * 包含完善的错误处理：网络错误、超时错误、API错误等
   */
  async function callAPI(endpoint, method, data, headers) {
    try {
      const options = {
        method: method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
      }

      const url = endpoint.startsWith('http') ? endpoint : config.apiBaseUrl + endpoint;
      
      // 添加超时控制（30秒）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      options.signal = controller.signal;
      
      let response;
      try {
        response = await fetch(url, options);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        // 网络错误处理
        if (fetchError.name === 'AbortError') {
          throw new Error('请求超时，请检查网络连接后重试');
        } else if (fetchError.message && fetchError.message.includes('Failed to fetch')) {
          throw new Error('网络连接失败，请检查网络设置');
        } else if (fetchError.message && fetchError.message.includes('NetworkError')) {
          throw new Error('网络错误，请检查网络连接');
        } else {
          throw new Error('网络请求失败：' + (fetchError.message || '未知错误'));
        }
      }
      
      clearTimeout(timeoutId);
      
      // 检查响应状态
      if (!response.ok) {
        // 尝试解析错误响应
        let errorMessage = '请求失败';
        try {
          const errorResult = await response.json();
          errorMessage = errorResult.message || errorResult.data?.message || `请求失败 (${response.status})`;
        } catch (parseError) {
          // 如果无法解析JSON，使用状态码
          if (response.status === 404) {
            errorMessage = '请求的资源不存在';
          } else if (response.status === 500) {
            errorMessage = '服务器错误，请稍后重试';
          } else if (response.status >= 500) {
            errorMessage = '服务器错误，请稍后重试';
          } else if (response.status === 401) {
            errorMessage = '未授权，请先登录';
          } else if (response.status === 403) {
            errorMessage = '权限不足，无法访问';
          } else {
            errorMessage = `请求失败 (${response.status})`;
          }
        }
        throw new Error(errorMessage);
      }

      // 解析响应
      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        throw new Error('服务器响应格式错误');
      }

      // 检查业务逻辑错误（如果API返回了code字段）
      if (result.code !== undefined && result.code !== 200 && result.code !== 0) {
        throw new Error(result.message || result.data?.message || '请求失败');
      }

      return result;
    } catch (error) {
      console.error('API调用失败:', error);
      
      // 如果是我们自定义的错误，直接抛出
      if (error.message) {
        throw error;
      }
      
      // 其他未知错误
      throw new Error('请求失败，请稍后再试');
    }
  }

  /**
   * 验证链接（普通模式）
   */
  async function validateLink(token, perspective) {
    try {
      const data = { token };
      if (perspective) {
        data.perspective = perspective;
      }
      const result = await callAPI(config.validateEndpoint, 'POST', data);
      
      // 检查返回数据结构
      if (result.data) {
        return result.data;
      } else if (result.valid !== undefined) {
        // 如果直接返回验证结果
        return result;
      } else {
        throw new Error('服务器返回数据格式错误');
      }
    } catch (error) {
      console.error('验证链接失败:', error);
      // 确保错误信息友好
      if (!error.message || error.message === 'Error') {
        throw new Error('验证链接失败，请检查网络连接后重试');
      }
      throw error;
    }
  }

  /**
   * 验证无限测试token
   */
  async function validateUnlimitedTest(token, testCode) {
    try {
      // 获取JWT token（从localStorage或cookie）
      const jwtToken = getJWTToken();
      if (!jwtToken) {
        throw new Error('未登录或登录已过期，请先登录管理员账户');
      }

      const result = await callAPI(
        config.unlimitedTestValidateEndpoint,
        'POST',
        { token, test_code: testCode },
        { 'Authorization': `Bearer ${jwtToken}` }
      );
      
      // 检查返回数据结构
      if (result.data) {
        return result.data;
      } else if (result.valid !== undefined) {
        // 如果直接返回验证结果
        return result;
      } else {
        throw new Error('服务器返回数据格式错误');
      }
    } catch (error) {
      console.error('验证无限测试token失败:', error);
      // 确保错误信息友好
      if (error.message && (error.message.includes('401') || error.message.includes('未授权'))) {
        throw new Error('未登录或登录已过期，请先登录管理员账户');
      } else if (error.message && (error.message.includes('403') || error.message.includes('权限'))) {
        throw new Error('权限不足，此测试仅限管理员使用');
      } else if (!error.message || error.message === 'Error') {
        throw new Error('验证失败，请检查网络连接后重试');
      }
      throw error;
    }
  }

  /**
   * 获取JWT token（从localStorage或cookie）
   */
  function getJWTToken() {
    // 尝试从localStorage获取（按优先级顺序）
    // 1. auth_token（Vue应用使用的键名）
    // 2. token（通用键名）
    // 3. jwt_token（备用键名）
    const token = localStorage.getItem('auth_token') || 
                  localStorage.getItem('token') || 
                  localStorage.getItem('jwt_token');
    if (token) {
      return token;
    }
    
    // 尝试从cookie获取
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'auth_token' || name === 'token' || name === 'jwt_token') {
        return decodeURIComponent(value);
      }
    }
    
    return null;
  }

  /**
   * 记录测试开始
   */
  async function startTest(token, perspective) {
    try {
      const data = { token };
      if (perspective) {
        data.perspective = perspective;
      }
      const result = await callAPI(config.startTestEndpoint, 'POST', data);
      
      // 检查返回数据结构
      if (result.data) {
        return result.data;
      } else if (result.success !== undefined) {
        // 如果直接返回结果
        return result;
      } else {
        throw new Error('服务器返回数据格式错误');
      }
    } catch (error) {
      console.error('记录测试开始失败:', error);
      // 确保错误信息友好
      if (!error.message || error.message === 'Error') {
        throw new Error('测试开始失败，请检查网络连接后重试');
      }
      throw error;
    }
  }

  /**
   * 记录测试完成
   */
  async function completeTest(token, perspective, resultData) {
    try {
      const data = { token };
      if (perspective) {
        data.perspective = perspective;
      }
      if (resultData) {
        data.resultData = resultData;
      }
      console.log('📤 发送completeTest API请求:', {
        endpoint: config.completeTestEndpoint,
        method: 'POST',
        data: { ...data, resultData: resultData ? '[已包含]' : undefined }
      });
      const result = await callAPI(config.completeTestEndpoint, 'POST', data);
      console.log('📥 收到completeTest API响应:', result);
      
      // 检查返回数据结构
      if (result.data) {
        return result.data;
      } else if (result.success !== undefined) {
        // 如果直接返回结果
        return result;
      } else {
        throw new Error('服务器返回数据格式错误');
      }
    } catch (error) {
      console.error('记录测试完成失败:', error);
      // 确保错误信息友好
      if (!error.message || error.message === 'Error') {
        throw new Error('测试完成失败，请检查网络连接后重试');
      }
      throw error;
    }
  }

  /**
   * 视角类型映射
   * 前端可能使用 'partner'，需要映射到后端的 'other'
   */
  function normalizePerspective(perspective) {
    if (!perspective) {
      return null;
    }
    // 将 'partner' 映射到 'other'（后端使用 other）
    if (perspective === 'partner') {
      return 'other';
    }
    // 'self' 保持不变
    if (perspective === 'self') {
      return 'self';
    }
    // 其他值直接返回
    return perspective;
  }

  /**
   * 验证SDK实例
   */
  class PsyTestValidatorInstance {
    constructor(token, testCode, unlimited) {
      this.token = token;
      this.testCode = testCode;
      this.unlimited = unlimited || false;
      this.link = null;
      this.isDualPerspective = false;
      this.perspectives = null;
      this.adminId = null;
      this.valid = false; // 链接是否有效
      this.validationError = null; // 验证错误信息
      this.startTime = null; // 测试开始时间
      this.expiresAt = null; // 链接过期时间
    }

    /**
     * 检查视角是否已完成
     * @param {string} perspective - 视角类型（'self' 或 'partner'/'other'）
     * @returns {boolean} 是否已完成
     */
    isPerspectiveCompleted(perspective) {
      if (!this.isDualPerspective || !this.perspectives) {
        return false;
      }

      // 标准化视角类型
      const normalizedPerspective = normalizePerspective(perspective);
      
      // 查找对应的视角状态
      const perspectiveState = this.perspectives.find(
        p => p.perspective === normalizedPerspective || 
             (normalizedPerspective === 'other' && p.perspective === 'other')
      );

      return perspectiveState ? perspectiveState.completed : false;
    }

    /**
     * 获取可用的视角列表
     * @returns {Array<string>} 可用的视角列表（'self' 或 'partner'）
     */
    getAvailablePerspectives() {
      if (!this.isDualPerspective || !this.perspectives) {
        return [];
      }

      const available = [];
      
      // 检查 self 视角
      const selfState = this.perspectives.find(p => p.perspective === 'self');
      if (selfState && !selfState.completed) {
        available.push('self');
      }

      // 检查 other 视角（前端可能使用 'partner'）
      const otherState = this.perspectives.find(p => p.perspective === 'other');
      if (otherState && !otherState.completed) {
        available.push('partner'); // 返回前端友好的名称
      }

      return available;
    }

    /**
     * 检查是否所有视角都已完成
     * @returns {boolean} 是否所有视角都已完成
     */
    areAllPerspectivesCompleted() {
      if (!this.isDualPerspective || !this.perspectives) {
        return false;
      }

      return this.perspectives.length === 2 && 
             this.perspectives.every(p => p.completed);
    }

    /**
     * 验证链接
     * @param {string} perspective - 视角类型（可选，用于双视角测试，支持 'self' 或 'partner'）
     * @param {boolean} showModalOnError - 是否在错误时显示弹窗（默认false，页面加载时不显示）
     */
    async validate(perspective, showModalOnError = false) {
      try {
        let validateResult;
        
        // 标准化视角类型（partner -> other）
        const normalizedPerspective = normalizePerspective(perspective);
        
        if (this.unlimited) {
          // 无限测试模式
          validateResult = await validateUnlimitedTest(this.token, this.testCode);
          if (validateResult.valid) {
            this.adminId = validateResult.admin_id;
            this.isDualPerspective = validateResult.is_dual_perspective || false;
          } else {
            // 验证失败，设置错误信息（无限测试模式的特殊提示）
            this.validationError = validateResult.message || '此测试仅限管理员使用，请先登录管理员账户';
          }
        } else {
          // 普通模式（传递标准化后的perspective）
          validateResult = await validateLink(this.token, normalizedPerspective);
          if (validateResult.valid) {
            this.link = validateResult.link;
            this.isDualPerspective = validateResult.isDualPerspective || false;
            this.perspectives = validateResult.perspectives || null;
          }
        }

        // 更新验证状态
        this.valid = validateResult.valid;
        if (!validateResult.valid) {
          this.validationError = validateResult.message || '测试链接无效';
          
          // 如果需要显示弹窗，则显示
          if (showModalOnError) {
            showModal(this.validationError, '提示', function() {
              // 可以选择跳转到首页或关闭页面
              // window.location.href = '/';
            });
          }
        } else {
          this.validationError = null;
        }

        return validateResult;
      } catch (error) {
        this.valid = false;
        
        // 无限测试模式的特殊错误提示
        if (this.unlimited) {
          this.validationError = error.message || '此测试仅限管理员使用，请先登录管理员账户';
        } else {
          this.validationError = error.message || '验证链接失败，请稍后再试';
        }
        
        // 如果需要显示弹窗，则显示
        if (showModalOnError) {
          showModal(this.validationError, '错误', function() {
            // 可以选择跳转到首页或关闭页面
            // window.location.href = '/';
          });
        }
        
        throw error;
      }
    }

    /**
     * 检查localStorage中是否有测试结果
     * @param {string} perspective - 视角类型（可选，用于双视角测试）
     * @returns {object|null} 测试结果，如果没有则返回null
     */
    getLocalResult(perspective) {
      try {
        let storageKey;
        if (this.unlimited) {
          // 无限测试模式
          if (this.isDualPerspective && perspective) {
            storageKey = `unlimited_test_result_${this.adminId}_${this.testCode}_${perspective}`;
          } else {
            storageKey = `unlimited_test_result_${this.adminId}_${this.testCode}`;
          }
        } else {
          // 普通模式
          if (this.isDualPerspective && perspective) {
            storageKey = `test_result_${this.token}_${perspective}`;
          } else {
            storageKey = `test_result_${this.token}`;
          }
        }
        
        const resultStr = localStorage.getItem(storageKey);
        if (resultStr) {
          return JSON.parse(resultStr);
        }
        return null;
      } catch (error) {
        console.error('读取localStorage失败:', error);
        return null;
      }
    }

    /**
     * 用户操作时验证链接（显示弹窗）
     * 用于用户点击"开始测试"或"重新测试"按钮时调用
     * 注意：每次调用都会重新验证，不使用缓存结果
     * @param {string} perspective - 视角类型（可选，用于双视角测试）
     * @returns {Promise<boolean>} 链接是否有效
     */
    async validateForUserAction(perspective) {
      try {
        // 强制重新验证，不使用缓存结果（每次用户操作时都应该重新验证）
        // 清除之前的验证状态，确保重新验证
        const validateResult = await this.validate(perspective, true); // 显示弹窗
        
        // 检查验证结果
        const isValid = validateResult && validateResult.valid === true;
        
        // 双重检查：确保验证状态和验证结果一致
        if (!isValid || this.valid !== true) {
          console.warn('验证失败:', {
            isValid,
            valid: this.valid,
            validateResult,
            error: this.validationError
          });
          // 确保验证状态为false
          this.valid = false;
          return false;
        }
        
        // 返回验证结果（确保返回最新的验证状态）
        return true;
      } catch (error) {
        // 错误已在validate方法中处理
        console.error('验证过程出错:', error);
        // 确保验证状态为false
        this.valid = false;
        return false;
      }
    }

    /**
     * 记录测试开始
     * 用于用户点击"开始测试"按钮时调用
     * @param {string} perspective - 视角类型（可选，用于双视角测试，支持 'self' 或 'partner'）
     * @returns {Promise<object>} 测试开始结果
     */
    async startTest(perspective) {
      try {
        // 双视角测试必须指定perspective
        if (this.isDualPerspective && !perspective) {
          throw new Error('双视角测试需要指定视角类型（self或partner）');
        }

        // 标准化视角类型（partner -> other）
        const normalizedPerspective = normalizePerspective(perspective);

        // 无限测试模式不需要调用 start-test 接口（不消耗额度）
        if (this.unlimited) {
          console.log('无限测试模式：跳过测试开始记录（不消耗额度）');
          return {
            success: true,
            message: '测试已开始（无限测试模式）',
            unlimited: true
          };
        }

        // 普通模式：先验证链接（如果无效显示弹窗）
        const isValid = await this.validateForUserAction(normalizedPerspective);
        if (!isValid) {
          // 链接无效，已显示弹窗，返回失败
          throw new Error(this.validationError || '链接验证失败');
        }

        // 链接有效，调用测试开始接口（传递标准化后的perspective）
        const result = await startTest(this.token, normalizedPerspective);
        
        // 记录开始时间（如果返回了firstUsedAt）
        if (result.link && result.link.firstUsedAt) {
          this.startTime = result.link.firstUsedAt;
          console.log('测试开始时间已记录:', this.startTime);
        }

        // 更新过期时间（如果返回了expiresAt）
        if (result.expiresAt) {
          this.expiresAt = result.expiresAt;
          console.log('链接过期时间:', this.expiresAt);
        }

        return result;
      } catch (error) {
        // 测试开始失败，显示错误提示
        const errorMessage = error.message || '测试开始失败，请稍后再试';
        console.error('测试开始失败:', errorMessage);
        
        // 显示错误弹窗
        showModal(errorMessage, '错误', function() {
          // 可以选择跳转到首页或关闭页面
          // window.location.href = '/';
        });
        
        throw error;
      }
    }

    /**
     * 保存测试结果到localStorage
     * @param {object} resultData - 测试结果数据
     * @param {string} perspective - 视角类型（可选，用于双视角测试）
     * @returns {boolean} 是否保存成功
     */
    saveResultToLocalStorage(resultData, perspective) {
      try {
        let storageKey;
        if (this.unlimited) {
          // 无限测试模式
          if (this.isDualPerspective && perspective) {
            storageKey = `unlimited_test_result_${this.adminId}_${this.testCode}_${perspective}`;
          } else {
            storageKey = `unlimited_test_result_${this.adminId}_${this.testCode}`;
          }
        } else {
          // 普通模式
          if (this.isDualPerspective && perspective) {
            storageKey = `test_result_${this.token}_${perspective}`;
          } else {
            storageKey = `test_result_${this.token}`;
          }
        }
        
        // 添加完成时间
        const fullResult = {
          ...resultData,
          completedAt: new Date().toISOString(),
          testCode: this.testCode,
          perspective: perspective || null
        };
        
        localStorage.setItem(storageKey, JSON.stringify(fullResult));
        console.log('测试结果已保存到localStorage:', storageKey);
        return true;
      } catch (error) {
        console.error('保存测试结果到localStorage失败:', error);
        return false;
      }
    }

    /**
     * 清除测试结果（用于重新测试）
     * @param {string} perspective - 视角类型（可选，用于双视角测试，如果不指定则清除所有视角）
     * @returns {boolean} 是否清除成功
     */
    clearLocalResult(perspective) {
      try {
        if (this.unlimited) {
          // 无限测试模式
          if (this.isDualPerspective) {
            if (perspective) {
              // 清除指定视角的结果
              const storageKey = `unlimited_test_result_${this.adminId}_${this.testCode}_${perspective}`;
              localStorage.removeItem(storageKey);
              console.log('已清除无限测试结果:', storageKey);
            } else {
              // 清除所有视角的结果
              localStorage.removeItem(`unlimited_test_result_${this.adminId}_${this.testCode}_self`);
              localStorage.removeItem(`unlimited_test_result_${this.adminId}_${this.testCode}_partner`);
              console.log('已清除所有无限测试结果');
            }
          } else {
            // 单视角测试
            const storageKey = `unlimited_test_result_${this.adminId}_${this.testCode}`;
            localStorage.removeItem(storageKey);
            console.log('已清除无限测试结果:', storageKey);
          }
        } else {
          // 普通模式
          if (this.isDualPerspective) {
            if (perspective) {
              // 清除指定视角的结果
              const storageKey = `test_result_${this.token}_${perspective}`;
              localStorage.removeItem(storageKey);
              console.log('已清除测试结果:', storageKey);
            } else {
              // 清除所有视角的结果
              localStorage.removeItem(`test_result_${this.token}_self`);
              localStorage.removeItem(`test_result_${this.token}_partner`);
              console.log('已清除所有测试结果');
            }
          } else {
            // 单视角测试
            const storageKey = `test_result_${this.token}`;
            localStorage.removeItem(storageKey);
            console.log('已清除测试结果:', storageKey);
          }
        }
        return true;
      } catch (error) {
        console.error('清除测试结果失败:', error);
        return false;
      }
    }

    /**
     * 记录测试完成
     * 用于用户完成测试时调用
     * @param {string} perspective - 视角类型（可选，用于双视角测试，支持 'self' 或 'partner'）
     * @param {object} resultData - 测试结果数据（JSON格式）
     * @returns {Promise<object>} 测试完成结果
     */
    async completeTest(perspective, resultData) {
      try {
        // 双视角测试必须指定perspective
        if (this.isDualPerspective && !perspective) {
          throw new Error('双视角测试需要指定视角类型（self或partner）');
        }

        // 标准化视角类型（partner -> other）
        const normalizedPerspective = normalizePerspective(perspective);

        // 先保存测试结果到localStorage（无论是否成功调用API都要保存）
        // 保存时使用原始perspective（保持前端友好）
        if (resultData) {
          this.saveResultToLocalStorage(resultData, perspective);
        }

        // 无限测试模式不需要调用 complete-test 接口（不消耗额度）
        if (this.unlimited) {
          console.log('无限测试模式：跳过测试完成记录（不消耗额度）');
          return {
            success: true,
            message: '测试已完成（无限测试模式）',
            unlimited: true
          };
        }

        // 普通模式：调用测试完成接口（传递标准化后的perspective）
        const result = await completeTest(this.token, normalizedPerspective, resultData);
        
        // 更新链接信息（如果返回了）
        if (result.link) {
          this.link = result.link;
          console.log('链接信息已更新:', result.link);
        }

        // 记录使用次数（如果返回了）
        if (result.usedCount !== undefined) {
          console.log('当前使用次数:', result.usedCount);
        }

        // 检查是否所有视角都完成（双视角测试）
        if (result.allPerspectivesCompleted) {
          console.log('所有视角测试已完成，链接已使用1次');
          // 更新perspectives状态
          if (this.perspectives) {
            this.perspectives.forEach(p => {
              p.completed = true;
            });
          }
        }

        return result;
      } catch (error) {
        // 测试完成失败，显示错误提示
        const errorMessage = error.message || '测试完成失败，请稍后再试';
        console.error('测试完成失败:', errorMessage);
        
        // 显示错误弹窗
        showModal(errorMessage, '错误', function() {
          // 可以选择跳转到首页或关闭页面
          // window.location.href = '/';
        });
        
        // 注意：即使API调用失败，结果也已经保存到localStorage
        // 所以仍然可以显示结果页面
        throw error;
      }
    }
  }

  /**
   * 全局 PsyTestValidator 对象
   */
  const PsyTestValidator = {
    /**
     * 初始化验证SDK
     * @param {string} testCode - 测试代码（可选，如果不提供则从URL提取）
     * @param {object} options - 配置选项
     * @param {string} options.perspective - 视角类型（可选，用于双视角测试）
     * @param {function} options.onSuccess - 验证成功回调
     * @param {function} options.onError - 验证失败回调
     * @param {function} options.onLoad - 加载完成回调（用于双视角测试）
     * @param {boolean} options.autoInit - 是否自动初始化（默认true）
     */
    init: async function(testCode, options) {
      options = options || {};
      
      try {
        // 从URL中提取参数
        const params = extractParamsFromUrl();
        if (!params) {
          const errorMsg = '无法从URL中提取test_code和token，请使用正确的测试链接访问';
          console.error(errorMsg);
          
          // 先调用onError回调，如果返回true或suppressErrors为true，则不显示错误弹窗
          let shouldSuppressError = false;
          if (options.onError) {
            const errorResult = options.onError(new Error(errorMsg));
            // 如果onError返回true，表示已处理，不显示错误弹窗
            shouldSuppressError = errorResult === true;
          }
          
          // 如果suppressErrors选项为true，不显示错误弹窗
          if (options.suppressErrors) {
            shouldSuppressError = true;
          }
          
          // 只有在不抑制错误时才显示错误弹窗
          if (!shouldSuppressError) {
            // 显示错误弹窗并阻止页面使用
            showModal(
              errorMsg + '<br><br>请通过后台生成的测试链接访问，不要直接访问静态文件。',
              '访问错误',
              function() {
                // 可以选择跳转到首页
                // window.location.href = '/';
              }
            );
          }
          
          // 返回null，表示初始化失败
          return null;
        }

        const { token, testCode: urlTestCode, unlimited } = params;
        const finalTestCode = testCode || urlTestCode;

        // 创建验证器实例
        const validator = new PsyTestValidatorInstance(token, finalTestCode, unlimited);

        // 先保存到全局变量（向后兼容），确保即使验证失败也能访问
        window.linkValidator = validator;

        // 验证链接（页面加载时不显示弹窗）
        const validateResult = await validator.validate(options.perspective, false);

        // 保存验证结果
        validator.link = validateResult.link;
        // 优先使用 is_dual_perspective（API返回的格式），其次使用 isDualPerspective（兼容格式）
        validator.isDualPerspective = validateResult.is_dual_perspective !== undefined 
          ? validateResult.is_dual_perspective 
          : (validateResult.isDualPerspective || false);
        validator.perspectives = validateResult.perspectives || null;

        if (!validateResult.valid) {
          // 链接无效，不显示弹窗（根据需求文档，页面加载时不显示弹窗）
          // 只禁用功能，等用户操作时再显示弹窗
          console.warn('链接验证失败:', validateResult.message);
          
          if (options.onError) {
            options.onError(new Error(validateResult.message || '测试链接无效'));
          }

          // 调用加载完成回调（即使链接无效也调用，让页面可以显示但禁用功能）
          if (options.onLoad) {
            options.onLoad({
              valid: false,
              is_dual_perspective: validator.isDualPerspective,
              perspectives: validator.perspectives,
              unlimited: validator.unlimited,
              error: validateResult.message
            });
          }

          // 添加推广链接（无论链接是否有效都显示）
          addPromotionLink();

          return validator; // 仍然返回validator，但valid为false
        }

        // 链接有效，检查localStorage是否有测试结果
        const hasLocalResult = validator.getLocalResult(options.perspective) !== null;

        // 如果是双视角测试，显示提示信息
        if (validator.isDualPerspective) {
          console.log('双视角测试模式');
          console.log('视角完成状态:', validator.perspectives);
        }

        // 如果是无限测试，显示提示信息
        if (validator.unlimited) {
          console.log('无限测试模式');
        }

        console.log('链接验证成功:', validateResult);
        console.log('是否有本地测试结果:', hasLocalResult);

        // 调用成功回调
        if (options.onSuccess) {
          options.onSuccess(validateResult, validator);
        }

        // 调用加载完成回调（用于双视角测试和决定显示测试页面还是报告页面）
        if (options.onLoad) {
          options.onLoad({
            valid: true,
            is_dual_perspective: validator.isDualPerspective,
            perspectives: validator.perspectives,
            unlimited: validator.unlimited,
            has_local_result: hasLocalResult
          });
        }

        // 添加推广链接（无论链接是否有效都显示）
        addPromotionLink();

        return validator;
      } catch (error) {
        // 验证失败，不显示弹窗（根据需求文档，页面加载时不显示弹窗）
        const errorMessage = error.message || '验证链接失败，请稍后再试';
        console.error('验证链接失败:', errorMessage);
        
        // 如果已经创建了validator实例，确保设置到全局变量
        // 尝试从URL提取参数创建validator（即使验证失败）
        try {
          const params = extractParamsFromUrl();
          if (params) {
            const { token, testCode: urlTestCode, unlimited } = params;
            const finalTestCode = testCode || urlTestCode;
            const validator = new PsyTestValidatorInstance(token, finalTestCode, unlimited);
            validator.valid = false;
            validator.validationError = errorMessage;
            window.linkValidator = validator;
          }
        } catch (e) {
          console.error('创建validator实例失败:', e);
        }
        
        if (options.onError) {
          options.onError(error);
        }

        // 调用加载完成回调（即使验证失败也调用，让页面可以显示但禁用功能）
        if (options.onLoad) {
          options.onLoad({
            valid: false,
            is_dual_perspective: false,
            perspectives: null,
            unlimited: false,
            error: errorMessage
          });
        }

        // 添加推广链接（无论链接是否有效都显示）
        addPromotionLink();
        
        // 如果已经创建了validator，返回它；否则返回null
        return window.linkValidator || null;
      }
    },

    /**
     * 验证链接（手动调用）
     */
    validate: validateLink,

    /**
     * 记录测试开始（手动调用）
     */
    startTest: startTest,

    /**
     * 记录测试完成（手动调用）
     */
    completeTest: completeTest,

    /**
     * 显示弹窗（手动调用）
     */
    showModal: showModal,
    
    /**
     * 添加推广链接（手动调用）
     */
    addPromotionLink: addPromotionLink
  };

  /**
   * 导出到全局
   */
  window.PsyTestValidator = PsyTestValidator;

  /**
   * 向后兼容：保留旧的全局对象
   */
  window.LinkValidator = {
    validate: validateLink,
    startTest: startTest,
    completeTest: completeTest,
    showModal: showModal
  };

  /**
   * 如果页面加载完成，自动初始化（可选）
   * 注意：建议在测试页面中手动调用 PsyTestValidator.init() 以便传入回调函数
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      // 不自动初始化，等待手动调用
      console.log('PsyTestValidator SDK 已加载，请调用 PsyTestValidator.init() 进行初始化');
    });
  } else {
    console.log('PsyTestValidator SDK 已加载，请调用 PsyTestValidator.init() 进行初始化');
  }

})();
