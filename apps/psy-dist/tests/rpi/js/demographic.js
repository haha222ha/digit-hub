/**
 * RPI 基本信息页面逻辑
 * 完全独立的实现，不依赖任何外部框架
 * 1:1复刻原版结构
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
let formData = {
  age: null,
  gender: null,
  zodiac: null,
  relationshipStatus: null,
  relationshipDuration: null
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initialize();
});

/**
 * 初始化基本信息页面
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
    
    // 更新UI
    updateUIForTestType();
    
    // 初始化表单事件
    initializeFormEvents();
    
    // 清除之前保存的表单数据，确保每次都是新表单
    clearSavedFormData();
    
    // 验证表单状态
    validateForm();
    
    // 隐藏加载提示
    hideLoading();
    
  } catch (error) {
    console.error('初始化失败:', error);
    hideLoading();
    alert('加载失败，请刷新页面重试。');
  }
}

/**
 * 根据测试类型更新UI文本
 */
function updateUIForTestType() {
  const testTypeText = document.getElementById('testTypeText');
  const heroTitle = document.getElementById('heroTitle');
  const heroDesc = document.getElementById('heroDesc');
  const ageLabel = document.getElementById('ageLabel');
  const genderLabel = document.getElementById('genderLabel');
  const zodiacLabel = document.getElementById('zodiacLabel');
  const relationshipStatusLabel = document.getElementById('relationshipStatusLabel');
  const relationshipDurationLabel = document.getElementById('relationshipDurationLabel');
  
  if (testType === 'self') {
    if (testTypeText) testTypeText.textContent = '💖 给自己测';
    if (heroTitle) heroTitle.textContent = '基本信息';
    if (heroDesc) heroDesc.textContent = '请提供一些基本信息，这将帮助我们提供更准确的结果分析';
    if (ageLabel) ageLabel.textContent = '您的年龄段';
    if (genderLabel) genderLabel.textContent = '您的性别';
    if (zodiacLabel) zodiacLabel.textContent = '您的星座';
    if (relationshipStatusLabel) relationshipStatusLabel.textContent = '您目前的恋爱状态';
    if (relationshipDurationLabel) relationshipDurationLabel.textContent = '当前(最近)一段恋爱的持续时间';
  } else {
    if (testTypeText) testTypeText.textContent = '💞 为恋人测';
    if (heroTitle) heroTitle.textContent = '恋人基本信息';
    if (heroDesc) heroDesc.textContent = '请提供恋人的基本信息，这将帮助我们提供更准确的评估结果';
    if (ageLabel) ageLabel.textContent = 'Ta的年龄段';
    if (genderLabel) genderLabel.textContent = 'Ta的性别';
    if (zodiacLabel) zodiacLabel.textContent = 'Ta的星座';
    if (relationshipStatusLabel) relationshipStatusLabel.textContent = '你们目前的恋爱状态';
    if (relationshipDurationLabel) relationshipDurationLabel.textContent = '你们在一起的时间';
  }
}

/**
 * 初始化表单事件
 */
function initializeFormEvents() {
  // 监听所有单选按钮变化
  const radioInputs = document.querySelectorAll('input[type="radio"]');
  radioInputs.forEach(input => {
    input.addEventListener('change', () => {
      updateFormData();
      validateForm();
    });
  });
  
  // 初始化自定义下拉菜单
  initializeCustomSelect();
}

/**
 * 初始化自定义下拉菜单
 */
function initializeCustomSelect() {
  const wrapper = document.getElementById('zodiacSelectWrapper');
  const trigger = document.getElementById('zodiacSelectTrigger');
  const dropdown = document.getElementById('zodiacSelectDropdown');
  const hiddenInput = document.getElementById('zodiacSelect');
  const options = dropdown.querySelectorAll('.rpi-custom-select-option');

  if (!wrapper || !trigger || !dropdown || !hiddenInput) return;

  // 点击触发器切换下拉菜单
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isActive = wrapper.classList.contains('active');
    
    if (isActive) {
      // 关闭下拉菜单
      wrapper.classList.remove('active');
      // 将下拉菜单移回原位置
      if (dropdown.parentElement !== wrapper) {
        wrapper.appendChild(dropdown);
      }
    } else {
      // 打开下拉菜单
      wrapper.classList.add('active');
      // 将下拉菜单移到 body 下，脱离层叠上下文限制
      dropdown.classList.add('rpi-dropdown-active');
      document.body.appendChild(dropdown);
      // 立即设置显示样式（因为下拉菜单在 body 下，CSS 选择器可能不生效）
      dropdown.style.display = 'block';
      dropdown.style.opacity = '1';
      dropdown.style.visibility = 'visible';
      dropdown.style.zIndex = '999999';
      dropdown.style.position = 'fixed';
      // 强制重排，确保下拉菜单已经添加到 DOM
      dropdown.offsetHeight;
      // 计算下拉菜单位置，确保不超出屏幕（立即执行，不使用延迟）
      positionDropdown(wrapper, dropdown);
    }
  });

  // 点击选项
  options.forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = option.getAttribute('data-value');
      const text = option.querySelector('.rpi-custom-select-option-text').textContent;
      const icon = option.querySelector('.rpi-custom-select-option-icon');

      // 更新隐藏输入值
      hiddenInput.value = value;

      // 更新显示
      if (value) {
        const triggerPlaceholder = trigger.querySelector('.rpi-custom-select-placeholder');
        if (triggerPlaceholder) {
          triggerPlaceholder.style.display = 'none';
        }
        
        let triggerValue = trigger.querySelector('.rpi-custom-select-value');
        if (!triggerValue) {
          triggerValue = document.createElement('span');
          triggerValue.className = 'rpi-custom-select-value';
          trigger.insertBefore(triggerValue, trigger.querySelector('.rpi-custom-select-arrow'));
        }
        
        triggerValue.innerHTML = `
          <span class="rpi-custom-select-value-text">${text}</span>
          ${icon ? `<span class="rpi-custom-select-value-icon">${icon.textContent}</span>` : ''}
        `;
      } else {
        const triggerValue = trigger.querySelector('.rpi-custom-select-value');
        if (triggerValue) {
          triggerValue.remove();
        }
        const triggerPlaceholder = trigger.querySelector('.rpi-custom-select-placeholder');
        if (triggerPlaceholder) {
          triggerPlaceholder.style.display = 'block';
        }
      }

      // 更新选中状态
      options.forEach(opt => {
        opt.classList.remove('selected');
      });
      option.classList.add('selected');

      // 关闭下拉菜单
      wrapper.classList.remove('active');
      dropdown.classList.remove('rpi-dropdown-active');
      dropdown.style.display = 'none';
      dropdown.style.opacity = '0';
      dropdown.style.visibility = 'hidden';
      
      // 移除滚动监听器
      if (wrapper._scrollListener) {
        window.removeEventListener('scroll', wrapper._scrollListener);
        window.removeEventListener('resize', wrapper._scrollListener);
        wrapper._scrollListener = null;
      }
      
      // 将下拉菜单移回原位置
      if (dropdown.parentElement !== wrapper) {
        wrapper.appendChild(dropdown);
      }

      // 更新表单数据
      updateFormData();
      validateForm();
    });
  });

  // 阻止下拉菜单内部的滚动事件冒泡
  dropdown.addEventListener('wheel', (e) => {
    e.stopPropagation();
  }, { passive: false });

  dropdown.addEventListener('touchmove', (e) => {
    e.stopPropagation();
  }, { passive: false });

  dropdown.addEventListener('scroll', (e) => {
    e.stopPropagation();
  });

  // 点击外部关闭下拉菜单（延迟执行，避免与下拉菜单内点击冲突）
  let clickOutsideHandler = (e) => {
    // 检查点击是否在下拉菜单内部
    if (!wrapper.contains(e.target) && !dropdown.contains(e.target)) {
      wrapper.classList.remove('active');
      dropdown.classList.remove('rpi-dropdown-active');
      dropdown.style.display = 'none';
      dropdown.style.opacity = '0';
      dropdown.style.visibility = 'hidden';
      
      // 移除滚动监听器
      if (wrapper._scrollListener) {
        window.removeEventListener('scroll', wrapper._scrollListener);
        window.removeEventListener('resize', wrapper._scrollListener);
        wrapper._scrollListener = null;
      }
      
      // 将下拉菜单移回原位置
      if (dropdown.parentElement !== wrapper) {
        wrapper.appendChild(dropdown);
      }
    }
  };
  
  // 延迟绑定，确保下拉菜单打开后再绑定
  wrapper.addEventListener('mousedown', (e) => {
    if (wrapper.classList.contains('active')) {
      setTimeout(() => {
        document.addEventListener('click', clickOutsideHandler, true);
      }, 0);
    }
  });

  // 下拉菜单关闭时移除事件监听并将下拉菜单移回原位置
  const observer = new MutationObserver(() => {
    if (!wrapper.classList.contains('active')) {
      document.removeEventListener('click', clickOutsideHandler, true);
      dropdown.classList.remove('rpi-dropdown-active');
      dropdown.style.display = 'none';
      dropdown.style.opacity = '0';
      dropdown.style.visibility = 'hidden';
      
      // 移除滚动监听器
      if (wrapper._scrollListener) {
        window.removeEventListener('scroll', wrapper._scrollListener);
        window.removeEventListener('resize', wrapper._scrollListener);
        wrapper._scrollListener = null;
      }
      
      // 将下拉菜单移回原位置
      if (dropdown.parentElement !== wrapper) {
        wrapper.appendChild(dropdown);
      }
    }
  });
  observer.observe(wrapper, { attributes: true, attributeFilter: ['class'] });

  // 移除页面滚动时关闭下拉菜单的逻辑
  // 允许用户在滚动页面时仍能选择下拉菜单中的选项
}

/**
 * 计算下拉菜单位置，确保不超出屏幕
 */
function positionDropdown(wrapper, dropdown) {
  const trigger = wrapper.querySelector('.rpi-custom-select-trigger');
  if (!trigger) return;
  
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const isMobile = window.innerWidth <= 768;
  
  // 固定定位：基于视口位置
  dropdown.style.position = 'fixed';
  dropdown.style.left = rect.left + 'px';
  dropdown.style.width = rect.width + 'px';
  dropdown.style.right = 'auto';

  // 计算最大高度，确保下拉菜单不超出屏幕，并且能够显示滚动条
  // 每个选项的高度约为 48px（包括 padding 和 border）
  const optionHeight = 48;
  const optionCount = 13; // "请选择星座" + 12个星座选项
  const totalContentHeight = optionCount * optionHeight; // 约 624px
  
  // 设置最大高度限制（最多显示约6个选项，约288px）
  // 这样当有13个选项时，会显示滚动条
  const minDropdownHeight = 180; // 最小高度（至少显示3-4个选项）
  const maxDropdownHeight = 288; // 最大高度（最多显示约6个选项，确保显示滚动条）
  const safeMarginBottom = 100; // 底部安全边距（为底部按钮和操作留空间）
  const safeMarginTop = 20; // 顶部安全边距
  
  // 计算实际可用空间
  let availableSpace;
  let useBottom = true; // 默认显示在下方
  
  // 判断使用上方还是下方空间
  if (spaceBelow < minDropdownHeight + safeMarginBottom && spaceAbove > spaceBelow) {
    // 下方空间不足，使用上方空间
    useBottom = false;
    availableSpace = spaceAbove - safeMarginTop;
  } else {
    // 使用下方空间
    useBottom = true;
    availableSpace = spaceBelow - safeMarginBottom;
  }
  
  // 计算实际的最大高度
  // 确保不超过可用空间，也不超过最大高度，但至少要有最小高度
  let maxHeight = Math.min(maxDropdownHeight, availableSpace);
  maxHeight = Math.max(minDropdownHeight, maxHeight);
  
  // 设置位置
  if (useBottom) {
    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.bottom = 'auto';
  } else {
    dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    dropdown.style.top = 'auto';
  }
  
  // 强制设置最大高度和overflow，确保滚动条显示
  // 使用 setProperty 并加上 !important 确保样式生效
  dropdown.style.setProperty('max-height', maxHeight + 'px', 'important');
  dropdown.style.setProperty('height', 'auto', 'important');
  dropdown.style.setProperty('overflow-y', 'auto', 'important');
  dropdown.style.setProperty('overflow-x', 'hidden', 'important');
  
  // 强制触发重排，确保样式生效
  dropdown.offsetHeight;

  // 确保下拉菜单可以滚动
  dropdown.style.overflowY = 'auto';
  dropdown.style.overflowX = 'hidden';
  dropdown.style.webkitOverflowScrolling = 'touch';
  dropdown.style.zIndex = '999999';
}

/**
 * 更新表单数据
 */
function updateFormData() {
  // 获取年龄段
  const ageInput = document.querySelector('input[name="age"]:checked');
  formData.age = ageInput ? ageInput.value : null;
  
  // 获取性别
  const genderInput = document.querySelector('input[name="gender"]:checked');
  formData.gender = genderInput ? genderInput.value : null;
  
  // 获取星座
  const zodiacSelect = document.getElementById('zodiacSelect');
  formData.zodiac = zodiacSelect ? zodiacSelect.value : null;
  
  // 获取恋爱状态
  const relationshipStatusInput = document.querySelector('input[name="relationshipStatus"]:checked');
  formData.relationshipStatus = relationshipStatusInput ? relationshipStatusInput.value : null;
  
  // 获取恋爱持续时间
  const relationshipDurationInput = document.querySelector('input[name="relationshipDuration"]:checked');
  formData.relationshipDuration = relationshipDurationInput ? relationshipDurationInput.value : null;
}

/**
 * 验证表单
 */
function validateForm() {
  const isFormValid = formData.age && formData.gender && formData.zodiac && formData.relationshipStatus;
  const submitButton = document.getElementById('submitButton');
  
  if (submitButton) {
    submitButton.disabled = !isFormValid;
  }
  
  return isFormValid;
}

/**
 * 处理表单提交（导出到全局）
 */
function handleSubmit() {
  // 更新表单数据
  updateFormData();
  
  // 验证必填项
  if (!formData.age || !formData.gender || !formData.zodiac || !formData.relationshipStatus) {
    alert('请填写所有必填项（标有*的项目）');
    return;
  }
  
  // 保存表单数据
  const fullFormData = {
    ...formData,
    testType,
    timestamp: new Date().toISOString()
  };
  
  // 保存到localStorage
  localStorage.setItem(`rpi_demographic_${testType}`, JSON.stringify(fullFormData));
  
  // 跳转到问卷页面（携带token）
  window.location.href = buildUrlWithToken(`questionnaire.html?type=${testType}`);
}

// 导出到全局作用域以便HTML调用
window.handleSubmit = handleSubmit;

/**
 * 清除已保存的表单数据
 */
function clearSavedFormData() {
  try {
    // 清除之前保存的表单数据
    localStorage.removeItem(`rpi_demographic_${testType}`);
    
    // 确保表单是空的
    const ageInputs = document.querySelectorAll('input[name="age"]');
    ageInputs.forEach(input => input.checked = false);
    
    const genderInputs = document.querySelectorAll('input[name="gender"]');
    genderInputs.forEach(input => input.checked = false);
    
    const hiddenInput = document.getElementById('zodiacSelect');
    if (hiddenInput) {
      hiddenInput.value = '';
    }
    
    // 重置自定义下拉菜单显示
    const wrapper = document.getElementById('zodiacSelectWrapper');
    if (wrapper) {
      wrapper.classList.remove('active');
      const triggerValue = wrapper.querySelector('.rpi-custom-select-value');
      if (triggerValue) {
        triggerValue.remove();
      }
      const triggerPlaceholder = wrapper.querySelector('.rpi-custom-select-placeholder');
      if (triggerPlaceholder) {
        triggerPlaceholder.style.display = 'block';
      }
      
      // 清除选中状态
      const options = wrapper.querySelectorAll('.rpi-custom-select-option');
      options.forEach(opt => opt.classList.remove('selected'));
    }
    
    const statusInputs = document.querySelectorAll('input[name="relationshipStatus"]');
    statusInputs.forEach(input => input.checked = false);
    
    const durationInputs = document.querySelectorAll('input[name="relationshipDuration"]');
    durationInputs.forEach(input => input.checked = false);
    
    // 重置表单数据
    formData = {
      age: null,
      gender: null,
      zodiac: null,
      relationshipStatus: null,
      relationshipDuration: null
    };
  } catch (error) {
    console.error('清除已保存数据失败:', error);
  }
}

/**
 * 加载已保存的表单数据（保留此函数以防将来需要）
 */
function loadSavedFormData() {
  try {
    const savedData = localStorage.getItem(`rpi_demographic_${testType}`);
    if (savedData) {
      const parsed = JSON.parse(savedData);
      
      // 恢复表单数据
      if (parsed.age) {
        const ageInput = document.getElementById(`age-${parsed.age}`);
        if (ageInput) ageInput.checked = true;
      }
      
      if (parsed.gender) {
        const genderInput = document.getElementById(`gender-${parsed.gender}`);
        if (genderInput) genderInput.checked = true;
      }
      
      if (parsed.zodiac) {
        const hiddenInput = document.getElementById('zodiacSelect');
        if (hiddenInput) {
          hiddenInput.value = parsed.zodiac;
          // 触发选择更新显示
          const option = document.querySelector(`.rpi-custom-select-option[data-value="${parsed.zodiac}"]`);
          if (option) {
            option.click();
          }
        }
      }
      
      if (parsed.relationshipStatus) {
        const statusInput = document.getElementById(`status-${parsed.relationshipStatus}`);
        if (statusInput) statusInput.checked = true;
      }
      
      if (parsed.relationshipDuration) {
        const durationInput = document.getElementById(`duration-${parsed.relationshipDuration}`);
        if (durationInput) durationInput.checked = true;
      }
      
      // 更新表单数据
      updateFormData();
    }
  } catch (error) {
    console.error('加载已保存数据失败:', error);
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
