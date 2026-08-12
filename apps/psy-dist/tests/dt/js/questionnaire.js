/**
 * DarkTriad 问卷页面逻辑
 * 完全独立的实现，不依赖任何外部框架
 */

import { QUESTIONS, OPTIONS } from '../data/questions.js';
import { calculateScore } from '../data/scoring.js';
import { 
  saveTestProgress, 
  getTestProgress, 
  clearTestProgress,
  saveTestResult,
  getTestResult,
  getProgressStats 
} from './utils/storage.js';

// 全局状态
let currentQuestion = 0;
let answers = new Array(70).fill(null);
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
      answers = savedProgress.answers || new Array(70).fill(null);
      
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
      answers = new Array(70).fill(null);
      currentQuestion = 0;
      hasShownRestoreModal = true;
      
      // 如果是新开始测试，调用测试开始API（DT是单视角测试）
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
  // 初始化导航按钮
  const prevButton = document.getElementById('prevButton');
  const nextButton = document.getElementById('nextButton');
  const submitButton = document.getElementById('submitButton');
  
  if (prevButton) {
    prevButton.addEventListener('click', () => {
      if (currentQuestion > 0) {
        currentQuestion--;
        renderQuestion();
        updateProgress();
        saveProgress();
      }
    });
  }
  
  if (nextButton) {
    nextButton.addEventListener('click', () => {
      if (answers[currentQuestion] !== null && answers[currentQuestion] !== undefined) {
        if (currentQuestion < questions.length - 1) {
          currentQuestion++;
          renderQuestion();
          updateProgress();
          saveProgress();
        }
      } else {
        alert('请先选择答案');
      }
    });
  }
  
  if (submitButton) {
    submitButton.addEventListener('click', () => {
      // 检查是否所有题目都已作答
      const allAnswered = answers.every(ans => ans !== null && ans !== undefined);
      
      if (!allAnswered) {
        const unansweredCount = answers.filter(ans => ans === null || ans === undefined).length;
        alert(`还有 ${unansweredCount} 道题目未作答，请完成所有题目后再提交。`);
        return;
      }
      
      // 显示提交确认对话框
      showSubmitModal();
    });
  }
  
  // 初始化题目导航
  initializeQuestionNavigation();
  
  // 恢复进度对话框
  document.getElementById('restoreConfirm').addEventListener('click', () => {
    hideRestoreModal();
    renderQuestion();
    updateProgress();
  });
  
  document.getElementById('restoreCancel').addEventListener('click', () => {
    hideRestoreModal();
    clearTestProgress();
    answers = new Array(70).fill(null);
    currentQuestion = 0;
    renderQuestion();
    updateProgress();
  });
  
  // 提交确认对话框
  document.getElementById('submitConfirm').addEventListener('click', handleSubmit);
  document.getElementById('submitCancel').addEventListener('click', hideSubmitModal);
  
  // 导航卡片折叠
  const navToggle = document.getElementById('navToggle');
  if (navToggle) {
    navToggle.addEventListener('click', toggleNavigation);
  }
}

/**
 * 初始化题目导航网格
 */
function initializeQuestionNavigation() {
  const grid = document.getElementById('navigationGrid');
  if (!grid) return;
  
  grid.innerHTML = '';
  
  questions.forEach((_, index) => {
    const button = document.createElement('button');
    button.className = 'nav-item-button';
    button.textContent = index + 1;
    button.addEventListener('click', () => goToQuestion(index));
    
    if (index === currentQuestion) {
      button.classList.add('active');
    }
    
    if (answers[index] !== null && answers[index] !== undefined) {
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
  
  // 渲染选项（DarkTriad使用5点Likert量表）
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
 * 渲染选项（DarkTriad使用5点Likert量表：1-5）
 */
function renderOptions(selectedValue) {
  const optionsContainer = document.getElementById('questionOptions');
  if (!optionsContainer) return;
  
  optionsContainer.innerHTML = '';
  
  options.forEach(option => {
    const optionDiv = document.createElement('div');
    optionDiv.className = 'option-item';
    
    // DarkTriad答案转换为数字（1-5）
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
 * 处理答案选择（DarkTriad答案是1-5）
 */
function handleAnswerChange(value) {
  answers[currentQuestion] = value;
  
  // 保存进度
  saveProgress();
  
  // 更新UI
  updateProgress();
  updateStatus();
  updateNavigationGrid();
  
  // 自动跳转到下一题
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
  document.getElementById('currentNum').textContent = currentQuestion + 1;
  document.getElementById('totalNum').textContent = totalQuestions;
  document.getElementById('answeredCount').textContent = answeredCount;
  
  // 更新进度条
  const progressFill = document.getElementById('progressFill');
  if (progressFill) {
    progressFill.style.width = progress + '%';
  }
  
  // 更新导航区域计数
  const navAnsweredCount = document.getElementById('navAnsweredCount');
  const navTotalCount = document.getElementById('navTotalCount');
  if (navAnsweredCount) navAnsweredCount.textContent = answeredCount;
  if (navTotalCount) navTotalCount.textContent = totalQuestions;
  
  // 检查是否所有题目都已作答
  const allAnswered = answeredCount === totalQuestions;
  
  // 显示/隐藏提交按钮
  const submitButton = document.getElementById('submitButton');
  const nextButton = document.getElementById('nextButton');
  
  if (allAnswered) {
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
    statusText.textContent = hasAnswer ? '已选择' : '请选择答案';
  }
  
  if (checkIcon) {
    checkIcon.style.display = hasAnswer ? 'inline' : 'none';
  }
}

/**
 * 更新导航网格
 */
function updateNavigationGrid() {
  const grid = document.getElementById('navigationGrid');
  if (!grid) return;
  
  const buttons = grid.querySelectorAll('.nav-item-button');
  buttons.forEach((button, index) => {
    // 移除之前的active状态
    button.classList.remove('active');
    
    // 添加当前题目active状态
    if (index === currentQuestion) {
      button.classList.add('active');
    }
    
    // 更新已回答状态
    if (answers[index] !== null && answers[index] !== undefined) {
      button.classList.add('answered');
    } else {
      button.classList.remove('answered');
    }
  });
}

/**
 * 跳转到指定题目
 */
function goToQuestion(index) {
  if (index >= 0 && index < questions.length) {
    currentQuestion = index;
    renderQuestion();
    updateProgress();
    saveProgress();
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
    }
  } else {
    alert('请先选择答案');
  }
}

/**
 * 切换导航卡片折叠/展开
 */
function toggleNavigation() {
  const grid = document.getElementById('navigationGrid');
  const toggle = document.getElementById('navToggle');
  
  if (!grid || !toggle) return;
  
  if (grid.style.display === 'none') {
    grid.style.display = 'grid';
    toggle.textContent = '▼';
  } else {
    grid.style.display = 'none';
    toggle.textContent = '▶';
  }
}

/**
 * 保存进度
 */
function saveProgress() {
  const progress = {
    answers: answers,
    currentQuestion: currentQuestion,
    timestamp: new Date().toISOString()
  };
  
  saveTestProgress(answers, currentQuestion);
}

/**
 * 显示恢复进度对话框
 */
function showRestoreModal(progress) {
  const modal = document.getElementById('restoreModal');
  if (!modal) return;
  
  const stats = getProgressStats(progress.answers || answers, questions.length);
  const savedTime = progress.timestamp ? new Date(progress.timestamp).toLocaleString('zh-CN') : '未知';
  
  document.getElementById('restoreTime').textContent = savedTime;
  document.getElementById('restoreProgress').textContent = `${stats.answeredCount}/${stats.totalQuestions} 题（${stats.progressPercent}%）`;
  document.getElementById('restoreCurrent').textContent = (progress.currentQuestion || 0) + 1;
  
  modal.style.display = 'flex';
}

/**
 * 隐藏恢复进度对话框
 */
function hideRestoreModal() {
  const modal = document.getElementById('restoreModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * 显示提交确认对话框
 */
function showSubmitModal() {
  // 检查是否所有题目都已作答
  const allAnswered = answers.every(ans => ans !== null && ans !== undefined);
  
  if (!allAnswered) {
    const unansweredCount = answers.filter(ans => ans === null || ans === undefined).length;
    alert(`还有 ${unansweredCount} 道题目未作答，请完成所有题目后再提交。`);
    return;
  }
  
  const modal = document.getElementById('submitModal');
  const submitProgress = document.getElementById('submitProgress');
  
  if (!modal) return;
  
  const stats = getProgressStats(answers, questions.length);
  
  if (submitProgress) {
    if (stats.isComplete) {
      submitProgress.textContent = `您已完成所有 ${stats.totalQuestions} 题，可以提交测试。`;
      submitProgress.style.color = '#52c41a';
    } else {
      submitProgress.textContent = `还有 ${stats.unansweredCount} 题未完成，确定要提交吗？`;
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
    
    // 计算分数
    const result = calculateScore(answers);
    
    // 保存结果
    const saveSuccess = saveTestResult(result);
    
    // 调用测试完成API（DT是单视角测试）
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
        testKey: 'dt',
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

