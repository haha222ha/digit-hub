/**
 * DarkTriad 报告页面逻辑
 * 完全独立的实现，不依赖任何外部框架
 * 魔丸灵珠主题
 */

import { getTestResult } from './utils/storage.js';
import { DIMENSION_NAMES, DIMENSION_ORDER } from '../data/questions.js';

// 报告数据
let reportData = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initialize();
});

/**
 * 初始化报告页面
 */
function initialize() {
  try {
    showLoading(true);
    
    // 加载测试结果
    const resultData = getTestResult();
    
    console.log('加载的测试结果数据:', resultData);
    
    if (!resultData || !resultData.result) {
      console.error('未找到测试结果数据');
      alert('未找到测试结果，请先完成测试。');
      // 构建首页URL（需要包含token以便SDK验证）
      let indexUrl = 'index.html';
      const urlParams = new URLSearchParams();
      const token = window.linkValidator && window.linkValidator.token;
      const isUnlimited = window.linkValidator && window.linkValidator.unlimited;
      if (isUnlimited && token) {
        urlParams.set('unlimited', 'true');
        urlParams.set('token', token);
      } else if (token) {
        urlParams.set('token', token);
      }
      const queryString = urlParams.toString();
      if (queryString) {
        indexUrl = `${indexUrl}?${queryString}`;
      }
      window.location.href = indexUrl;
      return;
    }
    
    reportData = resultData.result;
    
    console.log('报告数据:', reportData);
    console.log('D因子数据:', reportData.dFactor);
    console.log('魔丸灵珠数据:', reportData.moLing);
    console.log('维度数据:', reportData.dimensions);
    // 检查第一个维度的description字段
    if (reportData.dimensions) {
      const firstDimKey = Object.keys(reportData.dimensions)[0];
      if (firstDimKey) {
        console.log(`第一个维度 ${firstDimKey} 的数据:`, reportData.dimensions[firstDimKey]);
        console.log(`第一个维度是否有description:`, !!reportData.dimensions[firstDimKey]?.description);
      }
    }
    
    // 渲染报告
    renderReport();
    
    showLoading(false);
    
  } catch (error) {
    console.error('加载报告失败:', error);
    console.error('错误堆栈:', error.stack);
    showLoading(false);
    alert('加载报告失败，请刷新页面重试。错误信息：' + error.message);
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
 * 渲染报告
 */
function renderReport() {
  if (!reportData) {
    console.error('reportData为空');
    return;
  }
  
  try {
    renderDFactorDisplay();
  } catch (error) {
    console.error('渲染D因子展示区失败:', error);
  }
  
  try {
    renderMoLingAlert();
  } catch (error) {
    console.error('渲染魔丸灵珠判定失败:', error);
  }
  
  try {
    renderDFactorScience();
  } catch (error) {
    console.error('渲染D因子科学解读失败:', error);
  }
  
  try {
    renderRadarChart();
  } catch (error) {
    console.error('渲染雷达图失败:', error);
  }
  
  try {
    renderDominantTraits();
  } catch (error) {
    console.error('渲染主导特质失败:', error);
  }
  
  try {
    renderDimensions();
  } catch (error) {
    console.error('渲染维度详情失败:', error);
  }
  
  try {
    renderInterpersonal();
  } catch (error) {
    console.error('渲染人际关系失败:', error);
  }
  
  try {
    renderDevelopmentAdvice();
  } catch (error) {
    console.error('渲染发展建议失败:', error);
  }
  
  try {
    renderFAQ();
  } catch (error) {
    console.error('渲染FAQ失败:', error);
  }
  
  try {
    renderImportantAlert();
  } catch (error) {
    console.error('渲染重要提示失败:', error);
  }
  
  try {
    renderFooterInfo();
  } catch (error) {
    console.error('渲染底部说明失败:', error);
  }
  
  // 不再手动调用 renderAdminGuide()，因为SDK会自动添加推广链接到 .report-footer
  // try {
  //   renderAdminGuide();
  // } catch (error) {
  //   console.error('渲染管理员引导失败:', error);
  // }
  
  // 初始化重新测试按钮
  try {
    initializeRestartButton();
  } catch (error) {
    console.error('初始化重新测试按钮失败:', error);
  }
}

/**
 * 渲染D因子展示区
 */
function renderDFactorDisplay() {
  const dFactor = reportData.dFactor || {};
  // 如果dFactor是数字，说明是旧格式，需要转换
  let dFactorPercent, dFactorAverage;
  if (typeof dFactor === 'number') {
    dFactorAverage = dFactor;
    dFactorPercent = Math.round((dFactor / 5) * 100);
  } else {
    dFactorAverage = dFactor.averageScore || 0;
    dFactorPercent = dFactor.percentage || Math.round((dFactorAverage / 5) * 100);
  }
  
  const moLing = reportData.moLing || {};
  const isMoWan = (moLing.title && moLing.title.includes('魔丸')) || (moLing.type === '魔丸');
  const moLingTitle = moLing.title || moLing.type || '未知';
  const completedAt = reportData.completedAt || new Date().toISOString();
  const date = new Date(completedAt);
  const dateStr = date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const displaySection = document.getElementById('dFactorDisplay');
  if (!displaySection) return;
  
  const bgGradient = isMoWan
    ? 'linear-gradient(135deg, #ee5a6f 0%, #f29263 50%, #8b5fb6 100%)'
    : 'linear-gradient(135deg, #667eea 0%, #5fa8d3 50%, #4a90e2 100%)';
  
  displaySection.innerHTML = `
    <div class="d-factor-card" style="background: ${bgGradient}; position: relative; overflow: hidden; border-radius: 24px; padding: ${window.innerWidth <= 768 ? '32px 24px' : '48px 40px'}; margin-bottom: 32px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);">
      <div style="position: absolute; top: 0; right: 0; width: 200px; height: 200px; background: rgba(255,255,255,0.08); border-radius: 50%; transform: translate(50%, -50%);"></div>
      <div style="text-align: center; position: relative; z-index: 1;">
        <div style="background: rgba(255,255,255,0.12); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.25); border-radius: 12px; padding: 8px 20px; display: inline-block; margin-bottom: 20px;">
          <span style="color: white; font-size: 14px; font-weight: 600; opacity: 0.95;">黑暗三角人格测试报告</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 20px;">
          <div style="font-size: ${window.innerWidth <= 768 ? '80px' : '100px'};">${isMoWan ? '🔥' : '💧'}</div>
          <div style="border: 2px solid white; border-radius: 8px; padding: ${window.innerWidth <= 768 ? '12px 24px' : '14px 32px'}; background: rgba(255,255,255,0.1); backdrop-filter: blur(10px);">
            <div style="font-size: ${window.innerWidth <= 768 ? '36px' : '56px'}; font-weight: bold; color: white; text-shadow: 0 2px 8px rgba(0,0,0,0.2); line-height: 1;">${moLingTitle}</div>
          </div>
        </div>
        <div style="font-size: ${window.innerWidth <= 768 ? '16px' : '18px'}; color: rgba(255,255,255,0.9); line-height: 1.6; margin-bottom: 20px; text-align: center;">
          D因子得分：${dFactorPercent}%
        </div>
        <div style="font-size: 14px; color: rgba(255,255,255,0.75); margin-top: 24px; text-align: center;">
          测试完成时间：${dateStr} | 基于70题科学评估
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染十维度得分详情
 */
function renderDimensions() {
  const dimensionsGrid = document.getElementById('dimensionsGrid');
  if (!dimensionsGrid) {
    console.warn('dimensionsGrid元素不存在');
    return;
  }
  
  if (!reportData.dimensions) {
    console.warn('reportData.dimensions不存在');
    dimensionsGrid.innerHTML = '<p>暂无维度数据</p>';
    return;
  }
  
  dimensionsGrid.innerHTML = '';
  
  // 10个维度的配置（注意：key需要匹配scoring.js中的DIMENSION_ORDER）
  const dimensionConfigs = [
    { key: 'Egoism', icon: '💰', color: '#ff4757', name: '利己主义' },
    { key: 'Machiavellianism', icon: '🎯', color: '#ff6348', name: '马基雅维利主义' },
    { key: 'MoralDisengagement', icon: '🛡️', color: '#ff7f50', name: '道德推脱' },
    { key: 'Narcissism', icon: '⭐', color: '#ffa502', name: '自恋' },
    { key: 'PsychologicalEntitlement', icon: '👑', color: '#ff6b9d', name: '心理权力感' },
    { key: 'Psychopathy', icon: '⚡', color: '#c44569', name: '精神病质' },
    { key: 'Sadism', icon: '😈', color: '#4b7bec', name: '施虐倾向' },
    { key: 'SelfInterest', icon: '🔰', color: '#3867d6', name: '自我为中心' },
    { key: 'Spitefulness', icon: '💢', color: '#1e90ff', name: '恶毒倾向' },
    { key: 'Greed', icon: '💎', color: '#00a8ff', name: '贪婪' }
  ];
  
  // 使用配置的顺序和颜色
  // 兼容原版的数据访问方式：原版使用result[config.key]，我们也支持这种方式
  dimensionConfigs.forEach((config, index) => {
    const dim = reportData[config.key] || reportData.dimensions?.[config.key];
    if (!dim) {
      console.warn(`维度 ${config.key} 不存在，可用维度:`, Object.keys(reportData.dimensions || {}));
      return;
    }
    
    // 调试：检查description字段
    if (!dim.description) {
      console.warn(`维度 ${config.key} (${config.name}) 缺少description字段，dim对象:`, dim);
    }
    
    const averageScore = dim.averageScore || 0;
    const percent = dim.percentage || Math.round((averageScore / 5) * 100);
    const color = config.color;
    
    // 根据得分确定水平
    let level = '很低';
    if (averageScore >= 4.0) {
      level = '极高';
    } else if (averageScore >= 3.5) {
      level = '高';
    } else if (averageScore >= 3.0) {
      level = '中等';
    } else if (averageScore >= 2.5) {
      level = '中等偏低';
    } else if (averageScore >= 2.0) {
      level = '较低';
    } else {
      level = '很低';
    }
    
    const dimCard = document.createElement('div');
    dimCard.className = 'dimension-card';
    dimCard.style.border = '1px solid #e5e7eb';
    dimCard.style.borderRadius = '12px';
    dimCard.style.padding = '20px';
    dimCard.style.background = '#fff';
    dimCard.style.height = '100%';
    dimCard.style.marginBottom = '16px';
    
    // 标题（图标+名称）
    const titleDiv = document.createElement('div');
    titleDiv.style.display = 'flex';
    titleDiv.style.alignItems = 'center';
    titleDiv.style.gap = '12px';
    titleDiv.style.marginBottom = '16px';
    
    const iconSpan = document.createElement('span');
    iconSpan.style.fontSize = '24px';
    iconSpan.textContent = config.icon;
    
    const nameSpan = document.createElement('span');
    nameSpan.style.fontSize = '16px';
    nameSpan.style.fontWeight = '600';
    nameSpan.style.color = '#374151';
    nameSpan.textContent = config.name;
    
    titleDiv.appendChild(iconSpan);
    titleDiv.appendChild(nameSpan);
    
    // 进度条（百分比显示在进度条内，与原版一致）
    const progressDiv = document.createElement('div');
    progressDiv.style.marginBottom = '16px';
    progressDiv.style.position = 'relative';
    
    const progressBar = document.createElement('div');
    progressBar.style.width = '100%';
    progressBar.style.height = '14px';
    progressBar.style.background = '#f0f0f0';
    progressBar.style.borderRadius = '7px';
    progressBar.style.overflow = 'hidden';
    progressBar.style.position = 'relative';
    
    const progressFill = document.createElement('div');
    progressFill.style.height = '100%';
    progressFill.style.width = percent + '%';
    progressFill.style.background = `linear-gradient(to right, ${color}, ${color}dd)`;
    progressFill.style.transition = 'width 0.3s ease';
    progressFill.style.position = 'relative';
    
    // 百分比文字显示在进度条内（右侧）
    const percentText = document.createElement('span');
    percentText.style.position = 'absolute';
    percentText.style.right = '8px';
    percentText.style.top = '50%';
    percentText.style.transform = 'translateY(-50%)';
    percentText.style.fontSize = '12px';
    percentText.style.color = percent > 50 ? '#fff' : '#666';
    percentText.style.fontWeight = '600';
    percentText.style.zIndex = '1';
    percentText.textContent = percent + '%';
    
    progressFill.appendChild(percentText);
    progressBar.appendChild(progressFill);
    progressDiv.appendChild(progressBar);
    
    // 数据指标（3列）
    const dataRow = document.createElement('div');
    dataRow.style.display = 'grid';
    dataRow.style.gridTemplateColumns = 'repeat(3, 1fr)';
    dataRow.style.gap = '8px';
    dataRow.style.marginBottom = '16px';
    
    // 得分
    const scoreCard = document.createElement('div');
    scoreCard.style.textAlign = 'center';
    scoreCard.style.padding = '8px';
    scoreCard.style.background = '#f9fafb';
    scoreCard.style.borderRadius = '8px';
    scoreCard.style.border = '1px solid #e5e7eb';
    const scoreLabel = document.createElement('div');
    scoreLabel.style.fontSize = '12px';
    scoreLabel.style.color = '#999';
    scoreLabel.textContent = '得分';
    const scoreValue = document.createElement('div');
    scoreValue.style.fontSize = '14px';
    scoreValue.style.fontWeight = '600';
    scoreValue.style.color = '#374151'; // 原版是黑色，不是红色
    scoreValue.textContent = `${dim.rawScore || 0}/35`;
    scoreCard.appendChild(scoreLabel);
    scoreCard.appendChild(scoreValue);
    
    // 均分
    const avgCard = document.createElement('div');
    avgCard.style.textAlign = 'center';
    avgCard.style.padding = '8px';
    avgCard.style.background = '#f9fafb';
    avgCard.style.borderRadius = '8px';
    avgCard.style.border = '1px solid #e5e7eb';
    const avgLabel = document.createElement('div');
    avgLabel.style.fontSize = '12px';
    avgLabel.style.color = '#999';
    avgLabel.textContent = '均分';
    const avgValue = document.createElement('div');
    avgValue.style.fontSize = '14px';
    avgValue.style.fontWeight = '600';
    avgValue.style.color = '#374151'; // 原版是黑色，不是红色
    avgValue.textContent = averageScore.toFixed(2);
    avgCard.appendChild(avgLabel);
    avgCard.appendChild(avgValue);
    
    // 水平
    const levelCard = document.createElement('div');
    levelCard.style.textAlign = 'center';
    levelCard.style.padding = '8px';
    levelCard.style.background = `${color}10`;
    levelCard.style.borderRadius = '8px';
    levelCard.style.border = '1px solid #e5e7eb';
    const levelLabel = document.createElement('div');
    levelLabel.style.fontSize = '12px';
    levelLabel.style.color = '#999';
    levelLabel.textContent = '水平';
    const levelValue = document.createElement('div');
    levelValue.style.fontSize = '14px';
    levelValue.style.fontWeight = '600';
    levelValue.style.color = color;
    levelValue.textContent = level;
    levelCard.appendChild(levelLabel);
    levelCard.appendChild(levelValue);
    
    dataRow.appendChild(scoreCard);
    dataRow.appendChild(avgCard);
    dataRow.appendChild(levelCard);
    
    // 分隔线
    const divider = document.createElement('div');
    divider.style.height = '1px';
    divider.style.background = '#e5e7eb';
    divider.style.margin = '12px 0';
    
    dimCard.appendChild(titleDiv);
    dimCard.appendChild(progressDiv);
    dimCard.appendChild(dataRow);
    
    // 添加详细描述文本（原版有）
    // 检查description字段是否存在
    const description = dim.description || '';
    if (description) {
      const descDiv = document.createElement('p');
      descDiv.style.fontSize = '14px';
      descDiv.style.color = '#666';
      descDiv.style.lineHeight = '1.8';
      descDiv.style.margin = '12px 0 0 0';
      descDiv.textContent = description;
      dimCard.appendChild(descDiv);
    } else {
      // 如果description不存在，输出警告以便调试
      console.warn(`维度 ${config.key} 缺少description字段，dim对象:`, dim);
    }
    
    dimensionsGrid.appendChild(dimCard);
  });
}

/**
 * 渲染魔丸灵珠判定提示
 */
function renderMoLingAlert() {
  const moLingAlert = document.getElementById('moLingAlert');
  if (!moLingAlert) {
    console.warn('moLingAlert元素不存在');
    return;
  }
  
  if (!reportData.moLing) {
    console.warn('reportData.moLing不存在');
    moLingAlert.style.display = 'none';
    return;
  }
  
  const moLing = reportData.moLing;
  const isMoWan = (moLing.title && moLing.title.includes('魔丸')) || (moLing.type === '魔丸');
  const moLingTitle = moLing.title || moLing.type || '未知';
  
  moLingAlert.style.padding = '16px';
  moLingAlert.style.background = isMoWan ? '#fff7ed' : '#eff6ff';
  moLingAlert.style.border = `1px solid ${isMoWan ? '#fbbf24' : '#3b82f6'}`;
  moLingAlert.style.borderRadius = '8px';
  moLingAlert.style.marginBottom = '24px';
  
  const icon = document.createElement('span');
  icon.style.fontSize = '24px';
  icon.style.marginRight = '12px';
  icon.textContent = isMoWan ? '🔥' : '💧';
  
  const title = document.createElement('strong');
  title.style.fontSize = '16px';
  title.textContent = `你是${moLingTitle}体质`;
  
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.marginBottom = '8px';
  header.appendChild(icon);
  header.appendChild(title);
  
  const desc = document.createElement('p');
  desc.style.marginBottom = '8px';
  desc.style.color = '#666';
  desc.style.fontSize = '14px';
  desc.style.lineHeight = '1.6';
  desc.textContent = moLing.interpretation || moLing.description || '暂无解读';
  
  const quote = document.createElement('div');
  quote.style.fontSize = '14px';
  quote.style.color = '#999';
  quote.style.fontStyle = 'italic';
  quote.style.borderTop = '1px solid #e5e7eb';
  quote.style.paddingTop = '8px';
  quote.style.marginTop = '8px';
  const quoteText = moLing.quote || (isMoWan ? '我命由我不由天' : '善良是最大的力量');
  quote.textContent = `"${quoteText}" —— 《哪吒之魔童降世》`;
  
  moLingAlert.innerHTML = '';
  moLingAlert.appendChild(header);
  moLingAlert.appendChild(desc);
  moLingAlert.appendChild(quote);
}

/**
 * 渲染D因子科学解读
 */
function renderDFactorScience() {
  const dFactorScienceContent = document.getElementById('dFactorScienceContent');
  if (!dFactorScienceContent) {
    console.warn('dFactorScienceContent元素不存在');
    return;
  }
  
  const dFactor = reportData.dFactor || {};
  // 处理旧格式数据
  let dFactorPercent, dFactorLevel, dFactorAverage;
  if (typeof dFactor === 'number') {
    dFactorAverage = dFactor;
    dFactorPercent = Math.round((dFactor / 5) * 100);
    dFactorLevel = dFactorPercent >= 70 ? '高' : dFactorPercent >= 50 ? '中等' : '低';
  } else {
    dFactorAverage = dFactor.averageScore || 0;
    dFactorPercent = dFactor.percentage || Math.round((dFactorAverage / 5) * 100);
    dFactorLevel = dFactor.level || (dFactorPercent >= 70 ? '高' : dFactorPercent >= 50 ? '中等' : '低');
  }
  const interpretation = reportData.interpretation || '';
  
  dFactorScienceContent.innerHTML = '';
  
  // D因子得分展示（3列）
  const scoreRow = document.createElement('div');
  scoreRow.style.display = 'grid';
  scoreRow.style.gridTemplateColumns = 'repeat(3, 1fr)';
  scoreRow.style.gap = '16px';
  scoreRow.style.marginBottom = '24px';
  
  // D因子得分
  const scoreCard1 = document.createElement('div');
  scoreCard1.style.textAlign = 'center';
  scoreCard1.style.padding = '20px';
  scoreCard1.style.background = '#f9fafb';
  scoreCard1.style.borderRadius = '12px';
  
  const scoreLabel1 = document.createElement('div');
  scoreLabel1.style.fontSize = '14px';
  scoreLabel1.style.color = '#6b7280';
  scoreLabel1.style.marginBottom = '8px';
  scoreLabel1.textContent = 'D因子得分';
  
  const scoreValue1 = document.createElement('div');
  scoreValue1.style.fontSize = '48px';
  scoreValue1.style.fontWeight = 'bold';
  scoreValue1.style.color = '#ff4757';
  scoreValue1.textContent = dFactorPercent + '%';
  
  scoreCard1.appendChild(scoreLabel1);
  scoreCard1.appendChild(scoreValue1);
  
  // 水平等级
  const scoreCard2 = document.createElement('div');
  scoreCard2.style.textAlign = 'center';
  scoreCard2.style.padding = '20px';
  scoreCard2.style.background = '#f9fafb';
  scoreCard2.style.borderRadius = '12px';
  
  const scoreLabel2 = document.createElement('div');
  scoreLabel2.style.fontSize = '14px';
  scoreLabel2.style.color = '#6b7280';
  scoreLabel2.style.marginBottom = '8px';
  scoreLabel2.textContent = '水平等级';
  
  const scoreValue2 = document.createElement('div');
  scoreValue2.style.fontSize = '24px';
  scoreValue2.style.fontWeight = 'bold';
  scoreValue2.style.color = '#374151';
  scoreValue2.style.marginTop = '12px';
  scoreValue2.textContent = dFactorLevel;
  
  scoreCard2.appendChild(scoreLabel2);
  scoreCard2.appendChild(scoreValue2);
  
  // 原始分数
  const scoreCard3 = document.createElement('div');
  scoreCard3.style.textAlign = 'center';
  scoreCard3.style.padding = '20px';
  scoreCard3.style.background = '#f9fafb';
  scoreCard3.style.borderRadius = '12px';
  
  const scoreLabel3 = document.createElement('div');
  scoreLabel3.style.fontSize = '14px';
  scoreLabel3.style.color = '#6b7280';
  scoreLabel3.style.marginBottom = '8px';
  scoreLabel3.textContent = '原始分数';
  
  const scoreValue3 = document.createElement('div');
  scoreValue3.style.fontSize = '24px';
  scoreValue3.style.fontWeight = 'bold';
  scoreValue3.style.color = '#374151';
  scoreValue3.style.marginTop = '12px';
  scoreValue3.textContent = dFactorAverage.toFixed(2) + '/5.0';
  
  scoreCard3.appendChild(scoreLabel3);
  scoreCard3.appendChild(scoreValue3);
  
  scoreRow.appendChild(scoreCard1);
  scoreRow.appendChild(scoreCard2);
  scoreRow.appendChild(scoreCard3);
  
  // D因子理论说明（蓝色信息框样式）
  const theoryAlert = document.createElement('div');
  theoryAlert.style.padding = '20px';
  theoryAlert.style.background = '#1890ff';
  theoryAlert.style.borderRadius = '8px';
  theoryAlert.style.marginBottom = '24px';
  theoryAlert.style.position = 'relative';
  
  // 信息图标
  const iconDiv = document.createElement('div');
  iconDiv.style.position = 'absolute';
  iconDiv.style.top = '20px';
  iconDiv.style.left = '20px';
  iconDiv.style.width = '24px';
  iconDiv.style.height = '24px';
  iconDiv.style.background = 'rgba(255, 255, 255, 0.3)';
  iconDiv.style.borderRadius = '50%';
  iconDiv.style.display = 'flex';
  iconDiv.style.alignItems = 'center';
  iconDiv.style.justifyContent = 'center';
  iconDiv.style.fontSize = '14px';
  iconDiv.style.fontWeight = 'bold';
  iconDiv.style.color = '#fff';
  iconDiv.textContent = 'i';
  
  const contentDiv = document.createElement('div');
  contentDiv.style.paddingLeft = '40px';
  
  const theoryTitle = document.createElement('div');
  theoryTitle.style.fontSize = '16px';
  theoryTitle.style.fontWeight = '600';
  theoryTitle.style.color = '#fff';
  theoryTitle.style.marginBottom = '12px';
  theoryTitle.textContent = '什么是D因子?';
  
  const theoryText = document.createElement('div');
  theoryText.style.fontSize = '14px';
  theoryText.style.color = '#fff';
  theoryText.style.lineHeight = '1.8';
  theoryText.innerHTML = `
    <p style="margin-bottom: 8px;">D因子 (Dark Factor of Personality) 是德国乌尔姆大学心理学家Moshagen等人于2018年在《Psychological Review》上提出的理论。</p>
    <p style="margin-bottom: 8px;">研究发现,所有黑暗人格特质(自恋、马基雅维利主义、精神病质、利己主义等)背后都有一个共同核心———————即最大化自身效用,同时忽视、接受或恶意促使他人遭受不利后果的倾向。</p>
    <p style="margin-bottom: 0;">D因子得分反映了您在这个核心维度上的水平。就像智力有g因子一样,黑暗人格也有D因子。</p>
  `;
  
  contentDiv.appendChild(theoryTitle);
  contentDiv.appendChild(theoryText);
  theoryAlert.appendChild(iconDiv);
  theoryAlert.appendChild(contentDiv);
  
  // 分隔线
  const divider = document.createElement('div');
  divider.style.height = '1px';
  divider.style.background = '#e5e7eb';
  divider.style.margin = '24px 0';
  
  // 您的D因子解读
  const interpretationDiv = document.createElement('div');
  interpretationDiv.style.marginBottom = '20px';
  
  const interpTitle = document.createElement('div');
  interpTitle.style.fontSize = '16px';
  interpTitle.style.fontWeight = '600';
  interpTitle.style.color = '#374151';
  interpTitle.style.marginBottom = '12px';
  interpTitle.textContent = '📊 您的D因子解读';
  
  const interpText = document.createElement('p');
  interpText.style.fontSize = '15px';
  interpText.style.lineHeight = '1.8';
  interpText.style.color = '#666';
  interpText.style.margin = '0';
  interpText.textContent = interpretation;
  
  interpretationDiv.appendChild(interpTitle);
  interpretationDiv.appendChild(interpText);
  
  // D因子的实际意义
  const meaningDiv = document.createElement('div');
  
  const meaningTitle = document.createElement('div');
  meaningTitle.style.fontSize = '16px';
  meaningTitle.style.fontWeight = '600';
  meaningTitle.style.color = '#374151';
  meaningTitle.style.marginBottom = '12px';
  meaningTitle.textContent = '💡 D因子在生活中的意义';
  
  const meaningList = document.createElement('div');
  const meaningItems = [
    '职场竞争：D因子较高的人在需要竞争和战略思维的环境中可能更有优势',
    '人际关系：D因子水平影响您与他人的互动模式和信任建立',
    '决策风格：反映您在利益冲突时的决策倾向',
    '自我认知：了解D因子帮助您更客观地认识自己的行为动机'
  ];
  
  meaningItems.forEach(item => {
    const itemDiv = document.createElement('div');
    itemDiv.style.fontSize = '14px';
    itemDiv.style.color = '#666';
    itemDiv.style.lineHeight = '1.7';
    itemDiv.style.padding = '6px 0';
    itemDiv.textContent = '• ' + item;
    meaningList.appendChild(itemDiv);
  });
  
  meaningDiv.appendChild(meaningTitle);
  meaningDiv.appendChild(meaningList);
  
  dFactorScienceContent.appendChild(scoreRow);
  dFactorScienceContent.appendChild(theoryAlert);
  dFactorScienceContent.appendChild(divider);
  dFactorScienceContent.appendChild(interpretationDiv);
  dFactorScienceContent.appendChild(meaningDiv);
}

/**
 * 渲染魔丸灵珠体质分析
 */
function renderPersonalityType() {
  const personalityType = document.getElementById('personalityType');
  if (!personalityType || !reportData.moLing) return;
  
  const moLing = reportData.moLing;
  
  let description = '';
  if (moLing.type === '魔丸') {
    description = '您具有较高的D因子，表现出较强的自我中心倾向。这可能意味着您更加关注自身利益，在追求目标时可能较少考虑他人感受。适度水平的D因子可能是优势，可以帮助您在竞争环境中更好地保护自己，但需要注意平衡个人利益与他人关系。';
  } else {
    description = '您具有较低的D因子，表现出较强的同理心和利他倾向。这可能意味着您更关注他人感受，在追求目标时会更考虑他人利益。较低的D因子表明您更倾向于合作而非竞争，注重和谐的人际关系。';
  }
  
  const typeCard = document.createElement('div');
  typeCard.style.padding = '24px';
  typeCard.style.background = `linear-gradient(135deg, ${moLing.color}15, #ffffff)`;
  typeCard.style.borderRadius = '12px';
  typeCard.style.border = `2px solid ${moLing.color}`;
  typeCard.style.textAlign = 'center';
  
  const typeIcon = document.createElement('div');
  typeIcon.style.fontSize = '48px';
  typeIcon.style.marginBottom = '16px';
  typeIcon.textContent = moLing.type === '魔丸' ? '🔴' : '🔵';
  
  const typeName = document.createElement('h3');
  typeName.style.fontSize = '24px';
  typeName.style.fontWeight = '700';
  typeName.style.color = moLing.color;
  typeName.style.margin = '0 0 8px 0';
  typeName.textContent = `${moLing.type}体质（${moLing.level}）`;
  
  const typeDesc = document.createElement('p');
  typeDesc.style.fontSize = '16px';
  typeDesc.style.color = '#374151';
  typeDesc.style.lineHeight = '1.8';
  typeDesc.style.margin = '0';
  typeDesc.style.textAlign = 'left';
  typeDesc.textContent = description;
  
  typeCard.appendChild(typeIcon);
  typeCard.appendChild(typeName);
  typeCard.appendChild(typeDesc);
  
  personalityType.innerHTML = '';
  personalityType.appendChild(typeCard);
}


/**
 * 渲染各维度详细分析
 */
function renderDimensionDetails() {
  const dimensionDetailsList = document.getElementById('dimensionDetailsList');
  if (!dimensionDetailsList || !reportData.dimensions) return;
  
  dimensionDetailsList.innerHTML = '';
  
  DIMENSION_ORDER.forEach(dimKey => {
    const dim = reportData.dimensions[dimKey];
    if (!dim) return;
    
    const averageScore = dim.averageScore || 0;
    const percent = Math.round((averageScore / 5) * 100);
    
    // 确定颜色和等级
    let level = '低';
    let color = '#52c41a';
    if (averageScore >= 4.0) {
      level = '很高';
      color = '#ff4d4f';
    } else if (averageScore >= 3.5) {
      level = '高';
      color = '#ff7875';
    } else if (averageScore >= 3.0) {
      level = '中等';
      color = '#faad14';
    } else if (averageScore >= 2.5) {
      level = '偏低';
      color = '#ffc53d';
    } else if (averageScore >= 2.0) {
      level = '低';
      color = '#52c41a';
    } else {
      level = '很低';
      color = '#10b981';
    }
    
    const detailCard = document.createElement('div');
    detailCard.style.padding = '20px';
    detailCard.style.background = '#fff';
    detailCard.style.borderRadius = '12px';
    detailCard.style.border = `1px solid ${color}30`;
    detailCard.style.marginBottom = '16px';
    
    const headerDiv = document.createElement('div');
    headerDiv.style.display = 'flex';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.alignItems = 'center';
    headerDiv.style.marginBottom = '12px';
    
    const nameDiv = document.createElement('h4');
    nameDiv.style.margin = '0';
    nameDiv.style.fontSize = '18px';
    nameDiv.style.fontWeight = '600';
    nameDiv.style.color = '#1f2937';
    nameDiv.textContent = dim.name;
    
    const scoreDiv = document.createElement('div');
    scoreDiv.style.display = 'flex';
    scoreDiv.style.alignItems = 'center';
    scoreDiv.style.gap = '12px';
    
    const levelTag = document.createElement('span');
    levelTag.style.padding = '4px 12px';
    levelTag.style.borderRadius = '8px';
    levelTag.style.fontSize = '13px';
    levelTag.style.fontWeight = '600';
    levelTag.style.background = color;
    levelTag.style.color = 'white';
    levelTag.textContent = level;
    
    const scoreText = document.createElement('span');
    scoreText.style.fontSize = '15px';
    scoreText.style.color = color;
    scoreText.style.fontWeight = '600';
    scoreText.textContent = `${averageScore.toFixed(2)} / 5.00 (${percent}%)`;
    
    scoreDiv.appendChild(levelTag);
    scoreDiv.appendChild(scoreText);
    headerDiv.appendChild(nameDiv);
    headerDiv.appendChild(scoreDiv);
    
    const descDiv = document.createElement('p');
    descDiv.style.fontSize = '14px';
    descDiv.style.color = '#6b7280';
    descDiv.style.lineHeight = '1.7';
    descDiv.style.margin = '0';
    descDiv.textContent = `该维度得分${level}，反映了您在此方面的表现。每个人都在一定程度上具有这些特质，了解自己的得分有助于更好地认识自我。`;
    
    detailCard.appendChild(headerDiv);
    detailCard.appendChild(descDiv);
    dimensionDetailsList.appendChild(detailCard);
  });
}

/**
 * 渲染发展建议
 */
function renderDevelopmentAdvice() {
  const adviceContent = document.getElementById('adviceContent');
  if (!adviceContent) {
    console.warn('adviceContent元素不存在');
    return;
  }
  
  // 使用reportData.recommendations（来自scoring.js）
  const recommendations = reportData.recommendations || [];
  
  if (!recommendations || recommendations.length === 0) {
    console.warn('recommendations数据为空');
    adviceContent.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无建议</div>';
    return;
  }
  
  adviceContent.innerHTML = '';
  
  recommendations.forEach((item, index) => {
    const adviceItem = document.createElement('div');
    adviceItem.style.display = 'flex';
    adviceItem.style.alignItems = 'flex-start';
    adviceItem.style.width = '100%';
    adviceItem.style.padding = '16px 0';
    adviceItem.style.borderBottom = index < recommendations.length - 1 ? '1px solid #f0f0f0' : 'none';
    adviceItem.style.gap = '16px';
    
    const numberDiv = document.createElement('div');
    numberDiv.style.width = '32px';
    numberDiv.style.height = '32px';
    numberDiv.style.background = '#ff4757';
    numberDiv.style.color = 'white';
    numberDiv.style.borderRadius = '50%';
    numberDiv.style.display = 'flex';
    numberDiv.style.alignItems = 'center';
    numberDiv.style.justifyContent = 'center';
    numberDiv.style.fontSize = '14px';
    numberDiv.style.fontWeight = 'bold';
    numberDiv.style.flexShrink = 0;
    numberDiv.style.marginTop = '2px';
    numberDiv.textContent = index + 1;
    
    const textDiv = document.createElement('div');
    textDiv.style.fontSize = '16px';
    textDiv.style.lineHeight = '1.7';
    textDiv.style.color = '#1f2937';
    textDiv.style.fontWeight = '500';
    textDiv.style.flex = '1';
    textDiv.textContent = item;
    
    adviceItem.appendChild(numberDiv);
    adviceItem.appendChild(textDiv);
    adviceContent.appendChild(adviceItem);
  });
}

/**
 * 导出报告
 */
function exportReport() {
  if (!reportData) return;
  
  const completedAt = reportData.completedAt || new Date().toISOString();
  const date = new Date(completedAt);
  const dateStr = date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  let text = '黑暗三角人格测试 测评报告\n';
  text += '='.repeat(50) + '\n\n';
  
  text += `测评完成时间：${dateStr}\n\n`;
  text += `D因子得分：${(reportData.dFactor || 0).toFixed(2)}\n`;
  text += `魔丸灵珠体质：${reportData.moLing?.type || '未知'}（${reportData.moLing?.level || '未知'}）\n\n`;
  
  text += '十维度得分详情：\n';
  text += '-'.repeat(50) + '\n';
  
  if (reportData.dimensions) {
    DIMENSION_ORDER.forEach(dimKey => {
      const dim = reportData.dimensions[dimKey];
      if (dim) {
        text += `${dim.name}：${dim.averageScore.toFixed(2)} / 5.00\n`;
      }
    });
  }
  
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DarkTriad报告_${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 渲染雷达图
 */
function renderRadarChart() {
  const radarChartContainer = document.getElementById('radarChartContainer');
  const canvas = document.getElementById('radarChart');
  if (!radarChartContainer || !canvas) {
    console.warn('radarChartContainer或canvas元素不存在');
    return;
  }
  
  // 10个维度的配置（注意：key需要匹配scoring.js中的DIMENSION_ORDER）
  const dimensionConfigs = [
    { key: 'Egoism', icon: '💰', color: '#ff4757', name: '利己主义' },
    { key: 'Machiavellianism', icon: '🎯', color: '#ff6348', name: '马基雅维利主义' },
    { key: 'MoralDisengagement', icon: '🛡️', color: '#ff7f50', name: '道德推脱' },
    { key: 'Narcissism', icon: '⭐', color: '#ffa502', name: '自恋' },
    { key: 'PsychologicalEntitlement', icon: '👑', color: '#ff6b9d', name: '心理权力感' },
    { key: 'Psychopathy', icon: '⚡', color: '#c44569', name: '精神病质' },
    { key: 'Sadism', icon: '😈', color: '#4b7bec', name: '施虐倾向' },
    { key: 'SelfInterest', icon: '🔰', color: '#3867d6', name: '自我为中心' },
    { key: 'Spitefulness', icon: '💢', color: '#1e90ff', name: '恶毒倾向' },
    { key: 'Greed', icon: '💎', color: '#00a8ff', name: '贪婪' }
  ];
  
  // D因子总分显示框（先创建，避免被清空）
  const dFactor = reportData.dFactor || {};
  const dFactorPercent = dFactor.percentage || Math.round(((dFactor.averageScore || 0) / 5) * 100);
  
  // 创建D因子显示框的函数（可复用）
  const createDFactorDisplay = () => {
    const dFactorDisplay = document.createElement('div');
    dFactorDisplay.style.textAlign = 'center';
    dFactorDisplay.style.padding = '20px';
    dFactorDisplay.style.background = 'linear-gradient(135deg, rgba(255, 71, 87, 0.1) 0%, rgba(30, 144, 255, 0.1) 100%)';
    dFactorDisplay.style.borderRadius = '12px';
    dFactorDisplay.style.position = 'relative';
    
    // 顶部渐变条
    const gradientBar = document.createElement('div');
    gradientBar.style.position = 'absolute';
    gradientBar.style.top = '0';
    gradientBar.style.left = '0';
    gradientBar.style.right = '0';
    gradientBar.style.height = '4px';
    gradientBar.style.background = 'linear-gradient(90deg, #ff4757 0%, #1e90ff 100%)';
    gradientBar.style.borderRadius = '12px 12px 0 0';
    dFactorDisplay.appendChild(gradientBar);
    
    const dFactorLabel = document.createElement('div');
    dFactorLabel.style.fontSize = '16px';
    dFactorLabel.style.color = '#666';
    dFactorLabel.style.marginTop = '16px';
    dFactorLabel.textContent = 'D因子总分';
    
    const dFactorValue = document.createElement('div');
    dFactorValue.style.fontSize = '48px';
    dFactorValue.style.fontWeight = 'bold';
    dFactorValue.style.color = '#ff4757';
    dFactorValue.style.marginTop = '8px';
    dFactorValue.textContent = dFactorPercent.toFixed(1) + '%';
    
    dFactorDisplay.appendChild(dFactorLabel);
    dFactorDisplay.appendChild(dFactorValue);
    
    // 图例
    const legendDiv = document.createElement('div');
    legendDiv.style.display = 'flex';
    legendDiv.style.justifyContent = 'center';
    legendDiv.style.gap = '24px';
    legendDiv.style.marginTop = '16px';
    
    const legend1 = document.createElement('div');
    legend1.style.display = 'flex';
    legend1.style.alignItems = 'center';
    legend1.style.gap = '8px';
    const dot1 = document.createElement('div');
    dot1.style.width = '12px';
    dot1.style.height = '12px';
    dot1.style.borderRadius = '50%';
    dot1.style.background = '#ff4757';
    const label1 = document.createElement('span');
    label1.style.fontSize = '13px';
    label1.style.color = '#666';
    label1.textContent = '你的分数';
    legend1.appendChild(dot1);
    legend1.appendChild(label1);
    
    const legend2 = document.createElement('div');
    legend2.style.display = 'flex';
    legend2.style.alignItems = 'center';
    legend2.style.gap = '8px';
    const dot2 = document.createElement('div');
    dot2.style.width = '12px';
    dot2.style.height = '12px';
    dot2.style.borderRadius = '50%';
    dot2.style.background = '#1e90ff';
    const label2 = document.createElement('span');
    label2.style.fontSize = '13px';
    label2.style.color = '#666';
    label2.textContent = '人群平均';
    legend2.appendChild(dot2);
    legend2.appendChild(label2);
    
    legendDiv.appendChild(legend1);
    legendDiv.appendChild(legend2);
    dFactorDisplay.appendChild(legendDiv);
    
    return dFactorDisplay;
  };
  
  const dFactorDisplay = createDFactorDisplay();
  
  // 设置canvas尺寸（增大尺寸）
  // 注意：isMobile变量已经在上面定义了，这里需要重新定义
  const isMobileNow = window.innerWidth <= 768;
  const canvasWidth = isMobileNow ? Math.min(window.innerWidth - 20, 500) : 700;
  const canvasHeight = isMobileNow ? 450 : 550;
  
  // 设置canvas的实际像素尺寸（考虑设备像素比）
  const dpr = window.devicePixelRatio || 1;
  // 增加canvas尺寸以留出标签空间
  const canvasWidthWithPadding = canvasWidth;
  const canvasHeightWithPadding = canvasHeight;
  canvas.width = canvasWidthWithPadding * dpr;
  canvas.height = canvasHeightWithPadding * dpr;
  canvas.style.width = canvasWidthWithPadding + 'px';
  canvas.style.height = canvasHeightWithPadding + 'px';
  
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  
  const centerX = canvasWidthWithPadding / 2;
  const centerY = canvasHeightWithPadding / 2;
  // 减小半径，留更多空间给标签（避免超出边界）
  const radius = Math.min(centerX, centerY) - (isMobileNow ? 60 : 100);
  
  // 绘制雷达图（包含人群平均线）
  // 传递canvas尺寸以便标签定位
  drawRadarChart(ctx, centerX, centerY, radius, dimensionConfigs, isMobileNow, canvasWidthWithPadding, canvasHeightWithPadding);
  
  // 创建布局容器（电脑端：D因子在右边，移动端：D因子在上方）
  // 注意：先清空容器，但dFactorDisplay已经创建好了
  radarChartContainer.innerHTML = '';
  
  if (isMobileNow) {
    // 移动端：D因子在上方
    radarChartContainer.style.display = 'flex';
    radarChartContainer.style.flexDirection = 'column';
    radarChartContainer.appendChild(dFactorDisplay);
    radarChartContainer.appendChild(canvas);
  } else {
    // 电脑端：D因子在左边
    radarChartContainer.style.display = 'flex';
    radarChartContainer.style.flexDirection = 'row';
    radarChartContainer.style.alignItems = 'center';
    radarChartContainer.style.gap = '24px';
    
    // D因子在左边
    radarChartContainer.appendChild(dFactorDisplay);
    
    const canvasWrapper = document.createElement('div');
    canvasWrapper.style.flex = '1';
    canvasWrapper.appendChild(canvas);
    
    radarChartContainer.appendChild(canvasWrapper);
  }
  
  // 响应式调整（需要重新创建dFactorDisplay，因为innerHTML会清空）
  const handleResize = () => {
    const isMobileNow = window.innerWidth <= 768;
    const dFactorDisplayNew = createDFactorDisplay();
    
    radarChartContainer.innerHTML = '';
    
    if (isMobileNow) {
      radarChartContainer.style.display = 'flex';
      radarChartContainer.style.flexDirection = 'column';
      radarChartContainer.appendChild(dFactorDisplayNew);
      radarChartContainer.appendChild(canvas);
    } else {
      radarChartContainer.style.display = 'flex';
      radarChartContainer.style.flexDirection = 'row';
      radarChartContainer.style.alignItems = 'center';
      radarChartContainer.style.gap = '24px';
      
      // D因子在左边
      radarChartContainer.appendChild(dFactorDisplayNew);
      
      const canvasWrapper = document.createElement('div');
      canvasWrapper.style.flex = '1';
      canvasWrapper.appendChild(canvas);
      
      radarChartContainer.appendChild(canvasWrapper);
    }
  };
  
  window.addEventListener('resize', handleResize);
}

/**
 * 绘制雷达图
 */
function drawRadarChart(ctx, centerX, centerY, radius, dimensionConfigs, isMobile, canvasWidth, canvasHeight) {
  // 如果没有传递canvas尺寸，使用默认值
  const canvasWidthFinal = canvasWidth || centerX * 2;
  const canvasHeightFinal = canvasHeight || centerY * 2;
  const numDimensions = dimensionConfigs.length;
  const angleStep = (Math.PI * 2) / numDimensions;
  
  // 绘制网格（加深颜色）
  for (let level = 1; level <= 5; level++) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < numDimensions; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const x = centerX + Math.cos(angle) * (radius * level / 5);
      const y = centerY + Math.sin(angle) * (radius * level / 5);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.stroke();
  }
  
  // 绘制轴线（加深颜色）
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < numDimensions; i++) {
    const angle = i * angleStep - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
    ctx.stroke();
  }
  
  // 绘制刻度标签（1.0-5.0）
  ctx.font = isMobile ? '11px sans-serif' : '12px sans-serif';
  ctx.fillStyle = '#999';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let level = 1; level <= 5; level++) {
    const labelRadius = (radius * level / 5) - 15;
    const x = centerX;
    const y = centerY - labelRadius;
    ctx.fillText(level.toFixed(1), x, y);
  }
  
  // 绘制人群平均线（蓝色）
  const populationAverage = 2.5; // 人群平均值
  ctx.fillStyle = 'rgba(30, 144, 255, 0.2)';
  ctx.strokeStyle = '#1e90ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  for (let i = 0; i < numDimensions; i++) {
    const normalizedScore = (populationAverage / 5) * radius;
    const angle = i * angleStep - Math.PI / 2;
    const x = centerX + Math.cos(angle) * normalizedScore;
    const y = centerY + Math.sin(angle) * normalizedScore;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // 绘制人群平均数据点（蓝色）
  for (let i = 0; i < numDimensions; i++) {
    const normalizedScore = (populationAverage / 5) * radius;
    const angle = i * angleStep - Math.PI / 2;
    const x = centerX + Math.cos(angle) * normalizedScore;
    const y = centerY + Math.sin(angle) * normalizedScore;
    
    // 外圈白色
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // 内圈蓝色
    ctx.fillStyle = '#1e90ff';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // 绘制用户数据区域（红色）
  ctx.fillStyle = 'rgba(255, 71, 87, 0.35)';
  ctx.strokeStyle = '#ff4757';
  ctx.lineWidth = 3;
  ctx.beginPath();
  
  for (let i = 0; i < numDimensions; i++) {
    const config = dimensionConfigs[i];
    // 兼容原版的数据访问方式
    const dimension = reportData[config.key] || reportData.dimensions?.[config.key];
    const score = dimension ? dimension.averageScore : 0;
    const normalizedScore = (score / 5) * radius;
    
    const angle = i * angleStep - Math.PI / 2;
    const x = centerX + Math.cos(angle) * normalizedScore;
    const y = centerY + Math.sin(angle) * normalizedScore;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // 绘制用户数据点（红色，增大点）
  for (let i = 0; i < numDimensions; i++) {
    const config = dimensionConfigs[i];
    // 兼容原版的数据访问方式
    const dimension = reportData[config.key] || reportData.dimensions?.[config.key];
    const score = dimension ? dimension.averageScore : 0;
    const normalizedScore = (score / 5) * radius;
    
    const angle = i * angleStep - Math.PI / 2;
    const x = centerX + Math.cos(angle) * normalizedScore;
    const y = centerY + Math.sin(angle) * normalizedScore;
    
    // 外圈白色
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // 内圈红色
    ctx.fillStyle = '#ff4757';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // 绘制标签（调整位置避免超出边界）
  ctx.font = isMobile ? 'bold 13px "Microsoft YaHei", "PingFang SC", sans-serif' : 'bold 15px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.fillStyle = '#1f2937';
  
  for (let i = 0; i < numDimensions; i++) {
    const config = dimensionConfigs[i];
    const angle = i * angleStep - Math.PI / 2;
    // 减小标签距离，避免超出边界
    const labelRadius = radius + (isMobile ? 30 : 40);
    const x = centerX + Math.cos(angle) * labelRadius;
    const y = centerY + Math.sin(angle) * labelRadius;
    
    // 测量文本宽度
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textMetrics = ctx.measureText(config.name);
    const textWidth = textMetrics.width;
    const textHeight = parseInt(ctx.font) || 15;
    
    // 检查是否超出边界，如果超出则调整位置
    let finalX = x;
    let finalY = y;
    let align = 'center';
    let baseline = 'middle';
    let offsetX = 0;
    let offsetY = 0;
    
    // 右侧标签（0度到180度）
    if (angle > -Math.PI / 2 && angle < Math.PI / 2) {
      if (x + textWidth / 2 > canvasWidthFinal - 15) {
        // 超出右边界，改为右对齐
        align = 'right';
        offsetX = -8;
        finalX = Math.min(x, canvasWidthFinal - 15);
      } else {
        align = 'left';
        offsetX = 8;
      }
    } else {
      // 左侧标签（180度到360度）
      if (x - textWidth / 2 < 15) {
        // 超出左边界，改为左对齐
        align = 'left';
        offsetX = 8;
        finalX = Math.max(x, 15);
      } else {
        align = 'right';
        offsetX = -8;
      }
    }
    
    // 上方和下方标签
    if (Math.abs(angle) < Math.PI / 6 || Math.abs(angle) > 5 * Math.PI / 6) {
      if (angle > 0) {
        // 下方
        baseline = 'top';
        offsetY = 10;
        if (finalY + textHeight / 2 > canvasHeightFinal - 15) {
          finalY = canvasHeightFinal - 15 - textHeight / 2;
        }
      } else {
        // 上方
        baseline = 'bottom';
        offsetY = -10;
        if (finalY - textHeight / 2 < 15) {
          finalY = 15 + textHeight / 2;
        }
      }
    }
    
    ctx.save();
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(config.name, finalX + offsetX, finalY + offsetY);
    ctx.restore();
  }
}

/**
 * 渲染主导特质分析（Top 3）
 */
function renderDominantTraits() {
  const dominantTraitsContent = document.getElementById('dominantTraitsContent');
  if (!dominantTraitsContent) {
    console.warn('dominantTraitsContent元素不存在');
    return;
  }
  
  // 10个维度的配置（注意：key需要匹配scoring.js中的DIMENSION_ORDER）
  const dimensionConfigs = [
    { key: 'Egoism', icon: '💰', color: '#ff4757', name: '利己主义' },
    { key: 'Machiavellianism', icon: '🎯', color: '#ff6348', name: '马基雅维利主义' },
    { key: 'MoralDisengagement', icon: '🛡️', color: '#ff7f50', name: '道德推脱' },
    { key: 'Narcissism', icon: '⭐', color: '#ffa502', name: '自恋' },
    { key: 'PsychologicalEntitlement', icon: '👑', color: '#ff6b9d', name: '心理权力感' },
    { key: 'Psychopathy', icon: '⚡', color: '#c44569', name: '精神病质' },
    { key: 'Sadism', icon: '😈', color: '#4b7bec', name: '施虐倾向' },
    { key: 'SelfInterest', icon: '🔰', color: '#3867d6', name: '自我为中心' },
    { key: 'Spitefulness', icon: '💢', color: '#1e90ff', name: '恶毒倾向' },
    { key: 'Greed', icon: '💎', color: '#00a8ff', name: '贪婪' }
  ];
  
  // 获取主导特质（Top 3）
  const dominantTraits = reportData.dominantTraits || [];
  const dominantTraitAnalysis = reportData.dominantTraitAnalysis || '';
  
  if (dominantTraits.length === 0) {
    // 如果没有主导特质数据，从dimensions中计算
    const dimensions = reportData.dimensions || {};
    const sortedDims = Object.entries(dimensions)
      .map(([key, dim]) => ({ key, ...dim }))
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 3);
    
    dominantTraitsContent.innerHTML = '';
    
    // 主导特质组合分析（蓝色信息框）
    if (sortedDims.length > 0) {
      const analysisAlert = document.createElement('div');
      analysisAlert.style.padding = '16px';
      analysisAlert.style.background = '#e6f7ff';
      analysisAlert.style.border = '1px solid #91d5ff';
      analysisAlert.style.borderRadius = '8px';
      analysisAlert.style.marginBottom = '20px';
      
      // 信息图标
      const iconSpan = document.createElement('span');
      iconSpan.style.marginRight = '8px';
      iconSpan.textContent = 'ℹ️';
      
      const titleDiv = document.createElement('div');
      titleDiv.style.fontSize = '14px';
      titleDiv.style.fontWeight = '600';
      titleDiv.style.color = '#0050b3';
      titleDiv.style.marginBottom = '8px';
      titleDiv.appendChild(iconSpan);
      titleDiv.appendChild(document.createTextNode('主导特质组合'));
      
      const contentDiv = document.createElement('div');
      contentDiv.style.fontSize = '14px';
      contentDiv.style.color = '#0050b3';
      contentDiv.style.lineHeight = '1.8';
      contentDiv.textContent = '您的前三大主导特质是:';
      
      const listDiv = document.createElement('div');
      listDiv.style.marginTop = '8px';
      listDiv.style.fontSize = '14px';
      listDiv.style.color = '#0050b3';
      listDiv.style.lineHeight = '2';
      
      sortedDims.forEach((dim, index) => {
        const percent = Math.round((dim.averageScore / 5) * 100);
        const item = document.createElement('div');
        item.textContent = `${index + 1}. ${dim.name} (${percent}%) - 得分${dim.rawScore || 0}/35 (均分${dim.averageScore.toFixed(2)})`;
        listDiv.appendChild(item);
      });
      
      // 特质组合分析
      const analysisDiv = document.createElement('div');
      analysisDiv.style.marginTop = '12px';
      analysisDiv.style.paddingTop = '12px';
      analysisDiv.style.borderTop = '1px solid rgba(0, 80, 179, 0.2)';
      
      const analysisTitle = document.createElement('div');
      analysisTitle.style.fontSize = '14px';
      analysisTitle.style.fontWeight = '600';
      analysisTitle.style.color = '#0050b3';
      analysisTitle.style.marginBottom = '8px';
      analysisTitle.textContent = '【特质组合分析】';
      
      const analysisText = document.createElement('div');
      analysisText.style.fontSize = '14px';
      analysisText.style.color = '#0050b3';
      analysisText.style.lineHeight = '1.8';
      analysisText.style.whiteSpace = 'pre-line';
      
      if (sortedDims.length > 0) {
        const primaryTrait = sortedDims[0];
        analysisText.textContent = `您的首要特质${primaryTrait.name}得分较高 (${primaryTrait.averageScore.toFixed(2)}分), 在很多情况下会影响您的决策和行为模式。\n\n这三个特质的组合塑造了您独特的人格风格。理解它们如何相互作用, 能够帮助您更好地认识自己的行为模式, 在不同场景中扬长避短。`;
      }
      
      analysisDiv.appendChild(analysisTitle);
      analysisDiv.appendChild(analysisText);
      
      analysisAlert.appendChild(titleDiv);
      analysisAlert.appendChild(contentDiv);
      analysisAlert.appendChild(listDiv);
      analysisAlert.appendChild(analysisDiv);
      
      dominantTraitsContent.appendChild(analysisAlert);
    }
    
    // Top 3 详细展示
    const traitsGrid = document.createElement('div');
    traitsGrid.style.display = 'grid';
    traitsGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(250px, 1fr))';
    traitsGrid.style.gap = '16px';
    
    sortedDims.forEach((dim, index) => {
      const config = dimensionConfigs.find(c => c.key === dim.key);
      if (!config) return;
      
      const traitCard = document.createElement('div');
      traitCard.style.padding = '20px';
      traitCard.style.borderRadius = '12px';
      traitCard.style.border = `2px solid ${config.color}`;
      traitCard.style.background = '#fff';
      traitCard.style.height = '100%';
      
      const iconDiv = document.createElement('div');
      iconDiv.style.width = '48px';
      iconDiv.style.height = '48px';
      iconDiv.style.background = config.color;
      iconDiv.style.borderRadius = '50%';
      iconDiv.style.display = 'flex';
      iconDiv.style.alignItems = 'center';
      iconDiv.style.justifyContent = 'center';
      iconDiv.style.margin = '0 auto 12px';
      iconDiv.style.fontSize = '24px';
      iconDiv.textContent = config.icon;
      
      const title = document.createElement('div');
      title.style.textAlign = 'center';
      title.style.marginBottom = '8px';
      title.innerHTML = `<strong style="font-size: 16px; color: #374151;">No.${index + 1} ${dim.name}</strong>`;
      
      const percent = document.createElement('div');
      percent.style.textAlign = 'center';
      percent.style.marginTop = '8px';
      percent.innerHTML = `<span style="font-size: 28px; font-weight: bold; color: ${config.color};">${Math.round((dim.averageScore / 5) * 100)}%</span>`;
      
      const scoreInfo = document.createElement('div');
      scoreInfo.style.textAlign = 'center';
      scoreInfo.style.marginTop = '4px';
      scoreInfo.style.fontSize = '13px';
      scoreInfo.style.color = '#999';
      scoreInfo.textContent = `得分：${dim.rawScore}/35 · 均分：${dim.averageScore.toFixed(2)}`;
      
      const divider = document.createElement('div');
      divider.style.height = '1px';
      divider.style.background = '#e5e7eb';
      divider.style.margin = '12px 0';
      
      const desc = document.createElement('p');
      desc.style.fontSize = '13px';
      desc.style.color = '#666';
      desc.style.lineHeight = '1.6';
      desc.style.margin = '0';
      desc.textContent = dim.description || '';
      
      traitCard.appendChild(iconDiv);
      traitCard.appendChild(title);
      traitCard.appendChild(percent);
      traitCard.appendChild(scoreInfo);
      traitCard.appendChild(divider);
      traitCard.appendChild(desc);
      traitsGrid.appendChild(traitCard);
    });
    
    dominantTraitsContent.appendChild(traitsGrid);
    return;
  }
  
  // 如果有主导特质数据，使用数据
  dominantTraitsContent.innerHTML = '';
  
  // 主导特质组合分析Alert（与原版一致 - 简单段落形式）
  if (dominantTraitAnalysis) {
    const analysisAlert = document.createElement('div');
    analysisAlert.style.padding = '16px';
    analysisAlert.style.background = '#e6f7ff';
    analysisAlert.style.border = '1px solid #91d5ff';
    analysisAlert.style.borderRadius = '8px';
    analysisAlert.style.marginBottom = '20px';
    
    const alertTitle = document.createElement('div');
    alertTitle.style.fontSize = '14px';
    alertTitle.style.fontWeight = '600';
    alertTitle.style.color = '#0050b3';
    alertTitle.style.marginBottom = '8px';
    alertTitle.textContent = '主导特质组合';
    
    const alertDesc = document.createElement('div');
    alertDesc.style.fontSize = '14px';
    alertDesc.style.color = '#0050b3';
    alertDesc.style.lineHeight = '1.8';
    alertDesc.textContent = dominantTraitAnalysis;
    
    analysisAlert.appendChild(alertTitle);
    analysisAlert.appendChild(alertDesc);
    dominantTraitsContent.appendChild(analysisAlert);
  }
  
  // Top 3 文字列表展示（与原版一致）
  const traitsList = document.createElement('div');
  traitsList.style.display = 'flex';
  traitsList.style.flexDirection = 'column';
  traitsList.style.gap = '12px';
  
  dominantTraits.forEach((traitKey, index) => {
    const trait = reportData[traitKey] || reportData.dimensions?.[traitKey];
    const config = dimensionConfigs.find(c => c.key === traitKey);
    if (!trait) {
      console.warn(`主导特质 ${traitKey} 的数据不存在`);
      return;
    }
    if (!config) {
      console.warn(`找不到主导特质配置: ${traitKey}`);
      return;
    }
    
    const traitItem = document.createElement('div');
    traitItem.style.padding = '12px 16px';
    traitItem.style.background = '#fff';
    traitItem.style.borderRadius = '8px';
    traitItem.style.border = '1px solid #e5e7eb';
    
    const traitText = document.createElement('div');
    traitText.style.fontSize = '14px';
    traitText.style.color = '#374151';
    traitText.style.lineHeight = '1.6';
    
    const traitPercent = trait.percentage || Math.round((trait.averageScore / 5) * 100);
    const avgScoreDisplay = trait.averageScore % 1 === 0 ? trait.averageScore : trait.averageScore.toFixed(2);
    
    traitText.innerHTML = `<strong>${index + 1}. ${trait.name}</strong> (${traitPercent}%) - 得分${trait.rawScore}/35 (均分${avgScoreDisplay})`;
    
    traitItem.appendChild(traitText);
    traitsList.appendChild(traitItem);
  });
  
  dominantTraitsContent.appendChild(traitsList);
  
  // 特质组合分析
  if (dominantTraits.length > 0) {
    const analysisDiv = document.createElement('div');
    analysisDiv.style.marginTop = '20px';
    analysisDiv.style.padding = '16px';
    analysisDiv.style.background = '#f9fafb';
    analysisDiv.style.borderRadius = '8px';
    analysisDiv.style.border = '1px solid #e5e7eb';
    
    const analysisTitle = document.createElement('div');
    analysisTitle.style.fontSize = '14px';
    analysisTitle.style.fontWeight = '600';
    analysisTitle.style.color = '#374151';
    analysisTitle.style.marginBottom = '8px';
    analysisTitle.textContent = '【特质组合分析】';
    
    const analysisText = document.createElement('div');
    analysisText.style.fontSize = '14px';
    analysisText.style.color = '#666';
    analysisText.style.lineHeight = '1.8';
    analysisText.style.whiteSpace = 'pre-line';
    
    const primaryTrait = reportData[dominantTraits[0]] || reportData.dimensions?.[dominantTraits[0]];
    if (primaryTrait) {
      analysisText.textContent = `您的首要特质${primaryTrait.name}得分较高 (${primaryTrait.averageScore.toFixed(2)}分), 在很多情况下会影响您的决策和行为模式。\n\n这三个特质的组合塑造了您独特的人格风格。理解它们如何相互作用, 能够帮助您更好地认识自己的行为模式, 在不同场景中扬长避短。`;
    }
    
    analysisDiv.appendChild(analysisTitle);
    analysisDiv.appendChild(analysisText);
    dominantTraitsContent.appendChild(analysisDiv);
  }
}

/**
 * 渲染人际关系与职场影响
 */
function renderInterpersonal() {
  const interpersonalContent = document.getElementById('interpersonalContent');
  if (!interpersonalContent) return;
  
  const dFactor = reportData.dFactor || {};
  const dFactorPercent = dFactor.percentage || Math.round(((dFactor.averageScore || 0) / 5) * 100);
  const isHighD = dFactorPercent >= 50;
  
  interpersonalContent.innerHTML = '';
  
  // 2列布局（与原版一致）
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
  grid.style.gap = '16px';
  
  // 移动端改为1列
  if (window.innerWidth <= 768) {
    grid.style.gridTemplateColumns = '1fr';
  }
  
  // 左列
  const leftCol = document.createElement('div');
  
  // 人际交往模式
  const patternDiv = document.createElement('div');
  patternDiv.style.marginBottom = '16px';
  
  const patternTitle = document.createElement('div');
  patternTitle.style.fontSize = '15px';
  patternTitle.style.fontWeight = '600';
  patternTitle.style.color = '#374151';
  patternTitle.style.marginBottom = '8px';
  patternTitle.textContent = '👥 人际交往模式';
  
  const patternText = document.createElement('div');
  patternText.style.fontSize = '14px';
  patternText.style.color = '#666';
  patternText.style.lineHeight = '1.7';
  patternText.textContent = isHighD 
    ? '您倾向于在人际交往中保持一定的独立性和主动性，能够清晰表达自己的需求和边界。在需要竞争的场合，您不会过分退让。'
    : '您在人际交往中更注重和谐与共情，善于理解他人感受，愿意为维护关系做出适当妥协。您是团队中的润滑剂。';
  
  patternDiv.appendChild(patternTitle);
  patternDiv.appendChild(patternText);
  
  // 职场优势
  const advantageDiv = document.createElement('div');
  
  const advantageTitle = document.createElement('div');
  advantageTitle.style.fontSize = '15px';
  advantageTitle.style.fontWeight = '600';
  advantageTitle.style.color = '#374151';
  advantageTitle.style.marginBottom = '8px';
  advantageTitle.textContent = '💼 职场优势';
  
  const advantageText = document.createElement('div');
  advantageText.style.fontSize = '14px';
  advantageText.style.color = '#666';
  advantageText.style.lineHeight = '1.7';
  advantageText.textContent = isHighD
    ? '在需要决断力、战略思维和竞争力的岗位上表现出色。适合管理、销售、谈判等需要主动性的工作。'
    : '在需要团队协作、服务意识和同理心的岗位上表现优异。适合教育、咨询、人力资源等助人型工作。';
  
  advantageDiv.appendChild(advantageTitle);
  advantageDiv.appendChild(advantageText);
  
  leftCol.appendChild(patternDiv);
  leftCol.appendChild(advantageDiv);
  
  // 右列
  const rightCol = document.createElement('div');
  
  // 需要注意的方面
  const warningDiv = document.createElement('div');
  warningDiv.style.marginBottom = '16px';
  
  const warningTitle = document.createElement('div');
  warningTitle.style.fontSize = '15px';
  warningTitle.style.fontWeight = '600';
  warningTitle.style.color = '#374151';
  warningTitle.style.marginBottom = '8px';
  warningTitle.textContent = '⚠️ 需要注意的方面';
  
  const warningText = document.createElement('div');
  warningText.style.fontSize = '14px';
  warningText.style.color = '#666';
  warningText.style.lineHeight = '1.7';
  warningText.textContent = isHighD
    ? '在追求自我利益时，适度考虑他人感受有助于建立长期稳定的合作关系。过度的竞争意识可能影响团队和谐。'
    : '在为他人着想时，也要学会适度维护自己的权益，避免过度牺牲导致的倦怠。适当的自我主张并非自私。';
  
  warningDiv.appendChild(warningTitle);
  warningDiv.appendChild(warningText);
  
  // 发展建议
  const developDiv = document.createElement('div');
  
  const developTitle = document.createElement('div');
  developTitle.style.fontSize = '15px';
  developTitle.style.fontWeight = '600';
  developTitle.style.color = '#374151';
  developTitle.style.marginBottom = '8px';
  developTitle.textContent = '🎯 发展建议';
  
  const developText = document.createElement('div');
  developText.style.fontSize = '14px';
  developText.style.color = '#666';
  developText.style.lineHeight = '1.7';
  developText.textContent = isHighD
    ? '尝试在战略思维的基础上，增加对他人感受的关注。真正的领导力来自于影响力而非控制力。'
    : '在保持善良的同时，学会在必要时坚定表达自己的立场。健康的边界感能让你更好地帮助他人。';
  
  developDiv.appendChild(developTitle);
  developDiv.appendChild(developText);
  
  rightCol.appendChild(warningDiv);
  rightCol.appendChild(developDiv);
  
  grid.appendChild(leftCol);
  grid.appendChild(rightCol);
  
  interpersonalContent.appendChild(grid);
}

/**
 * 渲染常见问题FAQ
 */
function renderFAQ() {
  const faqContent = document.getElementById('faqContent');
  if (!faqContent) return;
  
  faqContent.innerHTML = '';
  
  const faqItems = [
    {
      key: '1',
      question: '🤔 什么是D因子？为什么要测D因子？',
      answer: `
        <div style="padding: 12px 0; line-height: 1.8; color: #4b5563;">
          <p style="margin-bottom: 16px; font-size: 15px;">
            <strong style="color: #ff4757;">D因子（Dark Factor）</strong>是所有黑暗人格特质的共同核心，
            就像智力有g因子一样，黑暗人格也有D因子。
          </p>
          
          <div style="background: #fef2f2; padding: 16px; border-radius: 12px; margin-bottom: 16px; border-left: 4px solid #ff4757">
            <div style="font-weight: 600; color: #991b1b; margin-bottom: 8px; display: block;">
              📊 D因子的发现
            </div>
            <div style="color: #7f1d1d;">
              德国乌尔姆大学的研究团队在2018年发表于《Psychological Review》的研究中发现：
              <strong>自恋、马基雅维利主义、精神病质</strong>等看似不同的黑暗特质，
              背后都有一个共同核心——<strong>最大化自身效用，同时忽视或伤害他人利益的倾向</strong>。
            </div>
          </div>

          <div style="background: #eff6ff; padding: 16px; border-radius: 12px; border-left: 4px solid #1e90ff">
            <div style="font-weight: 600; color: #1e40af; margin-bottom: 8px; display: block;">
              💡 为什么要了解D因子？
            </div>
            <ul style="padding-left: 20px; margin: 0; color: #1e3a8a;">
              <li>更好地理解自己的行为动机和决策模式</li>
              <li>识别自己在人际关系中的优势和盲点</li>
              <li>在竞争与合作中找到更适合的平衡点</li>
              <li>提升自我认知，优化人际互动策略</li>
            </ul>
          </div>
        </div>
      `
    },
    {
      key: '2',
      question: '🎭 魔丸和灵珠是什么意思？',
      answer: `
        <div style="padding: 12px 0; line-height: 1.8; color: #4b5563;">
          <p style="margin-bottom: 16px; font-size: 15px;">
            这是本测试的<strong style="color: #ff4757;">趣味化解读方式</strong>，
            灵感来自电影《哪吒之魔童降世》。
          </p>
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px;">
            <div style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); padding: 16px; border-radius: 12px;">
              <div style="font-size: 32px; text-align: center; margin-bottom: 8px;">🔥</div>
              <div style="font-weight: 600; color: #991b1b; margin-bottom: 8px; text-align: center; display: block;">
                魔丸体质
              </div>
              <div style="color: #7f1d1d; font-size: 14px;">
                D因子≥50%，代表较强的自主性、竞争力和决断力。
                就像哪吒的魔丸，虽然叛逆强大，但也能守护重要的人。
              </div>
            </div>
            <div style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); padding: 16px; border-radius: 12px;">
              <div style="font-size: 32px; text-align: center; margin-bottom: 8px;">💧</div>
              <div style="font-weight: 600; color: #1e40af; margin-bottom: 8px; text-align: center; display: block;">
                灵珠体质
              </div>
              <div style="color: #1e3a8a; font-size: 14px;">
                D因子&lt;50%，代表较强的同理心、善良和亲社会倾向。
                就像原本的灵珠，温和正义，是值得信赖的伙伴。
              </div>
            </div>
          </div>

          <div style="background: #fef3c7; padding: 16px; border-radius: 12px; margin-top: 16px">
            <div style="font-weight: 600; color: #92400e; margin-bottom: 8px; display: block;">
              ⚖️ 魔丸和灵珠没有好坏之分
            </div>
            <div style="color: #78350f;">
              魔丸和灵珠只是不同的人格倾向，各有优势。魔丸适合竞争环境，灵珠适合合作场景。
              关键是<strong>了解自己的特质，在合适的环境中发挥优势</strong>。
            </div>
          </div>
        </div>
      `
    },
    {
      key: '3',
      question: '📊 D因子高是不是不好？会不会是"坏人"？',
      answer: `
        <div style="padding: 12px 0; line-height: 1.8; color: #4b5563;">
          <div style="background: #fff7ed; padding: 16px; border-radius: 12px; border: 1px solid #fbbf24; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #92400e; margin-bottom: 8px; display: block; font-size: 16px;">
              绝对不是！D因子高≠坏人
            </div>
            <div style="color: #78350f; margin-top: 12px;">
              <p style="margin-bottom: 12px;">
                <strong style="color: #dc2626;">这是最常见的误解。</strong>
                D因子只是反映人格特质，<strong>不是道德评判</strong>。
              </p>
              
              <div style="background: #f0fdf4; padding: 16px; border-radius: 12px; margin-bottom: 12px;">
                <div style="font-weight: 600; color: #166534; margin-bottom: 8px; display: block;">
                  ✅ D因子较高的优势
                </div>
                <ul style="padding-left: 20px; margin: 0; color: #15803d;">
                  <li><strong>竞争力强</strong>：在商业、体育、学术竞争中更有优势</li>
                  <li><strong>决策果断</strong>：能在关键时刻快速做出决定</li>
                  <li><strong>战略思维</strong>：善于规划和执行复杂策略</li>
                  <li><strong>自信心强</strong>：不容易被质疑和挫折打击</li>
                </ul>
              </div>

              <div style="background: #fffbeb; padding: 16px; border-radius: 12px;">
                <div style="font-weight: 600; color: #92400e; margin-bottom: 8px; display: block;">
                  ⚠️ 需要注意的是
                </div>
                <div style="color: #78350f;">
                  过度的D因子可能影响长期人际关系。关键是<strong>找到平衡点</strong>：
                  在需要竞争时果断，在需要合作时包容。这样才能既实现目标，又维护关系。
                </div>
              </div>
            </div>
          </div>
        </div>
      `
    },
    {
      key: '4',
      question: '🔄 D因子会随时间改变吗？',
      answer: `
        <div style="padding: 12px 0; line-height: 1.8; color: #4b5563;">
          <p style="margin-bottom: 16px; font-size: 15px;">
            <strong style="color: #ff4757;">会有变化，但核心倾向相对稳定。</strong>
          </p>
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px;">
            <div style="background: #f0fdf4; padding: 16px; border-radius: 12px; height: 100%;">
              <div style="font-weight: 600; color: #166534; margin-bottom: 8px; display: block;">
                ✅ 相对稳定的部分
              </div>
              <ul style="padding-left: 20px; margin: 0; color: #15803d;">
                <li>核心人格倾向（魔丸/灵珠）</li>
                <li>主导特质类型（Top 3）</li>
                <li>基本的决策模式</li>
              </ul>
            </div>
            <div style="background: #fef2f2; padding: 16px; border-radius: 12px; height: 100%;">
              <div style="font-weight: 600; color: #991b1b; margin-bottom: 8px; display: block;">
                🔄 可能变化的部分
              </div>
              <ul style="padding-left: 20px; margin: 0; color: #b91c1c;">
                <li>具体分数高低</li>
                <li>某些维度的表现</li>
                <li>受环境影响的行为</li>
              </ul>
            </div>
          </div>

          <div style="background: #ede9fe; padding: 16px; border-radius: 12px; margin-top: 16px">
            <div style="font-weight: 600; color: #5b21b6; margin-bottom: 8px; display: block;">
              💡 人格是可以发展的
            </div>
            <div style="color: #6b21a8;">
              通过<strong>有意识的练习和反思</strong>，你可以调整自己的行为模式。
              比如提升同理心、学习更好的沟通方式、培养长期思维等。
              建议每1-2年重新测试，观察自己的成长变化。
            </div>
          </div>
        </div>
      `
    },
    {
      key: '5',
      question: '💼 如何在职场中应用测试结果？',
      answer: `
        <div style="padding: 12px 0; line-height: 1.8; color: #4b5563;">
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="background: #f0f9ff; padding: 16px; border-radius: 12px; border-left: 4px solid #0ea5e9">
              <div style="font-weight: 600; color: #0c4a6e; margin-bottom: 8px; display: block;">
                1️⃣ 了解自己的优势场景
              </div>
              <div style="color: #075985;">
                <strong>魔丸倾向</strong>：适合销售、管理、创业、谈判等需要竞争力的岗位<br/>
                <strong>灵珠倾向</strong>：适合HR、教育、客服、团队协作等需要同理心的岗位
              </div>
            </div>

            <div style="background: #fef3c7; padding: 16px; border-radius: 12px; border-left: 4px solid #f59e0b">
              <div style="font-weight: 600; color: #92400e; margin-bottom: 8px; display: block;">
                2️⃣ 调整沟通策略
              </div>
              <div style="color: #78350f;">
                了解自己的特质后，可以<strong>有意识地调整沟通方式</strong>。
                比如魔丸倾向的人在团队合作时多倾听他人，灵珠倾向的人在谈判时更坚定表达立场。
              </div>
            </div>

            <div style="background: #f5f3ff; padding: 16px; border-radius: 12px; border-left: 4px solid #8b5cf6">
              <div style="font-weight: 600; color: #6b21a8; margin-bottom: 8px; display: block;">
                3️⃣ 选择适合的团队角色
              </div>
              <div style="color: #7c3aed;">
                根据D因子水平选择合适的角色：高D因子适合当决策者和领导者，
                低D因子适合当协调者和支持者。<strong>各有价值，关键是找对位置</strong>。
              </div>
            </div>
          </div>
        </div>
      `
    },
    {
      key: '6',
      question: '🌟 某个维度分数特别高，需要担心吗？',
      answer: `
        <div style="padding: 12px 0; line-height: 1.8; color: #4b5563;">
          <div style="background: #f0fdf4; padding: 16px; border-radius: 12px; border: 1px solid #86efac; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #166534; margin-bottom: 8px; display: block; font-size: 16px;">
              不必过度担心
            </div>
            <div style="color: #15803d; margin-top: 12px;">
              <p style="margin-bottom: 12px;">
                单个维度高并不意味着有问题。<strong style="color: #ff4757;">关键看是否影响你的生活质量和人际关系</strong>。
              </p>
              
              <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-top: 12px;">
                <div style="font-weight: 600; margin-bottom: 8px; display: block; color: #374151;">
                  🎯 如何看待高分维度
                </div>
                <ul style="padding-left: 20px; margin: 0; color: #6b7280;">
                  <li><strong>自恋高</strong>：可能意味着强烈的自信和成就动机（有助于职业发展）</li>
                  <li><strong>马基雅维利主义高</strong>：可能代表出色的战略思维（商业优势）</li>
                  <li><strong>精神病质高</strong>：可能表示果敢和冒险精神（创业特质）</li>
                  <li><strong>利己主义高</strong>：可能反映明确的自我边界（自我保护）</li>
                </ul>
              </div>

              <div style="background: #fffbeb; padding: 16px; border-radius: 8px; margin-top: 12px;">
                <div style="color: #78350f; font-size: 14px;">
                  💡 <strong>平衡是关键</strong>：这些特质在适度水平是优势，
                  过度时可能带来人际困扰。重要的是<strong>自我觉察和灵活调整</strong>。
                </div>
              </div>
            </div>
          </div>
        </div>
      `
    },
    {
      key: '7',
      question: '❓ 测试结果准确吗？我感觉和实际情况有差异？',
      answer: `
        <div style="padding: 12px 0; line-height: 1.8; color: #4b5563;">
          <p style="margin-bottom: 16px; font-size: 15px;">
            测试结果受多种因素影响，<strong style="color: #ff4757;">可能存在一定偏差</strong>，这是正常的。
          </p>

          <div style="background: #fef2f2; padding: 16px; border-radius: 12px; margin-bottom: 16px">
            <div style="font-weight: 600; color: #991b1b; margin-bottom: 8px; display: block;">
              🎯 可能影响结果的因素
            </div>
            <ul style="padding-left: 20px; margin: 0; color: #7f1d1d;">
              <li><strong>作答心态</strong>：是否按真实想法作答，还是按"应该"的样子作答</li>
              <li><strong>当前状态</strong>：心情、压力、疲劳等临时状态会影响回答</li>
              <li><strong>自我认知</strong>：对自己的了解程度影响答题准确性</li>
              <li><strong>社会期望</strong>：可能无意识地美化自己的回答</li>
            </ul>
          </div>

          <div style="background: #eff6ff; padding: 16px; border-radius: 12px">
            <div style="font-weight: 600; color: #1e40af; margin-bottom: 8px; display: block;">
              💡 如何获得更准确的结果
            </div>
            <ul style="padding-left: 20px; margin: 0; color: #1e3a8a;">
              <li>在<strong>放松、真实</strong>的状态下作答</li>
              <li>根据<strong>实际行为</strong>而非"理想的自己"作答</li>
              <li>隔段时间<strong>重新测试</strong>，对比结果</li>
              <li>结合<strong>他人反馈</strong>，多角度了解自己</li>
            </ul>
          </div>
        </div>
      `
    }
  ];
  
  // 创建折叠面板容器
  faqItems.forEach(item => {
    const faqItem = document.createElement('div');
    faqItem.style.marginBottom = '12px';
    faqItem.style.border = '1px solid #e5e7eb';
    faqItem.style.borderRadius = '8px';
    faqItem.style.overflow = 'hidden';
    
    const questionDiv = document.createElement('div');
    questionDiv.style.padding = '16px';
    questionDiv.style.background = '#fff';
    questionDiv.style.cursor = 'pointer';
    questionDiv.style.display = 'flex';
    questionDiv.style.justifyContent = 'space-between';
    questionDiv.style.alignItems = 'center';
    questionDiv.style.fontSize = '16px';
    questionDiv.style.fontWeight = '600';
    questionDiv.style.color = '#374151';
    questionDiv.innerHTML = `<span>${item.question}</span><span style="font-size: 20px;">▼</span>`;
    
    const answerDiv = document.createElement('div');
    answerDiv.style.display = 'none';
    answerDiv.style.padding = '0 16px 16px';
    answerDiv.style.background = '#fff';
    answerDiv.innerHTML = item.answer;
    
    questionDiv.addEventListener('click', () => {
      const isOpen = answerDiv.style.display !== 'none';
      answerDiv.style.display = isOpen ? 'none' : 'block';
      questionDiv.querySelector('span:last-child').textContent = isOpen ? '▼' : '▲';
    });
    
    faqItem.appendChild(questionDiv);
    faqItem.appendChild(answerDiv);
    faqContent.appendChild(faqItem);
  });
}

/**
 * 渲染重要提示
 */
function renderImportantAlert() {
  const importantAlert = document.getElementById('importantAlert');
  if (!importantAlert) return;
  
  importantAlert.style.padding = '16px';
  importantAlert.style.background = '#e6f7ff';
  importantAlert.style.border = '1px solid #91d5ff';
  importantAlert.style.borderRadius = '12px';
  importantAlert.style.marginBottom = '24px';
  
  const title = document.createElement('div');
  title.style.fontSize = '16px';
  title.style.fontWeight = '600';
  title.style.color = '#0050b3';
  title.style.marginBottom = '12px';
  title.textContent = '🔔 关于本测试';
  
  const content = document.createElement('div');
  content.style.lineHeight = '1.8';
  content.style.color = '#0050b3';
  content.style.fontSize = '14px';
  content.innerHTML = `
    <p style="margin-bottom: 8px;"><strong>测试性质：</strong></p>
    <p style="margin-bottom: 8px;">✅ 这是一个基于D因子理论的自我探索工具，帮助您了解自己的人格特质。</p>
    <p style="margin-bottom: 12px;">🎭 本测试具有娱乐性质，结果仅供参考和自我认知。</p>
    
    <div style="height: 1px; background: #91d5ff; margin: 12px 0;"></div>
    
    <p style="margin-bottom: 8px;"><strong>关于黑暗人格特质：</strong></p>
    <p style="margin-bottom: 8px;">• 每个人都在一定程度上具有这些特质，这是正常的人格变异</p>
    <p style="margin-bottom: 8px;">• 适度水平的黑暗特质可能是优势（如自信、果断、战略思维、竞争力）</p>
    <p style="margin-bottom: 12px;">• 了解自己的特质有助于扬长避短，在合适的场景发挥优势</p>
    
    <div style="height: 1px; background: #91d5ff; margin: 12px 0;"></div>
    
    <p style="margin-bottom: 8px;"><strong>测试结果的使用：</strong></p>
    <p style="margin-bottom: 8px;">• 将结果作为自我认知的参考，而非绝对的标签</p>
    <p style="margin-bottom: 8px;">• 人格是发展的，通过有意识的练习可以调整行为模式</p>
    <p style="margin-bottom: 0;">• 以开放和好奇的心态看待结果，享受探索自我的过程</p>
  `;
  
  importantAlert.appendChild(title);
  importantAlert.appendChild(content);
}

/**
 * 渲染底部说明
 */
function renderFooterInfo() {
  const footerInfo = document.getElementById('reportFooterInfo');
  if (!footerInfo) return;
  
  const completedAt = reportData.completedAt || new Date().toISOString();
  const date = new Date(completedAt);
  // 格式化为：YYYY年MM月DD日 HH:mm（与原版一致）
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const formattedTime = `${year}年${month}月${day}日 ${hour}:${minute}`;
  
  footerInfo.style.textAlign = 'center';
  footerInfo.style.padding = '20px';
  footerInfo.style.color = '#6b7280';
  footerInfo.style.fontSize = '14px';
  footerInfo.style.background = 'rgba(255, 255, 255, 0.8)';
  footerInfo.style.borderRadius = '12px';
  footerInfo.style.border = '1px solid #e5e7eb';
  footerInfo.style.marginBottom = '16px';
  
  const timeDiv = document.createElement('div');
  timeDiv.style.marginBottom = '8px';
  timeDiv.textContent = `报告生成时间：${formattedTime}`;
  
  const descDiv = document.createElement('div');
  descDiv.style.fontSize = '12px';
  descDiv.style.lineHeight = '1.6';
  descDiv.style.color = '#9ca3af';
  descDiv.innerHTML = `
    本报告基于Moshagen et al. (2018)的D因子理论(Dark Factor of Personality)生成，采用70题Likert量表。
    <br />
    理论源自德国乌尔姆大学心理学研究团队，发表于《Psychological Review》，是全球最权威的黑暗人格研究成果之一。
    <br />
    测试结果仅供参考，帮助您更好地了解自我，在生活和工作中做出更明智的选择。
  `;
  
  footerInfo.appendChild(timeDiv);
  footerInfo.appendChild(descDiv);
}

/**
 * 渲染管理员注册引导
 */
function renderAdminGuide() {
  const adminGuide = document.getElementById('adminGuide');
  if (!adminGuide) return;
  
  // 隐藏管理员引导（用户要求去掉）
  adminGuide.style.display = 'none';
  
  const text = document.createElement('span');
  text.style.fontSize = '12px';
  text.style.color = '#9ca3af';
  text.textContent = '如果您也想为他人提供测试服务，';
  
  const link = document.createElement('span');
  link.style.color = '#6b7280';
  link.style.textDecoration = 'underline';
  link.style.marginLeft = '2px';
  link.style.cursor = 'pointer';
  link.textContent = '点击这里了解更多';
  link.addEventListener('click', () => {
    window.location.href = '/';
  });
  
  adminGuide.appendChild(text);
  adminGuide.appendChild(link);
}

/**
 * 初始化重新测试按钮
 */
function initializeRestartButton() {
  const restartButton = document.getElementById('restartButton');
  if (restartButton) {
    restartButton.addEventListener('click', () => {
      // 清除本地测试结果（用于重新测试）
      if (window.linkValidator && window.linkValidator.clearLocalResult) {
        window.linkValidator.clearLocalResult();
      }
      
      // 构建首页URL（需要包含token以便SDK验证）
      let indexUrl = 'index.html';
      const urlParams = new URLSearchParams();
      const token = window.linkValidator && window.linkValidator.token;
      const isUnlimited = window.linkValidator && window.linkValidator.unlimited;
      
      // 添加restart参数，表示重新测试
      urlParams.set('restart', 'true');
      
      if (isUnlimited && token) {
        urlParams.set('unlimited', 'true');
        urlParams.set('token', token);
      } else if (token) {
        urlParams.set('token', token);
      }
      
      const queryString = urlParams.toString();
      if (queryString) {
        indexUrl = `${indexUrl}?${queryString}`;
      }
      
      window.location.href = indexUrl;
    });
  }
}

// 导出函数供HTML调用
window.exportReport = exportReport;

