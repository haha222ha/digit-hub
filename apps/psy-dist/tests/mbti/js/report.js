/**
 * MBTI 报告页面逻辑
 * 完全独立的实现，不依赖任何外部框架
 */

import { DIMENSION_ORDER } from '../data/questions.js';
import { getTestResult } from './utils/storage.js';

// 报告数据
let reportData = null;

// 16种MBTI类型信息配置
const TYPE_INFO = {
  'INTJ': { 
    color: '#6366f1', 
    bgColor: '#f0f0ff',
    gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    name: '建筑师',
    slogan: '在复杂中找到秩序，用理性驱动前行'
  },
  'INTP': { 
    color: '#06b6d4', 
    bgColor: '#ecfeff',
    gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
    name: '思想家',
    slogan: '好奇心驱动，用逻辑探索世界本质'
  },
  'ENTJ': { 
    color: '#dc2626', 
    bgColor: '#fef2f2',
    gradient: 'linear-gradient(135deg, #dc2626, #ea580c)',
    name: '指挥官',
    slogan: '天生领袖，将愿景转化为现实'
  },
  'ENTP': { 
    color: '#d97706', 
    bgColor: '#fffbeb',
    gradient: 'linear-gradient(135deg, #d97706, #f59e0b)',
    name: '辩论家',
    slogan: '思维敏捷，在思辨中寻找可能性'
  },
  'INFJ': { 
    color: '#059669', 
    bgColor: '#ecfdf5',
    gradient: 'linear-gradient(135deg, #059669, #10b981)',
    name: '提倡者',
    slogan: '内心坚定，为理想默默耕耘'
  },
  'INFP': { 
    color: '#7c3aed', 
    bgColor: '#faf5ff',
    gradient: 'linear-gradient(135deg, #7c3aed, #a855f7)',
    name: '调停者',
    slogan: '价值导向，在真诚中寻找意义'
  },
  'ENFJ': { 
    color: '#be185d', 
    bgColor: '#fdf2f8',
    gradient: 'linear-gradient(135deg, #be185d, #e11d48)',
    name: '主人公',
    slogan: '善于激励，帮助他人发现潜能'
  },
  'ENFP': { 
    color: '#ea580c', 
    bgColor: '#fff7ed',
    gradient: 'linear-gradient(135deg, #ea580c, #fb923c)',
    name: '竞选者',
    slogan: '充满热情，将创意变为行动'
  },
  'ISTJ': { 
    color: '#1e40af', 
    bgColor: '#eff6ff',
    gradient: 'linear-gradient(135deg, #1e40af, #3b82f6)',
    name: '物流师',
    slogan: '可靠务实，用责任心守护秩序'
  },
  'ISFJ': { 
    color: '#0f766e', 
    bgColor: '#f0fdfa',
    gradient: 'linear-gradient(135deg, #0f766e, #14b8a6)',
    name: '守卫者',
    slogan: '温暖贴心，在服务他人中实现价值'
  },
  'ESTJ': { 
    color: '#92400e', 
    bgColor: '#fefce8',
    gradient: 'linear-gradient(135deg, #92400e, #ca8a04)',
    name: '总经理',
    slogan: '高效执行，用实干成就目标'
  },
  'ESFJ': { 
    color: '#a21caf', 
    bgColor: '#fdf4ff',
    gradient: 'linear-gradient(135deg, #a21caf, #c026d3)',
    name: '执政官',
    slogan: '和谐友善，在关爱中建立连接'
  },
  'ISTP': { 
    color: '#166534', 
    bgColor: '#f0fdf4',
    gradient: 'linear-gradient(135deg, #166534, #22c55e)',
    name: '鉴赏家',
    slogan: '动手解决，在实践中验证想法'
  },
  'ISFP': { 
    color: '#5b21b6', 
    bgColor: '#faf5ff',
    gradient: 'linear-gradient(135deg, #5b21b6, #8b5cf6)',
    name: '探险家',
    slogan: '灵活适应，在体验中发现美好'
  },
  'ESTP': { 
    color: '#b91c1c', 
    bgColor: '#fef2f2',
    gradient: 'linear-gradient(135deg, #b91c1c, #ef4444)',
    name: '企业家',
    slogan: '行动至上，在变化中抓住机遇'
  },
  'ESFP': { 
    color: '#c2410c', 
    bgColor: '#fff7ed',
    gradient: 'linear-gradient(135deg, #c2410c, #f97316)',
    name: '娱乐家',
    slogan: '乐观开朗，将快乐传递给世界'
  }
};

// 维度配置（与原版一致）
const DIMENSION_CONFIG = {
  'EI': {
    name: '🔋 您从哪里获得能量？',
    leftLabel: '内向 (I)',  // 恢复原版配置
    rightLabel: '外向 (E)', // 恢复原版配置
    leftColor: '#4f46e5',
    rightColor: '#8b5cf6',
    leftDesc: '更喜欢独处思考，从安静的内心世界中充电',
    rightDesc: '更喜欢与人交流，从热闹的外部世界中充电'
  },
  'SN': {
    name: '🧠 您如何处理信息？',
    leftLabel: '感觉 (S)',
    rightLabel: '直觉 (N)',
    leftColor: '#059669',
    rightColor: '#0891b2',
    leftDesc: '更关注现实和细节，相信看得见摸得着的事实',
    rightDesc: '更关注可能性和创意，相信第六感和未来潜力'
  },
  'TF': {
    name: '⚖️ 您如何做决定？',
    leftLabel: '思维 (T)',
    rightLabel: '情感 (F)',
    leftColor: '#dc2626',
    rightColor: '#ea580c',
    leftDesc: '更依靠逻辑分析，客观理性地判断对错',
    rightDesc: '更考虑情感因素，重视人情和价值观'
  },
  'JP': {
    name: '📅 您喜欢怎样的生活？',
    leftLabel: '判断 (J)',
    rightLabel: '知觉 (P)',
    leftColor: '#7c2d12',
    rightColor: '#a3a3a3',
    leftDesc: '更喜欢有计划、有规律，提前安排好一切',
    rightDesc: '更喜欢灵活应变，保持选择的开放性'
  }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initialize();
});

/**
 * 初始化报告
 */
async function initialize() {
  try {
    showLoading(true);
    
    // 等待数据加载
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 获取测试结果
    const resultData = getTestResult();
    
    if (!resultData || !resultData.result) {
      // 没有测试结果，跳转回问卷页面
      alert('未找到测试结果，请先完成测试。');
      window.location.href = 'index.html';
      return;
    }
    
    reportData = resultData.result;
    
    // 渲染报告
    renderReport();
    
    // 绑定重新测试按钮事件
    bindRestartButton();
    
    showLoading(false);
    
  } catch (error) {
    console.error('加载报告失败:', error);
    showLoading(false);
    alert('加载报告失败，请刷新页面重试。');
  }
}

/**
 * 渲染报告
 */
function renderReport() {
  // 渲染个性类型展示区
  renderTypeHero();
  
  // 渲染类型详细描述
  renderDescription();
  
  // 渲染维度得分详情
  renderDimensions();
  
  // 渲染核心特质与行为模式
  renderCoreTraits();
  
  // 渲染优势与成长空间
  renderStrengthsWeaknesses();
  
  // 渲染生活工作场景建议
  renderLifestyle();
  
  // 渲染压力应对与成长路径
  renderStressGrowth();
  
  // 渲染个性化发展建议
  renderRecommendations();
  
  // 渲染理解与应用
  renderUnderstanding();
}

/**
 * 渲染个性类型展示区
 */
function renderTypeHero() {
  const type = reportData.type || '----';
  const typeInfo = TYPE_INFO[type] || TYPE_INFO['INTJ'];
  const completedAt = reportData.completedAt || new Date().toISOString();
  
  const date = new Date(completedAt);
  const dateStr = date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // 设置背景渐变
  const hero = document.getElementById('typeHero');
  hero.style.background = typeInfo.gradient;
  
  // 更新内容
  document.getElementById('typeCode').textContent = type;
  document.getElementById('typeName').textContent = typeInfo.name;
  document.getElementById('typeSlogan').textContent = typeInfo.slogan;
  document.getElementById('reportDate').textContent = `测试完成时间：${dateStr} | 基于93题科学评估`;
}

/**
 * 渲染维度得分详情
 */
function renderDimensions() {
  const dimensionsGrid = document.getElementById('dimensionsGrid');
  dimensionsGrid.innerHTML = '';
  
  DIMENSION_ORDER.forEach(dimension => {
    const dimData = reportData.dimensions[dimension];
    if (!dimData) return;
    
    const config = DIMENSION_CONFIG[dimension];
    
    // 修复数据取值逻辑，确保与标签对应
    // 注意：leftLabel是'内向 (I)'，所以leftScore应该是I的分数
    // rightLabel是'外向 (E)'，所以rightScore应该是E的分数
    let leftScore, rightScore, leftPercentage, rightPercentage;
    if (dimension === 'EI') {
      // 恢复原版数据读取：leftLabel是'内向 (I)'，所以leftScore应该是I的分数
      leftScore = dimData.I || 0;  // 内向分数（对应leftLabel）
      rightScore = dimData.E || 0; // 外向分数（对应rightLabel）
    } else if (dimension === 'SN') {
      leftScore = dimData.S || 0;  // 感觉分数（对应leftLabel）
      rightScore = dimData.N || 0; // 直觉分数（对应rightLabel）
    } else if (dimension === 'TF') {
      leftScore = dimData.T || 0;  // 思维分数（对应leftLabel）
      rightScore = dimData.F || 0; // 情感分数（对应rightLabel）
    } else if (dimension === 'JP') {
      leftScore = dimData.J || 0;  // 判断分数（对应leftLabel）
      rightScore = dimData.P || 0; // 知觉分数（对应rightLabel）
    } else {
      leftScore = dimData[dimension[0]] || 0;
      rightScore = dimData[dimension[1]] || 0;
    }
    
    const total = leftScore + rightScore;
    leftPercentage = total > 0 ? Math.round((leftScore / total) * 100) : 50;
    rightPercentage = 100 - leftPercentage;
    
    // 判断偏向（使用 >= 比较，与scoring.js中的类型判断逻辑一致）
    // 当分数相等时，选择左侧（左侧字母），这与MBTI标准做法一致
    const isLeftPreferred = leftScore >= rightScore;
    const preferredPercentage = isLeftPreferred ? leftPercentage : rightPercentage;
    
    // 调试信息（可以在控制台查看）
    console.log(`维度 ${dimension}: leftScore=${leftScore}, rightScore=${rightScore}, leftPercentage=${leftPercentage}%, rightPercentage=${rightPercentage}%, isLeftPreferred=${isLeftPreferred}`);
    
    // 计算清晰度（偏好强度）
    let clarityLevel = '中等';
    let clarityColor = '#f59e0b';
    if (preferredPercentage >= 75) {
      clarityLevel = '非常清晰';
      clarityColor = '#10b981';
    } else if (preferredPercentage >= 65) {
      clarityLevel = '清晰';
      clarityColor = '#52c41a';
    } else if (preferredPercentage >= 55) {
      clarityLevel = '中等';
      clarityColor = '#f59e0b';
    } else {
      clarityLevel = '轻微';
      clarityColor = '#ff7875';
    }
    
    // 创建维度卡片
    const dimCard = document.createElement('div');
    dimCard.className = 'dimension-card';
    dimCard.style.background = '#fafbfc';
    dimCard.style.borderRadius = '16px';
    dimCard.style.padding = '24px';
    dimCard.style.border = '1px solid #e5e7eb';
    dimCard.style.position = 'relative';
    
    // 清晰度标签
    const clarityBadge = document.createElement('div');
    clarityBadge.style.position = 'absolute';
    clarityBadge.style.top = '16px';
    clarityBadge.style.right = '16px';
    clarityBadge.style.background = clarityColor;
    clarityBadge.style.color = 'white';
    clarityBadge.style.padding = '4px 10px';
    clarityBadge.style.borderRadius = '12px';
    clarityBadge.style.fontSize = '12px';
    clarityBadge.style.fontWeight = '600';
    clarityBadge.textContent = clarityLevel;
    
    // 维度标题
    const title = document.createElement('h3');
    title.style.color = '#1f2937';
    title.style.marginBottom = '20px';
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    title.textContent = config.name;
    
    // 百分比显示（天平式）
    const balanceDiv = document.createElement('div');
    balanceDiv.style.display = 'flex';
    balanceDiv.style.justifyContent = 'space-between';
    balanceDiv.style.alignItems = 'center';
    balanceDiv.style.marginBottom = '20px';
    
    const leftDiv = document.createElement('div');
    leftDiv.style.textAlign = 'left';
    leftDiv.style.opacity = isLeftPreferred ? '1' : '0.5';
    
    const leftLabel = document.createElement('div');
    leftLabel.style.fontSize = '16px';
    leftLabel.style.fontWeight = '600';
    leftLabel.style.color = isLeftPreferred ? config.leftColor : '#9ca3af';
    leftLabel.textContent = config.leftLabel;
    
    const leftPercent = document.createElement('div');
    leftPercent.style.fontSize = '20px';
    leftPercent.style.fontWeight = 'bold';
    leftPercent.style.color = isLeftPreferred ? config.leftColor : '#9ca3af';
    leftPercent.textContent = `${leftPercentage}%`;
    
    leftDiv.appendChild(leftLabel);
    leftDiv.appendChild(leftPercent);
    
    const rightDiv = document.createElement('div');
    rightDiv.style.textAlign = 'right';
    rightDiv.style.opacity = isLeftPreferred ? '0.5' : '1';
    
    const rightLabel = document.createElement('div');
    rightLabel.style.fontSize = '16px';
    rightLabel.style.fontWeight = '600';
    rightLabel.style.color = !isLeftPreferred ? config.rightColor : '#9ca3af';
    rightLabel.textContent = config.rightLabel;
    
    const rightPercent = document.createElement('div');
    rightPercent.style.fontSize = '20px';
    rightPercent.style.fontWeight = 'bold';
    rightPercent.style.color = !isLeftPreferred ? config.rightColor : '#9ca3af';
    rightPercent.textContent = `${rightPercentage}%`;
    
    rightDiv.appendChild(rightLabel);
    rightDiv.appendChild(rightPercent);
    
    balanceDiv.appendChild(leftDiv);
    balanceDiv.appendChild(rightDiv);
    
    // 天平滑块设计
    const scaleDiv = document.createElement('div');
    scaleDiv.style.position = 'relative';
    scaleDiv.style.height = '60px';
    scaleDiv.style.marginBottom = '20px';
    
    // 天平基座
    const base = document.createElement('div');
    base.style.position = 'absolute';
    base.style.bottom = '10px';
    base.style.left = '50%';
    base.style.transform = 'translateX(-50%)';
    base.style.width = '4px';
    base.style.height = '30px';
    base.style.background = '#9ca3af';
    base.style.borderRadius = '2px';
    
    // 天平横杆
    const bar = document.createElement('div');
    bar.style.position = 'absolute';
    bar.style.bottom = '35px';
    bar.style.left = '10%';
    bar.style.right = '10%';
    bar.style.height = '8px';
    bar.style.background = `linear-gradient(90deg, ${config.leftColor}, #e5e7eb, ${config.rightColor})`;
    bar.style.borderRadius = '4px';
    bar.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    
    // 滑动指示器
    // 横杆从10%到90%，占据80%宽度（有效范围是80%）
    // 指示条位置计算：
    // - 横杆从左到右，左边对应leftLabel（如内向I），右边对应rightLabel（如外向E）
    // - 圆点应该靠近百分比更低的那边（天平原理：百分比高的一侧把圆点推向百分比低的一侧）
    // 
    // 计算逻辑：
    // - 如果leftPercentage > rightPercentage（如83% > 17%），圆点应该在右边（靠近17%）
    //   位置 = 10% + rightPercentage * 0.8
    //   例如：leftPercentage=83%，rightPercentage=17%，计算：10 + 17 * 0.8 = 10 + 13.6 = 23.6%（右边，靠近17%）
    // - 如果rightPercentage > leftPercentage（如83% > 17%），圆点应该在左边（靠近17%）
    //   位置 = 10% + leftPercentage * 0.8
    //   例如：rightPercentage=83%，leftPercentage=17%，计算：10 + 17 * 0.8 = 10 + 13.6 = 23.6%（左边，靠近17%）
    const indicator = document.createElement('div');
    indicator.style.position = 'absolute';
    indicator.style.bottom = '30px';
    
    // 圆点应该靠近百分比更低的那边（所有维度统一逻辑）
    // 横杆从10%到90%，占据80%宽度（有效范围是80%）
    // - 圆点在左边（靠近leftLabel）：left值较小（接近10%）
    // - 圆点在右边（靠近rightLabel）：left值较大（接近90%）
    // - 圆点靠近百分比更低的那边：如果左边百分比高，圆点在右边；如果右边百分比高，圆点在左边
    // 
    // 计算公式验证：
    // 情况1：左边100%，右边0%（isLeftPreferred = true）
    //   - 圆点应该在右边（靠近0%），left值应该接近90%
    //   - 公式：10 + (100 - rightPercentage) * 0.8 = 10 + 100 * 0.8 = 90%（右边）✓
    // 
    // 情况2：左边0%，右边100%（isLeftPreferred = false）
    //   - 圆点应该在左边（靠近0%），left值应该接近10%
    //   - 公式：10 + leftPercentage * 0.8 = 10 + 0 * 0.8 = 10%（左边）✓
    // 
    // 情况3：左边83%，右边17%（isLeftPreferred = true）
    //   - 圆点应该在右边（靠近17%），left值应该略大于50%
    //   - 公式：10 + (100 - 17) * 0.8 = 10 + 83 * 0.8 = 76.4%（右边）✓
    // 
    // 情况4：左边17%，右边83%（isLeftPreferred = false）
    //   - 圆点应该在左边（靠近17%），left值应该略小于50%
    //   - 公式：10 + 17 * 0.8 = 10 + 13.6 = 23.6%（左边）✓
    if (isLeftPreferred) {
      // 左边百分比更高，圆点在右边（靠近百分比更低的右边）
      // 位置 = 10% + (100 - rightPercentage) * 0.8
      indicator.style.left = `${10 + (100 - rightPercentage) * 0.8}%`;
    } else {
      // 右边百分比更高，圆点在左边（靠近百分比更低的左边）
      // 位置 = 10% + leftPercentage * 0.8
      indicator.style.left = `${10 + leftPercentage * 0.8}%`;
    }
    indicator.style.transform = 'translateX(-50%)';
    indicator.style.width = '18px';
    indicator.style.height = '18px';
    indicator.style.background = isLeftPreferred ? config.leftColor : config.rightColor;
    indicator.style.borderRadius = '50%';
    indicator.style.border = '3px solid white';
    indicator.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    
    // 倾向提示文字
    const tipText = document.createElement('div');
    tipText.style.position = 'absolute';
    tipText.style.top = '0';
    tipText.style.left = '50%';
    tipText.style.transform = 'translateX(-50%)';
    tipText.style.fontSize = '14px';
    tipText.style.color = isLeftPreferred ? config.leftColor : config.rightColor;
    tipText.style.fontWeight = '600';
    tipText.style.textAlign = 'center';
    const preferredLabel = isLeftPreferred ? 
      (dimension === 'EI' ? '内向' : dimension === 'SN' ? '感觉' : dimension === 'TF' ? '思维' : '判断') : 
      (dimension === 'EI' ? '外向' : dimension === 'SN' ? '直觉' : dimension === 'TF' ? '情感' : '知觉');
    tipText.textContent = `更偏向于 ${preferredLabel}`;
    
    scaleDiv.appendChild(base);
    scaleDiv.appendChild(bar);
    scaleDiv.appendChild(indicator);
    scaleDiv.appendChild(tipText);
    
    // 特点描述
    const descDiv = document.createElement('div');
    descDiv.style.background = 'white';
    descDiv.style.padding = '20px';
    descDiv.style.borderRadius = '12px';
    descDiv.style.border = '1px solid #e5e7eb';
    
    const descTitle = document.createElement('div');
    descTitle.style.marginBottom = '12px';
    descTitle.style.fontSize = '16px';
    descTitle.style.color = isLeftPreferred ? config.leftColor : config.rightColor;
    descTitle.style.fontWeight = 'bold';
    descTitle.textContent = '💡 您的特点：';
    
    const descText = document.createElement('div');
    descText.style.fontSize = '15px';
    descText.style.color = '#374151';
    descText.style.lineHeight = '1.7';
    descText.textContent = isLeftPreferred ? config.leftDesc : config.rightDesc;
    
    const infoText = document.createElement('div');
    infoText.style.marginTop = '16px';
    infoText.style.padding = '12px';
    infoText.style.background = `${(isLeftPreferred ? config.leftColor : config.rightColor)}08`;
    infoText.style.borderRadius = '8px';
    infoText.style.borderLeft = `3px solid ${isLeftPreferred ? config.leftColor : config.rightColor}`;
    infoText.style.fontSize = '14px';
    infoText.style.color = '#6b7280';
    infoText.style.fontStyle = 'italic';
    infoText.textContent = `偏好强度：${preferredPercentage}% · 清晰度：${clarityLevel}`;
    
    descDiv.appendChild(descTitle);
    descDiv.appendChild(descText);
    descDiv.appendChild(infoText);
    
    // 组装卡片
    dimCard.appendChild(clarityBadge);
    dimCard.appendChild(title);
    dimCard.appendChild(balanceDiv);
    dimCard.appendChild(scaleDiv);
    dimCard.appendChild(descDiv);
    
    dimensionsGrid.appendChild(dimCard);
  });
  
  // 添加历史对比提示
  const tipDiv = document.createElement('div');
  tipDiv.style.cssText = `
    margin-top: 24px;
    padding: 16px;
    background: #f0f9ff;
    border: 1px solid #0ea5e9;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  const tipIcon = document.createElement('span');
  tipIcon.textContent = '💡';
  tipIcon.style.cssText = 'font-size: 16px;';
  const tipText = document.createElement('div');
  tipText.style.cssText = 'color: #0c4a6e; font-size: 14px;';
  tipText.textContent = '建议定期重新测评，追踪您的人格发展变化趋势';
  tipDiv.appendChild(tipIcon);
  tipDiv.appendChild(tipText);
  dimensionsGrid.parentElement.appendChild(tipDiv);
}

/**
 * 渲染类型详细描述
 */
function renderDescription() {
  const type = reportData.type;
  const typeInfo = TYPE_INFO[type] || TYPE_INFO['INTJ'];
  
  // 更新标题和副标题
  document.getElementById('descriptionTitle').innerHTML = `<span style="color: ${typeInfo.color};">👤</span> 了解您的性格特征`;
  document.getElementById('descriptionSubtitle').textContent = '深入了解您的个性特征和行为偏好';
  
  const descriptions = {
    'INTJ': '作为建筑师型人格，您是罕见的战略家和完美主义者。您具有卓越的长期规划能力，能够在复杂的信息中识别出核心模式，并构建系统性的解决方案。您的直觉思维让您能够预见未来趋势，而理性分析确保您的决策建立在坚实的逻辑基础上。您独立自主，更愿意单独工作以确保质量和效率，但在领导角色中也能展现出强大的组织协调能力。您对知识有着强烈的渴望，持续学习和自我完善是您的天性。',
    'INTP': '作为思想家型人格，您是天生的理论家和创新者。您拥有敏锐的分析思维，能够从不同角度解构复杂问题，发现其中的逻辑关系和潜在矛盾。您享受纯粹的思维活动，对抽象概念和理论框架有着特殊的兴趣。您的好奇心驱使您不断探索新的知识领域，但您更关注理解事物的本质而非实际应用。您独立思考，不轻易接受权威观点，更愿意通过自己的分析得出结论。',
    'ENTJ': '作为指挥官型人格，您是天生的领袖和组织者。您具有强烈的目标导向，能够制定长远的战略规划并有效执行。您的领导风格直接而有效，善于激发团队成员的潜能，推动整个组织向着共同目标前进。您在压力下表现出色，面对挑战时更加专注和高效。您具有卓越的系统思维，能够统筹全局，协调各种资源和人力。',
    'ENTP': '作为辩论家型人格，您是充满活力的创新者和思想启发者。您思维敏捷，能够快速建立不同概念之间的联系，产生新颖的想法和解决方案。您热爱智力辩论，享受探讨复杂问题的过程，能够从多个角度分析同一个问题。您的创造力源源不断，总是能够提出令人意外的观点和方法。',
    'INFJ': '作为提倡者型人格，您是理想主义者和深度思考者。您具有强烈的直觉洞察力，能够理解他人的深层动机和需求。您的价值体系根深蒂固，对正义、真理和人道主义有着坚定的信念。您善于从宏观角度看待问题，能够预见行动的长远后果。您在人际关系中表现出深度的同理心，能够给予他人温暖的支持和有价值的建议。',
    'INFP': '作为调停者型人格，您是温和的理想主义者和价值守护者。您的行为深受个人价值观的指导，始终寻求与内心信念一致的生活方式。您具有强烈的同理心，能够深刻理解他人的感受和处境。您富有创造力，经常通过艺术、写作或其他形式表达内心的想法和情感。您追求真实和意义，不愿为了外在的成功而妥协核心价值。',
    'ENFJ': '作为主人公型人格，您是天生的教育者和激励者。您具有卓越的人际沟通能力，能够深刻理解他人的需求和潜力。您热衷于帮助他人成长和发展，经常在团队中扮演导师和支持者的角色。您的领导风格温暖而有感染力，能够激发团队成员的积极性和创造力。',
    'ENFP': '作为竞选者型人格，您是充满激情的创新者和人际关系建设者。您热情洋溢，能够感染周围的人，营造积极向上的氛围。您具有丰富的想象力，总是能够看到新的可能性和机会。您善于建立广泛的人际网络，享受与不同背景的人交流和合作。',
    'ISTJ': '作为物流师型人格，您是可靠的实干家和传统守护者。您具有强烈的责任感，总是认真对待承诺和义务。您重视稳定和秩序，擅长建立和维护有效的系统和流程。您的工作方式井然有序，注重细节，确保每个环节都能正确执行。',
    'ISFJ': '作为守卫者型人格，您是温暖的服务者和和谐维护者。您具有深刻的同理心，能够敏锐地感知他人的需求和情感变化。您乐于助人，经常主动为他人提供支持和帮助，即使这意味着牺牲自己的时间和精力。',
    'ESTJ': '作为总经理型人格，您是高效的管理者和执行专家。您具有强烈的组织能力，能够建立清晰的结构和流程来提高效率。您目标导向，专注于实现具体的成果和业绩。您的领导风格直接而明确，善于制定计划并确保团队按时完成任务。',
    'ESFJ': '作为执政官型人格，您是热情的协调者和关系建设者。您具有出色的人际交往能力，能够营造温暖友好的工作和生活环境。您关心他人的感受，善于察觉团队成员的情绪变化，并及时提供支持。',
    'ISTP': '作为鉴赏家型人格，您是实用的问题解决者和技能大师。您具有敏锐的观察力，能够快速理解事物的运作机制。您动手能力强，喜欢通过实践来学习和验证理论。您在面对紧急情况时保持冷静，能够迅速分析问题并找到有效的解决方案。',
    'ISFP': '作为探险家型人格，您是温和的艺术家和价值守护者。您具有丰富的内心世界，对美感和和谐有着敏锐的感知力。您的行为受到强烈的个人价值观指导，追求真实和意义的生活。',
    'ESTP': '作为企业家型人格，您是充满活力的行动派和机会把握者。您具有敏锐的现实感知力，能够快速识别环境中的变化和机遇。您行动力强，喜欢立即采取行动而非长时间规划。',
    'ESFP': '作为娱乐家型人格，您是热情的表演者和氛围营造者。您天生乐观，能够为周围的人带来快乐和正能量。您具有强烈的人际敏感度，能够快速感知他人的情绪并给予适当回应。'
  };
  
  const descriptionContent = document.getElementById('descriptionContent');
  descriptionContent.style.background = `linear-gradient(135deg, ${typeInfo.color}08, ${typeInfo.color}03)`;
  descriptionContent.style.borderRadius = '12px';
  descriptionContent.style.padding = '24px';
  descriptionContent.style.border = `1px solid ${typeInfo.color}20`;
  descriptionContent.style.fontSize = '16px';
  descriptionContent.style.lineHeight = '1.8';
  descriptionContent.style.color = '#4b5563';
  descriptionContent.textContent = descriptions[type] || '您拥有独特的个性特征，值得深入探索和理解。';
}

/**
 * 渲染优势与劣势
 */
function renderStrengthsWeaknesses() {
  const type = reportData.type;
  const typeInfo = TYPE_INFO[type] || TYPE_INFO['INTJ'];
  
  // 优势数据
  const strengthsData = {
    'INTJ': [
      '战略性思维：能够制定长期规划，预见未来趋势和发展方向',
      '系统性分析：擅长将复杂问题分解为可管理的组件，构建整体解决方案',
      '独立执行：在最少监督下高质量完成复杂任务',
      '创新能力：能够跳出传统思维框架，提出突破性的想法和方法',
      '知识渴求：持续学习新技能和知识，不断提升专业能力',
      '质量导向：对工作成果有高标准要求，追求完美和卓越'
    ],
    'INTP': [
      '逻辑分析：具有强大的逻辑推理能力，能够发现思维中的矛盾和漏洞',
      '理论建构：善于建立抽象的理论框架，理解复杂概念之间的关系',
      '客观评估：能够客观地分析问题，不受偏见和情感因素影响',
      '创新思维：对新想法开放，能够从独特角度看待问题',
      '知识整合：能够将不同领域的知识有机结合，产生新的见解',
      '问题解决：在面对复杂技术问题时能够提供深刻的洞察'
    ],
    'ENTJ': [
      '领导才能：天生的领导者，能够激励团队朝着共同目标努力',
      '战略规划：擅长制定长期战略，统筹全局资源配置',
      '执行力强：能够将想法转化为具体行动，推动项目高效完成',
      '决策果断：在不确定环境下能够迅速做出明智决策',
      '组织协调：善于整合不同资源和人才，优化团队效能',
      '目标导向：专注于结果，能够在压力下保持高效工作状态'
    ],
    'ENTP': [
      '创新思维：思维敏捷，能够快速产生新颖的想法和解决方案',
      '适应能力：面对变化时能够快速调整策略和方向',
      '沟通技巧：善于表达复杂想法，能够说服和影响他人',
      '概念联结：能够看到不同概念之间的联系，进行跨领域思考',
      '学习能力：对新知识充满好奇，学习速度快且涉猎广泛',
      '团队催化：能够激发团队的创造力和积极性'
    ],
    'INFJ': [
      '直觉洞察：能够深刻理解他人的动机和未来发展趋势',
      '价值坚定：拥有清晰的价值体系，能够坚持正确的原则',
      '同理心强：能够深度理解他人的感受和需求',
      '长远视野：善于从长远角度思考问题的影响和后果',
      '创意表达：能够通过各种形式创造性地表达想法',
      '影响他人：能够激励他人追求更高的理想和目标'
    ],
    'INFP': [
      '价值驱动：行为始终与个人价值观保持一致，具有强烈的真实性',
      '创造才能：在艺术、写作等创意领域表现出天赋',
      '深度同理：能够深刻理解他人的内心世界和情感需求',
      '灵活适应：在不违背核心价值的前提下能够灵活调整',
      '潜力发现：善于看到他人身上的优点和发展潜力',
      '真诚沟通：在人际交往中表现出真诚和温暖'
    ],
    'ENFJ': [
      '人际敏感：能够敏锐察觉他人的情绪变化和需求',
      '激励能力：善于发现并激发他人的潜能和积极性',
      '组织协调：能够有效组织团队，促进合作与和谐',
      '沟通表达：具有出色的口头和书面表达能力',
      '社会责任：对社会和他人福祉有强烈的使命感',
      '变革推动：能够推动积极的变化和改进'
    ],
    'ENFP': [
      '热情感染：能够用自己的热情感染和激励周围的人',
      '人际建设：善于建立广泛而深入的人际关系网络',
      '创意无限：想象力丰富，总是能够提出新颖的想法',
      '机会敏感：能够敏锐地发现新的机会和可能性',
      '学习热情：对新事物充满好奇，学习积极性高',
      '团队活力：为团队带来积极向上的氛围和能量'
    ],
    'ISTJ': [
      '可靠稳定：始终能够按时高质量完成承诺的任务',
      '细节专精：注重细节，确保工作的准确性和完整性',
      '系统思维：善于建立和维护有效的工作系统和流程',
      '经验积累：能够从过往经验中学习，避免重复错误',
      '责任担当：对工作和承诺有强烈的责任感',
      '持续改进：在稳定中寻求渐进式的改进和优化'
    ],
    'ISFJ': [
      '服务精神：乐于为他人提供帮助和支持',
      '细心周到：能够注意到他人容易忽视的重要细节',
      '和谐维护：善于维护团队和人际关系的和谐',
      '记忆出色：能够记住重要的人和事，体现关怀',
      '忠诚可靠：在人际关系中表现出高度的忠诚和可靠性',
      '实务操作：在具体的执行和操作任务上表现出色'
    ],
    'ESTJ': [
      '高效执行：能够有效管理时间和资源，提高工作效率',
      '组织管理：擅长建立清晰的组织结构和工作流程',
      '目标达成：专注于结果，能够推动团队实现既定目标',
      '决策明确：基于事实做出清晰明确的决定',
      '标准制定：能够建立和维护高质量的工作标准',
      '资源整合：善于协调和优化各种可用资源'
    ],
    'ESFJ': [
      '人际协调：能够有效协调不同观点，促进团队合作',
      '氛围营造：善于创造温暖友好的工作和生活环境',
      '需求感知：能够敏锐察觉他人的需求并及时响应',
      '沟通桥梁：在不同群体之间起到良好的沟通桥梁作用',
      '活动组织：在组织各类活动和聚会方面表现出色',
      '服务导向：从帮助他人中获得满足感和成就感'
    ],
    'ISTP': [
      '问题诊断：能够快速识别问题的根源并找到解决方案',
      '实践操作：动手能力强，善于通过实践学习和验证',
      '危机应对：在紧急情况下保持冷静，快速有效响应',
      '工具掌握：对各种工具和技术有天然的理解和掌握能力',
      '独立工作：能够在最少指导下独立完成复杂任务',
      '效率优化：善于找到最有效率的工作方法'
    ],
    'ISFP': [
      '艺术天赋：在美术、音乐、设计等艺术领域有天然优势',
      '价值坚持：能够在各种环境下坚持个人核心价值观',
      '同情理解：对他人的感受和困难有深刻的理解',
      '和谐追求：努力在各种环境中维护和谐的氛围',
      '细节敏感：对环境中的美感和细节变化非常敏感',
      '支持他人：默默为他人提供温暖的支持和鼓励'
    ],
    'ESTP': [
      '机会把握：能够敏锐发现并快速抓住各种机遇',
      '现实适应：对现实环境有敏锐的感知和适应能力',
      '压力应对：在高压环境下仍能保持最佳工作状态',
      '人际技巧：善于与各种类型的人建立良好关系',
      '学习实用：通过直接经验快速掌握实用技能',
      '团队活跃：为团队带来活力和积极的行动力'
    ],
    'ESFP': [
      '情绪感染：能够用积极的情绪感染和鼓舞他人',
      '人际敏感：对他人的情绪变化有敏锐的感知能力',
      '表达才能：在各种表达和表演活动中表现突出',
      '氛围营造：善于营造轻松愉快的工作和生活氛围',
      '体验学习：通过直接体验和互动获得最佳学习效果',
      '关系维护：重视并善于维护各种人际关系'
    ]
  };
  
  // 劣势数据
  const weaknessesData = {
    'INTJ': [
      '人际沟通：需要加强与他人的情感交流，提高团队协作效果',
      '细节执行：在关注大局的同时，注意重要细节的落实',
      '反馈接纳：保持开放态度，主动寻求和接受他人的建设性意见',
      '灵活调整：在坚持原则的同时，适当考虑现实约束和变化'
    ],
    'INTP': [
      '实际应用：将理论知识更多地转化为实际的解决方案',
      '任务完成：提高项目执行力，确保想法能够落地实施',
      '人际技巧：增强与他人的情感交流，建立更好的工作关系',
      '结构化工作：建立更有条理的工作方式和时间管理习惯'
    ],
    'ENTJ': [
      '耐心倾听：给予他人更多表达机会，平衡自己的主导倾向',
      '情感关怀：在追求目标的过程中更多关注团队成员的感受',
      '灵活决策：在制定决策时考虑更多变量和不同观点',
      '压力管理：避免给自己和他人施加过度压力'
    ],
    'ENTP': [
      '持续专注：提高对单一项目的持续关注和深入执行能力',
      '细节管理：加强对重要细节的关注和管理',
      '计划执行：制定更具体的行动计划并坚持执行',
      '情感敏感：更多关注他人的情感需求和反应'
    ],
    'INFJ': [
      '边界设定：学会设定合理边界，避免过度承担他人责任',
      '现实平衡：在理想主义和现实可行性之间找到平衡',
      '自我关怀：增加对自己需求的关注，避免过度自我牺牲',
      '开放表达：更主动地表达自己的想法和需求'
    ],
    'INFP': [
      '决断执行：提高决策效率，减少过度思考导致的拖延',
      '冲突处理：增强面对和解决冲突的能力和勇气',
      '结构规划：建立更有条理的工作和生活安排',
      '客观分析：在情感之外增加更多理性分析的视角'
    ],
    'ENFJ': [
      '个人需求：更多关注自己的需求，避免过度关注他人',
      '边界设定：学会合理拒绝，不承担过多责任',
      '客观评估：在做决定时增加更多客观和理性的考虑',
      '压力释放：建立有效的压力缓解和自我恢复机制'
    ],
    'ENFP': [
      '任务专注：提高对单一任务的持续专注能力',
      '细节管理：加强对重要细节的关注和跟踪',
      '计划遵循：制定计划后坚持执行，减少随意改变',
      '深度分析：在广度基础上增加思考的深度和系统性'
    ],
    'ISTJ': [
      '变化适应：增强面对不确定性和变化的适应能力',
      '创新思维：在稳定基础上增加创新和改进的尝试',
      '表达沟通：更主动地表达想法和参与团队讨论',
      '风险承担：在谨慎的基础上适当承担必要的风险'
    ],
    'ISFJ': [
      '自我表达：更勇敢地表达个人观点和需求',
      '变化拥抱：增强对新事物和变化的接受能力',
      '边界维护：学会合理拒绝过度要求，保护个人时间',
      '自信建设：提高自信心，更多展示个人能力和价值'
    ],
    'ESTJ': [
      '灵活思考：在既定方法之外探索新的可能性',
      '情感理解：增加对他人情感和感受的敏感度',
      '过程关注：在结果导向的同时关注过程的体验',
      '多元观点：主动倾听和考虑不同的观点和意见'
    ],
    'ESFJ': [
      '独立判断：增强独立思考和决策的能力',
      '冲突面对：提高处理分歧和冲突的勇气和技巧',
      '个人需求：更多关注和表达自己的需求和想法',
      '变化适应：增强面对变化和不确定性的能力'
    ],
    'ISTP': [
      '长期规划：加强对未来的规划和目标设定能力',
      '情感表达：更多地表达情感和与他人建立深度连接',
      '团队协作：增强与他人合作和沟通的主动性',
      '理论学习：在实践基础上增加理论知识的学习'
    ],
    'ISFP': [
      '主动表达：更积极地表达个人观点和需求',
      '计划组织：提高生活和工作的计划性和组织性',
      '冲突应对：增强面对冲突和压力的应对能力',
      '目标导向：设定更清晰的个人和职业发展目标'
    ],
    'ESTP': [
      '长期思考：增加对未来后果的考虑和长期规划',
      '深度分析：在行动之前增加更多的深度思考',
      '理论学习：补充理论知识，提高抽象思维能力',
      '情感敏感：更多关注自己和他人的情感需求'
    ],
    'ESFP': [
      '独立分析：提高独立思考和客观分析的能力',
      '长期规划：加强对未来的规划和准备',
      '深度专注：提高对单一任务的深度专注能力',
      '批判思维：在积极态度基础上增加批判性思考'
    ]
  };
  
  const strengths = strengthsData[type] || ['具备独特的个人优势'];
  const weaknesses = weaknessesData[type] || ['需要关注的发展领域'];
  
  // 渲染优势列表（带图标）
  const strengthsList = document.getElementById('strengthsList');
  strengthsList.innerHTML = '';
  strengths.forEach(strength => {
    const li = document.createElement('li');
    li.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
    `;
    
    const icon = document.createElement('div');
    icon.style.cssText = `
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #059669;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
    `;
    icon.innerHTML = '<span style="color: white; font-size: 12px;">✓</span>';
    
    const text = document.createElement('div');
    text.style.cssText = `
      font-size: 15px;
      line-height: 1.6;
      color: #1f2937;
      font-weight: 500;
      flex: 1;
    `;
    text.textContent = strength;
    
    li.appendChild(icon);
    li.appendChild(text);
    strengthsList.appendChild(li);
  });
  
  // 渲染成长空间列表（带图标）
  const weaknessesList = document.getElementById('weaknessesList');
  weaknessesList.innerHTML = '';
  weaknesses.forEach(weakness => {
    const li = document.createElement('li');
    li.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
    `;
    
    const icon = document.createElement('div');
    icon.style.cssText = `
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #d97706;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
    `;
    icon.innerHTML = '<span style="color: white; font-size: 12px;">💡</span>';
    
    const text = document.createElement('div');
    text.style.cssText = `
      font-size: 15px;
      line-height: 1.6;
      color: #1f2937;
      flex: 1;
    `;
    text.textContent = weakness;
    
    li.appendChild(icon);
    li.appendChild(text);
    weaknessesList.appendChild(li);
  });
}

/**
 * 渲染核心特质与行为模式
 */
function renderCoreTraits() {
  const type = reportData.type;
  const typeInfo = TYPE_INFO[type] || TYPE_INFO['INTJ'];
  const coreTraitsCollapse = document.getElementById('coreTraitsCollapse');
  coreTraitsCollapse.innerHTML = '';
  
  const traits = [
    {
      key: '1',
      label: '思维模式与决策风格',
      content: type.includes('T') 
        ? '您倾向于基于逻辑和客观分析来做决定，重视效率和结果。在处理问题时，您会优先考虑事实和数据，善于进行理性分析和批判性思考。'
        : '您倾向于基于价值观和对他人的影响来做决定，重视和谐与共识。在处理问题时，您会考虑各方感受，善于理解他人立场并寻求双赢方案。'
    },
    {
      key: '2',
      label: '信息处理方式',
      content: type.includes('S')
        ? '您更注重具体的事实和细节，喜欢实用的信息。您善于观察现实情况，重视经验和传统做法，倾向于循序渐进地处理事情。'
        : '您更关注可能性和概念，喜欢探索新的想法。您善于看到事物的潜在联系，重视创新和变化，倾向于跳跃性地思考问题。'
    },
    {
      key: '3',
      label: '能量来源与社交偏好',
      content: type.includes('E')
        ? '您从与他人的互动中获得能量，享受社交和外部刺激。您善于表达想法，喜欢团队合作，在群体环境中往往表现活跃。'
        : '您从独处和内心反思中获得能量，偏好安静和深度思考。您善于倾听和观察，喜欢一对一的深入交流，需要独处时间来恢复精力。'
    },
    {
      key: '4',
      label: '生活组织方式',
      content: type.includes('J')
        ? '您喜欢有计划、有结构的生活方式，重视时间管理和目标达成。您倾向于提前做决定，喜欢按部就班地完成任务，给人可靠稳定的印象。'
        : '您喜欢灵活、开放的生活方式，重视适应性和即时响应。您倾向于保持选择的开放性，善于处理突发情况，给人随和灵活的印象。'
    }
  ];
  
  traits.forEach(trait => {
    const panel = document.createElement('div');
    panel.className = 'core-trait-panel';
    panel.style.cssText = `
      margin-bottom: 16px;
      background: white;
      border-radius: 12px;
      border: 1px solid ${typeInfo.color}20;
      overflow: hidden;
    `;
    
    const header = document.createElement('div');
    header.className = 'core-trait-header';
    header.style.cssText = `
      padding: 16px 24px;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      background: ${typeInfo.color}08;
      transition: background 0.2s ease;
    `;
    header.onmouseenter = () => header.style.background = `${typeInfo.color}12`;
    header.onmouseleave = () => header.style.background = `${typeInfo.color}08`;
    
    const dot = document.createElement('div');
    dot.style.cssText = `
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${typeInfo.color};
    `;
    
    const label = document.createElement('strong');
    label.style.cssText = `
      font-size: 16px;
      color: #1f2937;
    `;
    label.textContent = trait.label;
    
    header.appendChild(dot);
    header.appendChild(label);
    
    const content = document.createElement('div');
    content.className = 'core-trait-content';
    content.style.cssText = `
      padding: 16px 24px;
      display: block;
      font-size: 15px;
      line-height: 1.7;
      color: #4b5563;
    `;
    content.textContent = trait.content;
    
    let isExpanded = true;
    header.addEventListener('click', () => {
      isExpanded = !isExpanded;
      content.style.display = isExpanded ? 'block' : 'none';
    });
    
    panel.appendChild(header);
    panel.appendChild(content);
    coreTraitsCollapse.appendChild(panel);
  });
}

/**
 * 渲染个性化发展建议
 */
function renderRecommendations() {
  const type = reportData.type;
  const typeInfo = TYPE_INFO[type] || TYPE_INFO['INTJ'];
  
  const careerData = {
    'INTJ': '作为INTJ型人格，您适合从事需要战略思维和系统分析的职业。推荐领域包括：战略咨询、系统架构设计、科研、投资分析、项目管理等。您可以在这些领域充分发挥您的长期规划能力和创新能力。',
    'INTP': '作为INTP型人格，您适合从事需要理论研究和逻辑分析的职业。推荐领域包括：科学研究、软件开发、数据分析、理论研究、技术咨询等。您可以在这些领域充分发挥您的逻辑思维和创新能力。',
    'ENTJ': '作为ENTJ型人格，您适合从事需要领导和管理能力的职业。推荐领域包括：企业管理、战略规划、投资银行、项目管理、创业等。您可以在这些领域充分发挥您的领导才能和执行能力。',
    'ENTP': '作为ENTP型人格，您适合从事需要创新和灵活性的职业。推荐领域包括：创业、咨询、产品开发、市场营销、投资等。您可以在这些领域充分发挥您的创新思维和适应能力。',
    'INFJ': '作为INFJ型人格，您适合从事需要深度理解和价值创造的工作。推荐领域包括：心理咨询、人力资源、教育、写作、非营利组织等。您可以在这些领域充分发挥您的同理心和洞察力。',
    'INFP': '作为INFP型人格，您适合从事需要创造力和价值导向的职业。推荐领域包括：写作、艺术设计、心理咨询、教育、非营利组织等。您可以在这些领域充分发挥您的创造力和同理心。',
    'ENFJ': '作为ENFJ型人格，您适合从事需要人际互动和激励他人的工作。推荐领域包括：教育、培训、人力资源、咨询、非营利组织管理等。您可以在这些领域充分发挥您的人际能力和激励能力。',
    'ENFP': '作为ENFP型人格，您适合从事需要创意和人际互动的职业。推荐领域包括：市场营销、公关、创意设计、教育培训、创业等。您可以在这些领域充分发挥您的创意和人际建设能力。',
    'ISTJ': '作为ISTJ型人格，您适合从事需要可靠性和系统性的职业。推荐领域包括：会计、审计、工程、管理、法律等。您可以在这些领域充分发挥您的责任感和系统思维。',
    'ISFJ': '作为ISFJ型人格，您适合从事需要细心和服务的职业。推荐领域包括：医疗护理、教育、人力资源、行政管理、客户服务等。您可以在这些领域充分发挥您的服务精神和细心周到。',
    'ESTJ': '作为ESTJ型人格，您适合从事需要管理和执行能力的职业。推荐领域包括：企业管理、项目管理、运营管理、法律、金融等。您可以在这些领域充分发挥您的组织能力和执行力。',
    'ESFJ': '作为ESFJ型人格，您适合从事需要人际协调和服务的职业。推荐领域包括：人力资源、客户服务、活动组织、教育培训、行政管理等。您可以在这些领域充分发挥您的协调能力和服务精神。',
    'ISTP': '作为ISTP型人格，您适合从事需要技术和问题解决能力的职业。推荐领域包括：工程技术、IT支持、机械维修、数据分析、质量控制等。您可以在这些领域充分发挥您的技术能力和问题解决能力。',
    'ISFP': '作为ISFP型人格，您适合从事需要创意和审美的职业。推荐领域包括：艺术设计、音乐、摄影、室内设计、时尚设计等。您可以在这些领域充分发挥您的创造力和审美能力。',
    'ESTP': '作为ESTP型人格，您适合从事需要行动和人际互动的职业。推荐领域包括：销售、创业、运动、表演、紧急服务等。您可以在这些领域充分发挥您的行动力和人际技巧。',
    'ESFP': '作为ESFP型人格，您适合从事需要表达和人际互动的职业。推荐领域包括：表演、销售、活动组织、客户服务、旅游等。您可以在这些领域充分发挥您的表达能力和人际敏感度。'
  };
  
  const recommendationsList = document.getElementById('recommendationsList');
  recommendationsList.innerHTML = '';
  
  const recommendations = reportData.recommendations || [
    '发挥您的核心优势，在合适的领域深耕发展',
    '保持开放心态，积极学习其他类型的优点',
    '在工作和生活中寻找符合您性格特点的环境',
    '定期进行自我反思，持续优化个人发展策略'
  ];
  
  recommendations.forEach((rec, index) => {
    const item = document.createElement('div');
    item.style.cssText = `
      display: flex;
      align-items: flex-start;
      width: 100%;
      gap: 16px;
      padding: 16px 0;
      ${index < recommendations.length - 1 ? 'border-bottom: 1px solid #f0f0f0;' : ''}
    `;
    
    const number = document.createElement('div');
    number.style.cssText = `
      width: 32px;
      height: 32px;
      background: ${typeInfo.color};
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: bold;
      flex-shrink: 0;
      margin-top: 2px;
    `;
    number.textContent = index + 1;
    
    const text = document.createElement('div');
    text.style.cssText = `
      font-size: 16px;
      line-height: 1.7;
      color: #1f2937;
      font-weight: 500;
      flex: 1;
    `;
    text.textContent = rec;
    
    item.appendChild(number);
    item.appendChild(text);
    recommendationsList.appendChild(item);
  });
}

/**
 * 导出报告
 */
function exportReport() {
  const reportText = generateReportText();
  const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MBTI报告_${reportData.type}_${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 生成报告文本
 */
function generateReportText() {
  const type = reportData.type;
  const typeInfo = TYPE_INFO[type] || TYPE_INFO['INTJ'];
  const completedAt = reportData.completedAt || new Date().toISOString();
  const date = new Date(completedAt);
  const dateStr = date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  let text = 'MBTI 迈尔斯-布里格斯类型指标 测评报告\n';
  text += '='.repeat(50) + '\n\n';
  
  text += `测评完成时间：${dateStr}\n\n`;
  text += `您的MBTI人格类型：${type}（${typeInfo.name}）\n`;
  text += `类型描述：${typeInfo.slogan}\n\n`;
  
  text += '维度得分详情：\n';
  text += '-'.repeat(50) + '\n';
  DIMENSION_ORDER.forEach(dimension => {
    const dimData = reportData.dimensions[dimension];
    if (dimData) {
      const config = DIMENSION_CONFIG[dimension];
      const leftPercentage = dimData.leftPercentage || 50;
      const rightPercentage = dimData.rightPercentage || 50;
      text += `${config.name}：${config.leftLabel} ${leftPercentage}% | ${config.rightLabel} ${rightPercentage}%\n`;
    }
  });
  
  text += '\n类型详细描述：\n';
  text += '-'.repeat(50) + '\n';
  const descriptionContent = document.getElementById('descriptionContent');
  text += descriptionContent.textContent + '\n';
  
  return text;
}

/**
 * 渲染生活工作场景建议
 */
function renderLifestyle() {
  const type = reportData.type;
  const typeInfo = TYPE_INFO[type] || TYPE_INFO['INTJ'];
  const lifestyleGrid = document.getElementById('lifestyleGrid');
  lifestyleGrid.innerHTML = '';
  lifestyleGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;';
  
  // 工作环境偏好卡片
  const workCard = createLifestyleCard(typeInfo, '💼 工作环境偏好', [
    { label: '🏢 理想办公环境', content: getWorkEnvironment(type) },
    { label: '👥 团队协作方式', content: getTeamStyle(type) },
    { label: '🎯 工作任务偏好', content: getTaskPreference(type) }
  ]);
  lifestyleGrid.appendChild(workCard);
  
  // 人际交往风格卡片
  const socialCard = createLifestyleCard(typeInfo, '🤝 人际交往风格', [
    { label: '👂 沟通交流偏好', content: getCommunicationStyle(type) },
    { label: '💫 关系建立策略', content: getRelationshipStrategy(type) },
    { label: '⚡ 改进建议', content: getImprovementTips(type) }
  ]);
  lifestyleGrid.appendChild(socialCard);
  
  // 学习发展建议卡片
  const learningCard = createLifestyleCard(typeInfo, '📚 学习发展建议', [
    { label: '🎯 最佳学习方式', content: getLearningMethod(type) },
    { label: '🛠️ 推荐工具和资源', content: getLearningTools(type) },
    { label: '🚀 发展重点领域', content: getDevelopmentAreas(type) }
  ]);
  lifestyleGrid.appendChild(learningCard);
}

/**
 * 创建生活场景卡片
 */
function createLifestyleCard(typeInfo, title, items) {
  const card = document.createElement('div');
  card.style.cssText = `
    background: linear-gradient(135deg, ${typeInfo.color}08, #ffffff);
    border-radius: 16px;
    padding: 24px;
    border: 1px solid ${typeInfo.color}20;
  `;
  
  const cardTitle = document.createElement('h4');
  cardTitle.style.cssText = `
    color: ${typeInfo.color};
    font-size: 20px;
    margin: 0 0 20px 0;
  `;
  cardTitle.textContent = title;
  card.appendChild(cardTitle);
  
  items.forEach(item => {
    const panel = document.createElement('div');
    panel.style.cssText = 'margin-bottom: 16px;';
    
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px;
      background: ${typeInfo.color}08;
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 8px;
    `;
    const headerText = document.createElement('strong');
    headerText.style.cssText = `color: ${typeInfo.color}; font-size: 14px;`;
    headerText.textContent = item.label;
    header.appendChild(headerText);
    
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 12px;
      font-size: 14px;
      line-height: 1.6;
      color: #4b5563;
      display: block;
    `;
    content.innerHTML = item.content.split('\n').map(line => `<div style="margin-bottom: 4px;">${line}</div>`).join('');
    
    let isExpanded = true;
    header.addEventListener('click', () => {
      isExpanded = !isExpanded;
      content.style.display = isExpanded ? 'block' : 'none';
    });
    
    panel.appendChild(header);
    panel.appendChild(content);
    card.appendChild(panel);
  });
  
  return card;
}

/**
 * 获取工作环境描述
 */
function getWorkEnvironment(type) {
  const envs = {
    'INTJ': '• 独立的私人办公空间或安静的开放区域\n• 最少的干扰和会议，专注时间充裕\n• 高质量的设备和工具支持\n• 灵活的工作时间安排\n• 书籍和资料丰富的学习环境',
    'INTP': '• 灵活自由的工作空间布局\n• 可以随时调整的座位和设备\n• 充足的思考时间，少量紧急任务\n• 安静的讨论区域\n• 丰富的信息资源和数据库访问',
    'ENTJ': '• 现代化的办公设施和会议室\n• 高效的沟通和协作工具\n• 战略规划专用空间\n• 便于领导团队的开放布局\n• 成果展示和汇报的专业环境',
    'ENTP': '• 活跃多样的协作空间\n• 创意讨论和头脑风暴区域\n• 灵活可变的工作安排\n• 丰富的交流和社交机会\n• 鼓励创新的开放文化氛围',
    'INFJ': '• 安静和谐的个人工作空间\n• 温馨舒适的环境设计\n• 支持深度思考的私密区域\n• 自然光线和植物装饰\n• 体现组织价值观的文化元素',
    'INFP': '• 个性化和温馨的工作环境\n• 艺术装饰和创意元素\n• 灵活的工作时间和地点\n• 尊重个人价值观的组织文化\n• 鼓励创意表达的氛围',
    'ENFJ': '• 便于团队互动的开放空间\n• 温暖友好的环境氛围\n• 培训和发展专用区域\n• 展示团队成就的空间\n• 支持人际关系建设的设施',
    'ENFP': '• 充满活力的多彩工作空间\n• 灵活多变的座位安排\n• 社交和休闲相结合的区域\n• 鼓励创意的装饰和设计\n• 便于即兴讨论的开放空间',
    'ISTJ': '• 整洁有序的传统办公环境\n• 固定的个人工作位置\n• 完善的文件管理系统\n• 清晰的工作流程标识\n• 稳定可靠的技术设备',
    'ISFJ': '• 温馨和谐的团队工作环境\n• 便于互助合作的空间布局\n• 舒适的休息和交流区域\n• 体现关怀文化的环境设计\n• 支持服务他人的工作设施',
    'ESTJ': '• 高效规范的办公环境\n• 清晰的层级和区域划分\n• 先进的管理和监控系统\n• 专业的会议和汇报设施\n• 成果导向的环境设计',
    'ESFJ': '• 友好温暖的团队工作空间\n• 便于协作和沟通的布局\n• 舒适的员工休息区域\n• 庆祝和表彰的展示空间\n• 支持团队建设的设施',
    'ISTP': '• 实用功能性的工作环境\n• 充足的工具和设备支持\n• 独立的技术操作空间\n• 灵活的工作时间安排\n• 少量的会议和社交要求',
    'ISFP': '• 美观舒适的个人工作空间\n• 自然元素和艺术装饰\n• 灵活自主的工作安排\n• 尊重个人节奏的环境\n• 体现人文关怀的设计',
    'ESTP': '• 动态活跃的工作环境\n• 便于快速行动的空间布局\n• 丰富的人际互动机会\n• 即时反馈和沟通的设施\n• 充满变化和挑战的氛围',
    'ESFP': '• 轻松愉快的工作氛围\n• 色彩丰富的环境设计\n• 便于团队协作的开放空间\n• 庆祝和娱乐的专用区域\n• 鼓励表达和分享的文化'
  };
  return envs[type] || '• 舒适专业的工作环境\n• 支持个人特长发挥的设施\n• 体现组织文化的设计\n• 便于协作和沟通的空间\n• 促进个人发展的氛围';
}

/**
 * 获取团队协作方式
 */
function getTeamStyle(type) {
  const styles = {
    'INTJ': '• 偏好小规模的专业团队合作\n• 重视深度讨论和战略规划\n• 期望明确的角色分工和责任\n• 喜欢基于专业能力的协作\n• 需要充分的准备时间',
    'INTP': '• 享受思想交流和理论探讨\n• 偏好非正式的协作方式\n• 重视逻辑分析和客观讨论\n• 需要独立思考的时间和空间\n• 贡献创新想法和解决方案',
    'ENTJ': '• 天然的团队领导者和组织者\n• 善于制定目标和推动执行\n• 重视效率和结果导向\n• 能够协调不同资源和人员\n• 期望明确的权威和决策权',
    'ENTP': '• 活跃的创意贡献者和催化剂\n• 善于激发团队创新思维\n• 喜欢多样化的协作项目\n• 能够建立广泛的合作网络\n• 需要灵活的合作形式',
    'INFJ': '• 关注团队和谐和长期发展\n• 善于理解不同成员的需求\n• 偏好深度的一对一交流\n• 能够提供有价值的洞察\n• 致力于实现共同的理想',
    'INFP': '• 重视价值观一致的团队合作\n• 善于支持和鼓励他人\n• 偏好和谐的协作氛围\n• 能够从独特角度贡献想法\n• 需要真诚和尊重的环境',
    'ENFJ': '• 天然的团队建设者和激励者\n• 善于发现和培养他人潜能\n• 能够协调不同观点和冲突\n• 重视团队成员的共同成长\n• 致力于创造积极的团队文化',
    'ENFP': '• 充满热情的团队活跃分子\n• 善于激发团队创造力\n• 能够建立广泛的人际关系\n• 喜欢多样化的合作项目\n• 为团队带来积极的能量',
    'ISTJ': '• 可靠的团队执行者和支撑者\n• 重视明确的流程和标准\n• 善于维护团队稳定性\n• 认真完成分配的任务\n• 偏好有组织的团队结构',
    'ISFJ': '• 温暖的团队支持者和协调者\n• 善于关注每个成员的需求\n• 能够维护团队和谐氛围\n• 主动提供帮助和支持\n• 重视团队的凝聚力',
    'ESTJ': '• 高效的团队管理者和推动者\n• 善于制定和执行团队目标\n• 重视明确的角色和责任\n• 能够协调资源和优化流程\n• 专注于团队绩效和成果',
    'ESFJ': '• 积极的团队协调者和组织者\n• 善于促进团队沟通和合作\n• 能够营造友好的工作氛围\n• 关注每个成员的参与度\n• 重视团队的整体福祉',
    'ISTP': '• 独立的问题解决者和技术专家\n• 偏好基于技能的合作\n• 能够在需要时提供专业支持\n• 重视实际效果和效率\n• 需要相对独立的工作空间',
    'ISFP': '• 和谐的团队支持者和贡献者\n• 善于在幕后提供帮助\n• 能够带来独特的创意视角\n• 重视团队的价值观一致\n• 需要被尊重和认可的环境',
    'ESTP': '• 活跃的团队行动者和协调者\n• 善于应对紧急情况和挑战\n• 能够快速适应团队动态\n• 喜欢实际操作和即时行动\n• 为团队带来灵活性和活力',
    'ESFP': '• 热情的团队氛围营造者\n• 善于激发团队积极性\n• 能够协调人际关系和冲突\n• 重视团队的快乐和满意度\n• 为团队带来温暖和正能量'
  };
  return styles[type] || '• 重视团队协作和沟通\n• 能够发挥个人专长\n• 适应团队文化和节奏\n• 贡献独特的价值\n• 促进团队目标达成';
}

/**
 * 获取工作任务偏好
 */
function getTaskPreference(type) {
  const prefs = {
    'INTJ': '• 长期战略规划和系统设计\n• 复杂问题的分析和解决\n• 创新方案的研发和实施\n• 独立负责的重要项目\n• 具有深远影响的工作内容',
    'INTP': '• 理论研究和概念分析\n• 复杂系统的逻辑建构\n• 创新想法的探索和验证\n• 技术难题的深度分析\n• 自主探索的研究项目',
    'ENTJ': '• 组织战略制定和执行\n• 团队领导和资源管理\n• 商业机会的识别和开发\n• 变革管理和流程优化\n• 具有挑战性的管理任务',
    'ENTP': '• 创新项目的启动和推进\n• 多样化的合作和交流\n• 新概念的探索和应用\n• 跨领域的整合和连接\n• 充满变化的挑战性任务',
    'INFJ': '• 有意义的价值创造工作\n• 他人发展和成长的支持\n• 长期愿景的规划和实现\n• 深度洞察的分析和分享\n• 体现个人使命的项目',
    'INFP': '• 符合价值观的创意项目\n• 个人表达和创作工作\n• 帮助他人实现潜能的任务\n• 灵活自主的工作安排\n• 体现个人意义的内容',
    'ENFJ': '• 团队发展和人才培养\n• 组织文化建设和推进\n• 他人成长的指导和支持\n• 积极变化的推动和实现\n• 体现社会价值的工作',
    'ENFP': '• 创意项目的策划和执行\n• 人际关系的建设和维护\n• 新机会的发现和开发\n• 多样化的工作内容\n• 充满可能性的探索任务',
    'ISTJ': '• 结构化的执行和管理任务\n• 详细流程的制定和优化\n• 质量标准的维护和监控\n• 可靠稳定的日常运营\n• 基于经验的改进工作',
    'ISFJ': '• 服务他人的具体工作\n• 团队支持和协助任务\n• 细节管理和质量保证\n• 关怀他人的日常工作\n• 维护和谐的协调任务',
    'ESTJ': '• 目标明确的管理任务\n• 效率提升的项目执行\n• 资源优化和流程改进\n• 绩效监控和质量管理\n• 结果导向的实施工作',
    'ESFJ': '• 团队协调和组织工作\n• 人际关系的建设和维护\n• 服务他人的具体任务\n• 活动策划和执行工作\n• 和谐氛围的营造任务',
    'ISTP': '• 技术问题的实际解决\n• 工具设备的操作和维护\n• 实用技能的应用和发展\n• 独立执行的技术项目\n• 效率优化的实践工作',
    'ISFP': '• 创意表达的艺术项目\n• 个人价值的体现工作\n• 和谐环境的营造任务\n• 他人支持的具体工作\n• 美感体验的创造项目',
    'ESTP': '• 即时行动的紧急任务\n• 人际互动的销售工作\n• 变化应对的灵活项目\n• 实际操作的执行任务\n• 充满挑战的动态工作',
    'ESFP': '• 人际互动的服务工作\n• 团队氛围的营造任务\n• 创意表达的娱乐项目\n• 即时反馈的互动工作\n• 快乐分享的传播任务'
  };
  return prefs[type] || '• 发挥个人优势的任务\n• 体现专业价值的工作\n• 符合兴趣方向的项目\n• 具有成长机会的内容\n• 创造积极影响的任务';
}

/**
 * 获取沟通交流偏好
 */
function getCommunicationStyle(type) {
  const styles = {
    'INTJ': '• 偏好深度的一对一交流\n• 重视逻辑性和结构化的对话\n• 需要时间思考后再回应\n• 直接表达观点，不喜欢委婉\n• 更关注内容而非情感表达',
    'INTP': '• 享受理论探讨和概念辩论\n• 重视准确性和逻辑一致性\n• 可能在情感表达上较为含蓄\n• 喜欢探索不同的观点和可能性\n• 需要足够的思考时间',
    'ENTJ': '• 直接高效的沟通风格\n• 关注目标和结果导向的对话\n• 善于表达想法和影响他人\n• 可能显得过于直接或权威\n• 重视效率胜过情感细腻度',
    'ENTP': '• 活跃热情的交流方式\n• 享受思想碰撞和创意分享\n• 善于从不同角度看问题\n• 有时可能忽视他人的感受\n• 喜欢挑战传统观点',
    'INFJ': '• 深入细致的情感交流\n• 善于理解他人的深层需求\n• 偏好私密安全的对话环境\n• 能够提供有洞察力的建议\n• 可能在大群体中较为安静',
    'INFP': '• 真诚温暖的交流风格\n• 重视价值观和情感的表达\n• 善于倾听和理解他人\n• 可能在冲突时选择回避\n• 需要被理解和接纳的环境',
    'ENFJ': '• 温暖支持的沟通方式\n• 善于察觉和回应他人情绪\n• 能够激励和鼓舞他人\n• 有时可能过度关注他人需求\n• 自然地承担指导者角色',
    'ENFP': '• 热情开放的交流风格\n• 善于发现他人的优点和潜力\n• 能够轻松建立新的联系\n• 有时可能缺乏深度的持续关注\n• 喜欢分享想法和可能性',
    'ISTJ': '• 实际可靠的沟通方式\n• 重视事实和具体信息\n• 偏好传统和正式的交流\n• 需要时间建立信任关系\n• 在熟悉的环境中更加开放',
    'ISFJ': '• 关怀体贴的交流风格\n• 善于记住他人的重要细节\n• 主动关心他人的需求\n• 可能不善于表达个人需求\n• 营造和谐温暖的交流氛围',
    'ESTJ': '• 直接务实的沟通风格\n• 重视明确的信息和指示\n• 善于组织和协调讨论\n• 可能在情感敏感度上需要提升\n• 关注实际结果和效率',
    'ESFJ': '• 友好合作的交流方式\n• 善于促进群体和谐\n• 关注每个人的参与和感受\n• 可能过分依赖他人认可\n• 主动维护人际关系',
    'ISTP': '• 简洁实用的沟通风格\n• 更多通过行动而非语言表达\n• 在专业领域更加健谈\n• 可能在情感表达上较为含蓄\n• 偏好实际的交流内容',
    'ISFP': '• 温和友善的交流方式\n• 善于理解他人的感受\n• 可能在表达个人观点时较为谨慎\n• 重视和谐和相互尊重\n• 需要支持性的交流环境',
    'ESTP': '• 活跃直接的沟通风格\n• 善于适应不同的交流环境\n• 能够快速建立轻松的氛围\n• 可能在深度情感交流上需要发展\n• 喜欢实际和即时的交流',
    'ESFP': '• 热情洋溢的交流方式\n• 善于营造轻松愉快的氛围\n• 能够让他人感到舒适和被接纳\n• 重视情感表达和人际连接\n• 喜欢分享和互动'
  };
  return styles[type] || '• 重视真诚的交流\n• 适应不同的沟通环境\n• 善于表达个人观点\n• 关注他人的需求\n• 促进有效的沟通';
}

/**
 * 获取关系建立策略
 */
function getRelationshipStrategy(type) {
  const strategies = {
    'INTJ': '• 通过专业能力和知识建立威信\n• 寻找志同道合的深度伙伴\n• 在小圈子中建立信任关系\n• 提供有价值的洞察和建议\n• 保持适度的社交距离',
    'INTP': '• 在学术或专业领域寻找同伴\n• 通过分享知识和见解建立联系\n• 欣赏能够理解复杂思维的人\n• 给予他人思考空间和自由\n• 逐步深化有意义的关系',
    'ENTJ': '• 通过领导能力和成就建立影响力\n• 寻找能够共同实现目标的伙伴\n• 在专业网络中建立战略关系\n• 提供指导和发展机会\n• 平衡任务导向与人际关怀',
    'ENTP': '• 通过创意和热情吸引他人\n• 在多样化的环境中建立广泛联系\n• 寻找能够进行智力交流的伙伴\n• 保持关系的新鲜感和活力\n• 平衡广度与深度的关系',
    'INFJ': '• 通过深度理解和同理心建立信任\n• 寻找价值观一致的真诚伙伴\n• 在安全环境中逐步开放自己\n• 提供深刻的洞察和支持\n• 维护少数但深入的关系',
    'INFP': '• 通过真诚和温暖建立情感连接\n• 寻找理解和接纳自己的人\n• 在价值观契合的基础上建立关系\n• 给予他人无条件的支持\n• 需要相互尊重的关系基础',
    'ENFJ': '• 通过关怀和支持建立深厚关系\n• 主动了解和满足他人需求\n• 在团队中发挥凝聚作用\n• 帮助他人发现和发展潜能\n• 创造包容温暖的关系环境',
    'ENFP': '• 通过热情和积极态度感染他人\n• 在社交活动中主动建立新联系\n• 发现每个人的独特价值\n• 保持关系的活力和成长\n• 平衡新关系与深度维护',
    'ISTJ': '• 通过可靠性和忠诚建立长期关系\n• 在熟悉的环境中逐步建立信任\n• 重视承诺和责任的履行\n• 提供稳定的支持和帮助\n• 维护传统的关系模式',
    'ISFJ': '• 通过关怀和服务建立温暖关系\n• 主动关注他人的需求和感受\n• 在支持他人中建立深厚联系\n• 创造和谐安全的关系环境\n• 重视长期稳定的关系',
    'ESTJ': '• 通过专业能力和效率建立尊重\n• 在工作和目标导向的环境中建立关系\n• 提供实际的帮助和支持\n• 组织和协调团队活动\n• 重视明确的角色和责任',
    'ESFJ': '• 通过热情和关怀建立广泛关系\n• 主动促进群体和谐与团结\n• 记住并关注每个人的重要事情\n• 组织社交活动增进关系\n• 寻求他人的认可和反馈',
    'ISTP': '• 通过实际技能和帮助建立关系\n• 在共同兴趣和活动中建立联系\n• 提供实用的支持和解决方案\n• 尊重他人的独立性和空间\n• 通过行动而非言语表达关怀',
    'ISFP': '• 通过真诚和理解建立深层连接\n• 在艺术或价值观相关的环境中建立关系\n• 提供温暖的支持和鼓励\n• 创造美好和和谐的互动体验\n• 需要被尊重和认可的环境',
    'ESTP': '• 通过活力和幽默建立轻松关系\n• 在活动和体验中建立联系\n• 提供即时的帮助和支持\n• 适应不同的社交环境\n• 保持关系的活跃和动态',
    'ESFP': '• 通过快乐和温暖建立广泛关系\n• 在社交活动中主动建立联系\n• 让每个人感到被接纳和重视\n• 分享积极的情感和体验\n• 创造充满乐趣的互动环境'
  };
  return strategies[type] || '• 建立真诚的人际关系\n• 发挥个人独特优势\n• 适应不同的社交环境\n• 维护长期稳定的联系\n• 创造积极的互动体验';
}

/**
 * 获取改进建议
 */
function getImprovementTips(type) {
  const tips = {
    'INTJ': '• 主动参与专业社交活动和会议\n• 学会表达对他人成就的认可\n• 在批评时注意方式和语气\n• 适当分享个人经历增进关系\n• 定期主动联系重要的人',
    'INTP': '• 练习更清晰地表达复杂想法\n• 学会倾听他人的情感需求\n• 主动参与团队建设活动\n• 增加非正式的社交互动\n• 及时回应他人的沟通',
    'ENTJ': '• 增加对他人情感的关注和理解\n• 学会耐心倾听不同的观点\n• 在推进目标时考虑他人感受\n• 给予团队成员更多自主权\n• 表达对他人贡献的感谢',
    'ENTP': '• 深化重要关系的质量和深度\n• 学会关注他人的情感反应\n• 在激烈讨论中保持对他人的尊重\n• 定期维护已建立的关系\n• 在承诺时考虑实际执行能力',
    'INFJ': '• 适度扩展社交圈子和活动\n• 学会表达个人需求和边界\n• 在给予支持的同时保护自己\n• 主动分享个人想法和感受\n• 寻找价值观相似的群体',
    'INFP': '• 增强表达个人观点的勇气\n• 学会建设性地处理冲突\n• 主动寻求他人的反馈和建议\n• 在团队中更积极地参与\n• 设定明确的个人边界',
    'ENFJ': '• 学会关注和表达个人需求\n• 设定合理的帮助他人的边界\n• 在关怀他人时不忽视自己\n• 学会说"不"和合理拒绝\n• 寻求他人的支持和帮助',
    'ENFP': '• 加深重要关系的持续维护\n• 学会专注于长期的人际投资\n• 在热情之外增加深度的理解\n• 培养耐心处理关系冲突\n• 平衡新关系与老朋友的关注',
    'ISTJ': '• 主动参与团队的社交活动\n• 学会表达个人情感和想法\n• 适应新的社交环境和方式\n• 增加与不同类型人的接触\n• 在稳定基础上尝试新的关系',
    'ISFJ': '• 学会表达个人需求和想法\n• 在关怀他人时不忽视自己\n• 增强面对冲突的勇气\n• 寻求他人的理解和支持\n• 培养独立判断的能力',
    'ESTJ': '• 增加对他人情感的敏感度\n• 学会耐心倾听不同的观点\n• 在效率之外关注关系的质量\n• 表达对他人感受的理解\n• 适当放慢节奏关注过程',
    'ESFJ': '• 增强独立思考和判断能力\n• 学会在和谐之外坚持原则\n• 减少对外部认可的依赖\n• 培养处理冲突的技能\n• 关注个人成长和发展',
    'ISTP': '• 主动表达关怀和情感\n• 增加与他人的语言交流\n• 参与更多的团队协作活动\n• 学会寻求他人的情感支持\n• 分享个人想法和经验',
    'ISFP': '• 增强表达个人观点的自信\n• 学会在和谐之外坚持立场\n• 主动参与团队讨论和决策\n• 寻求反馈并接受建设性批评\n• 培养面对冲突的勇气',
    'ESTP': '• 培养深度情感交流的能力\n• 学会倾听他人的深层需求\n• 在行动之前增加思考时间\n• 建立稳定长期的关系\n• 关注关系的深度而非仅仅广度',
    'ESFP': '• 培养独立思考和分析能力\n• 学会处理关系中的困难和冲突\n• 在快乐之外关注关系的深度\n• 增加对他人深层需求的理解\n• 建立更稳定持久的关系'
  };
  return tips[type] || '• 保持开放和学习的心态\n• 适应不同的人际交往方式\n• 平衡个人需求与他人需求\n• 持续发展人际交往技能\n• 建立健康的人际边界';
}

/**
 * 获取最佳学习方式
 */
function getLearningMethod(type) {
  const methods = {
    'INTJ': '• 自主深度学习：制定长期学习计划\n• 系统性研究：从理论到实践的完整体系\n• 独立思考：大量阅读和反思时间\n• 概念整合：将不同领域知识连接\n• 实际应用：验证理论的实用价值',
    'INTP': '• 探索式学习：跟随好奇心自由探索\n• 理论深度：深入理解概念和原理\n• 逻辑分析：质疑和验证知识的准确性\n• 跨领域思考：寻找不同学科的联系\n• 独立研究：有充分的思考和分析时间',
    'ENTJ': '• 目标导向学习：明确学习的战略价值\n• 高效获取：快速掌握关键知识点\n• 实用为先：重视知识的直接应用\n• 结构化安排：有组织的学习计划\n• 成果展示：将学习转化为可见成就',
    'ENTP': '• 多样化学习：接触各种不同的知识领域\n• 创新思维：寻找新的学习方法和工具\n• 互动讨论：通过辩论加深理解\n• 概念连接：发现知识间的新联系\n• 项目驱动：通过实际项目应用所学',
    'INFJ': '• 意义导向学习：选择有价值的学习内容\n• 深度反思：充分的思考和内化时间\n• 整体视角：理解知识的全局意义\n• 个人连接：将学习与个人经历结合\n• 渐进深入：由浅入深的学习过程',
    'INFP': '• 兴趣驱动学习：从个人热情出发\n• 个性化路径：按照自己的节奏学习\n• 价值契合：选择符合价值观的内容\n• 创意表达：通过创作巩固学习\n• 内在动机：保持学习的内在热情',
    'ENFJ': '• 互动式学习：通过讨论和合作学习\n• 应用导向：关注知识如何帮助他人\n• 分享交流：在教授他人中加深理解\n• 实践结合：将理论应用于实际情境\n• 持续反馈：寻求他人的意见和建议',
    'ENFP': '• 体验式学习：通过实际体验获得知识\n• 社交学习：在人际互动中学习\n• 多媒体结合：使用各种学习媒介\n• 创意项目：通过创造性项目学习\n• 灵活安排：保持学习的趣味性',
    'ISTJ': '• 系统化学习：按照传统方法循序渐进\n• 重复练习：通过反复练习掌握技能\n• 权威资源：选择可靠的学习材料\n• 规律安排：建立固定的学习时间\n• 细节关注：注重学习的准确性',
    'ISFJ': '• 结构化学习：在有组织的环境中学习\n• 实用导向：关注学习对工作的帮助\n• 支持环境：寻求友好的学习氛围\n• 经验学习：从实际经验中获得知识\n• 渐进提升：稳步提高学习水平',
    'ESTJ': '• 目标明确学习：设定清晰的学习目标\n• 效率优先：选择最有效的学习方法\n• 实际应用：重视知识的实用价值\n• 组织化管理：建立完善的学习系统\n• 成果评估：定期检验学习效果',
    'ESFJ': '• 合作学习：在团队中共同学习\n• 互动交流：通过讨论加深理解\n• 反馈导向：重视他人的评价和建议\n• 应用实践：将学习应用于实际工作\n• 支持他人：在帮助他人中学习',
    'ISTP': '• 实践操作学习：通过动手实践掌握技能\n• 个人节奏：按照自己的速度学习\n• 技术专精：深入学习技术性知识\n• 问题解决：通过解决实际问题学习\n• 工具应用：熟练掌握各种学习工具',
    'ISFP': '• 个性化学习：根据个人兴趣定制内容\n• 创意结合：将艺术和创意融入学习\n• 价值导向：选择有意义的学习内容\n• 自由探索：在宽松环境中自主学习\n• 感受体验：通过感官体验加深印象',
    'ESTP': '• 体验式学习：在实际情境中学习\n• 即时应用：立即实践所学知识\n• 活跃互动：通过活动和游戏学习\n• 多样变化：保持学习内容的新鲜感\n• 社交学习：在与他人互动中学习',
    'ESFP': '• 互动学习：在愉快氛围中与他人学习\n• 多感官体验：使用视听触等多种感官\n• 情感连接：将情感融入学习过程\n• 即时反馈：获得及时的学习反馈\n• 社群分享：在学习社群中交流心得'
  };
  return methods[type] || '• 发现适合自己的学习方式\n• 保持持续的学习动机\n• 将学习与实际应用结合\n• 寻求他人的支持和反馈\n• 建立有效的学习习惯';
}

/**
 * 获取推荐工具和资源
 */
function getLearningTools(type) {
  const tools = {
    'INTJ': '• 知识管理：Notion、Obsidian、Roam Research\n• 深度阅读：Kindle、学术数据库、专业期刊\n• 计划工具：Todoist、Microsoft Project\n• 思维导图：MindMeister、XMind\n• 在线课程：Coursera、edX、专业认证课程',
    'INTP': '• 研究工具：Zotero、Mendeley、学术搜索引擎\n• 编程学习：GitHub、Stack Overflow、技术博客\n• 思考记录：Roam Research、Logseq\n• 理论学习：Khan Academy、MIT OpenCourseWare\n• 讨论平台：Reddit学术版块、专业论坛',
    'ENTJ': '• 项目管理：Asana、Trello、Monday.com\n• 商业学习：Harvard Business Review、LinkedIn Learning\n• 数据分析：Tableau、Excel高级功能\n• 领导力发展：TED Talks、管理培训课程\n• 网络建设：LinkedIn、行业会议和研讨会',
    'ENTP': '• 创意工具：Miro、Figma、MindMeister\n• 在线学习：Udemy、Skillshare、YouTube教程\n• 讨论平台：Discord学习群、Clubhouse\n• 项目协作：Slack、Microsoft Teams\n• 趋势跟踪：Feedly、Twitter学术账号',
    'INFJ': '• 反思记录：Day One、Journey日记应用\n• 深度学习：MasterClass、Great Courses\n• 冥想应用：Headspace、Calm\n• 价值观探索：人格测试、自我发现课程\n• 写作工具：Scrivener、Ulysses',
    'INFP': '• 创意工具：Canva、Adobe Creative Suite\n• 个人发展：Headspace、个人成长播客\n• 写作平台：Medium、个人博客\n• 艺术学习：Skillshare创意课程、YouTube艺术频道\n• 价值观资源：哲学课程、人文学科内容',
    'ENFJ': '• 协作平台：Zoom、Google Workspace\n• 教学工具：Kahoot、Mentimeter\n• 人际发展：情商课程、沟通技巧培训\n• 社交学习：学习小组、读书会\n• 分享平台：LinkedIn、专业博客',
    'ENFP': '• 创意应用：Pinterest、Instagram学习账号\n• 社交学习：Facebook学习群、Discord\n• 多媒体工具：Canva、视频编辑软件\n• 灵感收集：Pocket、Evernote\n• 在线社区：Reddit学习版块、学习论坛',
    'ISTJ': '• 传统教材：大学教科书、权威参考书\n• 结构化课程：传统在线大学课程、认证项目\n• 管理工具：Excel、项目管理软件\n• 重复练习：Anki记忆卡片、练习题库\n• 权威资源：政府网站、官方文档',
    'ISFJ': '• 友好平台：Khan Academy、Duolingo\n• 实用技能：职业培训课程、实用技能网站\n• 支持社区：学习伙伴、温和的学习环境\n• 记录工具：简单的笔记应用、学习日志\n• 实践应用：志愿服务、实习机会',
    'ESTJ': '• 效率工具：Microsoft Office、Google Workspace\n• 商业资源：商学院课程、行业报告\n• 管理培训：领导力课程、项目管理认证\n• 数据工具：Excel高级功能、商业智能工具\n• 网络平台：LinkedIn、专业协会',
    'ESFJ': '• 社交学习：学习小组、在线社区\n• 互动课程：直播课程、研讨会\n• 协作工具：Google Docs、共享文档\n• 反馈平台：课程评价系统、同伴反馈\n• 实用应用：工作相关培训、生活技能课程',
    'ISTP': '• 技术平台：GitHub、技术博客、开源项目\n• 实践工具：在线实验室、模拟器\n• 视频教程：YouTube技术频道、实操视频\n• 工具学习：软件教程、硬件手册\n• 问题解决：Stack Overflow、技术论坛',
    'ISFP': '• 创意平台：Behance、Dribbble、艺术社区\n• 个人节奏：自学平台、灵活课程\n• 美学学习：设计课程、艺术史资源\n• 创作工具：数字艺术软件、音乐制作工具\n• 价值观资源：心理学课程、人文学科',
    'ESTP': '• 体验平台：VR学习、实地考察\n• 即时应用：移动学习应用、微学习\n• 社交工具：学习聚会、现场工作坊\n• 游戏化学习：教育游戏、竞赛平台\n• 实践机会：实习、志愿服务、项目参与',
    'ESFP': '• 社交平台：Facebook学习群、Instagram教育账号\n• 多媒体学习：视频课程、播客、音频内容\n• 互动工具：直播课程、在线研讨会\n• 娱乐学习：教育游戏、趣味应用\n• 分享空间：学习博客、社交媒体分享'
  };
  return tools[type] || '• 选择适合的学习平台和工具\n• 利用现代科技提升学习效率\n• 建立个人知识管理系统\n• 寻找优质的学习资源\n• 保持学习工具的更新升级';
}

/**
 * 获取发展重点领域
 */
function getDevelopmentAreas(type) {
  const areas = {
    'INTJ': '• 系统思维：学习复杂系统设计和架构\n• 战略规划：提升长期规划和预测能力\n• 跨学科整合：连接不同领域的知识\n• 实施能力：将理论转化为实际方案\n• 沟通表达：提升向他人解释复杂概念的能力',
    'INTP': '• 理论建构：深化抽象思维和逻辑分析\n• 研究方法：掌握科学研究和分析方法\n• 知识整合：将碎片化知识系统化\n• 实践应用：加强理论与实践的结合\n• 合作技能：提升与他人协作的能力',
    'ENTJ': '• 领导艺术：提升团队管理和激励技能\n• 战略思维：发展长期规划和决策能力\n• 商业洞察：深化对市场和商业的理解\n• 人际技能：增强情商和沟通能力\n• 创新管理：学习如何推动组织创新',
    'ENTP': '• 创新思维：培养跳出框架的思考能力\n• 执行力：提升将想法转化为行动的能力\n• 深度专精：在广度基础上发展专业深度\n• 项目管理：学习有效管理复杂项目\n• 影响力：增强说服和影响他人的技能',
    'INFJ': '• 洞察力：深化对人性和社会的理解\n• 咨询技能：提升帮助他人发展的能力\n• 系统思考：理解复杂问题的深层结构\n• 创意表达：通过各种方式表达内在洞察\n• 边界管理：学会在帮助他人时保护自己',
    'INFP': '• 价值澄清：深化对个人价值观的理解\n• 创意发展：培养各种形式的创造能力\n• 沟通技巧：提升表达个人观点的能力\n• 项目管理：学会将创意转化为具体成果\n• 冲突解决：发展处理分歧的技能',
    'ENFJ': '• 人才发展：提升识别和培养他人潜能的能力\n• 组织建设：学习构建高效团队和文化\n• 沟通艺术：深化各种情境下的沟通技巧\n• 变革管理：掌握推动积极变化的方法\n• 自我关怀：学会在关怀他人时保护自己',
    'ENFP': '• 创意开发：将创新想法转化为实际价值\n• 专注技能：提升长期专注于重要事务的能力\n• 人际建设：深化建立和维护关系的技能\n• 项目完成：增强将项目进行到底的能力\n• 情绪管理：学会处理挫折和保持动力',
    'ISTJ': '• 质量管理：提升标准制定和质量控制能力\n• 流程优化：学习改进现有系统和流程\n• 变化适应：增强面对变化的灵活性\n• 团队协作：提升在团队中的协作技能\n• 创新思维：在稳定基础上培养创新能力',
    'ISFJ': '• 服务技能：提升帮助和支持他人的专业能力\n• 沟通表达：增强表达个人需求和想法的能力\n• 冲突处理：学会处理人际关系中的分歧\n• 自信建设：提升自我认知和自信心\n• 变化适应：增强面对新环境的适应能力',
    'ESTJ': '• 管理技能：提升团队管理和组织协调能力\n• 效率优化：学习提升组织和个人效率的方法\n• 情商发展：增强理解和回应他人情感的能力\n• 创新管理：学会在稳定中推动创新\n• 长期规划：提升战略思维和远期规划能力',
    'ESFJ': '• 协调技能：提升团队协调和冲突解决能力\n• 组织管理：学习高效组织活动和管理资源\n• 个人发展：在关注他人的同时发展自己\n• 独立判断：增强独立思考和决策的能力\n• 压力管理：学会处理工作和人际压力',
    'ISTP': '• 技术专精：深化在特定技术领域的专业能力\n• 问题诊断：提升快速识别和解决问题的技能\n• 系统思维：理解复杂系统的运作原理\n• 沟通技能：增强向他人解释技术概念的能力\n• 团队合作：提升在团队中发挥技术专长的能力',
    'ISFP': '• 创意表达：发展各种艺术和创意表达技能\n• 价值实现：学会将个人价值转化为实际行动\n• 自信建设：提升表达个人观点的勇气和技巧\n• 目标设定：学会设定和追求具体的发展目标\n• 影响力：增强通过创意工作影响他人的能力',
    'ESTP': '• 机会识别：提升发现和把握机会的敏锐度\n• 应变能力：增强在变化环境中的适应和应对能力\n• 关系建设：深化建立和维护各种关系的技能\n• 长期思维：在即时行动基础上增加长期考虑\n• 专业发展：在灵活性基础上建立专业优势',
    'ESFP': '• 氛围营造：提升创造积极环境和激励他人的能力\n• 关系管理：深化理解和协调各种人际关系\n• 情感智能：增强理解和回应他人情感的技巧\n• 目标导向：学会设定和追求具体的发展目标\n• 压力处理：提升应对挑战和挫折的能力'
  };
  return areas[type] || '• 发展核心专业技能\n• 提升人际交往能力\n• 增强问题解决技巧\n• 培养领导和影响力\n• 建立持续学习习惯';
}

/**
 * 渲染压力应对与成长路径
 */
function renderStressGrowth() {
  const type = reportData.type;
  const typeInfo = TYPE_INFO[type] || TYPE_INFO['INTJ'];
  const stressGrowthContent = document.getElementById('stressGrowthContent');
  stressGrowthContent.innerHTML = '';
  stressGrowthContent.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;';
  
  // 压力反应模式
  const stressCard = document.createElement('div');
  stressCard.style.cssText = `
    padding: 24px;
    background: #fef7f0;
    border-radius: 12px;
    border: 1px solid #fb923c20;
  `;
  const stressTitle = document.createElement('h4');
  stressTitle.style.cssText = 'color: #ea580c; margin: 0 0 16px 0; display: flex; align-items: center; gap: 8px;';
  stressTitle.innerHTML = '<span>💡</span> <span>压力反应模式</span>';
  const stressText = document.createElement('div');
  stressText.style.cssText = 'font-size: 15px; line-height: 1.7; color: #4b5563;';
  stressText.textContent = getStressPattern(type);
  stressCard.appendChild(stressTitle);
  stressCard.appendChild(stressText);
  stressGrowthContent.appendChild(stressCard);
  
  // 成长路径指南
  const growthCard = document.createElement('div');
  growthCard.style.cssText = `
    padding: 24px;
    background: #f0fdf4;
    border-radius: 12px;
    border: 1px solid #22c55e20;
  `;
  const growthTitle = document.createElement('h4');
  growthTitle.style.cssText = 'color: #059669; margin: 0 0 16px 0; display: flex; align-items: center; gap: 8px;';
  growthTitle.innerHTML = '<span>🚀</span> <span>成长路径指南</span>';
  const growthText = document.createElement('div');
  growthText.style.cssText = 'font-size: 15px; line-height: 1.7; color: #4b5563;';
  growthText.textContent = getGrowthPath(type);
  growthCard.appendChild(growthTitle);
  growthCard.appendChild(growthText);
  stressGrowthContent.appendChild(growthCard);
}

/**
 * 获取压力反应模式
 */
function getStressPattern(type) {
  const patterns = {
    'INTJ': '在压力下可能变得过度批判和完美主义，倾向于独自承担所有责任。可能出现过度分析和犹豫不决的情况。应对建议：寻求他人的支持和不同观点，设定现实可行的目标，适当放松对细节的控制。',
    'INTP': '压力下可能变得散漫和拖延，失去对时间的控制。可能出现过度怀疑和分析瘫痪。应对建议：建立明确的优先级和截止期限，寻求实际的行动指导，避免完美主义倾向。',
    'ENTJ': '压力下可能变得控制欲强烈和不耐烦，对他人要求过高。可能忽视自己和他人的情感需求。应对建议：学会委托和信任他人，定期进行情感检查，寻求平衡工作与休息。',
    'ENTP': '压力下可能变得散漫和冲动，难以专注于单一任务。可能出现过度承诺和时间管理困难。应对建议：学会说"不"，建立结构化的工作流程，寻求外部的组织支持。',
    'INFJ': '压力下可能变得过度敏感和自我批评，倾向于承担过多责任。可能出现情感过载和身体疲惫。应对建议：设定健康的边界，寻求情感支持，定期进行自我关怀活动。',
    'INFP': '压力下可能变得情绪化和退缩，避免冲突和决策。可能出现自我怀疑和拖延。应对建议：寻找安全的表达环境，建立支持网络，学会渐进式的问题解决方法。',
    'ENFJ': '压力下可能过度关注他人需求而忽视自己，容易情感耗竭。可能变得过于控制和焦虑。应对建议：学会自我关怀，设定个人边界，寻求他人的支持而非总是给予支持。',
    'ENFP': '压力下可能变得情绪波动和注意力分散，难以坚持计划。可能出现过度承诺和精力透支。应对建议：建立优先级系统，寻求结构化支持，学会管理能量而非时间。',
    'ISTJ': '压力下可能变得过度谨慎和抗拒变化，坚持既有方法。可能出现过度担忧和身体紧张。应对建议：逐步适应变化，寻求可靠的支持系统，学会灵活应对不确定性。',
    'ISFJ': '压力下可能过度自责和担心他人，容易被他人的需求压倒。可能变得过于谨慎和犹豫。应对建议：学会表达个人需求，寻求他人的理解，建立自信心和决策能力。',
    'ESTJ': '压力下可能变得过于控制和急躁，对效率有不现实的期望。可能忽视他人的感受和需求。应对建议：学会放慢节奏，关注过程而非仅仅结果，增强情感智能。',
    'ESFJ': '压力下可能过度担心他人的看法，容易被批评影响。可能变得过于迁就和失去个人立场。应对建议：建立内在的价值认同，学会处理冲突，寻求平衡他人期望与个人需求。',
    'ISTP': '压力下可能变得冷漠和退缩，避免情感表达和人际接触。可能出现过度内向和沟通困难。应对建议：寻找实际的问题解决方式，主动寻求他人支持，学会表达情感需求。',
    'ISFP': '压力下可能变得过度敏感和自我怀疑，避免冲突和决策。可能出现情感波动和创造力下降。应对建议：创造安全的表达空间，寻求温和的支持，通过创意活动缓解压力。',
    'ESTP': '压力下可能变得冲动和不安，寻求即时的解脱方式。可能忽视长期后果和他人感受。应对建议：学会暂停和反思，寻求平衡的活动，建立健康的压力释放方式。',
    'ESFP': '压力下可能变得过度情绪化和寻求外部认可，避免独处和深度思考。可能出现注意力分散。应对建议：学会独处和自我反思，寻找稳定的支持关系，建立情感调节技能。'
  };
  return patterns[type] || '每个人在压力下都有独特的反应模式，了解并接受这些反应是成长的第一步。';
}

/**
 * 获取成长路径指南
 */
function getGrowthPath(type) {
  const paths = {
    'INTJ': '发展情感智能和人际技能，学会表达感受和建立深度关系。培养灵活性，在坚持愿景的同时适应变化。通过教导他人来深化自己的理解，寻找有意义的导师关系。',
    'INTP': '将理论知识转化为实际应用，通过项目实践来验证想法。发展沟通技能，学会清晰地表达复杂概念。建立支持网络，寻找能够理解和挑战自己思维的伙伴。',
    'ENTJ': '培养耐心和倾听技能，学会欣赏不同的观点和方法。发展情感敏感度，关注决策对他人的影响。通过指导他人来提升领导能力，学会授权和信任。',
    'ENTP': '发展执行力和持续性，学会将创意转化为具体成果。培养深度专注能力，在广泛探索与深入钻研之间找到平衡。通过与他人合作来实现想法，学会团队协作。',
    'INFJ': '学会设定健康边界，平衡理想主义与现实可行性。发展自我关怀技能，避免过度付出。通过写作或其他形式分享洞察，寻找志同道合的社群。',
    'INFP': '发展决策能力和执行力，学会在不完美的情况下采取行动。培养冲突处理技能，勇敢地表达个人需求。通过创意表达来处理情感，寻找支持性的环境。',
    'ENFJ': '学会关注个人需求，在给予和接受之间找到平衡。发展客观分析能力，在情感之外增加理性考量。通过自我反思来理解个人动机，避免过度干预他人。',
    'ENFP': '培养专注力和深度思考能力，学会完成开始的项目。发展结构化思维，建立有效的组织系统。通过反思来深化经验，寻找持续的导师关系。',
    'ISTJ': '培养适应变化的能力，在稳定基础上接受新的可能性。发展创新思维，学会质疑传统方法。通过分享经验来帮助他人，建立更广泛的人际网络。',
    'ISFJ': '发展自信心和自我表达能力，学会坚持个人立场。培养变化适应能力，在服务他人的同时关注个人成长。通过领导小型项目来建立领导技能。',
    'ESTJ': '培养灵活性和创新思维，学会欣赏不同的工作方式。发展情感智能，增强对他人需求的敏感度。通过倾听和反思来提升领导效果，寻求多元化的反馈。',
    'ESFJ': '发展独立判断能力，学会在和谐与原则之间取得平衡。培养批判性思维，质疑外部期望。通过个人兴趣的探索来建立自我认同，寻求个人空间。',
    'ISTP': '发展长期规划能力，学会设定和追求未来目标。培养情感表达技能，建立更深入的人际关系。通过教导他人来分享技能，寻找团队合作机会。',
    'ISFP': '发展目标设定和规划能力，学会将价值观转化为具体行动。培养自信表达技能，勇敢地分享个人观点。通过小步骤的成功来建立成就感，寻找支持性的环境。',
    'ESTP': '发展长期思维和规划能力，学会考虑行动的长远后果。培养反思技能，通过经验总结来深化学习。建立稳定的关系，寻求深度的情感连接。',
    'ESFP': '发展独立思考和分析能力，学会客观评估情况。培养长期规划技能，设定个人发展目标。通过安静的活动来平衡社交需求，寻求深度的自我了解。'
  };
  return paths[type] || '成长是一个持续的过程，关键是找到适合自己的发展路径，在舒适区的基础上逐步扩展。';
}

/**
 * 渲染理解与应用
 */
function renderUnderstanding() {
  const type = reportData.type;
  const typeInfo = TYPE_INFO[type] || TYPE_INFO['INTJ'];
  const understandingContent = document.getElementById('understandingContent');
  
  understandingContent.innerHTML = `
    <div style="padding: 24px; background: rgba(255, 255, 255, 0.8); border-radius: 12px; margin-bottom: 24px;">
      <div style="font-size: 16px; line-height: 1.8; color: #4b5563; margin-bottom: 20px;">
        恭喜您完成了MBTI人格类型测评！通过这次深度探索，您现在更好地了解了自己的性格特征。
        作为<strong style="color: ${typeInfo.color}">${type}型人格（${typeInfo.name}）</strong>，
        您拥有独特的思维方式和行为模式。
      </div>
      <div style="padding: 20px; background: ${typeInfo.color}10; border-radius: 8px; border-left: 4px solid ${typeInfo.color}; margin-bottom: 20px;">
        <div style="margin-bottom: 12px; font-style: italic; color: ${typeInfo.color}; font-weight: 600; font-size: 16px;">
          记住：MBTI是理解自己的工具，而不是限制您的标签
        </div>
        <div style="font-size: 15px; color: #374151; line-height: 1.7;">
          <div style="margin-bottom: 8px;">• 拥抱您的自然偏好，它们是您的核心优势所在</div>
          <div style="margin-bottom: 8px;">• 保持成长心态，在不同情境中灵活运用各种能力</div>
          <div style="margin-bottom: 8px;">• 与不同类型的人交流合作，拓展视野和能力边界</div>
          <div>• 将MBTI作为自我发展的指南，而非固化的定义</div>
        </div>
      </div>
      <div style="padding: 16px; background: #e6f7ff; border-radius: 8px; border-left: 4px solid #1890ff; margin-bottom: 16px; font-size: 14px; color: #6b7280;">
        <strong>科学性提醒：</strong>本测评基于<strong>93道标准化题目</strong>，采用MBTI Step I基础量表的科学方法。
        请将结果作为自我认知和发展的参考，结合实际情况灵活运用。
        人格会随着经历和成长而发展，建议定期重新评估。
      </div>
      <div style="text-align: center; color: ${typeInfo.color}; font-style: italic; font-weight: 500; font-size: 17px; padding: 16px; background: ${typeInfo.color}08; border-radius: 8px;">
        愿这份报告帮助您更好地理解和发展自己，在人生路上发现更多可能性 ✨
      </div>
    </div>
  `;
}

/**
 * 显示/隐藏加载提示
 */
function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay');
  overlay.style.display = show ? 'flex' : 'none';
}

/**
 * 绑定重新测试按钮事件
 */
function bindRestartButton() {
  const restartButton = document.getElementById('restartButton');
  if (restartButton) {
    restartButton.addEventListener('click', () => {
      // 获取token（从URL参数或window.linkValidator）
      const urlParams = new URLSearchParams(window.location.search);
      let token = urlParams.get('token');
      
      // 如果URL中没有token，尝试从window.linkValidator获取
      if (!token && window.linkValidator && window.linkValidator.token) {
        token = window.linkValidator.token;
      }
      
      // 构建跳转URL（需要包含token以便SDK验证）
      let indexUrl = 'index.html';
      if (token) {
        const queryParams = new URLSearchParams();
        queryParams.set('token', token);
        queryParams.set('restart', 'true'); // 标记为重新测试
        
        // 检查是否是无限测试模式
        const isUnlimited = urlParams.get('unlimited') === 'true';
        if (isUnlimited) {
          queryParams.set('unlimited', 'true');
        }
        
        const queryString = queryParams.toString();
        if (queryString) {
          indexUrl = `${indexUrl}?${queryString}`;
        }
      }
      
      window.location.href = indexUrl;
    });
  }
}

