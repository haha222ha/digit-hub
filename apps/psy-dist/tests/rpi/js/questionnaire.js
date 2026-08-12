/**
 * RPI 问卷页面逻辑
 * 完全独立的实现，不依赖任何外部框架
 * 支持双视角：self（给自己测）、partner（为恋人测）
 */

import { SELF_QUESTIONS, PARTNER_QUESTIONS } from '../data/questions.js';
import { calculateScore } from '../data/scoring.js';
import { 
  saveTestProgress, 
  getTestProgress, 
  clearTestProgress,
  saveTestResult 
} from './utils/storage.js';

/**
 * 获取测试token
 * @returns {string|null} token或null
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
 * 调用completeTest API保存测试结果
 * @param {string} token - 测试链接token
 * @param {string} perspective - 视角类型（'self'或'other'）
 * @param {object} resultData - 测试结果数据
 * @returns {Promise<object>} API响应
 */
async function callCompleteTestAPI(token, perspective, resultData) {
  const API_BASE_URL = '/api/links/complete-test';
  
  const response = await fetch(API_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token: token,
      perspective: perspective,
      resultData: resultData
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `API请求失败: ${response.status}`);
  }
  
  return await response.json();
}

// 全局状态
let testType = null; // 'self' 或 'partner'
let questions = [];
let currentQuestion = 0;
let answers = new Array(40).fill(null);

// 维度信息
const DIMENSIONS = {
  control: {
    name: '控制欲望',
    description: '评估您对伴侣行为的控制倾向',
    color: '#FF6B9D'
  },
  jealousy: {
    name: '嫉妒强度',
    description: '评估您在关系中体验到的嫉妒情绪',
    color: '#FF4757'
  },
  dependency: {
    name: '情感依赖',
    description: '评估您对伴侣的情感依赖程度',
    color: '#FF9DCA'
  },
  insecurity: {
    name: '关系不安全感',
    description: '评估您在关系中的安全感和信任度',
    color: '#FFB3D9'
  }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initialize();
});

/**
 * 初始化问卷页面
 */
async function initialize() {
  try {
    showLoading(true);
    
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
    
    // 根据测试类型加载对应的题目
    questions = testType === 'self' ? SELF_QUESTIONS : PARTNER_QUESTIONS;
    
    // 尝试恢复进度
    const savedProgress = getTestProgress(testType);
    
    if (savedProgress && savedProgress.answers) {
      answers = savedProgress.answers;
      currentQuestion = savedProgress.currentQuestion || 0;
    } else {
      answers = new Array(40).fill(null);
      currentQuestion = 0;
    }
    
  // 初始化UI
  initializeUI();
  
  // 初始化题目跳转网格
  initializeJumpGrid();
  
  // 渲染当前题目
  renderQuestion();
  
  // 更新进度
  updateProgress();
  
  showLoading(false);
    
  } catch (error) {
    console.error('初始化失败:', error);
    showLoading(false);
    alert('加载失败，请刷新页面重试。');
  }
}

/**
 * 显示/隐藏加载提示
 */
function showLoading(show) {
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
  }
}

/**
 * 初始化UI
 */
function initializeUI() {
  // 更新测试类型标识
  const testTypeBadge = document.getElementById('testTypeBadge');
  if (testTypeBadge) {
    testTypeBadge.textContent = testType === 'self' ? '给自己测' : '为恋人测';
  }
  
  // 返回按钮
  const backButton = document.getElementById('backButton');
  if (backButton) {
    backButton.addEventListener('click', () => {
      if (confirm('确定要返回吗？未保存的进度可能会丢失。')) {
        // 携带token跳转
        const token = getToken();
        const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
        window.location.href = `demographic.html?type=${testType}${tokenParam}`;
      }
    });
  }
  
  // 导航按钮
  const prevButton = document.getElementById('prevButton');
  const nextButton = document.getElementById('nextButton');
  const submitButton = document.getElementById('submitButton');
  
  if (prevButton) {
    prevButton.addEventListener('click', goToPrevious);
  }
  
  if (nextButton) {
    nextButton.addEventListener('click', goToNext);
  }
  
  if (submitButton) {
    submitButton.addEventListener('click', () => {
      showSubmitModal();
    });
  }
  
  // 提交确认对话框
  const submitCancel = document.getElementById('submitCancel');
  const submitConfirm = document.getElementById('submitConfirm');
  const submitModalClose = document.getElementById('submitModalClose');
  
  if (submitCancel) {
    submitCancel.addEventListener('click', hideSubmitModal);
  }
  
  if (submitConfirm) {
    submitConfirm.addEventListener('click', handleSubmit);
  }
  
  if (submitModalClose) {
    submitModalClose.addEventListener('click', hideSubmitModal);
  }
}

/**
 * 初始化题目跳转网格
 */
function initializeJumpGrid() {
  const jumpGrid = document.getElementById('jumpGrid');
  if (!jumpGrid) return;
  
  jumpGrid.innerHTML = '';
  
  questions.forEach((_, index) => {
    const button = document.createElement('button');
    button.className = 'rpi-questionnaire-jump-btn';
    button.textContent = index + 1;
    button.addEventListener('click', () => {
      currentQuestion = index;
      renderQuestion();
      updateProgress();
      saveProgress();
    });
    
    jumpGrid.appendChild(button);
  });
  
  updateJumpGrid();
}

/**
 * 更新题目跳转网格状态
 */
function updateJumpGrid() {
  const jumpGrid = document.getElementById('jumpGrid');
  if (!jumpGrid) return;
  
  const buttons = jumpGrid.querySelectorAll('.rpi-questionnaire-jump-btn');
  buttons.forEach((button, index) => {
    button.classList.remove('active', 'answered');
    
    if (index === currentQuestion) {
      button.classList.add('active');
    }
    
    if (answers[index] !== null && answers[index] !== undefined) {
      button.classList.add('answered');
    }
  });
}

/**
 * 渲染当前题目
 */
function renderQuestion() {
  if (currentQuestion < 0 || currentQuestion >= questions.length) {
    return;
  }
  
  const question = questions[currentQuestion];
  const currentAnswer = answers[currentQuestion];
  
  // 更新题目编号和文本
  document.getElementById('questionNumber').textContent = currentQuestion + 1;
  document.getElementById('questionText').textContent = question.text;
  
  // 更新维度信息
  updateDimensionBanner(question.dimension);
  
  // 渲染选项
  renderOptions(question.options, currentAnswer);
  
  // 更新导航按钮状态
  updateNavButtons();
  
  // 更新状态提示
  updateStatus();
  
  // 更新跳转网格
  updateJumpGrid();
  
  // 滚动到顶部
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * 更新维度横幅
 */
function updateDimensionBanner(dimensionKey) {
  const dimension = DIMENSIONS[dimensionKey];
  if (!dimension) return;
  
  // 计算当前维度内的题目编号
  const dimensionQuestions = questions.filter(q => q.dimension === dimensionKey);
  const currentDimensionIndex = dimensionQuestions.findIndex(q => {
    const globalIndex = questions.findIndex(globalQ => globalQ.id === q.id);
    return globalIndex === currentQuestion;
  });
  const dimensionQuestionNumber = currentDimensionIndex + 1;
  
  // 更新维度标题
  const dimensionTitle = document.getElementById('dimensionTitle');
  if (dimensionTitle) {
    dimensionTitle.textContent = `${dimension.name}量表${testType === 'self' ? '（自测版）' : '（恋人版）'}`;
    dimensionTitle.style.color = dimension.color;
  }
  
  // 更新维度计数
  const dimensionCount = document.getElementById('dimensionCount');
  if (dimensionCount) {
    dimensionCount.textContent = `第 ${dimensionQuestionNumber} / 10 题`;
  }
  
  // 更新维度描述
  const dimensionDesc = document.getElementById('dimensionDesc');
  if (dimensionDesc) {
    dimensionDesc.textContent = dimension.description;
  }
  
  // 更新维度横幅背景色
  const dimensionBanner = document.getElementById('dimensionBanner');
  if (dimensionBanner) {
    dimensionBanner.style.background = `linear-gradient(135deg, ${dimension.color}15, ${dimension.color}05)`;
    dimensionBanner.style.borderLeft = `4px solid ${dimension.color}`;
  }
}

/**
 * 渲染选项
 */
function renderOptions(options, selectedValue) {
  const optionsContainer = document.getElementById('questionOptions');
  if (!optionsContainer) return;
  
  optionsContainer.innerHTML = '';
  
  options.forEach(option => {
    const optionItem = document.createElement('label');
    optionItem.className = 'rpi-option-item';
    
    const optionValue = typeof option.value === 'number' ? option.value : parseInt(option.value);
    const selectedValueNum = selectedValue !== null ? parseInt(selectedValue) : null;
    
    if (selectedValueNum === optionValue) {
      optionItem.classList.add('selected');
    }
    
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'questionOption';
    radio.value = option.value;
    radio.checked = selectedValueNum === optionValue;
    radio.addEventListener('change', () => handleAnswerChange(optionValue));
    
    const label = document.createElement('span');
    label.textContent = option.label;
    
    optionItem.appendChild(radio);
    optionItem.appendChild(label);
    optionsContainer.appendChild(optionItem);
  });
}

/**
 * 处理答案选择
 */
function handleAnswerChange(value) {
  answers[currentQuestion] = value;
  
  // 保存进度
  saveProgress();
  
  // 更新UI
  updateProgress();
  updateStatus();
  updateNavButtons();
  
  // 自动跳转到下一题（延迟300ms，让用户看到选中效果）
  setTimeout(() => {
    if (currentQuestion < questions.length - 1) {
      currentQuestion++;
      renderQuestion();
      updateProgress();
    }
  }, 300);
}

/**
 * 更新进度
 */
function updateProgress() {
  const totalQuestions = questions.length;
  const answeredCount = answers.filter(ans => ans !== null && ans !== undefined).length;
  const progress = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  
  // 更新进度文本
  document.getElementById('currentQuestionNum').textContent = currentQuestion + 1;
  document.getElementById('answeredCount').textContent = answeredCount;
  
  // 更新进度条
  const progressFill = document.getElementById('progressFill');
  if (progressFill) {
    progressFill.style.width = progress + '%';
  }
  
  // 检查是否所有题目都已作答
  const allAnswered = answeredCount === totalQuestions;
  
  // 显示/隐藏提交按钮
  const submitButton = document.getElementById('submitButton');
  const nextButton = document.getElementById('nextButton');
  
  if (allAnswered && currentQuestion === questions.length - 1) {
    if (submitButton) submitButton.style.display = 'block';
    if (nextButton) nextButton.style.display = 'none';
  } else {
    if (submitButton) submitButton.style.display = 'none';
    if (nextButton) nextButton.style.display = 'block';
  }
}

/**
 * 更新导航按钮状态
 */
function updateNavButtons() {
  const prevButton = document.getElementById('prevButton');
  const nextButton = document.getElementById('nextButton');
  
  // 上一题按钮
  if (prevButton) {
    prevButton.disabled = currentQuestion === 0;
  }
  
  // 下一题按钮
  if (nextButton) {
    const hasAnswer = answers[currentQuestion] !== null && answers[currentQuestion] !== undefined;
    nextButton.disabled = !hasAnswer || currentQuestion === questions.length - 1;
  }
}

/**
 * 更新状态提示
 */
function updateStatus() {
  const statusText = document.getElementById('statusText');
  const checkIcon = document.getElementById('checkIcon');
  const hasAnswer = answers[currentQuestion] !== null && answers[currentQuestion] !== undefined;
  
  if (statusText) {
    statusText.textContent = hasAnswer ? '已回答' : '请选择答案';
  }
  
  if (checkIcon) {
    checkIcon.style.display = hasAnswer ? 'inline' : 'none';
  }
}

/**
 * 跳转到上一题
 */
function goToPrevious() {
  if (currentQuestion > 0) {
    currentQuestion--;
    renderQuestion();
    updateProgress();
    saveProgress();
    updateJumpGrid();
  }
}

/**
 * 跳转到下一题
 */
function goToNext() {
  if (answers[currentQuestion] !== null && answers[currentQuestion] !== undefined) {
    if (currentQuestion < questions.length - 1) {
      currentQuestion++;
      renderQuestion();
      updateProgress();
      saveProgress();
      updateJumpGrid();
    }
  } else {
    alert('请先选择答案');
  }
}

/**
 * 保存进度
 */
function saveProgress() {
  saveTestProgress(answers, currentQuestion, testType);
}

/**
 * 显示提交确认对话框
 */
function showSubmitModal() {
  const allAnswered = answers.every(ans => ans !== null && ans !== undefined);
  
  if (!allAnswered) {
    const unansweredCount = answers.filter(ans => ans === null || ans === undefined).length;
    alert(`还有 ${unansweredCount} 道题目未作答，请完成所有题目后再提交。`);
    return;
  }
  
  const modal = document.getElementById('submitModal');
  const submitProgress = document.getElementById('submitProgress');
  
  if (!modal) return;
  
  const answeredCount = answers.filter(ans => ans !== null && ans !== undefined).length;
  
  if (submitProgress) {
    if (answeredCount === questions.length) {
      submitProgress.textContent = `您已完成所有 ${questions.length} 题，可以提交测试。`;
      submitProgress.style.color = '#52c41a';
    } else {
      submitProgress.textContent = `还有 ${questions.length - answeredCount} 题未完成，确定要提交吗？`;
      submitProgress.style.color = '#ff4d4f';
    }
  }
  
  modal.style.display = 'flex';
}

/**
 * 隐藏提交确认对话框
 */
function hideSubmitModal() {
  const modal = document.getElementById('submitModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * 处理提交
 */
async function handleSubmit() {
  // 检查是否所有题目都已作答
  const allAnswered = answers.every(ans => ans !== null && ans !== undefined);
  
  if (!allAnswered) {
    hideSubmitModal();
    const unansweredCount = answers.filter(ans => ans === null || ans === undefined).length;
    alert(`还有 ${unansweredCount} 道题目未作答，请完成所有题目后再提交。`);
    return;
  }
  
  try {
    showLoading(true);
    hideSubmitModal();
    
    // 获取人口统计信息
    const demographicData = JSON.parse(localStorage.getItem(`rpi_demographic_${testType}`) || '{}');
    
    // 计算分数
    const result = calculateScore(answers);
    
    // 保存结果（包含人口统计信息）
    const fullResult = {
      ...result,
      testType,
      demographic: demographicData,
      completedAt: new Date().toISOString()
    };
    
    // 保存到localStorage
    saveTestResult(fullResult, testType);
    
    // 如果有token，调用后台API保存测试完成记录（如果不是无限测试）
    const token = getToken();
    if (token) {
      // 检查是否是无限测试
      const isUnlimited = isUnlimitedTest(token);
      console.log('是否无限测试:', isUnlimited);
      
      // 如果是无限测试，跳过API调用
      if (!isUnlimited) {
        try {
          // 将testType转换为perspective：'self' -> 'self', 'partner' -> 'other'
          const perspective = testType === 'self' ? 'self' : 'other';
          console.log('调用completeTest API', { token, perspective, testType });
          const apiResponse = await callCompleteTestAPI(token, perspective, fullResult);
          console.log('测试完成记录已保存到后台', apiResponse);
          if (apiResponse.data) {
            console.log('API返回数据:', {
              usedCount: apiResponse.data.used_count,
              bothCompleted: apiResponse.data.both_completed,
              selfCompleted: apiResponse.data.self_completed,
              partnerCompleted: apiResponse.data.partner_completed,
            });
          }
        } catch (apiError) {
          // API调用失败不影响测试完成，只记录错误
          console.error('保存测试完成记录到后台失败（不影响本地结果）:', apiError);
        }
      } else {
        console.log('无限测试模式，跳过completeTest API调用');
      }
    } else {
      console.log('未找到token，仅保存到本地（离线模式）');
    }
    
    // 清除进度
    clearTestProgress(testType);
    
    // 跳转到分析页面
    showLoading(false);
    // 携带token跳转
    const finalToken = getToken();
    const finalTokenParam = finalToken ? `&token=${encodeURIComponent(finalToken)}` : '';
    window.location.href = `analysis.html?type=${testType}${finalTokenParam}`;
    
  } catch (error) {
    console.error('提交失败:', error);
    showLoading(false);
    hideSubmitModal();
    alert('提交失败，请重试。错误：' + error.message);
  }
}

