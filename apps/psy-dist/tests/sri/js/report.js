/**
 * SRI 报告页面逻辑
 * 完全独立的实现，不依赖任何外部框架
 */

import { DIMENSION_ORDER, DIMENSION_NAMES } from '../data/questions.js';
import { getTestResult } from './utils/storage.js';

// 报告数据
let reportData = null;

// 水平颜色映射
const LEVEL_COLORS = {
  '非常低': '#52c41a',
  '低': '#95de64',
  '中等偏低': '#91d5ff',
  '中等': '#1890ff',
  '中等偏高': '#ffd666',
  '高': '#ff7a45',
  '非常高': '#f5222d'
};

// 整体水平颜色映射
const OVERALL_LEVEL_COLORS = {
  '低欲望型': '#52c41a',
  '平衡型': '#1890ff',
  '高欲望型': '#faad14',
  '强欲望型': '#ff7a45'
};

// 维度配置
const DIMENSION_CONFIG = {
  'A': {
    icon: '💭',
    description: '反映您对性相关话题和行为的整体态度倾向'
  },
  'B': {
    icon: '😰',
    description: '评估您对性相关想法和行为的焦虑与罪恶感程度'
  },
  'C': {
    icon: '🚫',
    description: '衡量您在性行为中的抑制和放松程度'
  },
  'D': {
    icon: '🎭',
    description: '了解您对性别角色和性行为模式的观念'
  }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initialize();
});

/**
 * 获取token的工具函数
 * 从多个来源尝试获取token：URL、localStorage、SDK实例
 */
function getToken() {
  // 方法1：从URL中提取token
  const path = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  
  // 优先检查查询参数中的token（无限测试模式：/test/{test_code}?token={token}）
  const tokenFromQuery = searchParams.get('token');
  if (tokenFromQuery) {
    // 检查是否是无限测试格式：/test/{test_code}?unlimited=true&token={token}
    const testMatch = path.match(/^\/test\/([^\/]+)$/);
    if (testMatch) {
      return tokenFromQuery;
    }
  }
  
  // 尝试匹配 /test/{test_code}/{token} 格式
  const standardMatch = path.match(/^\/test\/([^\/]+)\/([^\/]+)$/);
  if (standardMatch) {
    return standardMatch[2];
  }
  
  // 尝试匹配 /tests/{test_code}/report.html?token={token} 格式
  const reportFileMatch = path.match(/^\/tests\/([^\/]+)\/report\.html$/);
  if (reportFileMatch && tokenFromQuery) {
    return tokenFromQuery;
  }
  
  // 方法2：从localStorage中查找token（遍历所有test_result_开头的key）
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('test_result_')) {
        const token = key.replace('test_result_', '');
        // 验证token格式（16字节base64编码，通常是22-24个字符）
        if (token && token.length >= 16) {
          return token;
        }
      }
    }
  } catch (error) {
    console.error('从localStorage获取token失败:', error);
  }
  
  // 方法3：从SDK实例获取token
  if (window.linkValidator && window.linkValidator.token) {
    return window.linkValidator.token;
  }
  
  return null;
}

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
      // 没有测试结果，尝试从URL参数获取（如果localStorage保存失败）
      const urlParams = new URLSearchParams(window.location.search);
      const resultParam = urlParams.get('result');
      if (resultParam) {
        try {
          const urlResult = JSON.parse(decodeURIComponent(resultParam));
          if (urlResult && urlResult.result) {
            resultData = { result: urlResult.result };
            console.log('从URL参数加载测试结果');
          }
        } catch (error) {
          console.error('解析URL参数中的结果失败:', error);
        }
      }
      
      if (!resultData || !resultData.result) {
        // 仍然没有测试结果，跳转回同意页面
        alert('未找到测试结果，请先完成测试。');
        const token = getToken();
        let indexUrl = 'index.html';
        if (token) {
          const urlParams = new URLSearchParams();
          urlParams.set('token', token);
          const isUnlimited = window.linkValidator && window.linkValidator.unlimited;
          if (isUnlimited) {
            urlParams.set('unlimited', 'true');
          }
          indexUrl = `${indexUrl}?${urlParams.toString()}`;
        }
        window.location.href = indexUrl;
        return;
      }
    }
    
    reportData = resultData.result;
    
    // 计算综合指数（从totalPercent计算）
    reportData.comprehensiveIndex = reportData.totalPercent || 0;
    
    // 渲染报告
    renderReport();
    
    // 初始化重新测试按钮
    initializeRestartButton();
    
    showLoading(false);
    
  } catch (error) {
    console.error('加载报告失败:', error);
    showLoading(false);
    alert('加载报告失败，请刷新页面重试。');
  }
}

/**
 * 初始化重新测试按钮
 */
function initializeRestartButton() {
  const restartButton = document.getElementById('restartButton');
  if (!restartButton) {
    console.warn('重新测试按钮未找到');
    return;
  }
  
  restartButton.addEventListener('click', () => {
    // 清除SDK保存的结果
    if (window.linkValidator && window.linkValidator.clearLocalResult) {
      window.linkValidator.clearLocalResult(); // SRI是单视角测试
    }
    
    // 获取token（从URL参数或window.linkValidator）
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token') || (window.linkValidator && window.linkValidator.token) || getToken();
    const isUnlimited = urlParams.get('unlimited') === 'true' || (window.linkValidator && window.linkValidator.unlimited);
    
    // 构建重新测试的URL
    let indexUrl = 'index.html';
    const newParams = new URLSearchParams();
    newParams.set('restart', 'true');
    
    if (token) {
      newParams.set('token', token);
    }
    if (isUnlimited) {
      newParams.set('unlimited', 'true');
    }
    
    const queryString = newParams.toString();
    if (queryString) {
      indexUrl = `${indexUrl}?${queryString}`;
    }
    
    window.location.href = indexUrl;
  });
}

/**
 * 渲染报告
 */
function renderReport() {
  // 渲染报告头部
  renderReportHeader();
  
  // 渲染整体评估结果
  renderOverallResult();
  
  // 渲染详细分数分析
  renderDetailedAnalysis();
  
  // 渲染分数区间参考标准
  renderScoreReference();
  
  // 渲染维度得分详情
  renderDimensions();
  
  // 渲染详细维度解读
  renderDimensionDetails();
  
  // 渲染个性化改善建议
  renderRecommendations();
  
  // 渲染亲密关系相处指南
  renderRelationshipGuide();
  
  // 渲染性态度类型特点总结
  renderTypeSummary();
  
  // 渲染人口学个性化分析
  renderDemographicInsights();
  
  // 渲染温馨提示
  renderWarmTips();
  
  // 渲染底部说明
  renderFooterInfo();
}

/**
 * 渲染报告头部
 */
function renderReportHeader() {
  const completedAt = reportData.completedAt || new Date().toISOString();
  const date = new Date(completedAt);
  const dateStr = date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  document.getElementById('reportDate').textContent = `测评完成时间：${dateStr}`;
}

/**
 * 渲染整体评估结果
 */
function renderOverallResult() {
  const comprehensiveIndex = reportData.comprehensiveIndex || reportData.totalPercent || 0;
  const overallLevel = reportData.overallLevel || '平衡型';
  const overallColor = OVERALL_LEVEL_COLORS[overallLevel] || '#1890ff';
  
  // 更新综合指数
  const indexElement = document.getElementById('comprehensiveIndex');
  indexElement.textContent = comprehensiveIndex;
  indexElement.style.color = overallColor;
  
  // 更新进度条
  document.getElementById('overallProgress').style.width = comprehensiveIndex + '%';
  document.getElementById('overallProgress').style.background = overallColor;
  
  // 更新整体水平
  const levelBadge = document.getElementById('overallLevelBadge');
  levelBadge.textContent = overallLevel;
  levelBadge.style.background = overallColor;
  
  // 更新副标题
  const subtitle = document.getElementById('overallSubtitle');
  if (overallLevel === '低欲望型') {
    subtitle.textContent = '性欲低·不压抑';
  } else if (overallLevel === '平衡型') {
    subtitle.textContent = '平衡舒适';
  } else if (overallLevel === '高欲望型') {
    subtitle.textContent = '性欲强·需关注满足';
  } else {
    subtitle.textContent = '性欲很强·需专业支持';
  }
  subtitle.style.color = overallColor;
  
  // 更新解释
  const interpretation = document.getElementById('overallInterpretation');
  const interpretationText = generateInterpretation();
  interpretation.innerHTML = `<p>${interpretationText}</p>`;
  interpretation.style.background = `linear-gradient(135deg, ${overallColor}08, ${overallColor}03)`;
  interpretation.style.borderColor = `${overallColor}20`;
}

/**
 * 生成总体解释
 */
function generateInterpretation() {
  const avgScore = reportData.totalAverageScore || 3.0;
  const overallLevel = reportData.overallLevel || '平衡型';
  
  if (overallLevel === '低欲望型') {
    return `您的性压抑综合指数为${reportData.comprehensiveIndex || 0}分，属于低欲望型。您对性的追求较低，倾向于保守传统的态度。性在您的生活中不是优先事项，这种状态让您内心平静自在。`;
  } else if (overallLevel === '平衡型') {
    return `您的性压抑综合指数为${reportData.comprehensiveIndex || 0}分，属于平衡型。您在性态度上保持着不错的平衡，既能接受传统观念，也能理解现代想法。这种平衡让您在亲密关系中感到舒适。`;
  } else if (overallLevel === '高欲望型') {
    return `您的性压抑综合指数为${reportData.comprehensiveIndex || 0}分，属于高欲望型。您对性持开放的态度，性欲望相对较强，性在您的生活中占据重要位置。与伴侣沟通您的需求，找到平衡点很重要。`;
  } else {
    return `您的性压抑综合指数为${reportData.comprehensiveIndex || 0}分，属于强欲望型。您对性持非常开放的态度，性欲望很强，性在您的生活中占据核心位置。强烈的性欲是正常的，关键是找到合适的方式表达和满足。`;
  }
}

/**
 * 渲染详细分数分析
 */
function renderDetailedAnalysis() {
  const comprehensiveIndex = reportData.comprehensiveIndex || reportData.totalPercent || 0;
  const analysis = getDetailedScoreAnalysis(comprehensiveIndex);
  const overallColor = OVERALL_LEVEL_COLORS[reportData.overallLevel] || '#1890ff';
  
  const analysisContent = document.getElementById('analysisContent');
  analysisContent.style.background = `linear-gradient(135deg, ${overallColor}15, #ffffff)`;
  analysisContent.style.borderRadius = '24px';
  analysisContent.style.padding = '32px 24px';
  analysisContent.style.border = `1px solid ${overallColor}30`;
  
  // 创建emoji标题
  const emojiDiv = document.createElement('div');
  emojiDiv.style.textAlign = 'center';
  emojiDiv.style.marginBottom = '16px';
  emojiDiv.innerHTML = `<div style="font-size: 72px; margin-bottom: 16px;">${analysis.emoji}</div>`;
  
  const titleDiv = document.createElement('h3');
  titleDiv.style.textAlign = 'center';
  titleDiv.style.color = overallColor;
  titleDiv.style.fontSize = '32px';
  titleDiv.style.fontWeight = '700';
  titleDiv.style.marginBottom = '8px';
  titleDiv.textContent = analysis.title;
  
  const subtitleDiv = document.createElement('p');
  subtitleDiv.style.textAlign = 'center';
  subtitleDiv.style.fontSize = '15px';
  subtitleDiv.style.color = '#6b7280';
  subtitleDiv.style.marginBottom = '24px';
  subtitleDiv.textContent = '您的性态度类型画像';
  
  // 总体描述
  const descDiv = document.createElement('div');
  descDiv.style.padding = '24px';
  descDiv.style.background = 'white';
  descDiv.style.borderRadius = '12px';
  descDiv.style.marginBottom = '24px';
  descDiv.style.border = `1px solid ${overallColor}30`;
  descDiv.style.fontSize = '16px';
  descDiv.style.lineHeight = '1.8';
  descDiv.style.color = '#374151';
  descDiv.textContent = analysis.description;
  
  // 关键特征和建议
  const featuresAdviceDiv = document.createElement('div');
  featuresAdviceDiv.style.display = 'grid';
  featuresAdviceDiv.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
  featuresAdviceDiv.style.gap = '24px';
  
  // 关键特征卡片
  const featuresCard = document.createElement('div');
  featuresCard.style.padding = '24px';
  featuresCard.style.background = '#f8fafc';
  featuresCard.style.borderRadius = '12px';
  featuresCard.style.border = '1px solid #e5e7eb';
  
  const featuresTitle = document.createElement('h4');
  featuresTitle.style.margin = '0 0 16px 0';
  featuresTitle.style.fontSize = '18px';
  featuresTitle.style.fontWeight = '600';
  featuresTitle.style.color = '#374151';
  featuresTitle.textContent = '✨ 关键特征表现';
  
  const featuresList = document.createElement('ul');
  featuresList.style.listStyle = 'none';
  featuresList.style.padding = '0';
  featuresList.style.margin = '0';
  analysis.keyPoints.forEach(point => {
    const li = document.createElement('li');
    li.style.padding = '8px 0';
    li.style.fontSize = '15px';
    li.style.lineHeight = '1.6';
    li.style.color = '#4b5563';
    li.textContent = point;
    featuresList.appendChild(li);
  });
  
  featuresCard.appendChild(featuresTitle);
  featuresCard.appendChild(featuresList);
  
  // 改善建议卡片
  const adviceCard = document.createElement('div');
  adviceCard.style.padding = '24px';
  adviceCard.style.background = '#f0fdf4';
  adviceCard.style.borderRadius = '12px';
  adviceCard.style.border = '1px solid #bbf7d0';
  
  const adviceTitle = document.createElement('h4');
  adviceTitle.style.margin = '0 0 16px 0';
  adviceTitle.style.fontSize = '18px';
  adviceTitle.style.fontWeight = '600';
  adviceTitle.style.color = '#374151';
  adviceTitle.textContent = '💖 改善行动建议';
  
  const adviceList = document.createElement('ul');
  adviceList.style.listStyle = 'none';
  adviceList.style.padding = '0';
  adviceList.style.margin = '0';
  analysis.advice.forEach(advice => {
    const li = document.createElement('li');
    li.style.padding = '8px 0';
    li.style.fontSize = '15px';
    li.style.lineHeight = '1.6';
    li.style.color = '#059669';
    li.textContent = '✓ ' + advice;
    adviceList.appendChild(li);
  });
  
  adviceCard.appendChild(adviceTitle);
  adviceCard.appendChild(adviceList);
  
  featuresAdviceDiv.appendChild(featuresCard);
  featuresAdviceDiv.appendChild(adviceCard);
  
  // 组装内容
  analysisContent.innerHTML = '';
  analysisContent.appendChild(emojiDiv);
  analysisContent.appendChild(titleDiv);
  analysisContent.appendChild(subtitleDiv);
  analysisContent.appendChild(descDiv);
  analysisContent.appendChild(featuresAdviceDiv);
}

/**
 * 获取详细分数分析
 */
function getDetailedScoreAnalysis(index) {
  const score = parseFloat(index);
  
  if (score < 20) {
    return {
      title: '🌟 佛系恋爱家',
      emoji: '☁️',
      description: '您是"佛系恋爱家"！您对性的追求非常低，倾向于保守传统的态度。性在您的生活中不是优先事项，您更看重其他方面的生活质量。这种状态让您不会因性欲望而感到困扰，内心平静自在。',
      keyPoints: [
        '☮️ 对性话题不太感兴趣，也不会刻意回避',
        '😌 认同传统的性道德观念，内心平和',
        '🍃 在亲密关系中按自己的节奏来，不强求',
        '📿 对性别角色有传统的认知，感到舒适',
        '💚 性不是生活重心，其他事物更重要'
      ],
      advice: [
        '✨ 您的状态很好，继续保持内心的平和',
        '💑 如果伴侣需求不同，坦诚沟通很重要',
        '📚 了解性知识也有助于更好地理解伴侣',
        '🌈 每个人的节奏不同，找到彼此的平衡点',
        '💭 如果对现状满意，就无需改变'
      ]
    };
  } else if (score < 30) {
    return {
      title: '🌸 温和保守派',
      emoji: '🌺',
      description: '您是"温和保守派"！您对性持相对保守的态度，但也能接受一些现代观点。性在您的生活中占适当的位置，您不会过分追求也不会完全回避。这种温和的态度让您在亲密关系中感到舒适。',
      keyPoints: [
        '🌟 对性持温和保守的态度，感到自在',
        '😌 有一些传统观念，但不会过分拘束',
        '🎨 在亲密关系中能够按自己的节奏相处',
        '🤝 对性别角色有一定看法，但也能灵活调整',
        '💖 性生活是生活的一部分，但不是全部'
      ],
      advice: [
        '🎯 您的状态很平衡，继续保持就好',
        '💡 与伴侣保持沟通，确保双方都舒适',
        '📖 适当了解性知识，增进关系理解',
        '💬 尊重彼此的边界和节奏',
        '🌱 如果感到满意，无需刻意改变'
      ]
    };
  } else if (score < 40) {
    return {
      title: '🌿 平衡协调者',
      emoji: '⚖️',
      description: '您是"平衡协调者"！您在性态度上保持着不错的平衡，既能接受传统观念，也能理解现代想法。性在您的生活中有适度的位置，您能够根据情况灵活调整自己的态度和行为。',
      keyPoints: [
        '⚖️ 性态度介于保守和开放之间',
        '🤔 能够理解不同的观点和立场',
        '🌊 在亲密关系中比较灵活适应',
        '💭 对性话题有自己的独立思考',
        '🌈 能够在不同情境下调整自己的态度'
      ],
      advice: [
        '🔍 继续保持这种平衡的心态',
        '📚 根据需要调整自己的态度',
        '💬 与伴侣坦诚沟通彼此的期待',
        '🤝 尊重双方的需求和边界',
        '🌟 平衡是一种智慧，您做得很好'
      ]
    };
  } else if (score < 60) {
    return {
      title: '🍃 开放探索者',
      emoji: '🌾',
      description: '您是"开放探索者"！您对性持相对开放的态度，性在您的生活中有一定的重要性。您比较重视亲密关系的质量，希望能够有满意的性生活体验。如果需求能够得到满足，这是很健康的状态。',
      keyPoints: [
        '🎒 对性持相对开放和积极的态度',
        '😊 性生活对您来说比较重要',
        '🚶 希望在亲密关系中有更好的体验',
        '📜 对性别角色持相对平等的观点',
        '💫 重视性生活的质量和满意度'
      ],
      advice: [
        '🌱 确保您的需求能够被健康地满足',
        '📖 与伴侣沟通彼此的期待和节奏',
        '🗣️ 如果需求未被满足，坦诚表达很重要',
        '💑 探索双方都舒适的亲密方式',
        '🎯 多尝试不同的沟通方式'
      ]
    };
  } else if (score < 70) {
    return {
      title: '🌙 热情追寻者',
      emoji: '🔥',
      description: '您是"热情追寻者"！您对性持开放的态度，性欲望相对较强，性在您的生活中占据重要位置。您重视亲密关系的质量和频率。如果这些需求能够得到满足，会让您感到幸福；如果未能满足，可能会带来一些困扰。',
      keyPoints: [
        '💭 性对您来说是重要的生活内容',
        '😊 对性持开放积极的态度',
        '🎭 重视亲密关系的质量和频率',
        '📏 倾向于平等开放的性别角色观',
        '🌟 希望获得满意的性生活体验'
      ],
      advice: [
        '🌈 与伴侣沟通您的需求和期待',
        '📚 学习如何在尊重双方的前提下表达需求',
        '🗨️ 如果需求差异较大，寻求共同的平衡点',
        '💞 探索更多满足需求的健康方式',
        '🎯 耐心和理解是关键'
      ]
    };
  } else if (score < 80) {
    return {
      title: '🔥 活力追求者',
      emoji: '🌹',
      description: '您是"活力追求者"！您对性持非常开放的态度，性欲望较强，性在您的生活中非常重要。您渴望丰富多彩的亲密生活。如果这些需求能够在健康的关系中得到满足，那很棒；如果经常感到需求未被满足，可能需要关注一下。',
      keyPoints: [
        '🌪️ 性是您生活中很重要的部分',
        '😊 对性持非常开放和积极的态度',
        '🔐 性欲望强烈，重视亲密生活',
        '⚖️ 认同开放平等的性别角色',
        '💢 如果需求未被满足，可能会感到困扰'
      ],
      advice: [
        '🌟 与伴侣深入沟通双方的需求',
        '📕 了解如何在关系中平衡彼此节奏',
        '🧘‍♀️ 学习管理未被满足时的情绪',
        '💞 探索更多增进亲密的创意方式',
        '💪 探索健康的方式来满足您的需求'
      ]
    };
  } else {
    return {
      title: '🌈 激情主义者',
      emoji: '✨',
      description: '您是"激情主义者"！您对性持非常开放的态度，性欲望很强，性在您的生活中占据核心位置。您非常重视亲密关系的质量和频率。强烈的性欲是正常的，关键是找到合适的方式表达和满足。',
      keyPoints: [
        '🌊 性是您生活的重要核心',
        '😊 对性持完全开放的态度',
        '🔒 性欲望非常强烈',
        '⛓️ 如果需求未被满足，会明显影响情绪',
        '💔 可能因为需求差异而感到困扰'
      ],
      advice: [
        '💝 与伴侣深度沟通，寻找双方的平衡点',
        '📚 学习如何健康地表达和满足需求',
        '🤝 理解伴侣可能有不同的节奏',
        '🌈 探索让双方都满意的创意方式',
        '💪 保持耐心，相互理解是关系的基石'
      ]
    };
  }
}

/**
 * 渲染维度得分详情
 */
function renderDimensions() {
  const dimensionsGrid = document.getElementById('dimensionsGrid');
  dimensionsGrid.innerHTML = '';
  
  DIMENSION_ORDER.forEach(dimKey => {
    const dimension = reportData.dimensions[dimKey];
    if (!dimension) return;
    
    const config = DIMENSION_CONFIG[dimKey];
    const level = dimension.level || '中等';
    const levelColor = LEVEL_COLORS[level] || '#1890ff';
    const averageScore = dimension.averageScore || 3.0;
    const percentage = (averageScore / 5) * 100;
    
    // 创建维度卡片
    const dimCard = document.createElement('div');
    dimCard.className = 'dimension-card';
    dimCard.style.background = `linear-gradient(135deg, ${levelColor}08, ${levelColor}03)`;
    dimCard.style.borderRadius = '16px';
    dimCard.style.padding = '24px';
    dimCard.style.border = `1px solid ${levelColor}30`;
    
    // 维度标题
    const titleDiv = document.createElement('div');
    titleDiv.style.display = 'flex';
    titleDiv.style.justifyContent = 'space-between';
    titleDiv.style.alignItems = 'center';
    titleDiv.style.marginBottom = '16px';
    
    const titleText = document.createElement('h3');
    titleText.style.margin = '0';
    titleText.style.fontSize = '18px';
    titleText.style.fontWeight = '600';
    titleText.style.color = '#1f2937';
    titleText.innerHTML = `${config.icon} ${dimension.name}`;
    
    const levelBadge = document.createElement('span');
    levelBadge.style.padding = '4px 12px';
    levelBadge.style.borderRadius = '12px';
    levelBadge.style.fontSize = '12px';
    levelBadge.style.fontWeight = '600';
    levelBadge.style.color = 'white';
    levelBadge.style.background = levelColor;
    levelBadge.textContent = level;
    
    titleDiv.appendChild(titleText);
    titleDiv.appendChild(levelBadge);
    
    // 得分显示
    const scoreDiv = document.createElement('div');
    scoreDiv.style.textAlign = 'center';
    scoreDiv.style.marginBottom = '16px';
    
    const scoreValue = document.createElement('div');
    scoreValue.style.fontSize = '32px';
    scoreValue.style.fontWeight = 'bold';
    scoreValue.style.color = levelColor;
    scoreValue.style.marginBottom = '8px';
    scoreValue.textContent = averageScore.toFixed(2);
    
    const scoreLabel = document.createElement('div');
    scoreLabel.style.fontSize = '14px';
    scoreLabel.style.color = '#6b7280';
    scoreLabel.textContent = `平均分 / 满分 5.0 分`;
    
    scoreDiv.appendChild(scoreValue);
    scoreDiv.appendChild(scoreLabel);
    
    // 进度条
    const progressDiv = document.createElement('div');
    progressDiv.style.width = '100%';
    progressDiv.style.height = '8px';
    progressDiv.style.background = '#f0f0f0';
    progressDiv.style.borderRadius = '4px';
    progressDiv.style.overflow = 'hidden';
    progressDiv.style.marginBottom = '16px';
    
    const progressFill = document.createElement('div');
    progressFill.style.height = '100%';
    progressFill.style.width = percentage + '%';
    progressFill.style.background = levelColor;
    progressFill.style.transition = 'width 0.3s ease';
    
    progressDiv.appendChild(progressFill);
    
    // 描述
    const descDiv = document.createElement('div');
    descDiv.style.fontSize = '14px';
    descDiv.style.color = '#6b7280';
    descDiv.style.lineHeight = '1.6';
    descDiv.textContent = config.description;
    
    // 详细信息
    const infoDiv = document.createElement('div');
    infoDiv.style.marginTop = '12px';
    infoDiv.style.padding = '12px';
    infoDiv.style.background = `${levelColor}08`;
    infoDiv.style.borderRadius = '8px';
    infoDiv.style.borderLeft = `3px solid ${levelColor}`;
    infoDiv.style.fontSize = '13px';
    infoDiv.style.color = '#6b7280';
    infoDiv.style.fontStyle = 'italic';
    infoDiv.textContent = `题目数量：${dimension.questionCount} 题 · 原始总分：${dimension.rawScore} 分`;
    
    // 组装卡片
    dimCard.appendChild(titleDiv);
    dimCard.appendChild(scoreDiv);
    dimCard.appendChild(progressDiv);
    dimCard.appendChild(descDiv);
    dimCard.appendChild(infoDiv);
    
    dimensionsGrid.appendChild(dimCard);
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
  a.download = `SRI报告_${new Date().toISOString().split('T')[0]}.txt`;
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
  
  let text = 'SRI 性压抑指数评估量表 测评报告\n';
  text += '='.repeat(50) + '\n\n';
  
  text += `测评完成时间：${dateStr}\n\n`;
  text += `性压抑综合指数：${reportData.comprehensiveIndex || 0} 分（满分 100 分）\n`;
  text += `评估水平：${reportData.overallLevel || '平衡型'}\n\n`;
  
  text += '维度得分详情：\n';
  text += '-'.repeat(50) + '\n';
  DIMENSION_ORDER.forEach(dimKey => {
    const dimension = reportData.dimensions[dimKey];
    if (dimension) {
      text += `${dimension.name}：${dimension.averageScore.toFixed(2)} 分（${dimension.level}）\n`;
    }
  });
  
  text += '\n详细分数分析：\n';
  text += '-'.repeat(50) + '\n';
  const analysis = getDetailedScoreAnalysis(reportData.comprehensiveIndex || 0);
  text += `${analysis.title}\n\n`;
  text += `${analysis.description}\n\n`;
  text += '关键特征表现：\n';
  analysis.keyPoints.forEach(point => {
    text += `  • ${point}\n`;
  });
  text += '\n改善行动建议：\n';
  analysis.advice.forEach(advice => {
    text += `  ✓ ${advice}\n`;
  });
  
  return text;
}

/**
 * 渲染分数区间参考标准
 */
function renderScoreReference() {
  const scoreReferenceGrid = document.getElementById('scoreReferenceGrid');
  scoreReferenceGrid.innerHTML = '';
  
  const comprehensiveIndex = reportData.comprehensiveIndex || reportData.totalPercent || 0;
  const overallColor = OVERALL_LEVEL_COLORS[reportData.overallLevel] || '#1890ff';
  
  // 分数区间参考标准（与整体类型判断保持一致）
  // 转换公式：totalPercent = Math.round(((totalAverageScore - 1) / 4) * 100)
  // 整体类型判断（基于总均分）：
  //   - 总均分 < 2.0 → 低欲望型
  //   - 总均分 < 2.5 → 平衡型
  //   - 总均分 < 3.5 → 高欲望型
  //   - 总均分 >= 3.5 → 强欲望型
  // 
  // 转换为综合指数（考虑Math.round四舍五入）：
  //   - 总均分 < 2.0 → 综合指数 0-24分 → 低欲望型
  //   - 总均分 2.0-2.49 → 综合指数 25-37分 → 平衡型
  //   - 总均分 2.5-3.49 → 综合指数 38-62分 → 高欲望型
  //   - 总均分 >= 3.5 → 综合指数 63-100分 → 强欲望型
  const scoreRanges = [
    { min: 0, max: 24, label: '0-24分', type: '低欲望型', color: '#52c41a' },
    { min: 25, max: 37, label: '25-37分', type: '平衡型', color: '#1890ff' },
    { min: 38, max: 62, label: '38-62分', type: '高欲望型', color: '#faad14' },
    { min: 63, max: 100, label: '63-100分', type: '强欲望型', color: '#ff7a45' }
  ];
  
  scoreRanges.forEach(range => {
    const isActive = comprehensiveIndex >= range.min && comprehensiveIndex <= range.max;
    
    const rangeCard = document.createElement('div');
    rangeCard.style.cssText = `
      padding: 16px;
      background: ${isActive ? (range.color === '#52c41a' ? '#f0fdf4' : range.color === '#1890ff' ? '#e6f7ff' : range.color === '#faad14' ? '#fffbeb' : '#fff7ed') : 'white'};
      border-radius: 8px;
      border: ${isActive ? `2px solid ${range.color}` : '1px solid #e5e7eb'};
      text-align: center;
    `;
    
    const tag = document.createElement('div');
    tag.style.cssText = `
      display: inline-block;
      padding: 4px 12px;
      background: ${range.color};
      color: white;
      border-radius: 4px;
      font-size: 12px;
      margin-bottom: 8px;
    `;
    tag.textContent = range.label;
    
    const type = document.createElement('div');
    type.style.cssText = `
      font-size: 14px;
      color: #374151;
      font-weight: 500;
    `;
    type.textContent = range.type;
    
    rangeCard.appendChild(tag);
    rangeCard.appendChild(type);
    scoreReferenceGrid.appendChild(rangeCard);
  });
  
  // 添加当前得分提示
  const currentScoreDiv = document.createElement('div');
  currentScoreDiv.style.cssText = `
    margin-top: 16px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.8);
    border-radius: 8px;
    text-align: center;
  `;
  const currentScoreText = document.createElement('div');
  currentScoreText.style.cssText = `
    font-size: 13px;
    color: #6b7280;
    font-style: italic;
  `;
  currentScoreText.innerHTML = `当前您的得分处于 <strong style="color: ${overallColor}">${reportData.overallLevel}</strong> 区间`;
  currentScoreDiv.appendChild(currentScoreText);
  scoreReferenceGrid.appendChild(currentScoreDiv);
  
  // 设置网格样式
  scoreReferenceGrid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  `;
}

/**
 * 渲染详细维度解读
 */
function renderDimensionDetails() {
  const dimensionDetailsCollapse = document.getElementById('dimensionDetailsCollapse');
  dimensionDetailsCollapse.innerHTML = '';
  
  // 这里需要从result中获取详细分析数据
  // 由于当前数据结构可能不包含detailedAnalysis，我们需要生成它
  DIMENSION_ORDER.forEach(dimKey => {
    const dimension = reportData.dimensions[dimKey];
    if (!dimension) return;
    
    const config = DIMENSION_CONFIG[dimKey];
    const levelColor = LEVEL_COLORS[dimension.level] || '#1890ff';
    
    // 创建可折叠面板
    const panel = document.createElement('div');
    panel.className = 'dimension-detail-panel';
    panel.style.cssText = `
      margin-bottom: 16px;
      background: white;
      border-radius: 12px;
      border: 1px solid ${levelColor}20;
      overflow: hidden;
    `;
    
    // 面板头部（可点击）
    const panelHeader = document.createElement('div');
    panelHeader.className = 'dimension-detail-header';
    panelHeader.style.cssText = `
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      background: ${levelColor}08;
    `;
    
    const headerTitle = document.createElement('div');
    headerTitle.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
    `;
    headerTitle.innerHTML = `<span style="font-size: 20px; margin-right: 8px;">${config.icon}</span>${dimension.name}`;
    
    const headerTag = document.createElement('span');
    headerTag.style.cssText = `
      padding: 4px 12px;
      background: ${levelColor};
      color: white;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    `;
    headerTag.textContent = `${dimension.level} - ${dimension.averageScore.toFixed(2)}分`;
    
    panelHeader.appendChild(headerTitle);
    panelHeader.appendChild(headerTag);
    
    // 面板内容（默认展开）
    const panelContent = document.createElement('div');
    panelContent.className = 'dimension-detail-content';
    panelContent.style.cssText = `
      padding: 16px 24px;
      display: block;
    `;
    
    // 特征描述
    const featuresDiv = document.createElement('div');
    featuresDiv.style.marginBottom = '24px';
    
    const featuresTitle = document.createElement('div');
    featuresTitle.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: 12px;
    `;
    featuresTitle.innerHTML = `
      <div style="width: 24px; height: 24px; background: #3b82f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 8px;">
        <span style="color: white; font-size: 12px;">👤</span>
      </div>
      <strong style="font-size: 15px; color: #374151;">您的特征表现</strong>
    `;
    
    const featuresText = document.createElement('div');
    featuresText.style.cssText = `
      font-size: 15px;
      line-height: 1.8;
      color: #4b5563;
      padding-left: 32px;
    `;
    featuresText.textContent = getDimensionDescription(dimKey, dimension);
    
    featuresDiv.appendChild(featuresTitle);
    featuresDiv.appendChild(featuresText);
    
    // 改善建议
    const suggestionsDiv = document.createElement('div');
    const suggestionsTitle = document.createElement('div');
    suggestionsTitle.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: 12px;
    `;
    suggestionsTitle.innerHTML = `
      <div style="width: 24px; height: 24px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 8px;">
        <span style="color: white; font-size: 12px;">✓</span>
      </div>
      <strong style="font-size: 15px; color: #374151;">改善建议</strong>
    `;
    
    const suggestionsList = document.createElement('ul');
    suggestionsList.style.cssText = `
      list-style: none;
      padding: 0;
      margin: 0;
      padding-left: 32px;
    `;
    
    getDimensionSuggestions(dimKey, dimension).forEach(suggestion => {
      const li = document.createElement('li');
      li.style.cssText = `
        padding: 8px 0;
        font-size: 14px;
        line-height: 1.6;
        color: #4b5563;
      `;
      li.textContent = `• ${suggestion}`;
      suggestionsList.appendChild(li);
    });
    
    suggestionsDiv.appendChild(suggestionsTitle);
    suggestionsDiv.appendChild(suggestionsList);
    
    panelContent.appendChild(featuresDiv);
    panelContent.appendChild(suggestionsDiv);
    
    // 点击头部切换显示
    let isExpanded = true;
    panelHeader.addEventListener('click', () => {
      isExpanded = !isExpanded;
      panelContent.style.display = isExpanded ? 'block' : 'none';
    });
    
    panel.appendChild(panelHeader);
    panel.appendChild(panelContent);
    dimensionDetailsCollapse.appendChild(panel);
  });
}

/**
 * 获取维度描述
 */
function getDimensionDescription(dimKey, dimension) {
  const level = dimension.level;
  const score = dimension.averageScore;
  
  // 根据维度和水平生成描述
  const descriptions = {
    'A': {
      '非常低': '您对性相关话题和行为持非常保守的态度，认同传统的性道德观念。',
      '低': '您对性持相对保守的态度，倾向于传统的价值观。',
      '中等偏低': '您在性态度上比较平衡，既尊重传统也理解现代观点。',
      '中等': '您在性态度上保持着良好的平衡，能够灵活适应不同情境。',
      '中等偏高': '您对性持相对开放的态度，能够接受多样化的观点。',
      '高': '您对性持开放的态度，认同多样化的性观念。',
      '非常高': '您对性持非常开放的态度，完全接受现代性观念。'
    },
    'B': {
      '非常低': '您对性相关想法几乎没有焦虑和罪恶感，内心平静自在。',
      '低': '您对性想法的焦虑和罪恶感较低，能够自然地接受自己的性需求。',
      '中等偏低': '您偶尔会对性想法感到一些不安，但整体上能够接受。',
      '中等': '您对性想法有一定的焦虑，但能够通过自我调节来管理。',
      '中等偏高': '您对性想法有较明显的焦虑和罪恶感，可能需要更多支持。',
      '高': '您对性想法有强烈的焦虑和罪恶感，建议寻求专业帮助。',
      '非常高': '您对性想法有非常强烈的焦虑和罪恶感，强烈建议寻求专业支持。'
    },
    'C': {
      '非常低': '您在性行为中非常放松，能够完全投入和享受。',
      '低': '您在性行为中比较放松，抑制程度较低。',
      '中等偏低': '您在性行为中有一些抑制，但整体上能够放松。',
      '中等': '您在性行为中有一定的抑制，需要更多安全感才能放松。',
      '中等偏高': '您在性行为中有较明显的抑制，可能影响享受程度。',
      '高': '您在性行为中有强烈的抑制，很难放松和投入。',
      '非常高': '您在性行为中有非常强烈的抑制，严重影响性体验。'
    },
    'D': {
      '非常低': '您对性别角色和性行为模式持非常传统的观念。',
      '低': '您对性别角色有传统的认知，倾向于保守的行为模式。',
      '中等偏低': '您对性别角色有一定的看法，但也能接受一些变化。',
      '中等': '您对性别角色持相对平等的观点，能够灵活适应。',
      '中等偏高': '您对性别角色持开放平等的观点，认同多样化的行为模式。',
      '高': '您完全认同性别平等和开放的性行为模式。',
      '非常高': '您完全接受多样化的性别角色和性行为模式。'
    }
  };
  
  return descriptions[dimKey]?.[level] || '该维度的特征表现需要进一步分析。';
}

/**
 * 获取维度改善建议
 */
function getDimensionSuggestions(dimKey, dimension) {
  const level = dimension.level;
  const score = dimension.averageScore;
  
  const suggestions = {
    'A': {
      '非常低': [
        '继续保持您对传统价值观的认同',
        '如果伴侣需求不同，尝试理解对方的观点',
        '在感到舒适的前提下，可以适当了解现代性观念'
      ],
      '低': [
        '尊重自己的保守态度，这是您的个性特点',
        '与伴侣沟通彼此的性观念差异',
        '在安全的关系中，可以尝试适度开放'
      ],
      '中等偏低': [
        '继续保持这种平衡的态度',
        '根据情境灵活调整自己的观点',
        '与伴侣保持开放的沟通'
      ],
      '中等': [
        '您的平衡状态很好，继续保持',
        '在关系中保持灵活和开放',
        '尊重双方的不同需求'
      ],
      '中等偏高': [
        '享受您的开放态度',
        '确保在关系中双方都感到舒适',
        '探索更多增进亲密的方式'
      ],
      '高': [
        '您的开放态度是优势',
        '与伴侣沟通彼此的期待',
        '在健康的关系中表达需求'
      ],
      '非常高': [
        '享受您的开放态度',
        '确保需求在健康的关系中得到满足',
        '如果感到困扰，寻求专业支持'
      ]
    },
    'B': {
      '非常低': [
        '继续保持内心的平静',
        '如果伴侣有焦虑，给予理解和支持',
        '享受这种自在的状态'
      ],
      '低': [
        '您的状态很好，继续保持',
        '如果偶尔感到不安，这是正常的',
        '与伴侣分享您的感受'
      ],
      '中等偏低': [
        '偶尔的焦虑是正常的',
        '通过自我调节来管理情绪',
        '与伴侣沟通您的感受'
      ],
      '中等': [
        '学习管理性相关的焦虑',
        '通过正念和放松技巧来缓解',
        '如果持续困扰，考虑寻求支持'
      ],
      '中等偏高': [
        '焦虑是可以管理的',
        '尝试放松技巧和正念练习',
        '考虑寻求专业心理咨询'
      ],
      '高': [
        '强烈的焦虑需要专业支持',
        '寻求心理咨询或性治疗',
        '学习健康的情绪管理方式'
      ],
      '非常高': [
        '强烈建议寻求专业心理健康支持',
        '性治疗师可以帮助您处理这些感受',
        '记住，寻求帮助是勇敢的表现'
      ]
    },
    'C': {
      '非常低': [
        '继续保持这种放松的状态',
        '享受您的性体验',
        '如果伴侣有抑制，给予理解'
      ],
      '低': [
        '您的放松状态很好',
        '在关系中保持开放和沟通',
        '享受亲密时光'
      ],
      '中等偏低': [
        '尝试在关系中建立更多安全感',
        '与伴侣沟通您的感受',
        '逐步放松，不要给自己压力'
      ],
      '中等': [
        '在安全的关系中练习放松',
        '与伴侣建立信任和安全感',
        '逐步减少抑制，享受过程'
      ],
      '中等偏高': [
        '抑制是可以改善的',
        '寻求专业支持来学习放松技巧',
        '在安全的环境中逐步练习'
      ],
      '高': [
        '强烈的抑制需要专业支持',
        '考虑寻求性治疗师的帮助',
        '学习放松和投入的技巧'
      ],
      '非常高': [
        '强烈建议寻求专业性治疗支持',
        '性治疗可以帮助您处理抑制问题',
        '记住，改善是可能的'
      ]
    },
    'D': {
      '非常低': [
        '尊重您的传统观念',
        '如果伴侣观念不同，尝试理解',
        '在舒适的前提下，可以了解其他观点'
      ],
      '低': [
        '您的传统观念是您的选择',
        '与伴侣沟通彼此的期待',
        '在关系中寻找平衡点'
      ],
      '中等偏低': [
        '继续保持灵活的态度',
        '根据情境调整自己的观念',
        '尊重双方的不同观点'
      ],
      '中等': [
        '您的平衡状态很好',
        '在关系中保持开放和尊重',
        '探索双方都舒适的相处方式'
      ],
      '中等偏高': [
        '享受您的开放态度',
        '与伴侣探索多样化的亲密方式',
        '确保双方都感到舒适'
      ],
      '高': [
        '您的开放态度是优势',
        '在健康的关系中表达需求',
        '探索更多增进亲密的方式'
      ],
      '非常高': [
        '享受您的开放态度',
        '确保在健康的关系中满足需求',
        '如果感到困扰，寻求支持'
      ]
    }
  };
  
  return suggestions[dimKey]?.[level] || ['继续关注这个维度的发展'];
}

/**
 * 渲染个性化改善建议
 */
function renderRecommendations() {
  const recommendationsList = document.getElementById('recommendationsList');
  recommendationsList.innerHTML = '';
  
  const recommendations = generateRecommendations();
  
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
      background: #667eea;
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
      font-size: 15px;
      line-height: 1.8;
      color: #374151;
      flex: 1;
    `;
    text.textContent = rec;
    
    item.appendChild(number);
    item.appendChild(text);
    recommendationsList.appendChild(item);
  });
}

/**
 * 生成个性化改善建议
 */
function generateRecommendations() {
  const comprehensiveIndex = reportData.comprehensiveIndex || reportData.totalPercent || 0;
  const overallLevel = reportData.overallLevel || '平衡型';
  
  if (overallLevel === '低欲望型') {
    return [
      '继续保持您内心的平和状态，这是您的个性特点',
      '如果伴侣需求不同，坦诚沟通很重要，找到双方都能接受的平衡点',
      '了解性知识也有助于更好地理解伴侣，但不必强迫自己改变',
      '记住，每个人的节奏不同，没有对错之分',
      '如果对现状满意，就无需改变，做真实的自己最重要'
    ];
  } else if (overallLevel === '平衡型') {
    return [
      '继续保持这种理想的平衡状态，您做得很好',
      '与伴侣保持开放的沟通，确保双方都感到满意',
      '根据自己的需求灵活调整，不要给自己压力',
      '享受当下的亲密关系，质量比数量更重要',
      '如果遇到挑战，记住平衡是一种智慧'
    ];
  } else if (overallLevel === '高欲望型') {
    return [
      '与伴侣沟通您的需求和期待，坦诚表达很重要',
      '学习如何在尊重双方的前提下表达需求',
      '如果需求差异较大，寻求共同的平衡点',
      '探索更多满足需求的健康方式，包括情感连接',
      '保持耐心和理解，关系需要双方共同努力'
    ];
  } else {
    return [
      '与伴侣深度沟通，寻找双方的平衡点',
      '学习如何健康地表达和满足需求',
      '理解伴侣可能有不同的节奏，这是正常的',
      '探索让双方都满意的创意方式',
      '保持耐心，相互理解是关系的基石',
      '如果需求未被满足时感到困扰，学习管理这些情绪'
    ];
  }
}

/**
 * 渲染亲密关系相处指南
 */
function renderRelationshipGuide() {
  const relationshipGuideTitle = document.getElementById('relationshipGuideTitle');
  const relationshipGuideContent = document.getElementById('relationshipGuideContent');
  
  const comprehensiveIndex = reportData.comprehensiveIndex || reportData.totalPercent || 0;
  const overallColor = OVERALL_LEVEL_COLORS[reportData.overallLevel] || '#1890ff';
  
  let relationshipTips = {};
  
  if (comprehensiveIndex < 20) {
    relationshipTips = {
      title: '佛系恋爱家的相处之道',
      scenarios: [
        {
          icon: '🌙',
          title: '日常相处',
          content: '您可能更享受精神层面的交流，比如聊天、看电影、一起做饭。亲密不一定要通过性来表达，拥抱、牵手、一起安静待着也很美好。'
        },
        {
          icon: '💬',
          title: '与伴侣沟通',
          content: '如果伴侣的需求比您强，不要勉强自己。坦诚告诉TA："我更看重我们精神上的连接"。好的关系需要相互理解，而不是委屈自己。'
        },
        {
          icon: '🎯',
          title: '关系平衡点',
          content: '找一个和您节奏相似的人会更舒服。如果伴侣需求不同，可以约定一个双方都能接受的频率和方式，彼此尊重最重要。'
        }
      ]
    };
  } else if (comprehensiveIndex < 40) {
    relationshipTips = {
      title: '温和保守派/平衡者的相处之道',
      scenarios: [
        {
          icon: '⚖️',
          title: '保持平衡',
          content: '您的平衡感很好！在亲密关系中，您能够根据双方的状态灵活调整。有时主动一点，有时顺其自然，这种节奏让关系更舒适。'
        },
        {
          icon: '💝',
          title: '情感连接',
          content: '对您来说，情感连接可能比生理接触更重要。营造浪漫的氛围、深度的对话、贴心的小举动，都是增进亲密的好方式。'
        },
        {
          icon: '🌟',
          title: '舒适区拓展',
          content: '在感到安全的前提下，可以偶尔尝试一些新鲜的事物。但记住，永远以双方都舒适为前提，不要勉强。'
        }
      ]
    };
  } else if (comprehensiveIndex < 70) {
    relationshipTips = {
      title: '开放探索者/热情追寻者的相处之道',
      scenarios: [
        {
          icon: '🔥',
          title: '表达需求',
          content: '您比较重视亲密生活，这很正常！坦诚地告诉伴侣您的想法和期待，但也要留意TA的反应，确保双方都舒适。沟通是关键！'
        },
        {
          icon: '🎨',
          title: '创意探索',
          content: '尝试一些新鲜有趣的方式来增进亲密：浪漫约会、情侣小游戏、一起学习新技能。让亲密关系充满新鲜感和趣味性。'
        },
        {
          icon: '💑',
          title: '节奏协调',
          content: '如果您和伴侣的需求不完全一致，找到一个双方都满意的平衡点。有时候质量比数量更重要，用心的互动胜过频繁的例行公事。'
        }
      ]
    };
  } else {
    relationshipTips = {
      title: '活力追求者/激情主义者的相处之道',
      scenarios: [
        {
          icon: '💝',
          title: '深度沟通',
          content: '您的性欲望很强，这是您的个性特点。和伴侣深入聊聊彼此的需求、期待和底线。理解TA可能和您节奏不同，找到让双方都满意的方式。'
        },
        {
          icon: '🌈',
          title: '多元满足',
          content: '亲密不只有一种形式。除了生理接触，情感连接、深度对话、共同兴趣也能满足亲密需求。多元化的方式会让关系更丰富。'
        },
        {
          icon: '🧘',
          title: '情绪管理',
          content: '如果需求未被满足时感到难受，试试运动、冥想、投入爱好等方式转移注意力。学会与这些情绪和平相处，而不是让它控制您。'
        }
      ]
    };
  }
  
  relationshipGuideTitle.textContent = relationshipTips.title;
  
  relationshipGuideContent.innerHTML = '';
  
  const subtitle = document.createElement('p');
  subtitle.style.cssText = `
    text-align: center;
    font-size: 15px;
    color: #6b7280;
    margin-bottom: 32px;
  `;
  subtitle.textContent = '让您的亲密关系更和谐美满';
  relationshipGuideContent.appendChild(subtitle);
  
  const scenariosGrid = document.createElement('div');
  scenariosGrid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 24px;
  `;
  
  relationshipTips.scenarios.forEach(scenario => {
    const scenarioCard = document.createElement('div');
    scenarioCard.style.cssText = `
      padding: 24px;
      background: white;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      transition: all 0.3s;
    `;
    
    const icon = document.createElement('div');
    icon.style.cssText = `
      font-size: 40px;
      text-align: center;
      margin-bottom: 16px;
    `;
    icon.textContent = scenario.icon;
    
    const title = document.createElement('h4');
    title.style.cssText = `
      text-align: center;
      color: ${overallColor};
      font-size: 18px;
      margin: 0 0 12px 0;
      font-weight: 600;
    `;
    title.textContent = scenario.title;
    
    const content = document.createElement('p');
    content.style.cssText = `
      font-size: 14px;
      line-height: 1.8;
      color: #4b5563;
      margin: 0;
      text-align: center;
    `;
    content.textContent = scenario.content;
    
    scenarioCard.appendChild(icon);
    scenarioCard.appendChild(title);
    scenarioCard.appendChild(content);
    scenariosGrid.appendChild(scenarioCard);
  });
  
  relationshipGuideContent.appendChild(scenariosGrid);
}

/**
 * 渲染性态度类型特点总结
 */
function renderTypeSummary() {
  const typeSummaryContent = document.getElementById('typeSummaryContent');
  typeSummaryContent.innerHTML = '';
  
  const comprehensiveIndex = reportData.comprehensiveIndex || reportData.totalPercent || 0;
  const overallColor = OVERALL_LEVEL_COLORS[reportData.overallLevel] || '#1890ff';
  
  let advantages = [];
  let challenges = [];
  
  if (comprehensiveIndex < 40) {
    advantages = [
      '💚 内心平和，不被性欲望困扰',
      '🌸 能够享受精神层面的亲密连接',
      '📚 对传统价值观有认同感',
      '🎯 生活重心多元，不会过分依赖性',
      '☮️ 在亲密关系中压力较小'
    ];
    challenges = [
      '🤔 可能与高欲望型伴侣产生频率差异',
      '💭 有时会被误解为"不够在乎对方"',
      '📖 对性话题的了解可能相对有限',
      '🌊 可能需要更多时间来适应新事物'
    ];
  } else if (comprehensiveIndex < 70) {
    advantages = [
      '💙 能够平衡不同的需求和期待',
      '🌟 对亲密关系有积极的态度',
      '💑 愿意为关系质量付出努力',
      '🎨 懂得在不同情境下灵活调整',
      '🤝 重视沟通和相互理解'
    ];
    challenges = [
      '⚖️ 在需求差异时需要寻找平衡点',
      '💬 有时可能难以完全表达内心想法',
      '🎭 需要在不同情境中找到合适的表达方式',
      '🌟 可能会因期待未达成而失落'
    ];
  } else {
    advantages = [
      '🔥 对亲密关系充满热情和活力',
      '💝 敢于表达自己的真实需求',
      '🌈 勇于探索和尝试新鲜事物',
      '⚡ 能够为关系注入激情和能量',
      '💪 重视亲密关系的质量和深度'
    ];
    challenges = [
      '💔 需求未被满足时可能会感到沮丧',
      '🔥 可能因为热情被误解为"只关注性"',
      '⏰ 需要学习管理强烈的欲望和情绪',
      '🤝 找到节奏相似的伴侣可能需要时间'
    ];
  }
  
  const summaryGrid = document.createElement('div');
  summaryGrid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 24px;
  `;
  
  // 优势特点卡片
  const advantagesCard = document.createElement('div');
  advantagesCard.style.cssText = `
    padding: 24px;
    background: linear-gradient(135deg, #d1fae5, #ffffff);
    border-radius: 12px;
    border: 1px solid #6ee7b7;
  `;
  
  const advantagesTitle = document.createElement('div');
  advantagesTitle.style.cssText = `
    display: flex;
    align-items: center;
    margin-bottom: 16px;
  `;
  advantagesTitle.innerHTML = `
    <div style="width: 32px; height: 32px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
      <span style="color: white; font-size: 16px;">✓</span>
    </div>
    <h4 style="margin: 0; color: #065f46; font-size: 18px; font-weight: 600;">您的优势特点</h4>
  `;
  
  const advantagesList = document.createElement('ul');
  advantagesList.style.cssText = `
    list-style: none;
    padding: 0;
    margin: 0;
  `;
  advantages.forEach(adv => {
    const li = document.createElement('li');
    li.style.cssText = `
      padding: 8px 0;
      font-size: 14px;
      line-height: 1.6;
      color: #374151;
    `;
    li.textContent = adv;
    advantagesList.appendChild(li);
  });
  
  advantagesCard.appendChild(advantagesTitle);
  advantagesCard.appendChild(advantagesList);
  
  // 可能的小挑战卡片
  const challengesCard = document.createElement('div');
  challengesCard.style.cssText = `
    padding: 24px;
    background: linear-gradient(135deg, #fef3c7, #ffffff);
    border-radius: 12px;
    border: 1px solid #fcd34d;
  `;
  
  const challengesTitle = document.createElement('div');
  challengesTitle.style.cssText = `
    display: flex;
    align-items: center;
    margin-bottom: 16px;
  `;
  challengesTitle.innerHTML = `
    <div style="width: 32px; height: 32px; background: #f59e0b; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
      <span style="color: white; font-size: 16px;">💡</span>
    </div>
    <h4 style="margin: 0; color: #92400e; font-size: 18px; font-weight: 600;">可能的小挑战</h4>
  `;
  
  const challengesList = document.createElement('ul');
  challengesList.style.cssText = `
    list-style: none;
    padding: 0;
    margin: 0;
  `;
  challenges.forEach(chal => {
    const li = document.createElement('li');
    li.style.cssText = `
      padding: 8px 0;
      font-size: 14px;
      line-height: 1.6;
      color: #374151;
    `;
    li.textContent = chal;
    challengesList.appendChild(li);
  });
  
  challengesCard.appendChild(challengesTitle);
  challengesCard.appendChild(challengesList);
  
  summaryGrid.appendChild(advantagesCard);
  summaryGrid.appendChild(challengesCard);
  typeSummaryContent.appendChild(summaryGrid);
  
  // 底部提示
  const bottomTip = document.createElement('div');
  bottomTip.style.cssText = `
    margin-top: 24px;
    padding: 20px;
    background: ${overallColor}10;
    border-radius: 12px;
    border-left: 4px solid ${overallColor};
    text-align: center;
  `;
  const tipText = document.createElement('div');
  tipText.style.cssText = `
    font-size: 15px;
    line-height: 1.8;
    color: #374151;
    font-style: italic;
  `;
  tipText.textContent = '💡 记住：没有完美的类型，只有适合的相处方式。了解自己，尊重伴侣，找到属于你们的节奏！';
  bottomTip.appendChild(tipText);
  typeSummaryContent.appendChild(bottomTip);
}

/**
 * 渲染人口学个性化分析
 */
function renderDemographicInsights() {
  const demographicInsightsSection = document.getElementById('demographicInsightsSection');
  const demographicInsightsContent = document.getElementById('demographicInsightsContent');
  
  // 检查是否有demographics数据
  const demographics = reportData.demographics || {};
  
  if (!demographics || Object.keys(demographics).length === 0) {
    demographicInsightsSection.style.display = 'none';
    return;
  }
  
  demographicInsightsSection.style.display = 'block';
  demographicInsightsContent.innerHTML = '';
  
  const insights = getDemographicInsights();
  
  if (insights.length === 0) {
    demographicInsightsSection.style.display = 'none';
    return;
  }
  
  insights.forEach(insight => {
    const insightCard = document.createElement('div');
    insightCard.style.cssText = `
      padding: 20px;
      background: linear-gradient(135deg, #f0f9ff, #ffffff);
      border-radius: 12px;
      border: 1px solid #bae6fd;
      margin-bottom: 16px;
    `;
    
    const title = document.createElement('h4');
    title.style.cssText = `
      color: #0369a1;
      font-size: 16px;
      margin: 0 0 12px 0;
      font-weight: 600;
    `;
    title.textContent = `📊 ${insight.title}`;
    
    const content = document.createElement('p');
    content.style.cssText = `
      font-size: 15px;
      line-height: 1.8;
      color: #4b5563;
      margin: 0;
    `;
    content.textContent = insight.content;
    
    insightCard.appendChild(title);
    insightCard.appendChild(content);
    demographicInsightsContent.appendChild(insightCard);
  });
}

/**
 * 获取人口学相关的个性化分析
 */
function getDemographicInsights() {
  const insights = [];
  const demo = reportData.demographics || {};
  
  // 年龄段分析
  if (demo.age) {
    const ageAnalysis = {
      '18-24岁': '您正处在探索自我、形成价值观的精彩年纪！这个阶段的性态度会影响未来的亲密关系。您的测评结果反映了成长环境和个人经历的综合作用，了解自己是很棒的开始。',
      '25-34岁': '这是建立亲密关系的黄金时期！您的性态度会影响关系的甜蜜度和幸福感。了解自己的特点，可以帮助您和伴侣更好地磨合，创造美好的相处方式。',
      '35-44岁': '这个阶段的您有更多的人生智慧和自我觉察。如果有一些想调整的地方，现在正是很好的时机。成熟的心智会让改变变得更容易实现。',
      '45-54岁': '人生的丰富阅历让您更懂得什么对自己重要。这个阶段关注性健康，可以为生活增添更多色彩。年龄从来不是享受亲密关系的障碍。',
      '55岁以上': '性健康是终身的美好话题！保持积极开放的态度，让您的生活质量更高。任何时候开始改善都不算晚，您值得拥有幸福自在的晚年生活。'
    };
    insights.push({
      title: `💫 年龄段特点 (${demo.age})`,
      content: ageAnalysis[demo.age] || '您所处的年龄段有其独特的魅力。'
    });
  }
  
  // 性别认同分析
  if (demo.gender && demo.gender !== '不愿回答') {
    const genderAnalysis = {
      '男性': '作为男性，社会可能对您有一些"应该怎样"的期待。您的测评结果反映了这些期待如何影响您对性的看法。记住，真实的自己比角色期待更重要。',
      '女性': '作为女性，您可能接收过一些关于"女生该怎样"的信息。您的测评结果展现了这些观念对您的影响。每个人都有权利定义自己舒适的亲密方式。',
      '非二元性别': '您的性别认同本身就体现了对传统的超越。您的测评结果需要在这个特别的视角下理解。做真实的自己，是最勇敢的选择。'
    };
    insights.push({
      title: `🎭 性别视角 (${demo.gender})`,
      content: genderAnalysis[demo.gender] || ''
    });
  }
  
  // 关系状态分析
  if (demo.relationship && demo.relationship !== '不便回答') {
    const relationshipAnalysis = {
      '单身': '单身是了解自己的好时机！您可以自由地探索自己的性观念和偏好，为未来的亲密关系做准备。了解自己的性态度特点，会让您在选择伴侣时更有方向。',
      '恋爱中': '恋爱中的甜蜜最重要！您的性态度特点会影响两人相处的舒适度。和伴侣分享这份报告，一起聊聊彼此的想法，会让关系更亲密哦。',
      '已婚/同居': '长期关系需要持续的经营。您的性态度会影响日常的亲密互动。了解自己的特点，和伴侣一起调整，可以为关系注入新的活力。'
    };
    insights.push({
      title: `💕 关系状态特点 (${demo.relationship})`,
      content: relationshipAnalysis[demo.relationship] || ''
    });
  }
  
  // 性生活活跃度分析
  if (demo.activity) {
    const activityAnalysis = {
      '很少(1-3次/年)': '频率不是唯一重要的，质量和舒适度同样重要。您的性态度可能影响了亲密频率，但改变态度可以让每次互动都更有意义。',
      '偶尔(1-3次/月)': '适度的频率对很多人来说是舒适的。如果您想让亲密时光更加愉悦，调整性态度可能会有帮助。',
      '经常(1-3次/周)': '规律的亲密生活很棒！如果能再调整一下心态，让每次都更放松投入，幸福感会成倍提升。',
      '频繁(4次/周以上)': '活跃的亲密生活说明您很重视这个部分。调整性态度可以让高频率的相处质量更上一层楼，让每次都更享受。'
    };
    insights.push({
      title: `🌡️ 亲密频率特点 (${demo.activity})`,
      content: activityAnalysis[demo.activity] || ''
    });
  }
  
  return insights;
}

/**
 * 渲染温馨提示
 */
function renderWarmTips() {
  const warmTipsContent = document.getElementById('warmTipsContent');
  warmTipsContent.innerHTML = '';
  
  const overallLevel = reportData.overallLevel || '平衡型';
  const overallColor = OVERALL_LEVEL_COLORS[overallLevel] || '#1890ff';
  
  let tipsContent = '';
  
  if (overallLevel === '低欲望型') {
    tipsContent = `
      <div style="margin-bottom: 12px;">
        <p style="font-size: 15px; line-height: 1.8; color: #4b5563; margin-bottom: 12px;">
          太棒了！您是"佛系恋爱家"，对性的追求较低，这是一种很健康的状态。您不会被性欲望困扰，内心平静自在。如果您对现状满意，继续保持就很好！
        </p>
        <div style="padding: 16px; background: #f0fdf4; border-radius: 8px; border-left: 4px solid #10b981; text-align: center; font-style: italic;">
          💚 低欲望不代表有问题，找到适合自己的节奏最重要！
        </div>
      </div>
    `;
  } else if (overallLevel === '平衡型') {
    tipsContent = `
      <div style="margin-bottom: 12px;">
        <p style="font-size: 15px; line-height: 1.8; color: #4b5563; margin-bottom: 12px;">
          非常好！您在性态度上保持着理想的平衡。性在您的生活中有适度的位置，您既不会过分追求也不会完全回避。这种平衡让您感到舒适自在。
        </p>
        <ul style="padding-left: 24px; margin-bottom: 12px; line-height: 2; font-size: 15px; color: #4b5563;">
          <li>🎯 继续保持这种平衡的状态</li>
          <li>💬 与伴侣沟通，确保双方都满意</li>
          <li>💑 根据自己的需求灵活调整</li>
          <li>🌟 享受当下的亲密关系</li>
        </ul>
        <div style="padding: 16px; background: #e6f7ff; border-radius: 8px; border-left: 4px solid #1890ff; text-align: center; font-style: italic;">
          💙 平衡是最理想的状态，您做得很好！
        </div>
      </div>
    `;
  } else if (overallLevel === '高欲望型') {
    tipsContent = `
      <div style="margin-bottom: 12px;">
        <p style="font-size: 15px; line-height: 1.8; color: #4b5563; margin-bottom: 12px;">
          您是"开放探索者"，对性持相对开放的态度，性在您的生活中有一定重要性。享受这份热情，同时也要找到双方的平衡：
        </p>
        <ul style="padding-left: 24px; margin-bottom: 12px; line-height: 2; font-size: 15px; color: #4b5563;">
          <li>💑 与伴侣沟通彼此的需求和节奏</li>
          <li>🗣️ 坦诚表达，同时也尊重对方</li>
          <li>💞 探索双方都舒适的亲密方式</li>
          <li>🎯 尝试更多增进关系的创意方式</li>
        </ul>
        <div style="padding: 16px; background: #fffbeb; border-radius: 8px; border-left: 4px solid #f59e0b; text-align: center; font-style: italic;">
          💛 性欲强是您的个性特点，关键是双方都感到幸福！
        </div>
      </div>
    `;
  } else {
    tipsContent = `
      <div style="margin-bottom: 12px;">
        <p style="font-size: 15px; line-height: 1.8; color: #4b5563; margin-bottom: 12px;">
          您是"激情主义者"，性欲望很强，性在您的生活中非常重要。强烈的性欲是完全正常的，这是您的个性特点：
        </p>
        <ul style="padding-left: 24px; margin-bottom: 12px; line-height: 2; font-size: 15px; color: #4b5563;">
          <li>💑 与伴侣深度沟通，寻找平衡点</li>
          <li>📚 学习如何健康地表达和满足需求</li>
          <li>🤝 理解伴侣可能有不同的节奏</li>
          <li>🌈 探索让双方都满意的创意方式</li>
          <li>💪 保持耐心，相互理解和包容</li>
        </ul>
        <div style="padding: 16px; background: #fff7ed; border-radius: 8px; border-left: 4px solid #f97316; text-align: center; font-style: italic;">
          🧡 强烈的性欲不是问题，享受这份激情，同时也尊重伴侣的节奏！
        </div>
      </div>
    `;
  }
  
  warmTipsContent.innerHTML = tipsContent;
}

/**
 * 渲染底部说明
 */
function renderFooterInfo() {
  const reportFooterInfo = document.getElementById('reportFooterInfo');
  
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
  
  reportFooterInfo.innerHTML = `
    <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 14px; background: rgba(255, 255, 255, 0.8); border-radius: 12px; border: 1px solid #e5e7eb; margin-bottom: 16px;">
      <div style="margin-bottom: 8px;">
        报告生成时间：${dateStr}
      </div>
      <div style="font-size: 12px; line-height: 1.6; color: #9ca3af;">
        本报告基于性态度量表(SRI)生成,综合了SIS/SES-SF、Mosher性罪恶感量表、KISS-9等经典测评工具。
        <br />
        这是一个娱乐性质的自我探索测评，帮助您了解自己的性态度类型。结果仅供参考和娱乐。
        <br />
        每个人的性态度都是独特的，没有好坏之分，找到适合自己的节奏最重要。
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

