/**
 * SRI 同意页面逻辑
 * 完全独立的实现，不依赖任何外部框架
 */

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initialize();
});

/**
 * 初始化同意页面
 */
function initialize() {
  // 开始测试按钮
  const startButton = document.getElementById('startButton');
  
  startButton.addEventListener('click', async () => {
    // 等待SDK初始化完成（最多等待3秒）
    let waitCount = 0;
    while (!window.linkValidator && waitCount < 30) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitCount++;
    }
    
    // 检查SDK是否初始化
    if (!window.linkValidator) {
      console.error('SDK未初始化:', {
        linkValidator: window.linkValidator,
        PsyTestValidator: window.PsyTestValidator,
        validatorInstance: window.validatorInstance
      });
      alert('验证SDK未初始化，无法开始测试。请刷新页面重试。');
      return;
    }
    
    // 验证链接有效性
    let isValid = false;
    if (typeof window.linkValidator.validateForUserAction === 'function') {
      try {
        isValid = await window.linkValidator.validateForUserAction();
        if (!isValid || window.linkValidator.valid === false) {
          console.warn('链接验证失败，无法开始测试');
          return;
        }
      } catch (error) {
        console.error('链接验证失败:', error);
        if (window.linkValidator) {
          window.linkValidator.valid = false;
        }
        return;
      }
    } else {
      if (window.linkValidator.valid === false) {
        alert(window.linkValidator.validationError || '测试链接无效，请检查链接是否正确');
        return;
      }
      isValid = window.linkValidator.valid !== false;
    }
    
    // 最终检查：确保验证通过
    if (!isValid || (window.linkValidator && window.linkValidator.valid === false)) {
      console.warn('最终验证检查失败，无法开始测试');
      return;
    }
    
    // 记录测试开始
    if (window.linkValidator && typeof window.linkValidator.startTest === 'function') {
      try {
        await window.linkValidator.startTest();
        console.log('测试开始记录成功');
      } catch (error) {
        console.error('记录测试开始失败:', error);
        // 测试开始失败，仍然允许继续（不阻止用户测试）
      }
    }
    
    // 跳转到问卷页面（需要传递token）
    const token = window.linkValidator && window.linkValidator.token;
    const isUnlimited = window.linkValidator && window.linkValidator.unlimited;
    let questionnaireUrl = 'questionnaire.html';
    const urlParams = new URLSearchParams();
    
    if (token) {
      urlParams.set('token', token);
    }
    if (isUnlimited) {
      urlParams.set('unlimited', 'true');
    }
    
    const queryString = urlParams.toString();
    if (queryString) {
      questionnaireUrl = `${questionnaireUrl}?${queryString}`;
    }
    
    window.location.href = questionnaireUrl;
  });
  
  // 添加按钮点击效果
  startButton.addEventListener('mousedown', () => {
    startButton.style.transform = 'scale(0.98)';
  });
  
  startButton.addEventListener('mouseup', () => {
    startButton.style.transform = 'scale(1)';
  });
  
  startButton.addEventListener('mouseleave', () => {
    startButton.style.transform = 'scale(1)';
  });
}

