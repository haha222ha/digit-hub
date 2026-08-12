/**
 * Holland 报告页面逻辑
 * 完全独立的实现，不依赖任何外部框架
 */

import { DIMENSION_ORDER, DIMENSION_NAMES } from '../data/questions.js';
import { getTestResult } from './utils/storage.js';

// 报告数据
let reportData = null;

// Holland Code颜色配置
const TYPE_COLORS = {
  R: { color: '#10b981', bg: '#ecfdf5', gradient: 'linear-gradient(135deg, #10b981, #14b8a6)' },
  I: { color: '#6366f1', bg: '#eef2ff', gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)' },
  A: { color: '#ec4899', bg: '#fdf2f8', gradient: 'linear-gradient(135deg, #ec4899, #f472b6)' },
  S: { color: '#f59e0b', bg: '#fffbeb', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)' },
  E: { color: '#ef4444', bg: '#fef2f2', gradient: 'linear-gradient(135deg, #ef4444, #f87171)' },
  C: { color: '#3b82f6', bg: '#eff6ff', gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa)' }
};

// 类型图标
const TYPE_ICONS = {
  R: '🔧',
  I: '🔬',
  A: '🎨',
  S: '🤝',
  E: '💼',
  C: '📊'
};

// 类型基本信息
const TYPE_INFO = {
  R: {
    name: '实际型',
    description: '喜欢使用工具、机器，进行实际操作。倾向于从事需要动手能力、体力或技能的工作。',
    traits: ['务实', '坦率', '诚实', '谦逊', '动手能力强', '喜欢户外'],
    suitable: '工程师、技师、建筑工人、机械操作员、农民、电工'
  },
  I: {
    name: '研究型',
    description: '喜欢观察、学习、研究、分析问题。倾向于从事需要思考、分析和探索的工作。',
    traits: ['理性', '好奇', '独立', '精确', '善于分析', '逻辑思维强'],
    suitable: '科学家、研究员、医生、程序员、数据分析师、实验室技术员'
  },
  A: {
    name: '艺术型',
    description: '喜欢创作、设计、表演等艺术活动。倾向于从事需要创造力和想象力的工作。',
    traits: ['创造', '感性', '直觉', '独立', '想象力丰富', '追求美感'],
    suitable: '艺术家、设计师、作家、音乐家、摄影师、导演'
  },
  S: {
    name: '社会型',
    description: '喜欢与人交往、帮助他人、服务社会。倾向于从事需要人际互动和服务的工作。',
    traits: ['友善', '热情', '负责', '善解人意', '乐于助人', '同理心强'],
    suitable: '教师、护士、心理咨询师、社工、人力资源、客服'
  },
  E: {
    name: '企业型',
    description: '喜欢影响他人、组织管理、追求成就。倾向于从事需要领导和管理能力的工作。',
    traits: ['自信', '有野心', '说服力强', '精力充沛', '领导力', '冒险精神'],
    suitable: '企业家、经理、销售、律师、政治家、市场营销'
  },
  C: {
    name: '传统型',
    description: '喜欢有规则的、系统化的工作。倾向于从事需要精确性和规范性的工作。',
    traits: ['细心', '有条理', '忠诚', '保守', '追求稳定', '注重细节'],
    suitable: '会计、秘书、银行职员、档案管理员、行政人员、审计师'
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
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const resultData = getTestResult();
    
    if (!resultData || !resultData.result) {
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
    
    // 调试：检查数据
    console.log('Report data:', reportData);
    console.log('TypeInfo:', reportData?.typeInfo);
    
    if (!reportData) {
      throw new Error('报告数据为空');
    }
    
    renderReport();
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
  renderHollandCode();
  renderDimensions();
  // 初始化重新测试按钮
  initializeRestartButton();
  renderCombination();
  renderPrimaryType();
  renderCareers();
  renderDevelopment();
  renderLearning();
  renderCareersDetail();
  renderDeepAnalysis();
  renderDevelopmentPath();
  renderFAQ();
  renderUnderstanding();
  renderFooterInfo();
  // 不再手动调用 renderAdminGuide()，因为SDK会自动添加推广链接到 .report-footer
  // renderAdminGuide();
}

/**
 * 渲染Holland Code展示区
 */
function renderHollandCode() {
  const hollandCode = reportData.hollandCode || '---';
  const primaryType = reportData.primaryType || 'R';
  const sortedDims = reportData.sortedDimensions || [];
  
  const primaryColor = TYPE_COLORS[primaryType] || TYPE_COLORS.R;
  const section = document.getElementById('hollandCodeSection');
  section.style.background = primaryColor.gradient;
  
  document.getElementById('hollandCode').textContent = hollandCode;
  
  // 渲染三个类型
  const codeTypes = document.getElementById('codeTypes');
  if (sortedDims.length >= 3) {
    const types = sortedDims.slice(0, 3);
    codeTypes.innerHTML = types.map((dim, idx) => {
      const icon = TYPE_ICONS[dim.key] || '🔧';
      const typeInfo = reportData.typeInfo?.[idx === 0 ? 'primary' : idx === 1 ? 'secondary' : 'tertiary'] || TYPE_INFO[dim.key];
      const name = typeInfo?.name || dim.name;
      return `${icon} ${name} (${dim.key})`;
    }).join(' · ');
  } else {
    codeTypes.textContent = '';
  }
  
  // 渲染主类型描述
  const codeDesc = document.getElementById('codeDescription');
  const primaryInfo = reportData.typeInfo?.primary || TYPE_INFO[primaryType];
  if (primaryInfo) {
    codeDesc.textContent = primaryInfo.description || '';
  }
  
  // 渲染日期
  const completedAt = reportData.completedAt || new Date().toISOString();
  const date = new Date(completedAt);
  const dateStr = date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  document.getElementById('codeDate').textContent = `测试完成时间：${dateStr} | 基于90题科学评估`;
}

/**
 * 渲染六维度得分详情
 */
function renderDimensions() {
  const dimensionsGrid = document.getElementById('dimensionsGrid');
  dimensionsGrid.innerHTML = '';
  
  const sortedDims = reportData.sortedDimensions || [];
  
  sortedDims.forEach((dim, index) => {
    const config = TYPE_COLORS[dim.key] || TYPE_COLORS.R;
    const typeInfo = TYPE_INFO[dim.key];
    const isFirst = index === 0;
    const isTopThree = index < 3;
    
    const dimCard = document.createElement('div');
    dimCard.className = 'dimension-card';
    dimCard.style.background = isFirst ? `linear-gradient(135deg, ${config.bg}, #ffffff)` : config.bg;
    dimCard.style.borderRadius = '16px';
    dimCard.style.padding = '24px';
    dimCard.style.border = isFirst ? `3px solid ${config.color}` : `2px solid ${config.color}30`;
    dimCard.style.position = 'relative';
    dimCard.style.boxShadow = isFirst ? '0 10px 25px -5px rgba(0, 0, 0, 0.15)' : 'none';
    
    // 排名标签
    const rankBadge = document.createElement('div');
    rankBadge.style.position = 'absolute';
    rankBadge.style.top = '16px';
    rankBadge.style.right = '16px';
    rankBadge.style.background = isFirst ? config.color : (isTopThree ? config.color : '#9ca3af');
    rankBadge.style.color = 'white';
    rankBadge.style.padding = isFirst ? '6px 16px' : '4px 12px';
    rankBadge.style.borderRadius = '12px';
    rankBadge.style.fontSize = '12px';
    rankBadge.style.fontWeight = '600';
    rankBadge.textContent = (isFirst ? '🏆 ' : '') + `第${index + 1}位`;
    
    // 类型图标和名称
    const headerDiv = document.createElement('div');
    headerDiv.style.marginBottom = '16px';
    
    const iconDiv = document.createElement('div');
    iconDiv.style.fontSize = isFirst ? '40px' : '32px';
    iconDiv.style.marginBottom = '8px';
    iconDiv.textContent = TYPE_ICONS[dim.key] || '🔧';
    
    const nameDiv = document.createElement('h4');
    nameDiv.style.margin = '0 0 8px 0';
    nameDiv.style.fontSize = '20px';
    nameDiv.style.fontWeight = '600';
    nameDiv.style.color = '#1f2937';
    nameDiv.textContent = dim.name;
    
    const descDiv = document.createElement('p');
    descDiv.style.fontSize = '14px';
    descDiv.style.color = '#6b7280';
    descDiv.style.lineHeight = '1.7';
    descDiv.style.margin = '8px 0 0 0';
    if (typeInfo) {
      descDiv.textContent = typeInfo.description;
    }
    
    headerDiv.appendChild(iconDiv);
    headerDiv.appendChild(nameDiv);
    headerDiv.appendChild(descDiv);
    
    // 进度条
    const progressDiv = document.createElement('div');
    progressDiv.style.marginBottom = '16px';
    
    const progressBar = document.createElement('div');
    progressBar.style.width = '100%';
    progressBar.style.height = isFirst ? '12px' : '10px';
    progressBar.style.background = '#f0f0f0';
    progressBar.style.borderRadius = '6px';
    progressBar.style.overflow = 'hidden';
    
    const progressFill = document.createElement('div');
    progressFill.style.height = '100%';
    progressFill.style.width = dim.percentage + '%';
    progressFill.style.background = config.color;
    progressFill.style.transition = 'width 0.3s ease';
    
    progressBar.appendChild(progressFill);
    
    const progressInfo = document.createElement('div');
    progressInfo.style.marginTop = '12px';
    progressInfo.style.display = 'flex';
    progressInfo.style.justifyContent = 'space-between';
    progressInfo.style.alignItems = 'center';
    
    const levelTag = document.createElement('span');
    levelTag.style.padding = '4px 12px';
    levelTag.style.borderRadius = '8px';
    levelTag.style.fontSize = '13px';
    levelTag.style.fontWeight = '600';
    levelTag.style.background = config.color;
    levelTag.style.color = 'white';
    levelTag.style.border = 'none';
    levelTag.textContent = (dim.level || '中等') + '兴趣';
    
    const percentText = document.createElement('span');
    percentText.style.fontSize = '15px';
    percentText.style.color = config.color;
    percentText.style.fontWeight = '600';
    percentText.textContent = dim.percentage + '%';
    
    progressInfo.appendChild(levelTag);
    progressInfo.appendChild(percentText);
    
    progressDiv.appendChild(progressBar);
    progressDiv.appendChild(progressInfo);
    
    // 性格特质
    if (typeInfo && typeInfo.traits) {
      const traitsDiv = document.createElement('div');
      traitsDiv.style.paddingTop = '16px';
      traitsDiv.style.borderTop = `1px solid ${config.color}20`;
      
      const traitsLabel = document.createElement('div');
      traitsLabel.style.fontSize = '13px';
      traitsLabel.style.color = '#6b7280';
      traitsLabel.style.fontWeight = '600';
      traitsLabel.style.marginBottom = '10px';
      traitsLabel.textContent = '🎯 性格特质';
      
      const traitsList = document.createElement('div');
      traitsList.style.display = 'flex';
      traitsList.style.flexWrap = 'wrap';
      traitsList.style.gap = '8px';
      
      typeInfo.traits.forEach(trait => {
        const traitTag = document.createElement('span');
        traitTag.style.padding = '4px 10px';
        traitTag.style.borderRadius = '6px';
        traitTag.style.fontSize = '12px';
        traitTag.style.background = isTopThree ? 'white' : '#fafafa';
        traitTag.style.color = config.color;
        traitTag.style.border = `1px solid ${config.color}40`;
        traitTag.textContent = trait;
        traitsList.appendChild(traitTag);
      });
      
      traitsDiv.appendChild(traitsLabel);
      traitsDiv.appendChild(traitsList);
      dimCard.appendChild(traitsDiv);
    }
    
    // 职业方向
    if (typeInfo && typeInfo.suitable) {
      const careerDiv = document.createElement('div');
      careerDiv.style.marginTop = '16px';
      careerDiv.style.padding = '14px';
      careerDiv.style.background = isTopThree ? 'white' : '#fafafa';
      careerDiv.style.borderRadius = '10px';
      careerDiv.style.border = `2px solid ${config.color}30`;
      
      const careerLabel = document.createElement('div');
      careerLabel.style.fontSize = '13px';
      careerLabel.style.color = config.color;
      careerLabel.style.fontWeight = '600';
      careerLabel.style.marginBottom = '8px';
      careerLabel.textContent = '💼 适合职业方向';
      
      const careerText = document.createElement('div');
      careerText.style.fontSize = '13px';
      careerText.style.color = '#4b5563';
      careerText.style.lineHeight = '1.7';
      careerText.textContent = typeInfo.suitable;
      
      careerDiv.appendChild(careerLabel);
      careerDiv.appendChild(careerText);
      dimCard.appendChild(careerDiv);
    }
    
    dimCard.appendChild(rankBadge);
    dimCard.appendChild(headerDiv);
    dimCard.appendChild(progressDiv);
    
    dimensionsGrid.appendChild(dimCard);
  });
}

/**
 * 渲染组合类型解读（带颜色高亮）
 */
function renderCombination() {
  const hollandCode = reportData.hollandCode || '';
  const interpretation = reportData.interpretation || '';
  
  if (!interpretation) return;
  
  const combinationContent = document.getElementById('combinationContent');
  
  const contentDiv = document.createElement('div');
  contentDiv.style.padding = '24px';
  contentDiv.style.background = '#fafbfc';
  contentDiv.style.borderRadius = '12px';
  contentDiv.style.border = '1px solid #e5e7eb';
  contentDiv.style.fontSize = '16px';
  contentDiv.style.lineHeight = '1.8';
  contentDiv.style.color = '#374151';
  
  // 渲染带颜色的interpretation文本
  const paragraphs = interpretation.split('\n\n');
  paragraphs.forEach((para, pIdx) => {
    const paraDiv = document.createElement('div');
    paraDiv.style.marginBottom = pIdx < paragraphs.length - 1 ? '16px' : '0';
    
    // 处理Holland Code高亮
    const codeMatch = para.match(/您的Holland Code是([RIASEC]{3})/);
    if (codeMatch) {
      const beforeCode = para.substring(0, codeMatch.index);
      const code = codeMatch[1];
      const afterCode = para.substring(codeMatch.index + codeMatch[0].length);
      
      if (beforeCode) {
        paraDiv.appendChild(document.createTextNode(beforeCode + '您的Holland Code是'));
      } else {
        paraDiv.appendChild(document.createTextNode('您的Holland Code是'));
      }
      
      // 添加彩色的Holland Code字母
      for (let i = 0; i < code.length; i++) {
        const codeSpan = document.createElement('span');
        codeSpan.style.color = TYPE_COLORS[code[i]]?.color || '#374151';
        codeSpan.style.fontWeight = '700';
        codeSpan.style.fontSize = '17px';
        codeSpan.textContent = code[i];
        paraDiv.appendChild(codeSpan);
      }
      
      if (afterCode) {
        paraDiv.appendChild(document.createTextNode(afterCode));
      }
    } else {
      paraDiv.textContent = para;
    }
    
    contentDiv.appendChild(paraDiv);
  });
  
  combinationContent.innerHTML = '';
  combinationContent.appendChild(contentDiv);
}

/**
 * 渲染主要类型详细分析
 */
function renderPrimaryType() {
  const primaryType = reportData.primaryType || 'R';
  const primaryInfo = TYPE_INFO[primaryType];
  const primaryColor = TYPE_COLORS[primaryType] || TYPE_COLORS.R;
  
  const fullTypeInfo = reportData.typeInfo?.primary || primaryInfo;
  const primaryTypeNameEl = document.getElementById('primaryTypeName');
  if (primaryTypeNameEl) {
    primaryTypeNameEl.textContent = fullTypeInfo?.fullName || fullTypeInfo?.name || primaryType;
  }
  
  const typeDetails = document.getElementById('typeDetails');
  if (!typeDetails) {
    console.warn('typeDetails element not found');
    return;
  }
  
  // 类型描述（包含workStyle）
  const descDiv = document.createElement('div');
  descDiv.style.padding = '24px';
  descDiv.style.background = `linear-gradient(135deg, ${primaryColor.bg}, #ffffff)`;
  descDiv.style.borderRadius = '12px';
  descDiv.style.marginBottom = '24px';
  descDiv.style.border = `1px solid ${primaryColor.color}20`;
  descDiv.style.fontSize = '16px';
  descDiv.style.lineHeight = '1.8';
  descDiv.style.color = '#374151';
  descDiv.textContent = (fullTypeInfo?.description || '') + (fullTypeInfo?.workStyle || '');
  
  // 性格特质
  const traitsDiv = document.createElement('div');
  traitsDiv.style.marginBottom = '24px';
  
  const traitsTitle = document.createElement('h4');
  traitsTitle.style.color = '#374151';
  traitsTitle.style.marginBottom = '16px';
  traitsTitle.textContent = '💎 性格特质';
  
  const traitsList = document.createElement('div');
  traitsList.style.display = 'flex';
  traitsList.style.flexWrap = 'wrap';
  traitsList.style.gap = '8px';
  
  const traits = fullTypeInfo?.traits || primaryInfo?.traits || [];
  traits.forEach(trait => {
    const traitTag = document.createElement('span');
    traitTag.style.padding = '6px 16px';
    traitTag.style.borderRadius = '16px';
    traitTag.style.fontSize = '14px';
    traitTag.style.background = primaryColor.color;
    traitTag.style.color = 'white';
    traitTag.style.border = 'none';
    traitTag.textContent = trait;
    traitsList.appendChild(traitTag);
  });
  
  traitsDiv.appendChild(traitsTitle);
  traitsDiv.appendChild(traitsList);
  
  // 核心优势
  const strengthsDiv = document.createElement('div');
  if (fullTypeInfo?.strengths && fullTypeInfo.strengths.length > 0) {
    const strengthsTitle = document.createElement('h4');
    strengthsTitle.style.color = '#374151';
    strengthsTitle.style.marginBottom = '16px';
    strengthsTitle.textContent = '⭐ 核心优势';
    
    const strengthsList = document.createElement('div');
    
    fullTypeInfo.strengths.forEach((item, index) => {
      const itemDiv = document.createElement('div');
      itemDiv.style.display = 'flex';
      itemDiv.style.alignItems = 'flex-start';
      itemDiv.style.padding = '12px 0';
      itemDiv.style.borderBottom = index < fullTypeInfo.strengths.length - 1 ? '1px solid #f0f0f0' : 'none';
      itemDiv.style.gap = '12px';
      
      const iconDiv = document.createElement('div');
      iconDiv.style.width = '24px';
      iconDiv.style.height = '24px';
      iconDiv.style.borderRadius = '50%';
      iconDiv.style.background = primaryColor.color;
      iconDiv.style.display = 'flex';
      iconDiv.style.alignItems = 'center';
      iconDiv.style.justifyContent = 'center';
      iconDiv.style.flexShrink = '0';
      iconDiv.style.marginTop = '2px';
      iconDiv.innerHTML = '✓';
      iconDiv.style.color = 'white';
      iconDiv.style.fontSize = '12px';
      
      const textDiv = document.createElement('div');
      textDiv.style.fontSize = '15px';
      textDiv.style.lineHeight = '1.6';
      textDiv.style.color = '#1f2937';
      textDiv.style.fontWeight = '500';
      textDiv.textContent = item;
      
      itemDiv.appendChild(iconDiv);
      itemDiv.appendChild(textDiv);
      strengthsList.appendChild(itemDiv);
    });
    
    strengthsDiv.appendChild(strengthsTitle);
    strengthsDiv.appendChild(strengthsList);
  }
  
  typeDetails.innerHTML = '';
  typeDetails.appendChild(descDiv);
  typeDetails.appendChild(traitsDiv);
  if (strengthsDiv.children.length > 0) {
    typeDetails.appendChild(strengthsDiv);
  }
}

/**
 * 渲染适合的职业方向
 */
function renderCareers() {
  const sortedDims = reportData.sortedDimensions || [];
  if (sortedDims.length < 3) return;
  
  const types = sortedDims.slice(0, 3);
  const primaryType = types[0].key;
  const secondaryType = types[1].key;
  const tertiaryType = types[2].key;
  
  const primaryColor = TYPE_COLORS[primaryType] || TYPE_COLORS.R;
  const primaryInfo = reportData.typeInfo?.primary || TYPE_INFO[primaryType];
  const secondaryInfo = reportData.typeInfo?.secondary || TYPE_INFO[secondaryType];
  const tertiaryInfo = reportData.typeInfo?.tertiary || TYPE_INFO[tertiaryType];
  
  const careersContent = document.getElementById('careersContent');
  
  // 主要推荐职业
  const primaryDiv = document.createElement('div');
  primaryDiv.style.padding = '24px';
  primaryDiv.style.background = `linear-gradient(135deg, ${primaryColor.bg}, #ffffff)`;
  primaryDiv.style.borderRadius = '12px';
  primaryDiv.style.border = `1px solid ${primaryColor.color}20`;
  primaryDiv.style.marginBottom = '24px';
  
  const primaryTitle = document.createElement('h4');
  primaryTitle.style.color = '#374151';
  primaryTitle.style.marginBottom = '16px';
  primaryTitle.style.fontSize = '18px';
  primaryTitle.innerHTML = `${TYPE_ICONS[primaryType]} 主要推荐职业`;
  
  const primaryText = document.createElement('p');
  primaryText.style.fontSize = '16px';
  primaryText.style.lineHeight = '1.8';
  primaryText.style.color = '#374151';
  primaryText.style.margin = '0';
  primaryText.textContent = primaryInfo?.suitable || '';
  
  primaryDiv.appendChild(primaryTitle);
  primaryDiv.appendChild(primaryText);
  
  // 次要和第三类型职业
  const secondaryDiv = document.createElement('div');
  secondaryDiv.style.display = 'grid';
  secondaryDiv.style.gridTemplateColumns = 'repeat(auto-fit, minmax(250px, 1fr))';
  secondaryDiv.style.gap = '16px';
  
  const secCard = document.createElement('div');
  secCard.style.padding = '20px';
  secCard.style.background = TYPE_COLORS[secondaryType]?.bg || '#fafafa';
  secCard.style.borderRadius = '12px';
  secCard.style.border = `1px solid ${TYPE_COLORS[secondaryType]?.color || '#ccc'}20`;
  
  const secTitle = document.createElement('h4');
  secTitle.style.color = '#374151';
  secTitle.style.marginBottom = '12px';
  secTitle.style.fontSize = '16px';
  secTitle.innerHTML = `${TYPE_ICONS[secondaryType]} ${secondaryInfo?.fullName || secondaryInfo?.name || secondaryType}`;
  
  const secText = document.createElement('p');
  secText.style.fontSize = '14px';
  secText.style.color = '#6b7280';
  secText.style.margin = '0';
  secText.textContent = secondaryInfo?.suitable || '';
  
  secCard.appendChild(secTitle);
  secCard.appendChild(secText);
  
  const tertCard = document.createElement('div');
  tertCard.style.padding = '20px';
  tertCard.style.background = TYPE_COLORS[tertiaryType]?.bg || '#fafafa';
  tertCard.style.borderRadius = '12px';
  tertCard.style.border = `1px solid ${TYPE_COLORS[tertiaryType]?.color || '#ccc'}20`;
  
  const tertTitle = document.createElement('h4');
  tertTitle.style.color = '#374151';
  tertTitle.style.marginBottom = '12px';
  tertTitle.style.fontSize = '16px';
  tertTitle.innerHTML = `${TYPE_ICONS[tertiaryType]} ${tertiaryInfo?.fullName || tertiaryInfo?.name || tertiaryType}`;
  
  const tertText = document.createElement('p');
  tertText.style.fontSize = '14px';
  tertText.style.color = '#6b7280';
  tertText.style.margin = '0';
  tertText.textContent = tertiaryInfo?.suitable || '';
  
  tertCard.appendChild(tertTitle);
  tertCard.appendChild(tertText);
  
  secondaryDiv.appendChild(secCard);
  secondaryDiv.appendChild(tertCard);
  
  careersContent.innerHTML = '';
  careersContent.appendChild(primaryDiv);
  careersContent.appendChild(secondaryDiv);
}

/**
 * 渲染职业发展建议
 */
function renderDevelopment() {
  const primaryType = reportData.primaryType || 'R';
  const primaryColor = TYPE_COLORS[primaryType] || TYPE_COLORS.R;
  
  const recommendations = reportData.recommendations || [
    `充分发挥您的${TYPE_INFO[primaryType]?.name || primaryType}优势，在相关领域深耕发展`,
    '结合您的次要和第三兴趣类型，探索跨领域的职业机会',
    '持续学习和提升专业技能，增强职业竞争力',
    '建立专业网络，与同行业人士交流合作',
    '关注行业发展趋势，适时调整职业规划'
  ];
  
  const recommendationsList = document.getElementById('recommendationsList');
  recommendationsList.innerHTML = '';
  
  recommendations.forEach((item, index) => {
    const itemDiv = document.createElement('div');
    itemDiv.style.display = 'flex';
    itemDiv.style.alignItems = 'flex-start';
    itemDiv.style.padding = '16px 0';
    itemDiv.style.borderBottom = index < recommendations.length - 1 ? '1px solid #f0f0f0' : 'none';
    itemDiv.style.gap = '16px';
    
    const numberDiv = document.createElement('div');
    numberDiv.style.width = '32px';
    numberDiv.style.height = '32px';
    numberDiv.style.background = primaryColor.color;
    numberDiv.style.color = 'white';
    numberDiv.style.borderRadius = '50%';
    numberDiv.style.display = 'flex';
    numberDiv.style.alignItems = 'center';
    numberDiv.style.justifyContent = 'center';
    numberDiv.style.fontSize = '14px';
    numberDiv.style.fontWeight = 'bold';
    numberDiv.style.flexShrink = '0';
    numberDiv.textContent = index + 1;
    
    const textDiv = document.createElement('div');
    textDiv.style.fontSize = '16px';
    textDiv.style.lineHeight = '1.7';
    textDiv.style.color = '#1f2937';
    textDiv.style.fontWeight = '500';
    textDiv.style.flex = '1';
    textDiv.textContent = item;
    
    itemDiv.appendChild(numberDiv);
    itemDiv.appendChild(textDiv);
    recommendationsList.appendChild(itemDiv);
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
  a.download = `Holland报告_${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 生成报告文本
 */
function generateReportText() {
  const completedAt = reportData.completedAt || new Date().toISOString();
  const date = new Date(completedAt);
  const dateStr = date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  let text = '霍兰德职业兴趣测试 测评报告\n';
  text += '='.repeat(50) + '\n\n';
  
  text += `测评完成时间：${dateStr}\n\n`;
  text += `您的Holland Code：${reportData.hollandCode || '---'}\n`;
  text += `主类型：${TYPE_INFO[reportData.primaryType]?.name || reportData.primaryType}\n\n`;
  
  text += '六维度得分详情：\n';
  text += '-'.repeat(50) + '\n';
  const sortedDims = reportData.sortedDimensions || [];
  sortedDims.forEach((dim, index) => {
    text += `${index + 1}. ${dim.name}：${dim.rawScore}分（${dim.percentage}%）\n`;
  });
  
  text += '\n适合的职业方向：\n';
  text += '-'.repeat(50) + '\n';
  if (sortedDims.length >= 1) {
    const primaryInfo = TYPE_INFO[sortedDims[0].key];
    text += `主要推荐：${primaryInfo?.suitable || ''}\n`;
  }
  
  return text;
}

/**
 * 渲染学习与发展路径
 */
function renderLearning() {
  const primaryType = reportData.primaryType || 'R';
  const fullTypeInfo = reportData.typeInfo?.primary;
  const primaryColor = TYPE_COLORS[primaryType] || TYPE_COLORS.R;
  
  const learningContent = document.getElementById('learningContent');
  if (!learningContent) {
    console.warn('learningContent element not found');
    return;
  }
  
  // 学习路径数据（从type-info.js或硬编码）
  const learningPaths = {
    R: ['工程技术类专业：机械、电气、土木等', '计算机硬件和网络技术', '农业、林业、园艺等实用学科', '汽车维修、机械操作等技能培训'],
    I: ['自然科学类专业：物理、化学、生物等', '医学、药学等健康科学', '计算机科学、数据科学、统计学', '心理学、社会学等研究性学科'],
    A: ['艺术设计类专业：美术、设计、音乐等', '文学、新闻、传媒等创作类学科', '建筑学、风景园林等艺术性专业', '戏剧影视、动画等表演艺术'],
    S: ['教育学、学前教育、特殊教育', '临床医学、护理学、康复治疗', '心理学、社会工作、社会学', '人力资源管理、行政管理'],
    E: ['工商管理、市场营销、国际商务', '法学、政治学、公共管理', '金融学、投资学、保险学', '创业管理、战略管理'],
    C: ['会计学、审计学、财务管理', '档案学、图书馆学、信息管理', '行政管理、公共事业管理', '统计学、经济学、金融学']
  };
  
  const skillDevelopment = {
    R: ['提升专业技术技能和操作能力', '学习相关工具和设备的使用', '培养问题诊断和解决能力', '关注新技术和新工艺的发展'],
    I: ['加强逻辑思维和分析能力', '提升数据处理和统计分析技能', '培养科学研究方法和实验设计能力', '保持好奇心，持续学习新知识'],
    A: ['培养创造力和想象力', '提升审美能力和艺术修养', '学习设计软件和创作工具', '多观察、多体验、多创作'],
    S: ['提升沟通和人际交往能力', '培养同理心和情绪管理能力', '学习团队协作和冲突解决技巧', '增强服务意识和责任感'],
    E: ['提升领导力和团队管理能力', '培养商业思维和战略规划能力', '增强说服力和谈判技巧', '学习目标设定和执行能力'],
    C: ['提升细节处理和数据管理能力', '培养组织规划和流程优化能力', '学习办公软件和管理工具', '增强执行力和时间管理能力']
  };
  
  const learningPath = learningPaths[primaryType] || [];
  const skills = skillDevelopment[primaryType] || [];
  
  const container = document.createElement('div');
  container.style.display = 'grid';
  container.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
  container.style.gap = '24px';
  
  // 推荐学习方向
  const learningDiv = document.createElement('div');
  learningDiv.style.padding = '24px';
  learningDiv.style.background = '#eff6ff';
  learningDiv.style.borderRadius = '12px';
  learningDiv.style.border = '1px solid #bfdbfe';
  
  const learningTitle = document.createElement('h4');
  learningTitle.style.color = '#1e40af';
  learningTitle.style.marginBottom = '16px';
  learningTitle.textContent = '📚 推荐学习方向';
  
  const learningList = document.createElement('div');
  learningPath.forEach(item => {
    const itemDiv = document.createElement('div');
    itemDiv.style.padding = '8px 0';
    itemDiv.style.fontSize = '14px';
    itemDiv.style.lineHeight = '1.6';
    itemDiv.style.color = '#374151';
    itemDiv.textContent = '• ' + item;
    learningList.appendChild(itemDiv);
  });
  
  learningDiv.appendChild(learningTitle);
  learningDiv.appendChild(learningList);
  
  // 能力提升建议
  const skillsDiv = document.createElement('div');
  skillsDiv.style.padding = '24px';
  skillsDiv.style.background = '#fef7f0';
  skillsDiv.style.borderRadius = '12px';
  skillsDiv.style.border = '1px solid #fed7aa';
  
  const skillsTitle = document.createElement('h4');
  skillsTitle.style.color = '#c2410c';
  skillsTitle.style.marginBottom = '16px';
  skillsTitle.textContent = '🎯 能力提升建议';
  
  const skillsList = document.createElement('div');
  skills.forEach(item => {
    const itemDiv = document.createElement('div');
    itemDiv.style.padding = '8px 0';
    itemDiv.style.fontSize = '14px';
    itemDiv.style.lineHeight = '1.6';
    itemDiv.style.color = '#374151';
    itemDiv.textContent = '• ' + item;
    skillsList.appendChild(itemDiv);
  });
  
  skillsDiv.appendChild(skillsTitle);
  skillsDiv.appendChild(skillsList);
  
  container.appendChild(learningDiv);
  container.appendChild(skillsDiv);
  
  learningContent.innerHTML = '';
  learningContent.appendChild(container);
}

/**
 * 渲染典型职业详解
 */
function renderCareersDetail() {
  const primaryType = reportData.primaryType || 'R';
  const fullTypeInfo = reportData.typeInfo?.primary;
  const primaryColor = TYPE_COLORS[primaryType] || TYPE_COLORS.R;
  
  const careersDetailGrid = document.getElementById('careersDetailGrid');
  const careersDetailSubtitle = document.getElementById('careersDetailSubtitle');
  
  if (!careersDetailGrid) {
    console.warn('careersDetailGrid element not found');
    return;
  }
  
  if (careersDetailSubtitle && fullTypeInfo?.name) {
    careersDetailSubtitle.textContent = `深入了解${fullTypeInfo.name}的代表性职业`;
  }
  
  const typicalCareers = fullTypeInfo?.typicalCareers || [];
  if (typicalCareers.length === 0) {
    // 如果没有典型职业数据，隐藏整个section
    const section = careersDetailGrid.closest('.careers-detail-section');
    if (section) {
      section.style.display = 'none';
    }
    return;
  }
  
  careersDetailGrid.style.display = 'grid';
  careersDetailGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(280px, 1fr))';
  careersDetailGrid.style.gap = '24px';
  careersDetailGrid.innerHTML = '';
  
  typicalCareers.forEach((career, index) => {
    const careerCard = document.createElement('div');
    careerCard.style.padding = '24px';
    careerCard.style.background = index === 0 ? `linear-gradient(135deg, ${primaryColor.bg}, #ffffff)` : '#fafbfc';
    careerCard.style.borderRadius = '12px';
    careerCard.style.border = index === 0 ? `2px solid ${primaryColor.color}40` : '1px solid #e5e7eb';
    careerCard.style.position = 'relative';
    careerCard.style.display = 'flex';
    careerCard.style.flexDirection = 'column';
    
    if (index === 0) {
      const badge = document.createElement('div');
      badge.style.position = 'absolute';
      badge.style.top = '16px';
      badge.style.right = '16px';
      badge.style.background = primaryColor.color;
      badge.style.color = 'white';
      badge.style.padding = '4px 12px';
      badge.style.borderRadius = '12px';
      badge.style.fontSize = '12px';
      badge.style.fontWeight = '600';
      badge.textContent = '热门推荐';
      careerCard.appendChild(badge);
    }
    
    const title = document.createElement('h4');
    title.style.color = index === 0 ? primaryColor.color : '#1f2937';
    title.style.marginBottom = '12px';
    title.style.fontSize = '18px';
    title.textContent = career.title;
    
    const desc = document.createElement('p');
    desc.style.fontSize = '14px';
    desc.style.lineHeight = '1.7';
    desc.style.color = '#6b7280';
    desc.style.marginBottom = '16px';
    desc.style.flex = '1';
    desc.textContent = career.description;
    
    const infoDiv = document.createElement('div');
    infoDiv.style.paddingTop = '16px';
    infoDiv.style.borderTop = '1px solid #e5e7eb';
    
    if (career.education) {
      const eduDiv = document.createElement('div');
      eduDiv.style.marginBottom = '8px';
      eduDiv.style.display = 'flex';
      eduDiv.style.alignItems = 'center';
      eduDiv.style.gap = '8px';
      
      const eduTag = document.createElement('span');
      eduTag.style.padding = '2px 8px';
      eduTag.style.background = '#3b82f6';
      eduTag.style.color = 'white';
      eduTag.style.borderRadius = '4px';
      eduTag.style.fontSize = '12px';
      eduTag.textContent = '学历要求';
      
      const eduText = document.createElement('span');
      eduText.style.fontSize = '13px';
      eduText.style.color = '#6b7280';
      eduText.textContent = career.education;
      
      eduDiv.appendChild(eduTag);
      eduDiv.appendChild(eduText);
      infoDiv.appendChild(eduDiv);
    }
    
    if (career.salary) {
      const salaryDiv = document.createElement('div');
      salaryDiv.style.display = 'flex';
      salaryDiv.style.alignItems = 'center';
      salaryDiv.style.gap = '8px';
      
      const salaryTag = document.createElement('span');
      salaryTag.style.padding = '2px 8px';
      salaryTag.style.background = '#10b981';
      salaryTag.style.color = 'white';
      salaryTag.style.borderRadius = '4px';
      salaryTag.style.fontSize = '12px';
      salaryTag.textContent = '薪资范围';
      
      const salaryText = document.createElement('span');
      salaryText.style.fontSize = '13px';
      salaryText.style.color = '#6b7280';
      salaryText.textContent = career.salary;
      
      salaryDiv.appendChild(salaryTag);
      salaryDiv.appendChild(salaryText);
      infoDiv.appendChild(salaryDiv);
    }
    
    careerCard.appendChild(title);
    careerCard.appendChild(desc);
    careerCard.appendChild(infoDiv);
    careersDetailGrid.appendChild(careerCard);
  });
}

/**
 * 渲染深度类型解读
 */
function renderDeepAnalysis() {
  const primaryType = reportData.primaryType || 'R';
  const fullTypeInfo = reportData.typeInfo?.primary;
  const primaryColor = TYPE_COLORS[primaryType] || TYPE_COLORS.R;
  
  const deepAnalysisContent = document.getElementById('deepAnalysisContent');
  const deepAnalysisSubtitle = document.getElementById('deepAnalysisSubtitle');
  
  if (!deepAnalysisContent) {
    console.warn('deepAnalysisContent element not found');
    return;
  }
  
  if (deepAnalysisSubtitle && fullTypeInfo?.fullName) {
    deepAnalysisSubtitle.textContent = `全面了解${fullTypeInfo.fullName}的特征`;
  }
  
  deepAnalysisContent.innerHTML = '';
  
  // 类型特征详解
  if (fullTypeInfo?.detailedDescription) {
    const descDiv = document.createElement('div');
    descDiv.style.padding = '28px';
    descDiv.style.background = `linear-gradient(135deg, ${primaryColor.bg}, #ffffff)`;
    descDiv.style.borderRadius = '12px';
    descDiv.style.border = `2px solid ${primaryColor.color}30`;
    descDiv.style.marginBottom = '24px';
    
    const title = document.createElement('h4');
    title.style.color = primaryColor.color;
    title.style.marginBottom = '16px';
    title.style.fontSize = '18px';
    title.textContent = '💡 类型特征详解';
    
    const text = document.createElement('p');
    text.style.fontSize = '16px';
    text.style.lineHeight = '2';
    text.style.color = '#374151';
    text.style.margin = '0';
    text.style.textIndent = '2em';
    text.textContent = fullTypeInfo.detailedDescription;
    
    descDiv.appendChild(title);
    descDiv.appendChild(text);
    deepAnalysisContent.appendChild(descDiv);
  }
  
  // 潜在挑战与建议
  if (fullTypeInfo?.challenges && fullTypeInfo.challenges.length > 0) {
    const challengesDiv = document.createElement('div');
    challengesDiv.style.padding = '24px';
    challengesDiv.style.background = '#fef2f2';
    challengesDiv.style.borderRadius = '12px';
    challengesDiv.style.border = '1px solid #fecaca';
    challengesDiv.style.marginBottom = '24px';
    
    const title = document.createElement('h4');
    title.style.color = '#dc2626';
    title.style.marginBottom = '16px';
    title.style.fontSize = '18px';
    title.textContent = '⚠️ 潜在挑战与建议';
    
    const list = document.createElement('div');
    fullTypeInfo.challenges.forEach((item, index) => {
      const itemDiv = document.createElement('div');
      itemDiv.style.display = 'flex';
      itemDiv.style.alignItems = 'flex-start';
      itemDiv.style.padding = '12px 0';
      itemDiv.style.borderBottom = index < fullTypeInfo.challenges.length - 1 ? '1px solid #fee2e2' : 'none';
      itemDiv.style.gap = '12px';
      
      const icon = document.createElement('div');
      icon.style.width = '24px';
      icon.style.height = '24px';
      icon.style.background = '#fee2e2';
      icon.style.color = '#dc2626';
      icon.style.borderRadius = '50%';
      icon.style.display = 'flex';
      icon.style.alignItems = 'center';
      icon.style.justifyContent = 'center';
      icon.style.fontSize = '12px';
      icon.style.fontWeight = 'bold';
      icon.style.flexShrink = '0';
      icon.style.marginTop = '2px';
      icon.textContent = '!';
      
      const text = document.createElement('div');
      text.style.fontSize = '15px';
      text.style.lineHeight = '1.7';
      text.style.color = '#7f1d1d';
      text.textContent = item;
      
      itemDiv.appendChild(icon);
      itemDiv.appendChild(text);
      list.appendChild(itemDiv);
    });
    
    const strategyDiv = document.createElement('div');
    strategyDiv.style.marginTop = '16px';
    strategyDiv.style.padding = '16px';
    strategyDiv.style.background = 'white';
    strategyDiv.style.borderRadius = '8px';
    strategyDiv.style.border = '1px solid #fecaca';
    
    const strategyText = document.createElement('div');
    strategyText.style.fontSize = '14px';
    strategyText.style.color = '#991b1b';
    strategyText.style.lineHeight = '1.8';
    strategyText.innerHTML = '<strong>💪 应对策略：</strong>了解自己的局限性，有意识地培养这些方面的能力。可以通过培训、实践或寻求他人帮助来弥补短板，同时充分发挥自己的优势。';
    
    strategyDiv.appendChild(strategyText);
    
    challengesDiv.appendChild(title);
    challengesDiv.appendChild(list);
    challengesDiv.appendChild(strategyDiv);
    deepAnalysisContent.appendChild(challengesDiv);
  }
  
  // 学习风格
  if (fullTypeInfo?.learningStyle) {
    const learningDiv = document.createElement('div');
    learningDiv.style.padding = '24px';
    learningDiv.style.background = '#f0fdf4';
    learningDiv.style.borderRadius = '12px';
    learningDiv.style.border = '1px solid #bbf7d0';
    
    const title = document.createElement('h4');
    title.style.color = '#059669';
    title.style.marginBottom = '16px';
    title.style.fontSize = '18px';
    title.textContent = '📈 您的学习风格';
    
    const text = document.createElement('p');
    text.style.fontSize = '15px';
    text.style.lineHeight = '1.9';
    text.style.color = '#065f46';
    text.style.margin = '0';
    text.style.padding = '12px 16px';
    text.style.background = 'white';
    text.style.borderRadius = '8px';
    text.style.border = '1px solid #bbf7d0';
    text.textContent = fullTypeInfo.learningStyle;
    
    learningDiv.appendChild(title);
    learningDiv.appendChild(text);
    deepAnalysisContent.appendChild(learningDiv);
  }
}

/**
 * 渲染发展路径规划
 */
function renderDevelopmentPath() {
  const primaryType = reportData.primaryType || 'R';
  const fullTypeInfo = reportData.typeInfo?.primary;
  const primaryColor = TYPE_COLORS[primaryType] || TYPE_COLORS.R;
  
  const developmentPathContent = document.getElementById('developmentPathContent');
  if (!developmentPathContent) {
    console.warn('developmentPathContent element not found');
    return;
  }
  
  if (!fullTypeInfo?.developmentPath) {
    // 如果没有发展路径数据，隐藏整个section
    const section = developmentPathContent.closest('.development-path-section');
    if (section) {
      section.style.display = 'none';
    }
    return;
  }
  
  const { shortTerm, longTerm } = fullTypeInfo.developmentPath;
  
  const container = document.createElement('div');
  container.style.display = 'grid';
  container.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
  container.style.gap = '24px';
  
  // 短期目标
  const shortTermDiv = document.createElement('div');
  shortTermDiv.style.padding = '28px';
  shortTermDiv.style.background = 'linear-gradient(135deg, #eff6ff, #dbeafe)';
  shortTermDiv.style.borderRadius = '12px';
  shortTermDiv.style.border = '2px solid #93c5fd';
  
  const shortTitle = document.createElement('h3');
  shortTitle.style.color = '#1e40af';
  shortTitle.style.marginBottom = '20px';
  shortTitle.style.fontSize = '22px';
  shortTitle.style.display = 'flex';
  shortTitle.style.alignItems = 'center';
  shortTitle.style.gap = '8px';
  shortTitle.innerHTML = '<span style="font-size: 28px;">🎯</span> 短期目标';
  
  const shortList = document.createElement('div');
  shortTerm.forEach((item, index) => {
    const itemDiv = document.createElement('div');
    itemDiv.style.display = 'flex';
    itemDiv.style.alignItems = 'flex-start';
    itemDiv.style.padding = '14px 0';
    itemDiv.style.borderBottom = index < shortTerm.length - 1 ? '1px solid #bfdbfe' : 'none';
    itemDiv.style.gap = '14px';
    
    const number = document.createElement('div');
    number.style.width = '32px';
    number.style.height = '32px';
    number.style.background = '#3b82f6';
    number.style.color = 'white';
    number.style.borderRadius = '50%';
    number.style.display = 'flex';
    number.style.alignItems = 'center';
    number.style.justifyContent = 'center';
    number.style.fontSize = '14px';
    number.style.fontWeight = 'bold';
    number.style.flexShrink = '0';
    number.style.marginTop = '2px';
    number.textContent = index + 1;
    
    const text = document.createElement('div');
    text.style.fontSize = '16px';
    text.style.lineHeight = '1.8';
    text.style.color = '#1e3a8a';
    text.style.fontWeight = '500';
    text.textContent = item;
    
    itemDiv.appendChild(number);
    itemDiv.appendChild(text);
    shortList.appendChild(itemDiv);
  });
  
  shortTermDiv.appendChild(shortTitle);
  shortTermDiv.appendChild(shortList);
  
  // 长期愿景
  const longTermDiv = document.createElement('div');
  longTermDiv.style.padding = '28px';
  longTermDiv.style.background = 'linear-gradient(135deg, #f0fdf4, #dcfce7)';
  longTermDiv.style.borderRadius = '12px';
  longTermDiv.style.border = '2px solid #86efac';
  
  const longTitle = document.createElement('h3');
  longTitle.style.color = '#059669';
  longTitle.style.marginBottom = '20px';
  longTitle.style.fontSize = '22px';
  longTitle.style.display = 'flex';
  longTitle.style.alignItems = 'center';
  longTitle.style.gap = '8px';
  longTitle.innerHTML = '<span style="font-size: 28px;">🚀</span> 长期愿景';
  
  const longList = document.createElement('div');
  longTerm.forEach((item, index) => {
    const itemDiv = document.createElement('div');
    itemDiv.style.display = 'flex';
    itemDiv.style.alignItems = 'flex-start';
    itemDiv.style.padding = '14px 0';
    itemDiv.style.borderBottom = index < longTerm.length - 1 ? '1px solid #bbf7d0' : 'none';
    itemDiv.style.gap = '14px';
    
    const number = document.createElement('div');
    number.style.width = '32px';
    number.style.height = '32px';
    number.style.background = '#10b981';
    number.style.color = 'white';
    number.style.borderRadius = '50%';
    number.style.display = 'flex';
    number.style.alignItems = 'center';
    number.style.justifyContent = 'center';
    number.style.fontSize = '14px';
    number.style.fontWeight = 'bold';
    number.style.flexShrink = '0';
    number.style.marginTop = '2px';
    number.textContent = index + 1;
    
    const text = document.createElement('div');
    text.style.fontSize = '16px';
    text.style.lineHeight = '1.8';
    text.style.color = '#065f46';
    text.style.fontWeight = '500';
    text.textContent = item;
    
    itemDiv.appendChild(number);
    itemDiv.appendChild(text);
    longList.appendChild(itemDiv);
  });
  
  longTermDiv.appendChild(longTitle);
  longTermDiv.appendChild(longList);
  
  container.appendChild(shortTermDiv);
  container.appendChild(longTermDiv);
  
  // 温馨提示
  const tipDiv = document.createElement('div');
  tipDiv.style.marginTop = '24px';
  tipDiv.style.padding = '20px';
  tipDiv.style.background = `linear-gradient(135deg, ${primaryColor.bg}, #ffffff)`;
  tipDiv.style.borderRadius = '12px';
  tipDiv.style.border = `1px solid ${primaryColor.color}30`;
  
  const tipText = document.createElement('div');
  tipText.style.fontSize = '15px';
  tipText.style.lineHeight = '1.9';
  tipText.style.color = '#374151';
  tipText.innerHTML = `<strong style="color: ${primaryColor.color};">💡 温馨提示：</strong>职业发展是一个动态的过程，这些建议应根据您的实际情况灵活调整。定期回顾和更新您的职业规划，保持学习和成长的动力，相信您一定能在职业道路上取得成功！`;
  
  tipDiv.appendChild(tipText);
  
  developmentPathContent.innerHTML = '';
  developmentPathContent.appendChild(container);
  developmentPathContent.appendChild(tipDiv);
}

/**
 * 渲染FAQ
 */
function renderFAQ() {
  const primaryType = reportData.primaryType || 'R';
  const primaryColor = TYPE_COLORS[primaryType] || TYPE_COLORS.R;
  const faqContent = document.getElementById('faqContent');
  
  if (!faqContent) return;
  
  const faqs = [
    {
      question: '🤔 Holland Code 中三个因子的影响有什么区别？',
      answer: `你的测试结果是一个<strong style="color: ${primaryColor.color};">三位代码</strong>（如RAS），这个代码由三个因子组成，每个因子对你的影响程度是不同的。<br><br><strong>📊 理解因子的权重</strong><br>因子的影响是逐级递减的：<br>• 第一个因子（如RAS中的<strong>R</strong>）对你的影响<strong>最大</strong><br>• 第二个因子（如RAS中的<strong>A</strong>）影响次之<br>• 第三个因子（如RAS中的<strong>S</strong>）影响相对较小<br><br><strong>💡 实用建议</strong><br>建议：<strong>找到同样代码（如RAS）的朋友交流</strong>，了解他们目前在什么行业、从事什么工作，这能给你提供更具体的职业参考和发展路径。他们的实际经验比理论建议更有参考价值！`
    },
    {
      question: '📊 分数的高低重要吗？低分是不是代表不适合？',
      answer: `<strong style="color: #dc2626;">不！</strong>霍兰德测试关注的是<strong style="color: ${primaryColor.color};">相对排名</strong>，而非绝对分数。<br><br><strong>📌 关键理解</strong><br>• 前三位代码反映你<strong>最突出的兴趣倾向</strong><br>• 后三位代码表示<strong>相对不感兴趣</strong>的领域（但不代表完全不能做）<br>• 重要的是各代码之间的<strong>相对差异</strong><br><br>例如：即使你的I型（研究型）分数不是最高的，但如果在前三位，说明研究分析仍然是你相对擅长和感兴趣的方向。`
    },
    {
      question: '🔄 我的结果会随时间改变吗？',
      answer: `<strong style="color: ${primaryColor.color};">会有变化，但核心倾向相对稳定。</strong><br><br><strong>✅ 相对稳定的部分</strong><br>• 核心兴趣类型（前1-2位）<br>• 基本性格倾向<br>• 天生的能力优势<br><br><strong>🔄 可能变化的部分</strong><br>• 具体分数高低<br>• 第2-3位代码的顺序<br>• 受经历影响的兴趣<br><br><strong>💡 建议</strong><br>建议每2-3年重新测试一次，特别是在<strong>职业转型期</strong>、<strong>人生重大变化后</strong>，或<strong>学习新技能后</strong>。`
    },
    {
      question: '🎯 我的代码组合很少见，是不是很难找到合适的工作？',
      answer: `<strong style="color: ${primaryColor.color};">这恰恰是你的独特优势！</strong><br><br>罕见的代码组合意味着你具有<strong>独特的能力组合</strong>，这在当今<strong>跨学科、复合型人才</strong>需求旺盛的时代特别有价值。<br><br><strong>🌟 如何利用独特组合</strong><br>• 寻找<strong>新兴职业</strong>和<strong>交叉领域</strong>的机会<br>• 考虑<strong>创造性地定义</strong>你的职业角色<br>• 在团队中担任<strong>桥梁角色</strong>，连接不同专业的人<br>• 关注<strong>创业机会</strong>，独特视角往往能发现市场空白`
    },
    {
      question: '❓ 测试结果和我现在的工作不匹配，怎么办？',
      answer: `这种情况<strong style="color: ${primaryColor.color};">非常常见</strong>，不必过于担心。以下是几种可能的情况和应对策略：<br><br><strong>1️⃣ 工作中寻找兴趣元素</strong><br>不必完全换工作，可以在现有岗位中<strong>增加与兴趣相关的任务</strong>。比如，E型（企业型）倾向的人在技术岗位上可以主动承担项目管理、团队协调的工作。<br><br><strong>2️⃣ 发展副业或兴趣爱好</strong><br>用<strong>业余时间</strong>发展符合兴趣代码的活动。工作提供稳定收入，兴趣带来心理满足，两者结合也是很好的人生策略。<br><br><strong>3️⃣ 规划职业转型</strong><br>如果确实感到<strong>持续的不匹配和不满</strong>，可以将测试结果作为<strong>职业转型的参考</strong>，但建议逐步过渡，降低风险。<br><br><strong>记住：</strong>职业满意度来自多个因素，兴趣匹配只是其中之一。工作环境、收入、发展机会、工作与生活平衡等都很重要。`
    }
  ];
  
  faqContent.innerHTML = '';
  
  faqs.forEach((faq, index) => {
    const faqItem = document.createElement('div');
    faqItem.style.marginBottom = '16px';
    faqItem.style.border = '1px solid #e5e7eb';
    faqItem.style.borderRadius = '8px';
    faqItem.style.overflow = 'hidden';
    
    const questionDiv = document.createElement('div');
    questionDiv.style.padding = '16px';
    questionDiv.style.background = '#f9fafb';
    questionDiv.style.cursor = 'pointer';
    questionDiv.style.fontSize = '16px';
    questionDiv.style.fontWeight = '600';
    questionDiv.style.color = '#374151';
    questionDiv.textContent = faq.question;
    
    const answerDiv = document.createElement('div');
    answerDiv.style.padding = '16px';
    answerDiv.style.display = 'none';
    answerDiv.style.fontSize = '15px';
    answerDiv.style.lineHeight = '1.8';
    answerDiv.style.color = '#4b5563';
    answerDiv.innerHTML = faq.answer;
    
    questionDiv.addEventListener('click', () => {
      answerDiv.style.display = answerDiv.style.display === 'none' ? 'block' : 'none';
    });
    
    faqItem.appendChild(questionDiv);
    faqItem.appendChild(answerDiv);
    faqContent.appendChild(faqItem);
  });
}

/**
 * 渲染理解您的Holland Code
 */
function renderUnderstanding() {
  const primaryType = reportData.primaryType || 'R';
  const secondaryType = reportData.secondaryType || 'I';
  const tertiaryType = reportData.tertiaryType || 'A';
  const hollandCode = reportData.hollandCode || '';
  const fullTypeInfo = reportData.typeInfo;
  const primaryColor = TYPE_COLORS[primaryType] || TYPE_COLORS.R;
  
  const understandingContent = document.getElementById('understandingContent');
  if (!understandingContent) return;
  
  const container = document.createElement('div');
  container.style.padding = '24px';
  container.style.background = 'rgba(255, 255, 255, 0.8)';
  container.style.borderRadius = '12px';
  container.style.marginBottom = '24px';
  
  const text1 = document.createElement('div');
  text1.style.fontSize = '16px';
  text1.style.lineHeight = '1.8';
  text1.style.color = '#4b5563';
  text1.style.marginBottom = '20px';
  
  const codeSpan1 = document.createElement('span');
  codeSpan1.style.color = TYPE_COLORS[primaryType]?.color;
  codeSpan1.style.fontWeight = '700';
  codeSpan1.textContent = primaryType;
  
  const codeSpan2 = document.createElement('span');
  codeSpan2.style.color = TYPE_COLORS[secondaryType]?.color;
  codeSpan2.style.fontWeight = '700';
  codeSpan2.textContent = secondaryType;
  
  const codeSpan3 = document.createElement('span');
  codeSpan3.style.color = TYPE_COLORS[tertiaryType]?.color;
  codeSpan3.style.fontWeight = '700';
  codeSpan3.textContent = tertiaryType;
  
  const primaryName = fullTypeInfo?.primary?.name || TYPE_INFO[primaryType]?.name;
  const secondaryName = fullTypeInfo?.secondary?.name || TYPE_INFO[secondaryType]?.name;
  const tertiaryName = fullTypeInfo?.tertiary?.name || TYPE_INFO[tertiaryType]?.name;
  
  text1.appendChild(document.createTextNode('恭喜您完成了霍兰德职业兴趣测评！通过这次深度探索，您现在更好地了解了自己的职业兴趣倾向。您的Holland Code是'));
  text1.appendChild(codeSpan1);
  text1.appendChild(codeSpan2);
  text1.appendChild(codeSpan3);
  text1.appendChild(document.createTextNode(`，这代表您在${primaryName}、${secondaryName}和${tertiaryName}这三个方面的兴趣最为突出。`));
  
  const tipDiv = document.createElement('div');
  tipDiv.style.padding = '20px';
  tipDiv.style.background = `${primaryColor.color}10`;
  tipDiv.style.borderRadius = '8px';
  tipDiv.style.borderLeft = `4px solid ${primaryColor.color}`;
  tipDiv.style.marginBottom = '20px';
  
  const tipTitle = document.createElement('div');
  tipTitle.style.marginBottom = '12px';
  tipTitle.style.fontStyle = 'italic';
  tipTitle.style.color = primaryColor.color;
  tipTitle.style.fontWeight = '600';
  tipTitle.style.fontSize = '16px';
  tipTitle.textContent = '记住：Holland Code是发现方向的工具，而不是限制您的标签';
  
  const tipList = document.createElement('div');
  tipList.style.fontSize = '15px';
  tipList.style.color = '#374151';
  tipList.style.lineHeight = '1.7';
  tipList.innerHTML = '<div style="margin-bottom: 8px;">• 拥抱您的职业兴趣，它们是您选择职业的重要参考</div><div style="margin-bottom: 8px;">• 保持开放心态，在不同领域中探索和尝试</div><div style="margin-bottom: 8px;">• 结合实际能力和机会，制定适合自己的职业规划</div><div>• 将Holland Code作为职业发展的指南，而非唯一标准</div>';
  
  tipDiv.appendChild(tipTitle);
  tipDiv.appendChild(tipList);
  
  const finalText = document.createElement('div');
  finalText.style.textAlign = 'center';
  finalText.style.color = primaryColor.color;
  finalText.style.fontStyle = 'italic';
  finalText.style.fontWeight = '500';
  finalText.style.fontSize = '17px';
  finalText.style.padding = '16px';
  finalText.style.background = `${primaryColor.color}08`;
  finalText.style.borderRadius = '8px';
  finalText.textContent = '愿这份报告帮助您找到真正适合的职业方向，在事业道路上发现更多可能性 ✨';
  
  container.appendChild(text1);
  container.appendChild(tipDiv);
  container.appendChild(finalText);
  
  understandingContent.innerHTML = '';
  understandingContent.appendChild(container);
}

/**
 * 渲染底部信息
 */
function renderFooterInfo() {
  const footerInfo = document.getElementById('reportFooterInfo');
  if (!footerInfo) return;
  
  const completedAt = reportData.completedAt || new Date().toISOString();
  const date = new Date(completedAt);
  const dateStr = date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  footerInfo.style.textAlign = 'center';
  footerInfo.style.padding = '20px';
  footerInfo.style.color = '#6b7280';
  footerInfo.style.fontSize = '14px';
  footerInfo.style.background = 'rgba(255, 255, 255, 0.8)';
  footerInfo.style.borderRadius = '12px';
  footerInfo.style.border = '1px solid #e5e7eb';
  footerInfo.style.marginBottom = '16px';
  
  const dateDiv = document.createElement('div');
  dateDiv.style.marginBottom = '8px';
  dateDiv.textContent = `报告生成时间：${dateStr}`;
  
  const descDiv = document.createElement('div');
  descDiv.style.fontSize = '12px';
  descDiv.style.lineHeight = '1.6';
  descDiv.style.color = '#9ca3af';
  descDiv.innerHTML = '本报告基于霍兰德职业兴趣理论(Holland Code)生成，采用90题完整版量表。<br>理论源自约翰·霍兰德(John L. Holland)教授的研究成果，是全球最权威的职业规划工具之一。<br>测试结果仅供参考，请结合实际情况综合考虑您的职业选择。';
  
  footerInfo.appendChild(dateDiv);
  footerInfo.appendChild(descDiv);
}

/**
 * 渲染管理员引导
 */
function renderAdminGuide() {
  const adminGuide = document.getElementById('adminGuide');
  if (!adminGuide) return;
  
  adminGuide.style.textAlign = 'center';
  adminGuide.style.padding = '12px 0';
  
  const text = document.createElement('span');
  text.style.fontSize = '12px';
  text.style.color = '#9ca3af';
  text.style.cursor = 'pointer';
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

/**
 * 显示/隐藏加载提示
 */
function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay');
  overlay.style.display = show ? 'flex' : 'none';
}

