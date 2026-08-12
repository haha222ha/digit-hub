/**
 * Holland 问卷页面逻辑
 * 完全独立的实现，不依赖任何外部框架
 */

import { QUESTIONS, OPTIONS } from '../data/questions.js';
import { calculateScore } from '../data/scoring.js';
import { 
  saveTestProgress, 
  getTestProgress, 
  clearTestProgress,
  saveTestResult,
  getProgressStats 
} from './utils/storage.js';
import { validateAnswers } from './utils/validation.js';

// 全局状态
let currentQuestion = 0;
let answers = new Array(90).fill(null);
let questions = QUESTIONS;
let options = OPTIONS;
let hasShownRestoreModal = false;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initialize();
});

/**
 * 初始化问卷
 */
async function initialize() {
  try {
    // 显示加载提示
    showLoading(true);
    
    // 等待数据加载（如果使用模块导入，数据已经加载）
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 尝试恢复进度
    const savedProgress = getTestProgress();
    
    if (savedProgress && !hasShownRestoreModal) {
      // 有保存的进度，询问用户是否恢复
      hasShownRestoreModal = true;
      answers = savedProgress.answers || new Array(90).fill(null);
      
      // 找到第一个未答的题目
      const firstUnansweredIndex = answers.findIndex(ans => ans === null || ans === undefined);
      if (firstUnansweredIndex !== -1) {
        currentQuestion = firstUnansweredIndex;
      } else {
        currentQuestion = savedProgress.currentQuestion || 0;
      }
      
      // 显示恢复进度对话框
      showRestoreModal(savedProgress);
    } else {
      // 没有保存的进度，初始化
      answers = new Array(90).fill(null);
      currentQuestion = 0;
      hasShownRestoreModal = true;
      
      // 如果是新开始测试，调用测试开始API（HIT是单视角测试）
      if (window.linkValidator) {
        try {
          await window.linkValidator.startTest();
          console.log('测试开始记录成功');
        } catch (error) {
          console.error('记录测试开始失败:', error);
          // 测试开始失败，返回首页
          showLoading(false);
          window.location.href = 'index.html';
          return; // 阻止继续初始化
        }
      } else {
        // SDK未初始化，返回首页
        console.warn('SDK未初始化，无法开始测试');
        showLoading(false);
        window.location.href = 'index.html';
        return; // 阻止继续初始化
      }
    }
    
    // 初始化UI
    initializeUI();
    
    // 渲染当前题目
    renderQuestion();
    
    // 更新进度
    updateProgress();
    
    // 隐藏加载提示
    showLoading(false);
    
  } catch (error) {
    console.error('初始化失败:', error);
    showLoading(false);
    alert('加载失败，请刷新页面重试。');
  }
}

/**
 * 初始化UI元素和事件监听
 */
function initializeUI() {
  // 上一题按钮
  document.getElementById('prevButton').addEventListener('click', goToPrevious);
  
  // 下一题按钮
  document.getElementById('nextButton').addEventListener('click', goToNext);
  
  // 提交按钮
  document.getElementById('submitButton').addEventListener('click', showSubmitModal);
  
  // 恢复进度对话框
  document.getElementById('restoreConfirm').addEventListener('click', () => {
    hideRestoreModal();
    renderQuestion();
    updateProgress();
  });
  
  document.getElementById('restoreCancel').addEventListener('click', () => {
    hideRestoreModal();
    clearTestProgress();
    answers = new Array(90).fill(null);
    currentQuestion = 0;
    renderQuestion();
    updateProgress();
  });
  
  // 提交确认对话框
  document.getElementById('submitConfirm').addEventListener('click', handleSubmit);
  document.getElementById('submitCancel').addEventListener('click', hideSubmitModal);
  
  // 导航卡片折叠
  document.getElementById('navToggle').addEventListener('click', toggleNavigation);
  
  // 初始化导航网格
  initializeNavigationGrid();
}

/**
 * 初始化题目导航网格
 */
function initializeNavigationGrid() {
  const grid = document.getElementById('navigationGrid');
  grid.innerHTML = '';
  
  questions.forEach((_, index) => {
    const button = document.createElement('button');
    button.className = 'nav-item-button';
    button.textContent = index + 1;
    button.addEventListener('click', () => goToQuestion(index));
    
    if (index === currentQuestion) {
      button.classList.add('active');
    }
    
    if (answers[index] !== null) {
      button.classList.add('answered');
    }
    
    grid.appendChild(button);
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
  
  // 渲染选项（Holland是二元选择：喜欢/不喜欢）
  renderOptions(currentAnswer);
  
  // 更新导航按钮状态
  updateNavButtons();
  
  // 更新状态提示
  updateStatus();
  
  // 更新导航网格中的当前题目高亮
  updateNavigationGrid();
  
  // 滚动到顶部
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * 渲染选项（Holland使用二元选择：1=喜欢，0=不喜欢）
 */
function renderOptions(selectedValue) {
  const optionsContainer = document.getElementById('questionOptions');
  optionsContainer.innerHTML = '';
  
  options.forEach(option => {
    const optionDiv = document.createElement('div');
    optionDiv.className = 'option-item';
    
    // Holland答案转换为数字（0或1）
    const optionValue = typeof option.value === 'number' ? option.value : parseInt(option.value);
    const selectedValueNum = selectedValue !== null ? parseInt(selectedValue) : null;
    
    if (selectedValueNum === optionValue) {
      optionDiv.classList.add('selected');
    }
    
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'questionOption';
    radio.id = `option-${option.value}`;
    radio.value = option.value;
    radio.checked = selectedValueNum === optionValue;
    radio.addEventListener('change', () => handleAnswerChange(optionValue));
    
    const label = document.createElement('label');
    label.htmlFor = `option-${option.value}`;
    label.textContent = option.label;
    
    optionDiv.appendChild(radio);
    optionDiv.appendChild(label);
    optionsContainer.appendChild(optionDiv);
  });
}

/**
 * 处理答案选择（Holland答案是0或1）
 */
function handleAnswerChange(value) {
  answers[currentQuestion] = value;
  
  // 保存进度
  saveTestProgress(answers, currentQuestion);
  
  // 更新UI
  updateProgress();
  updateStatus();
  updateNavigationGrid();
  updateNavButtons();
  
  // 延迟自动跳转（显示选中效果）
  setTimeout(() => {
    // 检查是否所有题目都已回答
    const allAnswered = answers.every((ans) => ans !== null && ans !== undefined);
    
    if (allAnswered) {
      // 所有题目都已完成，延迟弹出提示，确保 React 状态更新完成
      setTimeout(() => {
        // 再次验证所有题目都已回答（使用最新的答案数组）
        const finalValidation = answers.every((ans) => ans !== null && ans !== undefined);
        
        if (finalValidation) {
          // 自动弹出提交确认对话框
          showSubmitModal();
        }
      }, 100);
    } else {
      // 检查是否还有未答题目
      const nextUnansweredIndex = answers.findIndex((ans, idx) => 
        idx > currentQuestion && (ans === null || ans === undefined)
      );
      
      if (nextUnansweredIndex !== -1) {
        // 有未答题，跳转到第一个未答题
        goToQuestion(nextUnansweredIndex);
      } else if (currentQuestion < questions.length - 1) {
        // 没有未答题，跳转到下一题
        goToNext();
      } else {
        // 最后一题，显示提交按钮
        updateNavButtons();
      }
    }
  }, 300);
}

/**
 * 更新进度显示
 */
function updateProgress() {
  const stats = getProgressStats(answers, questions.length);
  
  // 更新进度文本
  document.getElementById('currentNum').textContent = currentQuestion + 1;
  document.getElementById('totalNum').textContent = questions.length;
  document.getElementById('answeredCount').textContent = stats.answeredCount;
  
  // 更新进度条
  const progressPercent = stats.progressPercent;
  document.getElementById('progressFill').style.width = progressPercent + '%';
  
  // 更新导航计数
  document.getElementById('navAnsweredCount').textContent = stats.answeredCount;
  document.getElementById('navTotalCount').textContent = questions.length;
  
  // 更新进度提示
  const progressAlert = document.getElementById('progressAlert');
  if (stats.isComplete) {
    progressAlert.innerHTML = '✅ <strong>完成提示：</strong>所有题目已完成，您可以点击"提交答案"按钮提交测试';
    progressAlert.style.color = '#52c41a';
  } else {
    progressAlert.innerHTML = `📝 <strong>进度提醒：</strong>请完成所有 ${questions.length} 题后再提交答案，还有 ${stats.unansweredCount} 题未完成`;
    progressAlert.style.color = '#666';
  }
}

/**
 * 更新导航按钮状态
 */
function updateNavButtons() {
  const prevButton = document.getElementById('prevButton');
  const nextButton = document.getElementById('nextButton');
  const submitButton = document.getElementById('submitButton');
  
  const stats = getProgressStats(answers, questions.length);
  
  // 上一题按钮
  prevButton.disabled = currentQuestion === 0;
  
  // 根据完成情况显示不同的按钮
  if (stats.isComplete) {
    // 所有题目已完成，显示提交按钮
    nextButton.style.display = 'none';
    submitButton.style.display = 'inline-block';
  } else {
    // 未完成，显示下一题按钮
    nextButton.style.display = currentQuestion < questions.length - 1 ? 'inline-block' : 'none';
    submitButton.style.display = 'none';
  }
}

/**
 * 更新状态提示
 */
function updateStatus() {
  const statusText = document.getElementById('statusText');
  const checkIcon = document.getElementById('checkIcon');
  
  if (answers[currentQuestion] !== null) {
    statusText.textContent = '已回答，即将跳转...';
    checkIcon.style.display = 'inline';
  } else {
    statusText.textContent = '请选择答案';
    checkIcon.style.display = 'none';
  }
}

/**
 * 更新导航网格
 */
function updateNavigationGrid() {
  const buttons = document.querySelectorAll('.nav-item-button');
  buttons.forEach((button, index) => {
    button.classList.remove('active');
    button.classList.remove('answered');
    
    if (index === currentQuestion) {
      button.classList.add('active');
    }
    
    if (answers[index] !== null) {
      button.classList.add('answered');
    }
  });
}

/**
 * 跳转到上一题
 */
function goToPrevious() {
  if (currentQuestion > 0) {
    saveTestProgress(answers, currentQuestion);
    currentQuestion--;
    renderQuestion();
    updateProgress();
  }
}

/**
 * 跳转到下一题
 */
function goToNext() {
  if (currentQuestion < questions.length - 1) {
    saveTestProgress(answers, currentQuestion);
    currentQuestion++;
    renderQuestion();
    updateProgress();
  }
}

/**
 * 跳转到指定题目
 */
function goToQuestion(index) {
  if (index >= 0 && index < questions.length) {
    saveTestProgress(answers, currentQuestion);
    currentQuestion = index;
    renderQuestion();
    updateProgress();
  }
}

/**
 * 切换导航卡片折叠状态
 */
function toggleNavigation() {
  const navCard = document.getElementById('navigationCard');
  const navGrid = document.getElementById('navigationGrid');
  const navToggle = document.getElementById('navToggle');
  
  if (navGrid.style.display === 'none') {
    navGrid.style.display = 'grid';
    navToggle.textContent = '▼';
  } else {
    navGrid.style.display = 'none';
    navToggle.textContent = '▶';
  }
}

/**
 * 显示恢复进度对话框
 */
function showRestoreModal(progress) {
  const modal = document.getElementById('restoreModal');
  const stats = getProgressStats(progress.answers, questions.length);
  const savedTime = new Date(progress.timestamp).toLocaleString('zh-CN');
  
  document.getElementById('restoreTime').textContent = savedTime;
  document.getElementById('restoreProgress').textContent = `${stats.answeredCount}/${stats.totalQuestions} 题（${stats.progressPercent}%）`;
  document.getElementById('restoreCurrent').textContent = progress.currentQuestion + 1;
  
  modal.style.display = 'flex';
}

/**
 * 隐藏恢复进度对话框
 */
function hideRestoreModal() {
  document.getElementById('restoreModal').style.display = 'none';
}

/**
 * 显示提交确认对话框
 */
function showSubmitModal() {
  const validation = validateAnswers(answers);
  
  if (!validation.valid) {
    alert(validation.error);
    return;
  }
  
  const stats = getProgressStats(answers, questions.length);
  const modal = document.getElementById('submitModal');
  const submitProgress = document.getElementById('submitProgress');
  
  if (stats.isComplete) {
    submitProgress.textContent = `您已完成所有 ${stats.totalQuestions} 题，可以提交测试。`;
    submitProgress.style.color = '#52c41a';
  } else {
    submitProgress.textContent = `还有 ${stats.unansweredCount} 题未完成，确定要提交吗？`;
    submitProgress.style.color = '#ff4d4f';
  }
  
  modal.style.display = 'flex';
}

/**
 * 隐藏提交确认对话框
 */
function hideSubmitModal() {
  document.getElementById('submitModal').style.display = 'none';
}

/**
 * 处理提交
 */
async function handleSubmit() {
  const validation = validateAnswers(answers);
  
  if (!validation.valid) {
    hideSubmitModal();
    alert(validation.error);
    return;
  }
  
  try {
    showLoading(true);
    
    // 计算分数
    const result = calculateScore(answers);
    
    // 保存结果
    const saveSuccess = saveTestResult(result);
    
    // 调用测试完成API（HIT是单视角测试）
    if (window.linkValidator) {
      try {
        await window.linkValidator.completeTest(undefined, result);
        console.log('测试完成记录成功');
      } catch (error) {
        console.error('记录测试完成失败:', error);
      }
    }
    
    // 清除进度
    clearTestProgress();
    
    // 跳转到报告页面
    hideSubmitModal();
    showLoading(false);
    
    // 检查是否是无限测试模式
    const isUnlimited = window.linkValidator && window.linkValidator.unlimited;
    const token = window.linkValidator && window.linkValidator.token;
    
    // 构建报告页面的URL
    let reportUrl = 'report.html';
    const urlParams = new URLSearchParams();
    
    // 如果是无限测试模式，添加unlimited和token参数
    if (isUnlimited && token) {
      urlParams.set('unlimited', 'true');
      urlParams.set('token', token);
    } else if (token) {
      // 普通模式，只添加token
      urlParams.set('token', token);
    }
    
    // 如果localStorage保存失败（可能被跟踪防护阻止），通过URL参数传递结果
    if (!saveSuccess) {
      console.warn('localStorage保存失败，通过URL参数传递结果');
      const resultParam = encodeURIComponent(JSON.stringify({
        testKey: 'hit',
        result: result,
        completedAt: new Date().toISOString()
      }));
      urlParams.set('result', resultParam);
    }
    
    // 构建完整的URL
    const queryString = urlParams.toString();
    if (queryString) {
      reportUrl = `${reportUrl}?${queryString}`;
    }
    
    window.location.href = reportUrl;
    
  } catch (error) {
    console.error('提交失败:', error);
    showLoading(false);
    hideSubmitModal();
    alert('提交失败，请重试。错误：' + error.message);
  }
}

/**
 * 显示/隐藏加载提示
 */
function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay');
  overlay.style.display = show ? 'flex' : 'none';
}

