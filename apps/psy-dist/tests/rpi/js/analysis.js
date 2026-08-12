/**
 * RPI 分析页面逻辑
 * 完全独立的实现，不依赖任何外部框架
 * 实现动画展示分析步骤和倒计时
 */

import { getTestResult } from './utils/storage.js';

// 全局状态
let testType = null;
let countdown = 5;  // 原版是5秒
let countdownInterval = null;
let stepTimers = [];  // 存储步骤定时器，用于清理

// 分析步骤
const analysisSteps = [
  { text: '正在读取您的答题数据...', delay: 500 },
  { text: '分析四维度占有欲特征...', delay: 1500 },
  { text: '计算RPI指数和等级...', delay: 2800 },
  { text: '生成个性化建议和分析...', delay: 4200 },
  { text: '整理完整评估报告...', delay: 5600 }
];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initialize();
});

/**
 * 初始化分析页面
 */
function initialize() {
  try {
    showLoading(true);
    
    // 从URL参数或localStorage获取测试类型
    const urlParams = new URLSearchParams(window.location.search);
    testType = urlParams.get('type') || localStorage.getItem('rpi_test_type') || 'self';
    
    // 如果没有测试类型，跳转回介绍页面
    if (!testType) {
      window.location.href = 'index.html';
      return;
    }
    
    // 检查是否有测试结果
    const resultData = getTestResult(testType);
    if (!resultData || !resultData.result) {
      alert('未找到测试结果，请先完成测试。');
      window.location.href = 'questionnaire.html?type=' + testType;
      return;
    }
    
    // 更新UI
    updateTestTypeDisplay();
    
    // 初始化进度环（延迟执行以确保DOM已完全渲染）
    setTimeout(() => {
      updateProgressRing(0);
    }, 100);
    
    // 监听窗口大小变化，重新调整圆环
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const currentPercent = countdown > 0 ? ((5 - countdown) / 5) * 100 : 100;
        updateProgressRing(currentPercent);
      }, 100);
    });
    
    // 初始化分析步骤（必须先初始化步骤，再启动倒计时）
    initializeAnalysisSteps();
    
    // 启动倒计时（在步骤初始化后）
    startCountdown();
    
    showLoading(false);
    
  } catch (error) {
    console.error('初始化失败:', error);
    showLoading(false);
    alert('加载失败，请刷新页面重试。');
  }
}

/**
 * 更新测试类型显示
 */
function updateTestTypeDisplay() {
  const testTypeSubtitle = document.getElementById('testTypeSubtitle');
  if (testTypeSubtitle) {
    const typeText = testType === 'self' ? '给自己测' : '为恋人测';
    testTypeSubtitle.textContent = `RPI 恋爱占有欲指数测评 · ${typeText} · 请稍候，我们正在为您生成个性化报告...`;
  }
}

/**
 * 初始化分析步骤
 */
function initializeAnalysisSteps() {
  const stepsContainer = document.getElementById('analysisSteps');
  if (!stepsContainer) return;
  
  // 清理之前的定时器
  stepTimers.forEach(timer => clearTimeout(timer));
  stepTimers = [];
  
  stepsContainer.innerHTML = '';
  
  // 创建所有步骤（初始状态为pending）
  analysisSteps.forEach((step, index) => {
    const stepDiv = document.createElement('div');
    stepDiv.className = 'rpi-analysis-step rpi-analysis-step-pending';
    stepDiv.id = `analysisStep${index}`;
    
    const iconDiv = document.createElement('div');
    iconDiv.className = 'rpi-analysis-step-icon';
    iconDiv.innerHTML = '<span class="rpi-analysis-step-dot"></span>';
    
    const textSpan = document.createElement('span');
    textSpan.className = 'rpi-analysis-step-text';
    textSpan.textContent = step.text;
    
    stepDiv.appendChild(iconDiv);
    stepDiv.appendChild(textSpan);
    stepsContainer.appendChild(stepDiv);
    
    // 设置定时器，在指定延迟后开始该步骤
    const startTimer = setTimeout(() => {
      startStep(index);
    }, step.delay);
    
    stepTimers.push(startTimer);
  });
}

/**
 * 开始执行某个步骤
 */
function startStep(stepIndex) {
  const stepDiv = document.getElementById(`analysisStep${stepIndex}`);
  if (!stepDiv) return;
  
  // 如果已经在loading或completed状态，不重复执行
  if (stepDiv.classList.contains('rpi-analysis-step-loading') || 
      stepDiv.classList.contains('rpi-analysis-step-completed')) {
    return;
  }
  
  // 设置为loading状态
  stepDiv.className = 'rpi-analysis-step rpi-analysis-step-loading';
  
  const iconDiv = stepDiv.querySelector('.rpi-analysis-step-icon');
  if (iconDiv) {
    // 使用Ant Design的LoadingOutlined SVG
    iconDiv.innerHTML = '<span class="anticon anticon-loading"><svg viewBox="0 0 1024 1024" focusable="false" data-icon="loading" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M988 548c-19.9 0-36-16.1-36-36 0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 00-94.3-139.9 437.71 437.71 0 00-139.9-94.3C637 83.6 579.4 72 520 72s-117 11.6-171.3 34.6a440.45 440.45 0 00-139.9 94.3 437.71 437.71 0 00-94.3 139.9C91.6 395 80 452.6 80 512s11.6 117 34.6 171.3c22.9 54.3 55.5 103.9 94.3 139.9a437.71 437.71 0 00139.9 94.3C404 940.4 461.6 952 521 952s117-11.6 171.3-34.6a437.71 437.71 0 00139.9-94.3c38.8-36 71.4-85.6 94.3-139.9C949.4 629 961 571.4 961 512c0-19.9 16.1-36 36-36s36 16.1 36 36c0 251.2-204.8 456-456 456S133 763.2 133 512 337.8 56 589 56s456 204.8 456 456c0 19.9-16.1 36-36 36z"></path></svg></span>';
  }
  
  // 1秒后完成该步骤
  const completeTimer = setTimeout(() => {
    completeStep(stepIndex);
  }, 1000);
  
  stepTimers.push(completeTimer);
}

/**
 * 完成某个步骤
 */
function completeStep(stepIndex) {
  const stepDiv = document.getElementById(`analysisStep${stepIndex}`);
  if (!stepDiv) return;
  
  // 如果已经完成，不重复执行
  if (stepDiv.classList.contains('rpi-analysis-step-completed')) {
    return;
  }
  
  // 设置为completed状态
  stepDiv.className = 'rpi-analysis-step rpi-analysis-step-completed';
  
  const iconDiv = stepDiv.querySelector('.rpi-analysis-step-icon');
  if (iconDiv) {
    // 使用Ant Design的CheckOutlined SVG
    iconDiv.innerHTML = '<span class="anticon anticon-check"><svg viewBox="64 64 896 896" focusable="false" data-icon="check" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M912 190h-69.9c-9.8 0-19.1 4.5-25.1 12.2L404.7 724.5 207 474a32 32 0 00-25.1-12.2H112c-6.7 0-10.4 7.7-6.3 12.9l273.9 347c12.8 16.2 37.4 16.2 50.3 0l488.4-618.9c4.1-5.1.4-12.8-6.3-12.8z"></path></svg></span>';
  }
}

/**
 * 启动倒计时
 */
function startCountdown() {
  // 清理之前的定时器
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  
  const countdownElement = document.getElementById('countdownNumber');
  if (!countdownElement) {
    console.error('找不到倒计时元素 countdownNumber');
    return;
  }
  
  countdown = 5;  // 原版是5秒
  countdownElement.textContent = countdown;
  
  // 更新标题（动态显示点）
  updateAnalysisTitle();
  
  // 初始化进度环
  updateProgressRing(0);
  
  countdownInterval = setInterval(() => {
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      
      // 确保进度环填满
      updateProgressRing(100);
      
      // 确保倒计时显示为0
      if (countdownElement) {
        countdownElement.textContent = '0';
      }
      
      // 延迟一下再跳转，让用户看到完成状态
      setTimeout(() => {
        window.location.href = `report.html?type=${testType}`;
      }, 300);
      return;
    }
    
    // 更新进度环（原版使用的是5秒倒计时，从0到100%）
    const percent = ((5 - countdown) / 5) * 100;
    updateProgressRing(percent);
    
    // 更新倒计时显示
    if (countdownElement) {
      countdownElement.textContent = countdown;
    }
    
    // 更新标题（动态显示点）
    updateAnalysisTitle();
    
    // 递减倒计时
    countdown--;
  }, 1000);
}

/**
 * 更新分析标题（动态显示点）
 */
function updateAnalysisTitle() {
  const titleElement = document.getElementById('analysisTitle');
  if (!titleElement) return;
  
  // 计算已完成步骤数
  const completedSteps = document.querySelectorAll('.rpi-analysis-step-completed').length;
  const loadingSteps = document.querySelectorAll('.rpi-analysis-step-loading').length;
  const activeSteps = completedSteps + loadingSteps;
  
  const dots = '.'.repeat(activeSteps);
  titleElement.textContent = `报告分析中${dots}`;
}


/**
 * 更新进度环
 */
function updateProgressRing(percent) {
  const fillCircle = document.getElementById('progressRingFill');
  const bgCircle = document.querySelector('.rpi-progress-ring-background');
  const svg = document.querySelector('.rpi-progress-ring-svg');
  if (!fillCircle || !svg) return;
  
  // 根据SVG的实际尺寸动态计算半径和中心点
  const svgWidth = svg.clientWidth || parseInt(svg.getAttribute('width')) || 180;
  const center = svgWidth / 2;
  const radius = center - 8; // 减去stroke-width的一半（8/2=4），再留一些边距
  
  // 更新circle元素的cx、cy、r属性
  fillCircle.setAttribute('cx', center);
  fillCircle.setAttribute('cy', center);
  fillCircle.setAttribute('r', radius);
  if (bgCircle) {
    bgCircle.setAttribute('cx', center);
    bgCircle.setAttribute('cy', center);
    bgCircle.setAttribute('r', radius);
  }
  
  // 更新transform属性以保持旋转中心正确
  fillCircle.setAttribute('transform', `rotate(-90 ${center} ${center})`);
  
  // 计算周长
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  
  fillCircle.style.strokeDasharray = `${circumference} ${circumference}`;
  fillCircle.style.strokeDashoffset = offset;
  fillCircle.style.transition = 'stroke-dashoffset 0.3s ease';
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


