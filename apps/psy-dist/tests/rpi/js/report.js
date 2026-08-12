/**
 * RPI 报告页面逻辑
 * 完全独立的实现，不依赖任何外部框架
 * 实现报告生成和渲染逻辑
 */

// 注意：在 ES module 中，import 语句会被提升到模块顶部
// 所以这个 console.log 会在 import 之后执行
import { getTestResult, hasTestResult, clearTestResult, clearTestProgress } from './utils/storage.js';
import { DIMENSION_ORDER } from '../data/questions.js';

// 模块导入完成后的第一个可执行语句
console.warn('⚠️⚠️⚠️ report.js 模块开始执行！⚠️⚠️⚠️');
console.error('🔴🔴🔴 report.js 模块顶层代码执行 🔴🔴🔴');

/**
 * 获取token
 */
function getToken() {
  // 方法1：从URL查询参数获取
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromQuery = urlParams.get('token');
  if (tokenFromQuery) {
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
 * 调用validateTestLink API检查链接状态
 * @param {string} token - 测试链接token
 * @returns {Promise<object>} API响应
 */
async function callValidateLinkAPI(token) {
  const API_BASE_URL = '/api/links/validate';
  
  const response = await fetch(API_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token: token
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `API请求失败: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * 处理重新测试
 */
async function handleRestart() {
  console.log('handleRestart 被调用');
  try {
    const token = getToken();
    console.log('获取到的token:', token);
    
    if (!token) {
      alert('未找到测试链接，无法重新测试。');
      window.location.href = 'index.html';
      return;
    }

    // 检查是否是无限测试
    const isUnlimited = isUnlimitedTest(token);
    console.log('是否无限测试:', isUnlimited);
    
    // 检查是否达到使用次数限制
    let canRestart = false;
    
    // 如果是无限测试，跳过API验证，直接允许重新测试
    if (isUnlimited) {
      console.log('无限测试模式，跳过API验证');
      canRestart = true;
    } else {
      // 普通测试，需要调用API验证
      try {
        console.log('开始验证链接...');
        const validateResult = await callValidateLinkAPI(token);
        console.log('验证链接结果:', validateResult);
        
        if (validateResult.data && validateResult.data.link) {
          const link = validateResult.data.link;
          // 如果maxUses为null表示无限制，或者usedCount < maxUses表示还有剩余次数
          const hasReachedLimit = link.max_uses !== null && link.used_count >= link.max_uses;
          canRestart = !hasReachedLimit;
          
          console.log('链接状态:', {
            used_count: link.used_count,
            max_uses: link.max_uses,
            hasReachedLimit,
            canRestart
          });
          
          if (hasReachedLimit) {
            alert('测试链接使用次数已用完，无法重新测试。');
            window.location.href = buildUrlWithToken('index.html');
            return;
          }
        } else if (!validateResult.data || !validateResult.data.valid) {
          alert(validateResult.message || '链接验证失败，无法重新测试。');
          window.location.href = 'index.html';
          return;
        } else {
          // 如果链接有效但没有使用次数限制信息，允许重新测试
          canRestart = true;
        }
      } catch (apiError) {
        console.warn('验证链接失败（允许继续）:', apiError);
        // API调用失败时，仍然允许清除localStorage并跳转（让startTest API来处理验证）
        canRestart = true;
      }
    }

    // 检查两个视角是否都完成了
    const hasSelf = hasTestResult('self');
    const hasPartner = hasTestResult('partner');
    const bothCompleted = hasSelf && hasPartner;
    
    console.log('测试完成状态检查:', {
      hasSelf,
      hasPartner,
      bothCompleted
    });
    
    // 如果还没达到使用次数限制，且两个视角都完成了，才清除所有报告数据
    if (canRestart && bothCompleted) {
      console.log('两个视角都已完成，开始清除localStorage数据...');
      
      // 清除前检查localStorage中的键
      const keysBefore = Object.keys(localStorage).filter(k => k.startsWith('rpi_'));
      console.log('清除前的localStorage键:', keysBefore);
      
      // 清除所有测试结果和进度
      clearTestResult(); // 清除self和partner的结果
      clearTestProgress(); // 清除self和partner的进度
      
      // 清除其他可能影响状态的键（保留token）
      const keysToRemove = [
        'rpi_test_type',
        'rpi_consent_self',
        'rpi_consent_partner',
        'rpi_demographic_self',
        'rpi_demographic_partner'
      ];
      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          console.warn(`清除${key}失败:`, e);
        }
      });
      
      // 清除后检查localStorage中的键
      const keysAfter = Object.keys(localStorage).filter(k => k.startsWith('rpi_'));
      console.log('清除后的localStorage键:', keysAfter);
      
      // 验证是否已清除
      const selfResult = localStorage.getItem('rpi_test_result_self');
      const partnerResult = localStorage.getItem('rpi_test_result_partner');
      console.log('验证清除结果:', {
        selfResult: selfResult ? '存在' : '已清除',
        partnerResult: partnerResult ? '存在' : '已清除'
      });
      
      console.log('已清除所有测试数据，准备重新测试');
    } else if (!bothCompleted) {
      // 如果只有一个视角完成，不清除数据，只跳转回首页
      console.log('只有一个视角完成，不清除数据，只跳转回首页');
    }

    // 跳转到首页（携带token）
    const targetUrl = buildUrlWithToken('index.html');
    console.log('跳转到:', targetUrl);
    window.location.href = targetUrl;
  } catch (error) {
    console.error('重新测试失败:', error);
    alert('重新测试失败，请稍后再试。错误：' + error.message);
  }
}

// 立即导出到全局作用域，供HTML按钮调用
window.handleRestart = handleRestart;
console.log('window.handleRestart 已导出:', typeof window.handleRestart, typeof handleRestart);

// 确保在模块加载后立即导出（双重保险）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.handleRestart = handleRestart;
    console.log('DOMContentLoaded 时再次导出 handleRestart:', typeof window.handleRestart);
  });
} else {
  // DOM 已经加载完成，立即导出
  window.handleRestart = handleRestart;
  console.log('DOM 已加载，导出 handleRestart:', typeof window.handleRestart);
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
let testType = null;
let reportData = null;
let demographicData = null;

// 维度信息（用于报告展示）
const DIMENSION_INFO = {
  control: {
    name: '控制欲望',
    icon: '🎯',
    description: '评估您对伴侣行为的控制倾向',
    color: '#E92063',
    bgColor: 'rgba(233, 32, 99, 0.1)'
  },
  jealousy: {
    name: '嫉妒强度',
    icon: '💔',
    description: '评估您在关系中体验到的嫉妒情绪',
    color: '#E64D66',
    bgColor: 'rgba(230, 77, 102, 0.1)'
  },
  dependency: {
    name: '情感依赖',
    icon: '💞',
    description: '评估您对伴侣的情感依赖程度',
    color: '#D92680',
    bgColor: 'rgba(217, 38, 128, 0.1)'
  },
  insecurity: {
    name: '关系不安',
    icon: '😰',
    description: '评估您在关系中的安全感和信任度',
    color: '#EC4899',
    bgColor: 'rgba(236, 72, 153, 0.1)'
  }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 确保 handleRestart 在初始化时已导出
  window.handleRestart = handleRestart;
  console.log('DOMContentLoaded: window.handleRestart =', typeof window.handleRestart);
  initialize();
});

/**
 * 初始化报告页面
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
    
    // 获取测试结果
    const resultData = getTestResult(testType);
    
    if (!resultData || !resultData.result) {
      alert('未找到测试结果，请先完成测试。');
      window.location.href = 'questionnaire.html?type=' + testType;
      return;
    }
    
    reportData = resultData.result;
    demographicData = resultData.result?.demographic || {};
    
    // 初始化UI
    initializeUI();
    
    // 检查并显示切换组件
    checkAndShowSwitch();
    
    // 渲染报告
    renderReport();
    
    showLoading(false);
    
  } catch (error) {
    console.error('初始化失败:', error);
    showLoading(false);
    alert('加载失败，请刷新页面重试。错误：' + error.message);
  }
}

/**
 * 检查并显示切换组件
 */
function checkAndShowSwitch() {
  const hasSelf = hasTestResult('self');
  const hasPartner = hasTestResult('partner');
  
  // 只有当两个测试都完成时才显示切换组件
  if (hasSelf && hasPartner) {
    const switchContainer = document.getElementById('reportSwitchContainer');
    if (switchContainer) {
      switchContainer.style.display = 'block';
      
      // 设置当前激活的按钮
      const selfBtn = document.getElementById('switchSelfBtn');
      const partnerBtn = document.getElementById('switchPartnerBtn');
      
      if (selfBtn && partnerBtn) {
        // 移除所有激活状态
        selfBtn.classList.remove('active');
        partnerBtn.classList.remove('active');
        
        // 根据当前testType设置激活状态
        if (testType === 'self') {
          selfBtn.classList.add('active');
        } else {
          partnerBtn.classList.add('active');
        }
        
        // 添加点击事件
        selfBtn.addEventListener('click', () => {
          if (testType !== 'self') {
            window.location.href = 'report.html?type=self';
          }
        });
        
        partnerBtn.addEventListener('click', () => {
          if (testType !== 'partner') {
            window.location.href = 'report.html?type=partner';
          }
        });
      }
    }
  }
}

/**
 * 初始化UI
 */
function initializeUI() {
  // 导出按钮
  const exportButton = document.getElementById('exportButton');
  if (exportButton) {
    exportButton.addEventListener('click', () => {
      exportReport();
    });
  }
  
}

/**
 * 渲染报告
 */
function renderReport() {
  console.log('renderReport 开始执行, reportData:', !!reportData);
  if (!reportData) {
    console.error('reportData 不存在，renderReport 提前返回');
    return;
  }
  
  try {
    const { rpiIndex, level, levelText, levelColor, dimensions } = reportData;
    
    console.log('开始渲染报告各个部分...');
    
    // 渲染Hero卡片
    renderHeroCard(rpiIndex, level, levelText, levelColor);
    
    // 渲染四个维度
    renderDimensions(dimensions);
    
    // 渲染结果解释
    renderInterpretation(rpiIndex, level, levelText, dimensions);
    
    // 渲染个性化建议
    renderSuggestions(rpiIndex, dimensions);
    
    // 渲染可视化分析（双雷达图）
    renderRadars(dimensions);
    
    // 渲染恋爱占有欲人格类型
    renderPersonality(rpiIndex);
    
    // 渲染依恋模式分析
    renderAttachment(rpiIndex, dimensions);
    
    // 渲染占有欲影响路径分析
    renderPathAnalysis();
    
    // 渲染爱情心理学专家建议
    renderExpertAdvice(dimensions);
    
    // 渲染星座参考（如果提供星座信息）
    renderZodiac(demographicData);
    
    // 渲染关系健康度评估
    renderHealth(rpiIndex, dimensions);
    
    // 渲染有效沟通技巧指南
    renderCommunication();
    
    // 渲染30天自我成长计划
    renderGrowth();
    
    // 渲染推荐学习资源
    renderResources();
    
    // 渲染评估信息
    renderInfo();
    
    // 渲染底部操作按钮
    console.log('准备调用 renderFooterActions...');
    renderFooterActions();
    console.log('renderFooterActions 调用完成');
  } catch (error) {
    console.error('renderReport 执行出错:', error);
    // 即使出错，也尝试渲染底部按钮
    try {
      console.log('尝试单独渲染底部按钮...');
      renderFooterActions();
    } catch (footerError) {
      console.error('渲染底部按钮也失败:', footerError);
    }
  }
}

/**
 * 渲染Hero卡片（RPI总指数）
 */
function renderHeroCard(rpiIndex, level, levelText, levelColor) {
  // 更新标题
  const heroTitle = document.getElementById('heroTitle');
  if (heroTitle) {
    heroTitle.textContent = testType === 'self' ? '恋爱占有欲指数 (RPI)' : '恋人占有欲指数 (RPI)';
  }
  
  // 更新分数
  const heroScore = document.getElementById('heroScore');
  if (heroScore) {
    heroScore.textContent = rpiIndex;
  }
  
  // 更新等级
  const heroLevel = document.getElementById('heroLevel');
  if (heroLevel) {
    heroLevel.textContent = `${level} （${levelText}）`;
    heroLevel.style.background = levelColor;
    heroLevel.style.color = 'white';
  }
  
  // 更新描述文本
  const heroText = document.getElementById('heroText');
  if (heroText) {
    const subject = testType === 'self' ? '您' : 'Ta';
    heroText.innerHTML = `${subject}的恋爱占有欲指数为 <strong>${rpiIndex}</strong>，处于「${level}（${levelText}）」水平`;
  }
  
  // 更新进度条
  const scaleMarker = document.getElementById('scaleMarker');
  if (scaleMarker) {
    scaleMarker.style.left = `${rpiIndex}%`;
  }
}

/**
 * 渲染四个维度分析
 */
function renderDimensions(dimensions) {
  const dimensionsGrid = document.getElementById('dimensionsGrid');
  if (!dimensionsGrid) return;
  
  dimensionsGrid.innerHTML = '';
  
  // 确保维度数据存在
  const safeDimensions = {
    control: dimensions?.control || { raw: '0', z: 0, percent: 0 },
    jealousy: dimensions?.jealousy || { raw: '0', z: 0, percent: 0 },
    dependency: dimensions?.dependency || { raw: '0', z: 0, percent: 0 },
    insecurity: dimensions?.insecurity || { raw: '0', z: 0, percent: 0 }
  };
  
  DIMENSION_ORDER.forEach(dimKey => {
    const dimension = safeDimensions[dimKey];
    const info = DIMENSION_INFO[dimKey];
    
    if (!dimension || !info) return;
    
    const { raw, z, percent } = dimension;
    
    // 根据分数生成得分解读
    let detailText = '';
    if (percent < 40) {
      if (dimKey === 'control') {
        detailText = '您尊重伴侣的自主性和个人空间，给予对方充分的信任和自由。这是健康关系的重要基础。';
      } else if (dimKey === 'jealousy') {
        detailText = '您对伴侣保持着良好的信任度，较少因嫉妒而产生负面情绪。这有助于建立安全稳定的关系氛围。';
      } else if (dimKey === 'dependency') {
        detailText = '您保持着良好的情感独立性，即使独处也能自我满足。您有自己的生活重心，不会过度依赖伴侣。';
      } else if (dimKey === 'insecurity') {
        detailText = '您对关系有较强的安全感，相信自己值得被爱，对关系的未来感到乐观。这是安全型依恋的特征。';
      }
    } else if (percent < 60) {
      if (dimKey === 'control') {
        detailText = '您的控制倾向处于正常范围。偶尔会想了解伴侣的行踪，但总体上保持着适度的平衡。';
      } else if (dimKey === 'jealousy') {
        detailText = '您的嫉妒程度属于正常范围。偶尔会因伴侣与异性互动而不适，但不会过度影响关系。';
      } else if (dimKey === 'dependency') {
        detailText = '您的情感依赖程度适中。既重视恋爱关系，也保持一定的个人空间和独立性。';
      } else if (dimKey === 'insecurity') {
        detailText = '您的关系安全感处于正常水平。偶尔会担心关系变化，但不会过度焦虑。';
      }
    } else if (percent < 80) {
      if (dimKey === 'control') {
        detailText = '您对伴侣有较强的控制欲望，可能经常想知道对方在做什么，或希望参与对方的决定。建议适度放手，给予更多信任。';
      } else if (dimKey === 'jealousy') {
        detailText = '您较容易产生嫉妒情绪，可能频繁担心伴侣被吸引或出轨。建议学习情绪管理，建立更多信任。';
      } else if (dimKey === 'dependency') {
        detailText = '您对伴侣有较强的情感依赖，可能将对方视为生活中心，独处时感到焦虑。建议培养个人兴趣，建立多元支持系统。';
      } else if (dimKey === 'insecurity') {
        detailText = '您对关系缺乏安全感，可能经常担心被抛弃或不够好。建议探索不安全感的根源，可能与早期依恋经历有关。';
      }
    } else {
      if (dimKey === 'control') {
        detailText = '您的控制欲较强，可能频繁监控伴侣的行为、限制社交或要求随时汇报。这可能会让伴侣感到窒息，建议寻求专业帮助调整。';
      } else if (dimKey === 'jealousy') {
        detailText = '您的嫉妒强度较高，可能经常想象负面场景、质问伴侣或因嫉妒争吵。建议探索嫉妒背后的不安全感根源。';
      } else if (dimKey === 'dependency') {
        detailText = '您高度依赖伴侣，可能觉得没有对方就不完整。建议发展独立性，学习自我关怀，避免共依存模式。';
      } else if (dimKey === 'insecurity') {
        detailText = '您的关系不安全感比较高，可能经常担心和焦虑。试着培养自信，多和朋友聊天，让生活更充实。记住，你很棒，值得被爱！';
      }
    }
    
    const dimensionCard = document.createElement('div');
    dimensionCard.className = 'rpi-report-dimension-card';
    
    dimensionCard.innerHTML = `
      <div class="rpi-report-dimension-header-row">
        <div class="rpi-report-dimension-left">
          <span class="rpi-report-dimension-icon">${info.icon}</span>
          <span class="rpi-report-dimension-name">${info.name}</span>
        </div>
        <div class="rpi-report-dimension-score-badge" style="background: ${info.bgColor}; color: ${info.color}">
          ${percent} 分
        </div>
      </div>
      <div class="rpi-report-dimension-progress">
        <div class="rpi-progress-bar">
          <div class="rpi-progress-fill" style="width: ${percent}%; background: ${info.color}"></div>
        </div>
      </div>
      <div class="rpi-report-dimension-meta">
        <span class="rpi-report-dimension-z">Z分数: ${z.toFixed(2)}</span>
        <span class="rpi-report-dimension-percentile">百分位: ${percent}%</span>
      </div>
      <p class="rpi-report-dimension-detail">
        <strong>得分解读：</strong>${detailText}
      </p>
    `;
    
    dimensionsGrid.appendChild(dimensionCard);
  });
}

/**
 * 渲染结果解释
 */
function renderInterpretation(rpiIndex, level, levelText, dimensions) {
  const interpretationContent = document.getElementById('interpretationContent');
  if (!interpretationContent) return;
  
  const subject = testType === 'self' ? '您' : 'Ta';
  const object = testType === 'self' ? '伴侣' : '您';
  const possessive = testType === 'self' ? '对方' : '您';
  
  // 确保维度数据存在
  const safeDimensions = {
    control: dimensions?.control || { raw: '0', z: 0, percent: 0 },
    jealousy: dimensions?.jealousy || { raw: '0', z: 0, percent: 0 },
    dependency: dimensions?.dependency || { raw: '0', z: 0, percent: 0 },
    insecurity: dimensions?.insecurity || { raw: '0', z: 0, percent: 0 }
  };
  
  let interpretationHTML = '';
  
  if (rpiIndex < 20) {
    interpretationHTML = `
      <p class="rpi-interpretation-summary-text">
        ${subject}的恋爱占有欲指数为 <strong class="rpi-score-highlight">${rpiIndex}</strong> 分，处于「<strong>很低（自由自在）</strong>」水平。
      </p>
      <p class="rpi-interpretation-desc">
        ${subject}在恋爱关系中表现出很强的独立性和信任感，给予${object}充分的自由和空间。${subject}不太会因为${object}的社交活动而感到不安，也很少有监控或限制${possessive}的行为。
      </p>
      <p class="rpi-interpretation-desc">
        在以下维度上表现优秀：高度信任${object}，尊重${possessive}的个人空间，情感独立性强。
      </p>
      <p class="rpi-interpretation-desc">
        这种松弛的相处模式有利于建立健康平等的亲密关系。不过，适度的关注和在乎也能让${possessive}感受到被重视。
      </p>
    `;
  } else if (rpiIndex < 40) {
    interpretationHTML = `
      <p class="rpi-interpretation-summary-text">
        ${subject}的恋爱占有欲指数为 <strong class="rpi-score-highlight">${rpiIndex}</strong> 分，处于「<strong>偏低（松弛有度）</strong>」水平。
      </p>
      <p class="rpi-interpretation-desc">
        ${subject}在恋爱中保持着良好的平衡，既重视关系又不会过度控制。${subject}会偶尔想了解${object}的动态，但总体上给予${possessive}足够的信任和自由。
      </p>
      <p class="rpi-interpretation-desc">
        在以下维度上表现良好：信任与关注并存，偶尔会有轻微的不安或嫉妒，但能够理性处理。
      </p>
      <p class="rpi-interpretation-desc">
        这种适度的占有欲有助于维持健康稳定的关系，${object}既能感受到被爱，又不会感到被束缚。
      </p>
    `;
  } else if (rpiIndex < 60) {
    interpretationHTML = `
      <p class="rpi-interpretation-summary-text">
        ${subject}的恋爱占有欲指数为 <strong class="rpi-score-highlight">${rpiIndex}</strong> 分，处于「<strong>中等（恰到好处）</strong>」水平。
      </p>
      <p class="rpi-interpretation-desc">
        ${subject}的占有欲处于正常范围内，既不会过度冷漠也不会过分控制。${subject}会关心${object}的行踪和社交，偶尔会有嫉妒或不安的情绪，但通常能够自我调节。
      </p>
      <p class="rpi-interpretation-desc">
        在以下维度上表现平衡：在意${object}但不过度干涉，会因某些情况产生嫉妒但能控制，需要一定的确认和关注但不依赖。
      </p>
      <p class="rpi-interpretation-desc">
        这是比较常见且健康的恋爱模式。建议继续保持开放的沟通，及时表达自己的感受和需求。
      </p>
    `;
  } else if (rpiIndex < 80) {
    interpretationHTML = `
      <p class="rpi-interpretation-summary-text">
        ${subject}的恋爱占有欲指数为 <strong class="rpi-score-highlight">${rpiIndex}</strong> 分，处于「<strong>偏高（执着深情）</strong>」水平。
      </p>
      <p class="rpi-interpretation-desc">
        ${subject}在恋爱关系中占有欲较为强烈，这可能表现为频繁关心${object}的行踪、对${possessive}的社交活动较为敏感等。建议关注是否对关系造成过度压力。
      </p>
      <p class="rpi-interpretation-desc">
        在以下维度上得分较高：嫉妒倾向、情感依赖、关系不安。这些特点可能影响${subject}在恋爱关系中的行为方式和情感体验。
      </p>
      <p class="rpi-interpretation-desc">
        建议给彼此更多空间，培养独立的兴趣爱好。如果感到情绪难以控制，可以向信任的朋友倾诉或寻求专业帮助。
      </p>
    `;
  } else {
    interpretationHTML = `
      <p class="rpi-interpretation-summary-text">
        ${subject}的恋爱占有欲指数为 <strong class="rpi-score-highlight">${rpiIndex}</strong> 分，处于「<strong>很高（爱到极致）</strong>」水平。
      </p>
      <p class="rpi-interpretation-desc">
        ${subject}的占有欲非常强烈，可能表现为频繁查看${object}动态、限制${possessive}社交活动等。这种极端的占有欲通常与深层的不安全感有关。
      </p>
      <p class="rpi-interpretation-desc">
        在以下维度上得分极高：控制欲望、嫉妒倾向、情感依赖、关系不安。这种程度的占有欲可能已经严重影响了关系质量。
      </p>
      <p class="rpi-interpretation-desc">
        建议试着给彼此更多空间，培养独立的兴趣爱好。如果感到情绪难以控制，建议向专业的心理咨询师寻求帮助。
      </p>
    `;
  }
  
  // 添加关键发现高亮项
  let highlightsHTML = '';
  const highlightItems = [];
  
  if (safeDimensions.control.percent >= 60) {
    highlightItems.push({
      icon: '🎯',
      text: `控制欲望较高（${safeDimensions.control.percent}分）`
    });
  }
  if (safeDimensions.jealousy.percent >= 60) {
    highlightItems.push({
      icon: '💔',
      text: `嫉妒倾向明显（${safeDimensions.jealousy.percent}分）`
    });
  }
  if (safeDimensions.dependency.percent >= 60) {
    highlightItems.push({
      icon: '💞',
      text: `情感依赖度高（${safeDimensions.dependency.percent}分）`
    });
  }
  if (safeDimensions.insecurity.percent >= 60) {
    highlightItems.push({
      icon: '😰',
      text: `关系安全感低（${safeDimensions.insecurity.percent}分）`
    });
  }
  
  if (highlightItems.length > 0) {
    highlightsHTML = `
      <div class="rpi-report-interpretation-highlights">
        <h4>🎯 关键发现</h4>
        <div class="rpi-report-highlight-grid">
          ${highlightItems.map(item => `
            <div class="rpi-report-highlight-item">
              <span class="rpi-report-highlight-icon">${item.icon}</span>
              <span><strong>${item.text.split('（')[0]}</strong>${item.text.split('（')[1]}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  interpretationContent.innerHTML = interpretationHTML + highlightsHTML;
}

/**
 * 渲染个性化建议
 */
function renderSuggestions(rpiIndex, dimensions) {
  const suggestionsTitle = document.getElementById('suggestionsTitle');
  const suggestionsContent = document.getElementById('suggestionsContent');
  if (!suggestionsContent) return;
  
  // 更新标题
  if (suggestionsTitle) {
    suggestionsTitle.textContent = testType === 'self' ? '💡 给您的建议' : '💡 理解与应对建议';
  }
  
  let suggestionsHTML = '';
  
  // 根据测试类型显示不同的建议
  if (testType === 'self') {
    suggestionsHTML = `
      <div class="rpi-report-suggestion-row">
        <span class="rpi-report-check">✓</span>
        <span>尝试培养独立的兴趣爱好，增强自我价值感，减少对伴侣的过度依赖。</span>
      </div>
      <div class="rpi-report-suggestion-row">
        <span class="rpi-report-check">✓</span>
        <span>学习信任和沟通技巧，用开放的对话替代监控和猜疑行为。</span>
      </div>
      <div class="rpi-report-suggestion-row">
        <span class="rpi-report-check">✓</span>
        <span>反思控制欲的根源，可能与不安全感或过往经历有关。</span>
      </div>
      <div class="rpi-report-suggestion-row">
        <span class="rpi-report-check">✓</span>
        <span>练习情绪管理，当嫉妒冲突时，先冷静思考再做出反应。</span>
      </div>
      <div class="rpi-report-suggestion-row">
        <span class="rpi-report-check">✓</span>
        <span>关注自我成长，建立稳固的自尊和自信，减少对伴侣的需要。</span>
      </div>
      <div class="rpi-report-suggestion-row">
        <span class="rpi-report-check">✓</span>
        <span>与伴侣坦诚地讨论你的恐惧，分享你的感受和需求。</span>
      </div>
      <div class="rpi-report-suggestion-row">
        <span class="rpi-report-check">✓</span>
        <span>如果占有欲影响了关系，可以和伴侣聊聊彼此的感受，一起看看情感类的书籍或文章。</span>
      </div>
    `;
  } else {
    suggestionsHTML = `
      <div class="rpi-report-suggestion-row">
        <span class="rpi-report-check">✓</span>
        <span>理解Ta的占有欲可能源于不安全感或对关系的重视，试着理解背后的情感需求。</span>
      </div>
      <div class="rpi-report-suggestion-row">
        <span class="rpi-report-check">✓</span>
        <span>主动给予Ta足够的安全感，及时回复消息，分享你的行程和感受。</span>
      </div>
      <div class="rpi-report-suggestion-row">
        <span class="rpi-report-check">✓</span>
        <span>温和地设定边界，告诉Ta哪些行为让你感到不适，寻求双方都能接受的相处方式。</span>
      </div>
      <div class="rpi-report-suggestion-row">
        <span class="rpi-report-check">✓</span>
        <span>鼓励Ta发展独立的兴趣和社交圈，帮助Ta建立自我价值感。</span>
      </div>
      <div class="rpi-report-suggestion-row">
        <span class="rpi-report-check">✓</span>
        <span>如果Ta的占有欲过强让你感到窒息，可以建议一起寻求伴侣咨询。</span>
      </div>
      <div class="rpi-report-suggestion-row">
        <span class="rpi-report-check">✓</span>
        <span>爱要相互尊重，给彼此自由的空间才能让关系更长久。</span>
      </div>
      <div class="rpi-report-suggestion-row">
        <span class="rpi-report-check">✓</span>
        <span>通过了解Ta的占有欲特点，可以更好地理解和改善你们的关系模式。</span>
      </div>
    `;
  }
  
  suggestionsContent.innerHTML = suggestionsHTML;
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
 * 导出报告
 */
function exportReport() {
  if (!reportData) return;
  
  try {
    const reportText = generateReportText();
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RPI报告_${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert('报告已保存');
  } catch (error) {
    console.error('导出失败:', error);
    alert('导出失败，请重试');
  }
}

/**
 * 生成报告文本
 */
function generateReportText() {
  if (!reportData) return '';
  
  const { rpiIndex, level, levelText, dimensions } = reportData;
  const subject = testType === 'self' ? '您' : 'Ta';
  
  let text = `RPI恋爱占有欲指数评估报告\n`;
  text += `==============================\n\n`;
  text += `测试类型：${testType === 'self' ? '给自己测' : '为恋人测'}\n`;
  text += `测试日期：${new Date().toLocaleString('zh-CN')}\n\n`;
  text += `总指数：${rpiIndex}分\n`;
  text += `等级：${level}（${levelText}）\n\n`;
  text += `四个维度得分：\n`;
  
  DIMENSION_ORDER.forEach(dimKey => {
    const dimension = dimensions[dimKey];
    const info = DIMENSION_INFO[dimKey];
    if (dimension && info) {
      text += `  ${info.name}：${dimension.percent}分\n`;
    }
  });
  
  text += `\n==============================\n`;
  text += `报告仅供参考，不具有医学诊断功能。\n`;
  
  return text;
}

/**
 * 渲染可视化分析（双雷达图）
 */
function renderRadars(dimensions) {
  const radarsContainer = document.getElementById('radarsContainer');
  if (!radarsContainer) return;
  
  // 获取四个维度的百分比
  const control = dimensions.control.percent;
  const jealousy = dimensions.jealousy.percent;
  const dependency = dimensions.dependency.percent;
  const insecurity = dimensions.insecurity.percent;
  
  // 计算依恋类型的分数
  // 焦虑维度 = insecurity (关系不安全感)
  // 回避维度 = 100 - dependency (低依赖 = 高回避)
  const anxietyScore = insecurity; // 焦虑维度
  const avoidanceScore = 100 - dependency; // 回避维度
  
  // 四种依恋类型的匹配强度
  const secureScore = Math.round((100 - anxietyScore + dependency) / 2); // 低焦虑 + 高依赖（低回避）
  const anxiousScore = Math.round((anxietyScore + dependency) / 2); // 高焦虑 + 高依赖（低回避）
  const avoidantScore = Math.round(((100 - anxietyScore) + avoidanceScore) / 2); // 低焦虑 + 高回避（低依赖）
  const fearfulScore = Math.round((anxietyScore + avoidanceScore) / 2); // 高焦虑 + 高回避（低依赖）
  
  // 确定主导依恋类型
  const maxScore = Math.max(secureScore, anxiousScore, avoidantScore, fearfulScore);
  const types = [];
  if (secureScore === maxScore) types.push('安全型');
  if (anxiousScore === maxScore) types.push('焦虑型');
  if (avoidantScore === maxScore) types.push('回避型');
  if (fearfulScore === maxScore) types.push('恐惧型');
  const dominantType = types.join(' + ') || '混合型';
  
  let radarsHTML = `
    <!-- 恋爱占有欲雷达图 -->
    <div class="rpi-report-radar-card">
      <h3 class="rpi-report-radar-title">恋爱占有欲雷达图</h3>
      <div class="rpi-report-radar-chart">
        <svg viewBox="-60 -60 420 420" class="rpi-report-radar-svg">
          <!-- 背景网格 -->
          <polygon points="150,30 270,150 150,270 30,150" fill="#FAFAFA" stroke="#E5E7EB" stroke-width="1.5"/>
          <polygon points="150,60 240,150 150,240 60,150" fill="#F5F5F5" stroke="#E5E7EB" stroke-width="1.5"/>
          <polygon points="150,90 210,150 150,210 90,150" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="1.5"/>
          <polygon points="150,120 180,150 150,180 120,150" fill="#FAFAFA" stroke="#E5E7EB" stroke-width="1"/>
          
          <!-- 中心点 -->
          <circle cx="150" cy="150" r="3" fill="#9CA3AF"/>
          
          <!-- 轴线 -->
          <line x1="150" y1="150" x2="150" y2="30" stroke="#D1D5DB" stroke-width="1"/>
          <line x1="150" y1="150" x2="270" y2="150" stroke="#D1D5DB" stroke-width="1"/>
          <line x1="150" y1="150" x2="150" y2="270" stroke="#D1D5DB" stroke-width="1"/>
          <line x1="150" y1="150" x2="30" y2="150" stroke="#D1D5DB" stroke-width="1"/>
          
          <!-- 刻度标签 -->
          <text x="150" y="145" text-anchor="middle" fill="#9CA3AF" font-size="10">20</text>
          <text x="150" y="115" text-anchor="middle" fill="#9CA3AF" font-size="10">40</text>
          <text x="150" y="85" text-anchor="middle" fill="#9CA3AF" font-size="10">60</text>
          <text x="150" y="55" text-anchor="middle" fill="#9CA3AF" font-size="10">80</text>
          
          <!-- 数据多边形（4个点，按上右下左顺序） -->
          <polygon 
            points="150,${150-(control*1.2)} ${150+(jealousy*1.2)},150 150,${150+(dependency*1.2)} ${150-(insecurity*1.2)},150"
            fill="rgba(233, 32, 99, 0.3)" 
            stroke="#E92063" 
            stroke-width="3"
          />
          
          <!-- 数据点 -->
          <circle cx="150" cy="${150-(control*1.2)}" r="6" fill="#E92063" stroke="white" stroke-width="2"/>
          <circle cx="${150+(jealousy*1.2)}" cy="150" r="6" fill="#E92063" stroke="white" stroke-width="2"/>
          <circle cx="150" cy="${150+(dependency*1.2)}" r="6" fill="#E92063" stroke="white" stroke-width="2"/>
          <circle cx="${150-(insecurity*1.2)}" cy="150" r="6" fill="#E92063" stroke="white" stroke-width="2"/>
          
          <!-- 维度标签 -->
          <text x="150" y="10" text-anchor="middle" fill="#333" font-size="14" font-weight="600">控制欲望</text>
          <text x="150" y="24" text-anchor="middle" fill="#E92063" font-size="12" font-weight="bold">${control}</text>
          
          <text x="295" y="155" text-anchor="start" fill="#333" font-size="14" font-weight="600">嫉妒强度</text>
          <text x="295" y="169" text-anchor="start" fill="#E92063" font-size="12" font-weight="bold">${jealousy}</text>
          
          <text x="150" y="295" text-anchor="middle" fill="#333" font-size="14" font-weight="600">情感依赖</text>
          <text x="150" y="309" text-anchor="middle" fill="#E92063" font-size="12" font-weight="bold">${dependency}</text>
          
          <text x="5" y="155" text-anchor="end" fill="#333" font-size="14" font-weight="600">关系不安</text>
          <text x="5" y="169" text-anchor="end" fill="#E92063" font-size="12" font-weight="bold">${insecurity}</text>
        </svg>
      </div>
      <div class="rpi-report-radar-desc">
        T分数范围：20-80，50为平均水平
      </div>
    </div>

    <!-- 依恋类型雷达图 -->
    <div class="rpi-report-radar-card">
      <h3 class="rpi-report-radar-title">依恋类型雷达图</h3>
      <div class="rpi-report-radar-chart">
        <svg viewBox="-60 -60 420 420" class="rpi-report-radar-svg">
          <!-- 背景网格 -->
          <polygon points="150,30 270,150 150,270 30,150" fill="#FAFAFA" stroke="#E5E7EB" stroke-width="1.5"/>
          <polygon points="150,60 240,150 150,240 60,150" fill="#F5F5F5" stroke="#E5E7EB" stroke-width="1.5"/>
          <polygon points="150,90 210,150 150,210 90,150" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="1.5"/>
          <polygon points="150,120 180,150 150,180 120,150" fill="#FAFAFA" stroke="#E5E7EB" stroke-width="1"/>
          
          <!-- 中心点 -->
          <circle cx="150" cy="150" r="3" fill="#9CA3AF"/>
          
          <!-- 轴线 -->
          <line x1="150" y1="150" x2="150" y2="30" stroke="#D1D5DB" stroke-width="1"/>
          <line x1="150" y1="150" x2="270" y2="150" stroke="#D1D5DB" stroke-width="1"/>
          <line x1="150" y1="150" x2="150" y2="270" stroke="#D1D5DB" stroke-width="1"/>
          <line x1="150" y1="150" x2="30" y2="150" stroke="#D1D5DB" stroke-width="1"/>
          
          <!-- 刻度标签 -->
          <text x="150" y="145" text-anchor="middle" fill="#9CA3AF" font-size="10">20</text>
          <text x="150" y="115" text-anchor="middle" fill="#9CA3AF" font-size="10">40</text>
          <text x="150" y="85" text-anchor="middle" fill="#9CA3AF" font-size="10">60</text>
          <text x="150" y="55" text-anchor="middle" fill="#9CA3AF" font-size="10">80</text>
          
          <!-- 数据多边形 - 依恋类型（基于不安全感和依赖度计算） -->
          <polygon 
            points="150,${150-(secureScore*1.2)} ${150+(anxiousScore*1.2)},150 150,${150+(avoidantScore*1.2)} ${150-(fearfulScore*1.2)},150"
            fill="rgba(233, 32, 99, 0.3)" 
            stroke="#E92063" 
            stroke-width="3"
          />
          
          <!-- 数据点 -->
          <circle cx="150" cy="${150-(secureScore*1.2)}" r="6" fill="#E92063" stroke="white" stroke-width="2"/>
          <circle cx="${150+(anxiousScore*1.2)}" cy="150" r="6" fill="#E92063" stroke="white" stroke-width="2"/>
          <circle cx="150" cy="${150+(avoidantScore*1.2)}" r="6" fill="#E92063" stroke="white" stroke-width="2"/>
          <circle cx="${150-(fearfulScore*1.2)}" cy="150" r="6" fill="#E92063" stroke="white" stroke-width="2"/>
          
          <!-- 维度标签 -->
          <text x="150" y="10" text-anchor="middle" fill="#333" font-size="14" font-weight="600">安全型</text>
          <text x="150" y="24" text-anchor="middle" fill="#666" font-size="11">${secureScore}</text>
          
          <text x="295" y="155" text-anchor="start" fill="#333" font-size="14" font-weight="600">焦虑型</text>
          <text x="295" y="169" text-anchor="start" fill="#666" font-size="11">${anxiousScore}</text>
          
          <text x="150" y="295" text-anchor="middle" fill="#333" font-size="14" font-weight="600">回避型</text>
          <text x="150" y="309" text-anchor="middle" fill="#666" font-size="11">${avoidantScore}</text>
          
          <text x="5" y="155" text-anchor="end" fill="#333" font-size="14" font-weight="600">恐惧型</text>
          <text x="5" y="169" text-anchor="end" fill="#666" font-size="11">${fearfulScore}</text>
        </svg>
      </div>
      <div class="rpi-report-radar-desc">
        主导类型：<span style="color: #E92063; font-weight: bold;">${dominantType}</span>
      </div>
      <div class="rpi-report-radar-desc" style="font-size: 12px; margin-top: 4px; color: #666;">
        核心维度：焦虑 ${anxietyScore}% · 回避 ${avoidanceScore}%
      </div>
      <div class="rpi-report-radar-desc" style="font-size: 11px; margin-top: 8px; padding: 8px; background: #FFF5F7; border-radius: 6px; line-height: 1.6;">
        <strong>💡 图表说明：</strong>四个维度表示您与各类型的"匹配度"。<br/>
        • <strong>焦虑型</strong>（高焦虑+高依赖）：${anxiousScore}%<br/>
        • <strong>回避型</strong>（低焦虑+低依赖）：${Math.round(((100 - anxietyScore) + (100 - dependency)) / 2)}%<br/>
        • <strong>安全型</strong>（低焦虑+高依赖）：${secureScore}%<br/>
        • <strong>恐惧型</strong>（高焦虑+低依赖）：${fearfulScore}%
      </div>
    </div>
  `;
  
  radarsContainer.innerHTML = radarsHTML;
}

/**
 * 获取人称代词
 */
function getPronouns() {
  if (testType === 'self') {
    return { subject: '您', object: '伴侣', possessive: '您的', partner: '对方' };
  } else {
    return { subject: 'Ta', object: '您', possessive: 'Ta的', partner: '您' };
  }
}

/**
 * 渲染恋爱占有欲人格类型
 */
function renderPersonality(rpiIndex) {
  const personalityContent = document.getElementById('personalityContent');
  if (!personalityContent) return;
  
  const p = getPronouns();
  let personalityType;
  
  // 根据 RPI 分数确定人格类型
  if (rpiIndex >= 80) {
    personalityType = {
      icon: '🔗',
      name: '共依存融合型',
      subtitle: '与伴侣共依存，界限模糊，失去自我，需要重建独立性',
      traits: ['无法分离', '界限模糊', '自我消失', '过度依赖', '情感绑架'],
      strengths: ['关系紧密', '情感投入深'],
      warnings: ['共依存关系', '双方都可能不健康', '需要重建自我', '易产生窒息感'],
      advice: '你们的关系非常紧密！不妨尝试培养一些个人爱好，和朋友多聚聚，保持独立的生活空间。健康的爱情需要两个完整的人，而不是半个人拼在一起哦！'
    };
  } else if (rpiIndex >= 65) {
    personalityType = {
      icon: '⚡',
      name: '强控制依赖型',
      subtitle: '控制欲强烈，高度依赖伴侣，需要学会放手和信任',
      traits: ['控制欲强', '嫉妒敏感', '需要掌控', '缺乏安全感', '过度监控'],
      strengths: ['关系投入高', '重视承诺', '责任心强'],
      warnings: ['易引发冲突', '伴侣感到压力', '关系紧张', '需要学会信任'],
      advice: '你的占有欲有点强哦！试着多信任对方，给彼此一些自由空间。培养自己的兴趣爱好，让生活更丰富。相信你们的感情，放松一点会更好！'
    };
  } else if (rpiIndex >= 50) {
    personalityType = {
      icon: '💫',
      name: '焦虑依恋型',
      subtitle: '对关系焦虑，需要频繁确认，但仍保持一定独立性',
      traits: ['需要确认', '关系焦虑', '情绪波动', '敏感多疑', '占有适中'],
      strengths: ['情感真挚', '重视关系', '愿意沟通', '有自我意识'],
      warnings: ['过度担忧', '情绪消耗大', '需要学会自我安抚', '建立自信'],
      advice: '你的焦虑型依恋可能让你在关系中感到不安。建议学习正念冥想和情绪管理技巧，提升自我价值感。《依恋》一书能帮助你更好地理解自己。'
    };
  } else if (rpiIndex >= 35) {
    personalityType = {
      icon: '🌸',
      name: '健康平衡型',
      subtitle: '占有欲适度，能平衡亲密与独立，关系健康和谐',
      traits: ['界限清晰', '信任伴侣', '情绪稳定', '独立自主', '适度关注'],
      strengths: ['关系和谐', '相互尊重', '自我完整', '沟通良好', '信任基础好'],
      warnings: ['保持现状', '继续成长', '警惕倦怠期'],
      advice: '你拥有健康的恋爱模式！建议继续保持这种平衡状态，同时可以阅读《亲密关系》等书籍，持续提升关系质量。'
    };
  } else if (rpiIndex >= 20) {
    personalityType = {
      icon: '🦋',
      name: '独立自主型',
      subtitle: '占有欲较低，高度独立，需要注意情感连接',
      traits: ['高度独立', '占有欲弱', '理性冷静', '重视空间', '情感淡化'],
      strengths: ['独立性强', '不黏人', '给予自由', '成熟理性', '自我完整'],
      warnings: ['情感连接弱', '伴侣可能感到被忽视', '需要增加亲密感', '平衡独立与亲密'],
      advice: '你的独立性很强，但要注意不要让伴侣感到被忽视。建议适当表达关心和在乎，学习《爱的五种语言》，找到适合你们的亲密方式。'
    };
  } else {
    personalityType = {
      icon: '🌙',
      name: '回避疏离型',
      subtitle: '占有欲极低，情感疏离，可能存在回避型依恋',
      traits: ['情感疏离', '回避亲密', '冷漠淡然', '自我保护', '距离感强'],
      strengths: ['独立能力强', '不依赖他人', '理性客观'],
      warnings: ['难以建立深度连接', '伴侣感到孤独', '关系难以维系', '需要打开心扉'],
      advice: '你是个很独立的人！不过有时候也可以适当向伴侣敞开心扉，分享你的感受。试着表达情感，会让关系更亲密哦。记住，示弱不是软弱，是信任的表现！'
    };
  }
  
  let traitsHTML = personalityType.traits.map(trait => `<li>${trait}</li>`).join('');
  let strengthsHTML = personalityType.strengths.map(strength => `<li>${strength}</li>`).join('');
  let warningsHTML = personalityType.warnings.map(warning => `<li>${warning}</li>`).join('');
  
  let personalityHTML = `
    <div class="rpi-report-personality-card">
      <div class="rpi-report-personality-icon">
        <span style="font-size: 48px;">${personalityType.icon}</span>
      </div>
      <h3 class="rpi-report-personality-type">${personalityType.name}</h3>
      <p class="rpi-report-personality-subtitle">
        ${personalityType.subtitle}
      </p>
      
      <div class="rpi-report-personality-details">
        <div class="rpi-report-personality-section">
          <h4>✨ 核心特征</h4>
          <ul>
            ${traitsHTML}
          </ul>
        </div>

        <div class="rpi-report-personality-section rpi-report-personality-positive">
          <h4>😊 ${p.possessive}的优势</h4>
          <ul>
            ${strengthsHTML}
          </ul>
        </div>

        <div class="rpi-report-personality-section rpi-report-personality-warning">
          <h4>⚠️ 需要注意的方面</h4>
          <ul>
            ${warningsHTML}
          </ul>
        </div>
      </div>

      <div class="rpi-report-personality-advice">
        <span class="rpi-report-advice-icon">💡</span>
        <strong>专业建议</strong>
        <p>${personalityType.advice}</p>
      </div>
    </div>
  `;
  
  personalityContent.innerHTML = personalityHTML;
}

/**
 * 渲染依恋模式分析
 */
function renderAttachment(rpiIndex, dimensions) {
  const attachmentContent = document.getElementById('attachmentContent');
  if (!attachmentContent) return;
  
  let attachmentType;
  
  // 根据 RPI 分数确定依恋模式
  if (rpiIndex >= 70) {
    attachmentType = {
      icon: '💗',
      name: '焦虑型依恋',
      subtitle: '对关系高度焦虑，需要不断确认被爱，对分离高度敏感',
      manifestations: '需要频繁的关注和确认；担心被抛弃；对伴侣的小变化敏感；情绪过度依赖伴侣；经常查看伴侣手机和社交媒体；要求伴侣随时报告行踪。',
      causes: '早期与照顾者的关系不稳定，得到的回应时而温暖时而冷漠，形成"我不值得被爱"的内在模式。可能经历过父母情感忽视、频繁分离或不可预测的养育方式。',
      improvement: '建立稳定的自我价值感；学习情绪自我调节；在安全关系中获得矫正性体验；通过冥想和正念练习降低焦虑；与伴侣坦诚沟通内心恐惧，建立安全承诺。'
    };
  } else if (rpiIndex >= 50) {
    attachmentType = {
      icon: '🔄',
      name: '矛盾型依恋',
      subtitle: '在亲密与独立之间摇摆，既渴望又害怕关系',
      manifestations: '时而非常黏人，时而疏远冷淡；对伴侣的态度反复无常；既需要确认又抗拒亲密；内心矛盾纠结；担心失去自我又害怕失去对方。',
      causes: '童年时期父母的养育方式不一致，有时过度保护有时放任不管，导致对关系的矛盾心理。可能经历过被侵入隐私或被过度控制的经历。',
      improvement: '试着找到亲密与独立的平衡点；和伴侣坦诚沟通自己的需求；保持真实的自己；记住爱一个人不需要失去自我；给自己一些时间慢慢调整。'
    };
  } else if (rpiIndex >= 30) {
    attachmentType = {
      icon: '🌟',
      name: '安全型依恋',
      subtitle: '情感稳定，能够平衡亲密与独立，信任关系',
      manifestations: '能够舒适地表达情感和需求；信任伴侣；不过度依赖也不回避亲密；冲突后能有效修复；情绪稳定；给予对方空间的同时保持连接。',
      causes: '童年时期得到了稳定、温暖、可预测的照顾，父母能够及时回应需求，建立了"我值得被爱、他人值得信任"的内在模式。',
      improvement: '继续保持这种健康的依恋模式；不断深化自我认知；在关系中持续学习和成长；培养更丰富的情感表达能力；成为伴侣的安全港湾。'
    };
  } else {
    attachmentType = {
      icon: '🌙',
      name: '回避型依恋',
      subtitle: '回避亲密和情感表达，强调独立，不愿依赖他人',
      manifestations: '不愿分享内心真实感受；当关系过于亲密时会退缩；强调自给自足；难以承诺和信任；用理性压抑情感；保持情感距离；避免冲突和深度沟通。',
      causes: '童年时期情感需求常被忽视或拒绝，学会了压抑需求和情感。可能经历过早期分离、情感冷漠的养育环境，或被教导"不要依赖他人"。',
      improvement: '试着向伴侣多表达你的感受；允许自己偶尔示弱；慢慢学会信任；记住亲密关系会让生活更美好；不要什么都自己扛，有人陪伴也挺好的！'
    };
  }
  
  let attachmentHTML = `
    <div class="rpi-report-attachment-card">
      <div class="rpi-report-attachment-type">
        <div class="rpi-report-attachment-icon">${attachmentType.icon}</div>
        <h3>${attachmentType.name}</h3>
        <p>${attachmentType.subtitle}</p>
      </div>
      <div class="rpi-report-attachment-details">
        <div class="rpi-report-attachment-item">
          <strong>典型表现：</strong>
          <p>${attachmentType.manifestations}</p>
        </div>
        <div class="rpi-report-attachment-item">
          <strong>形成原因：</strong>
          <p>${attachmentType.causes}</p>
        </div>
        <div class="rpi-report-attachment-item">
          <strong>改善方向：</strong>
          <p>${attachmentType.improvement}</p>
        </div>
      </div>
    </div>
  `;
  
  attachmentContent.innerHTML = attachmentHTML;
}

/**
 * 渲染占有欲影响路径分析
 */
function renderPathAnalysis() {
  const pathContent = document.getElementById('pathContent');
  if (!pathContent) return;
  
  let pathHTML = `
    <div class="rpi-report-path-card">
      <p class="rpi-report-path-intro">
        占有欲的形成和影响是一个复杂的心理过程，从深层根源到最终的关系影响，
        经历了多个层面的转化。理解这个路径有助于找到改善的切入点。
      </p>
      <div class="rpi-report-path-flow">
        <div class="rpi-report-path-item rpi-report-path-root">
          <span class="rpi-report-path-number">1</span>
          <div class="rpi-report-path-content">
            <span class="rpi-report-path-label">根源层面</span>
            <span class="rpi-report-path-text">不安全依恋 + 低自尊 + 过往创伤</span>
            <span class="rpi-report-path-desc">童年与照顾者的关系、过往被背叛的经历、自我价值感不足</span>
          </div>
        </div>
        <div class="rpi-report-path-arrow">↓</div>
        <div class="rpi-report-path-item rpi-report-path-cognition">
          <span class="rpi-report-path-number">2</span>
          <div class="rpi-report-path-content">
            <span class="rpi-report-path-label">认知层面</span>
            <span class="rpi-report-path-text">怀疑思维 + 威胁评估 + 归因偏差</span>
            <span class="rpi-report-path-desc">过度解读伴侣行为、将正常社交视为威胁、灾难化思维</span>
          </div>
        </div>
        <div class="rpi-report-path-arrow">↓</div>
        <div class="rpi-report-path-item rpi-report-path-emotion">
          <span class="rpi-report-path-number">3</span>
          <div class="rpi-report-path-content">
            <span class="rpi-report-path-label">情绪层面</span>
            <span class="rpi-report-path-text">焦虑 + 嫉妒 + 恐惧 + 愤怒</span>
            <span class="rpi-report-path-desc">持续的不安、强烈的嫉妒情绪、被抛弃的恐惧</span>
          </div>
        </div>
        <div class="rpi-report-path-arrow">↓</div>
        <div class="rpi-report-path-item rpi-report-path-behavior">
          <span class="rpi-report-path-number">4</span>
          <div class="rpi-report-path-content">
            <span class="rpi-report-path-label">行为层面</span>
            <span class="rpi-report-path-text">监控 + 限制 + 控制 + 质问</span>
            <span class="rpi-report-path-desc">查看手机、限制社交、要求汇报、频繁质问</span>
          </div>
        </div>
        <div class="rpi-report-path-arrow">↓</div>
        <div class="rpi-report-path-item rpi-report-path-impact">
          <span class="rpi-report-path-number">5</span>
          <div class="rpi-report-path-content">
            <span class="rpi-report-path-label">关系影响</span>
            <span class="rpi-report-path-text">信任受损 + 冲突增加 + 亲密度下降</span>
            <span class="rpi-report-path-desc">伴侣感到窒息、关系满意度降低、可能导致分手</span>
          </div>
        </div>
      </div>
      
      <div class="rpi-report-path-intervention">
        <h4>🎯 干预切入点</h4>
        <p>
          改善占有欲可以从任何层面入手：处理童年创伤（根源）、纠正认知扭曲（认知）、
          学习情绪管理（情绪）、改变控制行为（行为）、改善沟通模式（关系）。
          建议从最容易改变的行为层面开始，逐步深入到认知和情绪层面。
        </p>
      </div>
    </div>
  `;
  
  pathContent.innerHTML = pathHTML;
}

/**
 * 获取星座信息
 */
function getZodiacInfo(zodiacKey) {
  const ZODIAC_DATA = {
    aries: { name: '白羊座', emoji: '♈', tags: ['热情主动', '冲动直接', '占有欲强', '嫉妒心重'], traits: '白羊座的你在恋爱中热情主动，占有欲强，希望成为伴侣生活的中心。你性格直爽，有时会因冲动而表现出强烈的嫉妒或控制行为。你渴望被关注和确认，不喜欢伴侣与异性过多接触。', advice: '学会控制冲动，给伴侣更多空间。当感到嫉妒时，先冷静思考再表达。你的热情是优势，但过度的占有可能让对方窒息。' },
    taurus: { name: '金牛座', emoji: '♉', tags: ['占有欲强', '情感依赖', '缺乏安全感', '忠诚稳定'], traits: '金牛座的你在恋爱中占有欲较强，将伴侣视为重要的情感财富。你希望关系稳定长久，对背叛零容忍。你可能会通过物质或陪伴来表达爱，但也容易因缺乏安全感而过度依赖或控制。', advice: '建立稳固的自我价值感，不要将全部安全感寄托在伴侣身上。学会信任，给予对方自由度。你的忠诚是优势，但要避免过度占有。' },
    gemini: { name: '双子座', emoji: '♊', tags: ['占有欲低', '自由随性', '情感独立', '社交广泛'], traits: '双子座的你在恋爱中占有欲相对较低，重视个人自由和空间。你善于社交，不太会限制伴侣的活动。但有时你的独立可能让伴侣感到被忽视，觉得你不够在乎。', advice: '虽然占有欲低是优势，但也要让伴侣感受到你的重视和专注。适度的关心和确认可以增强关系亲密度。平衡自由与亲密。' },
    cancer: { name: '巨蟹座', emoji: '♋', tags: ['情感依赖', '缺乏安全感', '占有欲强', '敏感多疑'], traits: '巨蟹座的你在恋爱中情感依赖度高，渴望深度的情感连接和安全感。你容易因伴侣的小变化而产生不安，需要频繁的确认和关注。你可能会因为过度敏感而误解伴侣的行为，产生嫉妒或控制倾向。', advice: '建立内在的安全感，不要完全依赖外部确认。学习情绪管理，避免过度解读。你的细腻是优势，但要避免让敏感变成焦虑和控制。' },
    leo: { name: '狮子座', emoji: '♌', tags: ['占有欲强', '控制欲明显', '嫉妒心重', '自尊心强'], traits: '狮子座的你在恋爱中自信热情，占有欲强，希望成为伴侣眼中唯一的焦点。你渴望被崇拜和重视，不能容忍被忽视或背叛。你可能会因为强烈的自尊心而表现出控制或嫉妒行为，希望伴侣把你放在第一位。你慷慨大方，愿意为爱人付出一切，但也期待同样的回报和专注。', advice: '学会分享注意力，不要要求伴侣把所有重心都放在你身上。给对方一些主权和决策权。真正的爱不是控制和占有，而是相互尊重。你的自信和热情是优势，但过度的占有欲可能让对方感到压力。' },
    virgo: { name: '处女座', emoji: '♍', tags: ['控制欲强', '完美主义', '缺乏安全感', '情感保守'], traits: '处女座的你在恋爱中追求完美和秩序，可能会有较强的控制倾向。你希望一切按照预期发展，对伴侣的行为有较高的期待和标准。你可能会因为完美主义而过度管控，或因为不安全感而需要掌控细节。', advice: '接受关系中的不完美和不确定性。放下过度的控制欲，给伴侣犯错和成长的空间。学会信任和放手，完美的关系是双方共同成长的过程。' },
    libra: { name: '天秤座', emoji: '♎', tags: ['占有欲适中', '追求平衡', '情感独立', '理性温和'], traits: '天秤座的你在恋爱中追求平衡和和谐，占有欲通常处于适中水平。你能够理性地看待关系，既重视伴侣也保持独立。但有时你可能过于追求表面和平，压抑真实的不安或嫉妒情绪。', advice: '诚实表达你的感受，包括不安和嫉妒。真正的和谐不是压抑情绪，而是坦诚沟通。你的平衡感是优势，继续保持理性与情感的平衡。' },
    scorpio: { name: '天蝎座', emoji: '♏', tags: ['占有欲极强', '控制欲明显', '嫉妒心强', '情感深沉'], traits: '天蝎座的你在恋爱中占有欲和控制欲都很强，对伴侣有强烈的独占需求。你情感深沉，一旦投入就希望对方全心全意。你可能会监控伴侣的行为，对背叛零容忍，嫉妒心很强。你的占有源于深度的情感投入和对失去的恐惧。', advice: '学会信任，控制极端的占有欲和嫉妒。给伴侣呼吸的空间，真正的忠诚来自自愿而非监控。你的深情是优势，但要避免让爱变成控制和束缚。' },
    sagittarius: { name: '射手座', emoji: '♐', tags: ['占有欲低', '自由随性', '情感独立', '不喜束缚'], traits: '射手座的你在恋爱中占有欲较低，热爱自由，也给予伴侣充分的空间。你不喜欢被束缚，也不会过度束缚对方。但有时你的独立可能让伴侣感到被忽视，觉得你不够投入或在乎。', advice: '虽然自由很重要，但也要让伴侣感受到被重视。适度的关心和确认可以增强亲密度。平衡自由与承诺，让对方感到安全。' },
    capricorn: { name: '摩羯座', emoji: '♑', tags: ['控制欲较强', '情感保守', '责任感强', '缺乏表达'], traits: '摩羯座的你在恋爱中较为保守和传统，可能会有控制倾向但表现较为隐蔽。你通过实际行动表达爱，但可能缺乏情感表达和确认。你希望关系按照计划发展，对不确定性感到不安。', advice: '学会表达情感和脆弱，不要只用控制来获得安全感。开放地沟通你的需求和恐惧。你的责任感是优势，但要避免让关系变得过于刻板和缺乏温度。' },
    aquarius: { name: '水瓶座', emoji: '♒', tags: ['占有欲低', '情感独立', '理性客观', '不善表达'], traits: '水瓶座的你在恋爱中占有欲很低，重视精神独立和个人空间。你理性客观，不太会因嫉妒而失控。但你的疏离可能让伴侣感到不被重视，觉得你不够投入或关心。', advice: '虽然独立是优势，但关系需要情感投入和表达。让伴侣知道你的在乎，适度的占有欲可以增强亲密感。平衡理性与情感。' },
    pisces: { name: '双鱼座', emoji: '♓', tags: ['情感依赖', '缺乏安全感', '敏感多疑', '浪漫梦幻'], traits: '双鱼座的你在恋爱中情感依赖度高，渴望融入式的亲密关系。你敏感多疑，容易因为伴侣的小变化而产生不安和嫉妒。你可能会为了维持关系而牺牲自我，或通过情感勒索来挽留对方。你的占有源于对爱的渴望和对失去的恐惧。', advice: '建立清晰的关系边界，保持自我独立性。不要将全部幸福寄托在伴侣身上。学习自我关怀和情绪调节。你的浪漫是优势，但要避免让依赖变成负担。' }
  };
  
  return ZODIAC_DATA[zodiacKey] || null;
}

/**
 * 渲染爱情心理学专家建议
 */
function renderExpertAdvice(dimensions) {
  const expertContent = document.getElementById('expertContent');
  if (!expertContent) return;
  
  let expertHTML = `
    <!-- 控制欲望管理 -->
    <div class="rpi-report-expert-card">
      <div class="rpi-report-expert-icon" style="background: rgba(233, 32, 99, 0.1);">
        <span>🎯</span>
      </div>
      <h3>控制欲望管理</h3>
      <p class="rpi-report-expert-intro">
        你表现出较高的控制倾向。心理学研究表明，过度控制往往源于内心的不安全感。建议：
      </p>
      <div class="rpi-report-expert-steps">
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">①</span>
          <span>反思控制欲的根源，可能与童年经历或过往被背叛经验有关；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">②</span>
          <span>学习信任的艺术，给予伴侣信任空间；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">③</span>
          <span>用开放对话代替监控，表达需求而非控制行为；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">④</span>
          <span>培养自己的兴趣爱好，建立独立的生活圈子。</span>
        </div>
      </div>
    </div>

    <!-- 嫉妒情绪调节 -->
    <div class="rpi-report-expert-card">
      <div class="rpi-report-expert-icon" style="background: rgba(230, 77, 102, 0.1);">
        <span>💔</span>
      </div>
      <h3>嫉妒情绪调节</h3>
      <p class="rpi-report-expert-intro">
        你的嫉妒倾向较为明显。适度嫉妒是在乎的表现，但过度嫉妒会伤害关系。建议：
      </p>
      <div class="rpi-report-expert-steps">
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">①</span>
          <span>练习情绪觉察，当嫉妒出现时先暂停，思考；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">②</span>
          <span>挑战嫉妒背后的非理性信念，"Ta和异性说话≠Ta不爱我"；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">③</span>
          <span>用"我感到..."表达而非指责；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">④</span>
          <span>提升自我价值感，相信自己值得被爱；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">⑤</span>
          <span>与伴侣坦诚沟通恐惧，寻求理解和支持；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">⑥</span>
          <span>了解嫉妒是正常情绪，但可以选择如何回应。</span>
        </div>
      </div>
    </div>

    <!-- 情感独立成长 -->
    <div class="rpi-report-expert-card">
      <div class="rpi-report-expert-icon" style="background: rgba(217, 38, 128, 0.1);">
        <span>👥</span>
      </div>
      <h3>情感独立成长</h3>
      <p class="rpi-report-expert-intro">
        你对伴侣的情感依赖较高。健康的关系需要两个完整的个体。建议：
      </p>
      <div class="rpi-report-expert-steps">
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">①</span>
          <span>培养独立的兴趣和朋友圈，丰富你的生活；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">②</span>
          <span>练习独处，学会享受一个人的时光；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">③</span>
          <span>建立多元的情感支持系统（朋友、家人），不要只依赖伴侣；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">④</span>
          <span>提升自我价值感，不要将自我完整性寄托在关系上；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">⑤</span>
          <span>学习情绪自我调节，不过度依赖伴侣安慰；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">⑥</span>
          <span>阅读共依赖相关书籍，了解健康依恋模式。</span>
        </div>
      </div>
    </div>

    <!-- 关系安全感建立 -->
    <div class="rpi-report-expert-card">
      <div class="rpi-report-expert-icon" style="background: rgba(251, 191, 36, 0.1);">
        <span>🛡️</span>
      </div>
      <h3>关系安全感建立</h3>
      <p class="rpi-report-expert-intro">
        你在关系中存在较强的不安全感，这可能源于焦虑型依恋或过往创伤。建议：
      </p>
      <div class="rpi-report-expert-steps">
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">①</span>
          <span>探索不安全感的根源，是童年经历还是过往关系伤害？</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">②</span>
          <span>挑战"我不够好"的负面信念，列举自己的优点；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">③</span>
          <span>练习正念和自我关怀，减少过度担忧；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">④</span>
          <span>与伴侣开放沟通恐惧，寻求理解和支持；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">⑤</span>
          <span>如果不安全感让你很困扰，可以和信任的朋友或伴侣聊聊；</span>
        </div>
        <div class="rpi-report-expert-step">
          <span class="rpi-report-step-number">⑥</span>
          <span>记录伴侣值得信任的证据，在焦虑时翻看提醒自己。</span>
        </div>
      </div>
    </div>
  `;
  
  expertContent.innerHTML = expertHTML;
}

/**
 * 渲染星座参考
 */
function renderZodiac(demographicData) {
  const zodiacSection = document.getElementById('zodiacSection');
  if (!zodiacSection) return;
  
  const hasZodiac = demographicData && demographicData.zodiac && demographicData.zodiac !== 'unknown';
  
  // 如果没有星座信息，显示提示
  if (!hasZodiac) {
    let zodiacHTML = `
      <div class="rpi-report-section">
        <h2 class="rpi-report-section-title">
          <span class="rpi-report-section-icon">⭐</span>
          星座性格参考
          <span class="rpi-report-section-badge">仅供娱乐</span>
        </h2>
        <div class="rpi-report-zodiac-card">
          <div style="text-align: center; padding: 40px 20px;">
            <div style="font-size: 48px; margin-bottom: 16px;">🌟</div>
            <h3 style="color: #666; margin-bottom: 12px;">未提供星座信息</h3>
            <p style="color: #999; line-height: 1.6;">
              您在填写基本信息时未选择星座。星座参考部分将不会显示。<br/>
              如需查看星座分析，可以重新进行测试并填写星座信息。
            </p>
          </div>
        </div>
      </div>
    `;
    zodiacSection.innerHTML = zodiacHTML;
    return;
  }
  
  const zodiacInfo = getZodiacInfo(demographicData.zodiac);
  if (!zodiacInfo) {
    zodiacSection.innerHTML = '';
    return;
  }
  
  let tagsHTML = zodiacInfo.tags.map(tag => `<span class="rpi-report-zodiac-tag">${tag}</span>`).join('');
  
  let zodiacHTML = `
    <div class="rpi-report-section">
      <h2 class="rpi-report-section-title">
        <span class="rpi-report-section-icon">⭐</span>
        星座性格参考
        <span class="rpi-report-section-badge">仅供娱乐</span>
      </h2>
      <div class="rpi-report-zodiac-card">
        <!-- 星座标题 -->
        <div class="rpi-report-zodiac-title-row">
          <span class="rpi-report-zodiac-emoji">${zodiacInfo.emoji}</span>
          <h3>${zodiacInfo.name}</h3>
        </div>

        <!-- 星座标签 -->
        <div class="rpi-report-zodiac-tags">
          ${tagsHTML}
        </div>

        <!-- 恋爱特点 -->
        <div class="rpi-report-zodiac-section">
          <h4>💜 ${zodiacInfo.name}在恋爱中的特点</h4>
          <p>${zodiacInfo.traits}</p>
        </div>

        <!-- 星座建议 -->
        <div class="rpi-report-zodiac-section">
          <h4>💡 给你的星座建议</h4>
          <p>${zodiacInfo.advice}</p>
        </div>

        <!-- 特别说明 -->
        <div class="rpi-report-zodiac-disclaimer">
          <span class="rpi-report-zodiac-disclaimer-icon">ℹ️</span>
          <p>
            <strong>特别说明：</strong>
            星座性格没有科学依据，以上内容仅作为文化和星座传承，纯属娱乐参考。
            您的RPI评估结果全基于心理学理论和实际问卷，与星座无关。每个人都是独特的个体，不应被星座标签所限制。
          </p>
        </div>
      </div>
    </div>
  `;
  
  zodiacSection.innerHTML = zodiacHTML;
}

/**
 * 渲染关系健康度评估
 */
function renderHealth(rpiIndex, dimensions) {
  const healthContent = document.getElementById('healthContent');
  if (!healthContent) return;
  
  const dependency = dimensions.dependency.percent;
  const control = dimensions.control.percent;
  const insecurity = dimensions.insecurity.percent;
  const jealousy = dimensions.jealousy.percent;
  
  // 确定每个指标的状态
  const dependencyStatus = dependency >= 80 ? 'health-warning' : dependency >= 60 ? 'health-caution' : 'health-good';
  const controlStatus = control >= 80 ? 'health-warning' : control >= 60 ? 'health-caution' : 'health-good';
  const insecurityStatus = insecurity >= 80 ? 'health-warning' : insecurity >= 60 ? 'health-caution' : 'health-good';
  const jealousyStatus = jealousy >= 80 ? 'health-warning' : jealousy >= 60 ? 'health-caution' : 'health-good';
  
  // 依赖度描述
  const dependencyDesc = dependency >= 80 ? '依赖度很高，需要培养独立性' : dependency >= 60 ? '依赖度较高，注意保持自我' : dependency >= 30 ? '连接适度，保持平衡' : '连接较弱，可增加互动';
  
  // 控制平衡度描述
  const controlDesc = control >= 80 ? '控制欲过强，需要学会放手' : control >= 60 ? '控制倾向明显，注意平衡' : control >= 30 ? '控制适度，继续保持' : '控制欲低，关系自由';
  
  // 安全感描述
  const insecurityDesc = insecurity >= 80 ? '安全感很低，建议培养自信' : insecurity >= 60 ? '安全感偏低，可以提升' : insecurity >= 30 ? '安全感中等，继续保持' : '安全感强，关系稳固';
  
  // 情绪稳定性描述
  const jealousyDesc = jealousy >= 80 ? '嫉妒情绪强烈，影响关系' : jealousy >= 60 ? '嫉妒倾向明显，需要调节' : jealousy >= 30 ? '情绪较稳定，偶有波动' : '情绪稳定，心态平和';
  
  // 综合评价
  let summary = '';
  if (rpiIndex >= 80) {
    summary = '您的关系目前处于<strong>高风险状态</strong>，占有欲过强可能已经严重影响了双方的幸福感。建议尽快采取行动，寻求专业帮助。';
  } else if (rpiIndex >= 65) {
    summary = '您的关系存在<strong>一定风险</strong>，占有欲较强可能会给伴侣带来压力。建议学习情绪管理和沟通技巧，改善互动模式。';
  } else if (rpiIndex >= 50) {
    summary = '您的关系处于<strong>警戒状态</strong>，占有欲有些偏高，需要注意平衡亲密与独立。建议自我反思并与伴侣沟通。';
  } else if (rpiIndex >= 35) {
    summary = '您的关系总体<strong>健康良好</strong>，占有欲适度，能够平衡亲密与自由。继续保持并不断提升关系质量。';
  } else {
    summary = '您的关系中占有欲较低，总体<strong>自由健康</strong>，但也要注意保持适度的情感连接，避免过于疏离。';
  }
  
  let healthHTML = `
    <div class="rpi-report-health-card">
      <p class="rpi-report-health-intro">
        基于您的RPI指数和四维度分析，我们对您当前的关系健康状况进行综合评估：
      </p>
      
      <div class="rpi-report-health-indicators">
        <div class="rpi-report-health-item ${dependencyStatus}">
          <div class="rpi-report-health-icon">💕</div>
          <div class="rpi-report-health-content">
            <h4>情感连接度</h4>
            <div class="rpi-report-health-bar">
              <div class="rpi-report-health-fill" style="width: ${Math.min(dependency, 100)}%;"></div>
            </div>
            <p>${dependencyDesc}</p>
          </div>
        </div>

        <div class="rpi-report-health-item ${controlStatus}">
          <div class="rpi-report-health-icon">🎯</div>
          <div class="rpi-report-health-content">
            <h4>控制平衡度</h4>
            <div class="rpi-report-health-bar">
              <div class="rpi-report-health-fill" style="width: ${100 - Math.min(control, 100)}%;"></div>
            </div>
            <p>${controlDesc}</p>
          </div>
        </div>

        <div class="rpi-report-health-item ${insecurityStatus}">
          <div class="rpi-report-health-icon">🛡️</div>
          <div class="rpi-report-health-content">
            <h4>安全感指数</h4>
            <div class="rpi-report-health-bar">
              <div class="rpi-report-health-fill" style="width: ${100 - Math.min(insecurity, 100)}%;"></div>
            </div>
            <p>${insecurityDesc}</p>
          </div>
        </div>

        <div class="rpi-report-health-item ${jealousyStatus}">
          <div class="rpi-report-health-icon">😊</div>
          <div class="rpi-report-health-content">
            <h4>情绪稳定性</h4>
            <div class="rpi-report-health-bar">
              <div class="rpi-report-health-fill" style="width: ${100 - Math.min(jealousy, 100)}%;"></div>
            </div>
            <p>${jealousyDesc}</p>
          </div>
        </div>
      </div>

      <div class="rpi-report-health-summary">
        <h4>🎯 综合评价</h4>
        <p>${summary}</p>
      </div>
    </div>
  `;
  
  healthContent.innerHTML = healthHTML;
}

/**
 * 渲染有效沟通技巧指南
 */
function renderCommunication() {
  const communicationContent = document.getElementById('communicationContent');
  if (!communicationContent) return;
  
  let communicationHTML = `
    <div class="rpi-report-communication-card">
      <div class="rpi-report-comm-intro">
        <p>占有欲相关的冲突往往源于沟通不良。学习以下技巧，可以帮助您更好地表达需求、理解伴侣：</p>
      </div>

      <div class="rpi-report-comm-techniques">
        <div class="rpi-report-comm-item">
          <div class="rpi-report-comm-number">1</div>
          <div class="rpi-report-comm-content">
            <h4>"我"式表达</h4>
            <div class="rpi-report-comm-example">
              <div class="rpi-report-comm-bad">
                <span class="rpi-report-comm-label bad">❌ 指责式：</span>
                "你总是不理我，你根本不在乎我！"
              </div>
              <div class="rpi-report-comm-good">
                <span class="rpi-report-comm-label good">✅ "我"式：</span>
                "当你没有及时回我消息时，我感到被忽视和不安，我需要感受到被重视。"
              </div>
            </div>
          </div>
        </div>

        <div class="rpi-report-comm-item">
          <div class="rpi-report-comm-number">2</div>
          <div class="rpi-report-comm-content">
            <h4>积极倾听</h4>
            <ul class="rpi-report-comm-tips">
              <li>放下手机，给予全部注意力</li>
              <li>不打断，让对方说完</li>
              <li>复述确认："你是说...对吗？"</li>
              <li>理解感受："我理解你的感受"</li>
            </ul>
          </div>
        </div>

        <div class="rpi-report-comm-item">
          <div class="rpi-report-comm-number">3</div>
          <div class="rpi-report-comm-content">
            <h4>暂停技巧</h4>
            <p>当情绪激动时：</p>
            <ul class="rpi-report-comm-tips">
              <li>"我现在很生气，需要冷静一下，我们20分钟后再谈好吗？"</li>
              <li>避免在愤怒时做决定或说狠话</li>
              <li>冷静后主动重启对话</li>
            </ul>
          </div>
        </div>

        <div class="rpi-report-comm-item">
          <div class="rpi-report-comm-number">4</div>
          <div class="rpi-report-comm-content">
            <h4>定期关系对话</h4>
            <p>每周安排固定时间（如周日晚上）进行关系对话：</p>
            <ul class="rpi-report-comm-tips">
              <li>分享本周的感受和需求</li>
              <li>表达欣赏和感谢</li>
              <li>讨论待解决的问题</li>
              <li>制定下周改善计划</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `;
  
  communicationContent.innerHTML = communicationHTML;
}

/**
 * 渲染30天自我成长计划
 */
function renderGrowth() {
  const growthContent = document.getElementById('growthContent');
  if (!growthContent) return;
  
  let growthHTML = `
    <div class="rpi-report-growth-card">
      <p class="rpi-report-growth-intro">
        改变需要时间和坚持。以下是一个为期30天的系统化成长计划，帮助您逐步降低不健康的占有欲，建立更和谐的关系：
      </p>

      <div class="rpi-report-growth-timeline">
        <div class="rpi-report-growth-phase">
          <div class="rpi-report-growth-phase-header">
            <span class="rpi-report-growth-week">第1周</span>
            <span class="rpi-report-growth-theme">自我觉察期</span>
          </div>
          <ul class="rpi-report-growth-tasks">
            <li>每天记录情绪日记，识别占有欲触发点</li>
            <li>完成"我的不安全感来源"书面反思</li>
            <li>练习正念冥想，每天10分钟</li>
            <li>与伴侣坦诚分享内心感受（选择合适时机）</li>
          </ul>
        </div>

        <div class="rpi-report-growth-phase">
          <div class="rpi-report-growth-phase-header">
            <span class="rpi-report-growth-week">第2周</span>
            <span class="rpi-report-growth-theme">认知调整期</span>
          </div>
          <ul class="rpi-report-growth-tasks">
            <li>学习并实践认知重构技巧</li>
            <li>每当嫉妒或焦虑出现，写下并挑战非理性想法</li>
            <li>阅读《依恋理论》或相关书籍</li>
            <li>减少查看伴侣手机/社交媒体的频率</li>
          </ul>
        </div>

        <div class="rpi-report-growth-phase">
          <div class="rpi-report-growth-phase-header">
            <span class="rpi-report-growth-week">第3周</span>
            <span class="rpi-report-growth-theme">行为改变期</span>
          </div>
          <ul class="rpi-report-growth-tasks">
            <li>培养独立兴趣爱好，每周2-3次</li>
            <li>给伴侣更多个人空间，减少控制行为</li>
            <li>练习"我"式沟通，表达需求而非指责</li>
            <li>与朋友社交，拓展社交圈</li>
          </ul>
        </div>

        <div class="rpi-report-growth-phase">
          <div class="rpi-report-growth-phase-header">
            <span class="rpi-report-growth-week">第4周</span>
            <span class="rpi-report-growth-theme">巩固提升期</span>
          </div>
          <ul class="rpi-report-growth-tasks">
            <li>回顾30天的成长变化，写总结</li>
            <li>与伴侣进行关系对话，听取反馈</li>
            <li>制定长期成长计划</li>
            <li>如有需要，和朋友或伴侣多交流</li>
          </ul>
        </div>
      </div>

      <div class="rpi-report-growth-tips">
        <h4>💡 坚持小贴士</h4>
        <ul>
          <li>设置每日提醒，养成习惯</li>
          <li>找一个支持者（朋友/伴侣）互相督促</li>
          <li>每周回顾进展，记录小成功</li>
          <li>对自己保持耐心，改变需要时间</li>
          <li>偶尔退步是正常的，重要的是继续前进</li>
        </ul>
      </div>
    </div>
  `;
  
  growthContent.innerHTML = growthHTML;
}

/**
 * 渲染推荐学习资源
 */
function renderResources() {
  const resourcesContent = document.getElementById('resourcesContent');
  if (!resourcesContent) return;
  
  let resourcesHTML = `
    <div class="rpi-report-resources-grid">
      <!-- 推荐书籍 -->
      <div class="rpi-report-resource-column">
        <div class="rpi-report-resource-column-header">
          <span class="rpi-report-resource-column-icon">📚</span>
          <span>推荐书籍</span>
        </div>
        <ul class="rpi-report-resource-list">
          <li>《依恋理论》- Bowlby</li>
          <li>《亲密关系》- Rowland Miller</li>
          <li>《爱的五种语言》- Gary Chapman</li>
        </ul>
      </div>

      <!-- 在线课程 -->
      <div class="rpi-report-resource-column">
        <div class="rpi-report-resource-column-header">
          <span class="rpi-report-resource-column-icon">🎓</span>
          <span>在线课程</span>
        </div>
        <ul class="rpi-report-resource-list">
          <li>亲密关系心理学</li>
          <li>情绪管理与沟通技巧</li>
          <li>依恋类型与关系模式</li>
        </ul>
      </div>

      <!-- 专业支持 -->
      <div class="rpi-report-resource-column">
        <div class="rpi-report-resource-column-header">
          <span class="rpi-report-resource-column-icon">💬</span>
          <span>专业支持</span>
        </div>
        <ul class="rpi-report-resource-list">
          <li>情感交流社群</li>
          <li>恋爱话题播客</li>
          <li>心理学科普文章</li>
        </ul>
      </div>
    </div>
  `;
  
  resourcesContent.innerHTML = resourcesHTML;
}

/**
 * 渲染评估信息
 */
function renderInfo() {
  const infoCard = document.getElementById('infoCard');
  if (!infoCard) return;
  
  // 获取测试结果的时间戳
  const timestamp = reportData?.timestamp || demographicData?.timestamp || new Date().toISOString();
  const testTypeText = testType === 'self' ? '给自己测' : '为恋人测';
  
  let infoHTML = `
    <h3>评估信息</h3>
    <div class="rpi-report-info-grid">
      <div class="rpi-report-info-item">
        <span class="rpi-report-info-label">评估类型:</span>
        <span class="rpi-report-info-value">${testTypeText}</span>
      </div>
      <div class="rpi-report-info-item">
        <span class="rpi-report-info-label">完成时间:</span>
        <span class="rpi-report-info-value">${new Date(timestamp).toLocaleString('zh-CN')}</span>
      </div>
      <div class="rpi-report-info-item">
        <span class="rpi-report-info-label">回答题数:</span>
        <span class="rpi-report-info-value">40 题</span>
      </div>
      <div class="rpi-report-info-item">
        <span class="rpi-report-info-label">会话ID:</span>
        <span class="rpi-report-info-value">session_${Date.now()}</span>
      </div>
    </div>
  `;
  
  infoCard.innerHTML = infoHTML;
}

/**
 * 渲染底部操作按钮
 */
function renderFooterActions() {
  console.log('renderFooterActions 被调用');
  
  const footerActions = document.getElementById('footerActions');
  if (!footerActions) {
    console.warn('footerActions 元素不存在，按钮已在HTML中定义');
    return;
  }
  
  // 检查按钮是否已存在（在HTML中定义）
  const existingBtn = document.getElementById('rpi-restart-btn');
  if (existingBtn) {
    console.log('按钮已存在于HTML中，无需重新渲染');
    return;
  }
  
  // 如果按钮不存在，则动态创建（备用方案）
  console.log('按钮不存在，动态创建按钮');
  // 直接使用 onclick 属性，确保即使模块加载失败也能工作
  // 优先使用 window.handleRestart，如果不可用则使用 window.rpiRestart，都不可用则直接执行清除逻辑
  let footerHTML = `
    <button id="rpi-restart-btn" class="rpi-report-footer-btn rpi-report-footer-btn-primary" onclick="(function(){const f=window.handleRestart||window.rpiRestart;if(typeof f==='function'){f();}else{localStorage.removeItem('rpi_test_result_self');localStorage.removeItem('rpi_test_result_partner');localStorage.removeItem('rpi_test_type');localStorage.removeItem('rpi_consent_self');localStorage.removeItem('rpi_consent_partner');localStorage.removeItem('rpi_demographic_self');localStorage.removeItem('rpi_demographic_partner');const t=localStorage.getItem('rpi_test_token')||new URLSearchParams(window.location.search).get('token');window.location.href=t?'index.html?token='+encodeURIComponent(t):'index.html';}})();return false;">
      <span class="anticon anticon-reload">
        <svg viewBox="64 64 896 896" focusable="false" data-icon="reload" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M909.1 209.3l-56.4 44.1C775.8 155.1 656.2 92 521.9 92 290 92 102.3 279.5 102 511.5 101.7 743.7 289.8 932 521.9 932c181.3 0 335.8-115 394.6-276.1 1.5-4.2-.7-8.9-4.9-10.3l-56.7-19.5a8 8 0 00-10.1 4.8c-1.8 5-3.8 10-5.9 14.9-17.3 41-42.1 77.8-73.7 109.4A344.77 344.77 0 01655.9 829c-42.3 0-82.5-11.4-117.6-33.1a345.12 345.12 0 01-104.8-93.9A345.1 345.1 0 01318.3 652c-11.4-42.3 5.7-87.6 42.8-114.6 40.9-29.6 98.7-30.5 140.9-2.7 1.5.9 3.1 1.8 4.5 2.9 4.7 3.1 7.5 8.8 6.6 14.5l-28.5 171a8 8 0 01-10.3 6.2l-170-54.5c-5.8-1.9-9.5-7.6-7.7-13.4l28.5-171c.9-5.7 5.5-10.2 11.2-11.1 5.6-.9 11.1 2.1 13.4 7.5l29.3 93 1.2 3.8a345.13 345.13 0 01112.1 129.7 345.1 345.1 0 0191.4 111.6c24.3 38.2 37.1 81.9 37.1 125.7 0 190.5-154.9 345.5-345.5 345.5S176.4 702 176.4 511.5c0-89.7 34.5-174 97.1-237.5 58.7-58.7 136.8-91 219.9-91 73.2 0 141.5 25.5 196.7 71.5L818 311.7a8 8 0 0012.7-4.1l54.5-170.2a8 8 0 00-6.7-10.1l-170-54.5a8 8 0 00-10.1 6.7l-9.2 28.8c-2.4-1-4.9-2-7.4-2.9z"></path></svg>
      </span>
      重新测试
    </button>
  `;
  
  footerActions.innerHTML = footerHTML;
  console.log('footerActions innerHTML 已设置（动态创建）');
}


