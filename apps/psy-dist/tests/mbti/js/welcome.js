/**
 * MBTI 欢迎页面逻辑
 * 处理欢迎页面和问卷页面之间的切换
 */

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initialize();
});

/**
 * 初始化欢迎页面
 */
function initialize() {
  const startButton = document.getElementById('welcomeStartButton');
  const welcomePage = document.getElementById('welcomePage');
  const questionnairePage = document.getElementById('questionnairePage');
  
  if (!startButton || !welcomePage || !questionnairePage) {
    console.error('欢迎页面元素未找到');
    return;
  }
  
  // 开始测试按钮事件
  startButton.addEventListener('click', async () => {
    // 等待SDK初始化完成（最多等待3秒）
    let waitCount = 0;
    while (!window.linkValidator && waitCount < 30) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitCount++;
    }
    
    // 检查SDK是否初始化
    if (!window.linkValidator) {
      console.error('SDK未初始化，无法开始测试');
      alert('验证SDK未初始化，无法开始测试。请刷新页面重试。');
      return;
    }
    
    // 先验证链接有效性（如果无效会显示弹窗）
    let isValid = false;
    if (typeof window.linkValidator.validateForUserAction === 'function') {
      try {
        isValid = await window.linkValidator.validateForUserAction();
        console.log('验证结果:', { isValid, valid: window.linkValidator.valid, error: window.linkValidator.validationError });
        
        // 检查验证结果和验证状态（双重检查）
        if (!isValid || window.linkValidator.valid === false) {
          // 链接无效，已显示弹窗，不进入答题页面
          console.warn('链接验证失败，无法开始测试', {
            isValid,
            valid: window.linkValidator.valid,
            error: window.linkValidator.validationError
          });
          return;
        }
      } catch (error) {
        // 验证失败，已显示弹窗，不进入答题页面
        console.error('链接验证失败:', error);
        if (window.linkValidator) {
          window.linkValidator.valid = false;
        }
        return;
      }
    } else {
      // 如果validateForUserAction不存在，检查valid状态
      if (window.linkValidator.valid === false) {
        alert(window.linkValidator.validationError || '测试链接无效，请检查链接是否正确');
        return;
      }
      isValid = window.linkValidator.valid !== false;
    }
    
    // 最终检查：确保验证通过才进入答题页面
    if (!isValid || (window.linkValidator && window.linkValidator.valid === false)) {
      console.warn('最终验证检查失败，无法开始测试');
      return;
    }
    
    // 链接验证通过，进入答题页面
    // 隐藏欢迎页面
    welcomePage.style.display = 'none';
    // 显示问卷页面
    questionnairePage.style.display = 'flex';
    
    // 初始化问卷（如果还没初始化）
    if (window.initQuestionnaire && typeof window.initQuestionnaire === 'function') {
      try {
        window.initQuestionnaire();
      } catch (error) {
        console.error('初始化问卷失败:', error);
        // 如果初始化失败，返回欢迎页面
        welcomePage.style.display = 'flex';
        questionnairePage.style.display = 'none';
      }
    }
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

