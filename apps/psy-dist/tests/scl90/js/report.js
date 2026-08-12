/**
 * SCL-90 报告页面逻辑
 * 完全独立的实现，不依赖任何外部框架
 */

import { FACTOR_ORDER, FACTOR_NAMES } from '../data/questions.js';
import { getTestResult } from './utils/storage.js';

// 报告数据
let reportData = null;

/**
 * 添加推广链接到页面底部
 * 根据需求文档，在所有测试页面（包括报告页）底部自动显示推广链接
 */
function addPromotionLink() {
  // 检查是否已经添加过推广链接（避免重复添加）
  if (document.getElementById('link-validator-promotion-link')) {
    return;
  }

  // 检测页面是否已有底部区域
  // 注意：报告页面的 .report-footer 是重新测试按钮区域，不要使用
  // 优先使用 .report-footer-note（报告页面的说明区域）
  let footer = document.querySelector('.report-footer-note') ||
                document.querySelector('.test-footer') || 
                document.querySelector('footer');

  // 如果是报告页面，在 .report-footer（重新测试按钮）后面添加推广链接区域
  const isReportPage = window.location.pathname.includes('report.html');
  
  if (isReportPage) {
    // 报告页面：在 .report-footer（重新测试按钮）后面创建一个新的推广链接区域
    const reportFooter = document.querySelector('.report-footer');
    if (reportFooter) {
      // 在 .report-footer 后面创建一个新的推广链接区域
      footer = document.createElement('div');
      footer.className = 'link-validator-promotion-footer';
      // 检查是否是移动端，移动端需要更多的底部间距（因为固定定位的按钮）
      const isMobile = window.innerWidth <= 768;
      const bottomPadding = isMobile ? '100px' : '80px';
      footer.style.cssText = `
        text-align: center;
        padding: 20px;
        padding-bottom: ${bottomPadding};
        margin-top: 20px;
        margin-bottom: 0;
        border-top: 1px solid #eee;
        background-color: #fafafa;
        position: relative;
        z-index: 1;
        width: 100%;
        box-sizing: border-box;
      `;
      // 插入到 .report-footer 后面
      reportFooter.parentNode.insertBefore(footer, reportFooter.nextSibling);
    } else {
      // 如果没有 .report-footer，创建新的底部区域
      footer = document.createElement('div');
      footer.className = 'link-validator-promotion-footer';
      const isMobile = window.innerWidth <= 768;
      const bottomPadding = isMobile ? '100px' : '80px';
      footer.style.cssText = `
        text-align: center;
        padding: 20px;
        padding-bottom: ${bottomPadding};
        margin-top: 40px;
        margin-bottom: 0;
        border-top: 1px solid #eee;
        background-color: #fafafa;
        position: relative;
        z-index: 1;
        width: 100%;
        box-sizing: border-box;
      `;
      document.body.appendChild(footer);
    }
  } else {
    // 非报告页面：使用现有的底部区域或创建新的
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'link-validator-promotion-footer';
      const isMobile = window.innerWidth <= 768;
      const bottomPadding = isMobile ? '100px' : '80px';
      footer.style.cssText = `
        text-align: center;
        padding: 20px;
        padding-bottom: ${bottomPadding};
        margin-top: 40px;
        margin-bottom: 0;
        border-top: 1px solid #eee;
        background-color: #fafafa;
        position: relative;
        z-index: 1;
        width: 100%;
        box-sizing: border-box;
      `;
      document.body.appendChild(footer);
    }
  }

  // 创建推广链接容器
  const promotionContainer = document.createElement('div');
  promotionContainer.id = 'link-validator-promotion-link';
  promotionContainer.style.cssText = `
    color: #666;
    font-size: 14px;
    line-height: 1.6;
    margin: 0;
  `;

  // 创建推广链接文本和链接
  const promotionText = document.createTextNode('如果您也想为他人提供测试服务，');
  const promotionLink = document.createElement('a');
  promotionLink.href = '/';
  promotionLink.target = '_blank';
  promotionLink.rel = 'noopener noreferrer';
  promotionLink.textContent = '点击这里了解更多';
  promotionLink.style.cssText = `
    color: #1890ff;
    text-decoration: none;
    cursor: pointer;
  `;
  
  // 添加链接悬停效果
  promotionLink.addEventListener('mouseenter', function() {
    this.style.textDecoration = 'underline';
  });
  promotionLink.addEventListener('mouseleave', function() {
    this.style.textDecoration = 'none';
  });

  // 移动端适配：调整字体大小和间距
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    promotionContainer.style.fontSize = '13px';
    promotionContainer.style.padding = '15px 10px';
  }

  // 组装推广链接
  promotionContainer.appendChild(promotionText);
  promotionContainer.appendChild(promotionLink);

  // 添加到底部区域
  footer.appendChild(promotionContainer);

  console.log('推广链接已添加到报告页面底部');
}

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
  
  // 尝试匹配 /test/{test_code}/{token} 格式（普通模式）
  const standardMatch = path.match(/^\/test\/([^\/]+)\/([^\/]+)$/);
  if (standardMatch) {
    return standardMatch[2];
  }
  
  // 尝试匹配 /tests/{test_code}/index.html?token={token} 格式
  const staticFileMatch = path.match(/^\/tests\/([^\/]+)\/index\.html$/);
  if (staticFileMatch && tokenFromQuery) {
    return tokenFromQuery;
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
        // 验证token格式（通常是长字符串）
        if (token && token.length > 10) {
          return token;
        }
      }
    }
  } catch (e) {
    console.warn('从localStorage获取token失败:', e);
  }
  
  // 方法3：从SDK实例中获取（如果已初始化）
  if (window.linkValidator && window.linkValidator.token) {
    return window.linkValidator.token;
  }
  
  return null;
}

/**
 * 获取测试页面的URL（带token）
 * @returns {string} 测试页面URL
 */
function getTestPageUrl() {
  const token = getToken();
  const testCode = 'scl90'; // SCL90测试代码
  
  // 检查是否是无限测试模式（通过URL参数判断）
  const urlParams = new URLSearchParams(window.location.search);
  const isUnlimited = urlParams.get('unlimited') === 'true';
  
  if (token) {
    if (isUnlimited) {
      // 无限测试模式：/test/{test_code}?unlimited=true&token={token}
      return `/test/${testCode}?unlimited=true&token=${token}`;
    } else {
      // 普通模式：/test/{test_code}/{token}
      return `/test/${testCode}/${token}`;
    }
  } else {
    // 如果无法获取token，返回不带token的URL（会触发SDK错误提示）
    return 'index.html';
  }
}

// 将函数暴露到全局作用域，供HTML的onclick调用
window.getTestPageUrl = getTestPageUrl;

// 严重程度颜色映射
const SEVERITY_COLORS = {
  '有点': '#52c41a',      // 浅绿色
  '轻微': '#73d13d',      // 稍深绿色
  '中度': '#fa8c16',      // 橙色
  '重度': '#ff4d4f'       // 红色
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM加载完成，开始初始化报告...');
  console.log('健康综述元素存在:', !!document.getElementById('healthSummaryContent'));
  console.log('底部说明元素存在:', !!document.getElementById('reportFooterNote'));
  console.log('分析底部说明元素存在:', !!document.getElementById('analysisFooterNote'));
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
    
    // 检查是否是无限测试模式（通过URL参数判断）
    const urlParams = new URLSearchParams(window.location.search);
    const isUnlimited = urlParams.get('unlimited') === 'true';
    
    // 获取测试结果
    console.log('尝试获取测试结果...');
    const resultData = getTestResult();
    console.log('获取到的测试结果:', resultData);
    
    // 如果是无限测试模式，且没有测试结果（说明是刷新页面），清除结果并跳转到测试页面
    if (isUnlimited && (!resultData || !resultData.result)) {
      console.log('无限测试模式：刷新报告页且无测试结果，清除结果并跳转到测试页面');
      
      // 清除无限测试结果
      // 尝试从SDK实例获取adminId和testCode
      if (window.linkValidator && window.linkValidator.unlimited) {
        const adminId = window.linkValidator.adminId;
        const testCode = window.linkValidator.testCode || 'scl90';
        
        // 清除无限测试结果
        if (window.linkValidator.clearLocalResult) {
          window.linkValidator.clearLocalResult();
        } else {
          // 手动清除
          const storageKey = `unlimited_test_result_${adminId}_${testCode}`;
          localStorage.removeItem(storageKey);
          console.log('已清除无限测试结果:', storageKey);
        }
      } else {
        // 如果SDK未初始化，尝试遍历localStorage清除所有无限测试结果
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('unlimited_test_result_')) {
              localStorage.removeItem(key);
              console.log('已清除无限测试结果:', key);
            }
          }
        } catch (e) {
          console.warn('清除无限测试结果失败:', e);
        }
      }
      
      // 跳转到测试页面
      showLoading(false);
      window.location.href = getTestPageUrl();
      return;
    }
    
    if (!resultData || !resultData.result) {
      // 没有测试结果，显示提示
      console.warn('未找到测试结果，可能的原因：1. localStorage被浏览器阻止 2. 还未完成测试');
      
      // 至少显示页面结构，即使没有测试结果
      showLoading(false);
      
      // 显示提示信息
      const healthSummaryContent = document.getElementById('healthSummaryContent');
      if (healthSummaryContent) {
        healthSummaryContent.innerHTML = `
          <div class="health-summary-card" style="background: #fff3cd; border: 1px solid #ffc107; padding: 20px; border-radius: 12px; text-align: center;">
            <h3 style="color: #856404; margin: 0 0 16px 0;">⚠️ 未找到测试结果</h3>
            <p style="color: #856404; margin: 0 0 12px 0;">
              可能的原因：<br>
              1. 浏览器的跟踪防护阻止了数据存储<br>
              2. 还未完成测试
            </p>
            <button onclick="window.location.href=getTestPageUrl()" style="padding: 10px 20px; background: #ffc107; border: none; border-radius: 8px; color: #856404; font-weight: 600; cursor: pointer; margin-top: 12px;">
              前往测试页面
            </button>
          </div>
        `;
      }
      
      const footerNote = document.getElementById('reportFooterNote');
      if (footerNote) {
        footerNote.innerHTML = `
          <div class="footer-note-content">
            <div class="footer-note-time">报告生成时间：${new Date().toLocaleString('zh-CN')}</div>
            <div class="footer-note-disclaimer">
              此报告基于 SCL-90 症状自评量表生成，仅供参考，不能替代专业诊断。<br>
              如需进一步评估或治疗建议，请咨询专业心理健康服务提供者。
            </div>
          </div>
        `;
      }
      
      // 添加推广链接（即使没有测试结果也显示）
      addPromotionLink();
      
      // 5秒后自动跳转
      setTimeout(() => {
        window.location.href = getTestPageUrl();
      }, 5000);
      return;
    }
    
    reportData = resultData.result;
    
    // 添加推广链接（报告页面也需要显示）
    addPromotionLink();
    
    // 计算总体严重程度和解释
    const overallSeverity = calculateOverallSeverity(reportData);
    reportData.severity = overallSeverity.level;
    reportData.totalScore = reportData.totalRawScore;
    reportData.interpretation = generateInterpretation(reportData, overallSeverity);
    
  // 渲染报告
  console.log('开始渲染报告...');
  renderReport();
  console.log('报告渲染完成');
  
  // 渲染雷达图
  renderRadarChart();
    
    // 渲染健康综述
    console.log('开始渲染健康综述...');
    renderHealthSummary();
    
    // 渲染底部说明
    console.log('开始渲染底部说明...');
    renderFooterNotes();
    
    console.log('所有内容渲染完成');
    showLoading(false);
    
  } catch (error) {
    console.error('加载报告失败:', error);
    showLoading(false);
    alert('加载报告失败，请刷新页面重试。');
  }
}

/**
 * 计算总体严重程度
 */
function calculateOverallSeverity(result) {
  const avgScore = result.totalAverageScore;
  
  if (avgScore >= 4.0) {
    return { level: '重度', color: '#ff4d4f' };
  } else if (avgScore >= 3.0) {
    return { level: '中度', color: '#fa8c16' };
  } else if (avgScore >= 2.0) {
    return { level: '轻微', color: '#73d13d' };
  } else {
    return { level: '有点', color: '#52c41a' };
  }
}

/**
 * 生成总体解释
 */
function generateInterpretation(result, severity) {
  const avgScore = result.totalAverageScore;
  const positiveItems = result.totalPositiveItems;
  
  if (severity.level === '有点') {
    return `您的SCL-90总均分为${avgScore.toFixed(2)}分，心理健康状况良好。90个题目中有${positiveItems}个阳性项目（得分≥2），整体症状水平在正常范围内。建议继续保持良好的生活习惯和心理健康状态。`;
  } else if (severity.level === '轻微') {
    return `您的SCL-90总均分为${avgScore.toFixed(2)}分，心理健康状况处于轻微水平。90个题目中有${positiveItems}个阳性项目（得分≥2），存在一些轻微的心理困扰。建议关注心理健康，适当调整生活方式，必要时寻求专业帮助。`;
  } else if (severity.level === '中度') {
    return `您的SCL-90总均分为${avgScore.toFixed(2)}分，心理健康状况处于中度水平。90个题目中有${positiveItems}个阳性项目（得分≥2），存在一定程度的心理困扰。建议及时关注心理健康，调整生活方式，积极寻求专业帮助。`;
  } else {
    return `您的SCL-90总均分为${avgScore.toFixed(2)}分，心理健康状况处于重度水平。90个题目中有${positiveItems}个阳性项目（得分≥2），存在较严重的心理困扰。建议尽快寻求专业的心理健康评估和治疗。`;
  }
}

/**
 * 获取因子的严重程度
 */
function getFactorSeverity(score) {
  const numScore = typeof score === 'number' ? score : parseFloat(score);
  if (isNaN(numScore)) return { level: '数据异常', color: '#d9d9d9' };
  
  if (numScore >= 4.0) return { level: '重度', color: '#ff4d4f' };
  if (numScore >= 3.0) return { level: '中度', color: '#fa8c16' };
  if (numScore >= 2.0) return { level: '轻微', color: '#73d13d' };
  return { level: '有点', color: '#52c41a' };
}

/**
 * 渲染报告
 */
function renderReport() {
  // 渲染报告头部
  renderReportHeader();
  
  // 渲染总体评估结果
  renderOverallResult();
  
  // 渲染因子维度详情
  renderFactors();
  
  // 渲染详细因子分析
  renderDetailedAnalysis();
}

/**
 * 渲染雷达图
 */
function renderRadarChart() {
  const canvas = document.getElementById('radarChart');
  if (!canvas || !reportData) return;
  
  // 检测是否为移动端
  const isMobile = window.innerWidth <= 768;
  
  // 响应式调整canvas大小
  const container = canvas.parentElement;
  const containerWidth = container.clientWidth;
  const size = isMobile 
    ? Math.min(containerWidth - 10, 600) // 移动端增大到600px，减少边距
    : Math.min(containerWidth - 40, 800); // 桌面端最大800px
  canvas.width = size;
  canvas.height = size;
  
  const ctx = canvas.getContext('2d');
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  // 移动端留出空间给标签，但不要太多
  const radius = isMobile 
    ? Math.min(centerX, centerY) - 75 // 减少留白，让图表更大
    : Math.min(centerX, centerY) - 100;
  
  // 获取因子数据
  const factors = FACTOR_ORDER.map(key => ({
    name: FACTOR_NAMES[key],
    score: reportData.factorScores[key]?.averageScore || 0,
    key: key
  }));
  
  const factorCount = factors.length;
  const angleStep = (Math.PI * 2) / factorCount;
  
  // 清空画布
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 绘制背景网格
  drawRadarGrid(ctx, centerX, centerY, radius, factorCount, angleStep, isMobile);
  
  // 绘制数据区域
  drawRadarData(ctx, canvas, centerX, centerY, radius, factors, angleStep, isMobile);
  
  // 绘制标签
  drawRadarLabels(ctx, centerX, centerY, radius, factors, angleStep, isMobile);
}

/**
 * 绘制雷达图网格
 */
function drawRadarGrid(ctx, centerX, centerY, radius, factorCount, angleStep, isMobile = false) {
  // 绘制同心圆（5个等级，对应1.0-5.0）
  for (let level = 1; level <= 5; level++) {
    const r = (radius * level) / 5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = isMobile ? 1 : 1.5;
    ctx.stroke();
  }
  
  // 绘制轴线
  for (let i = 0; i < factorCount; i++) {
    const angle = i * angleStep - Math.PI / 2; // 从顶部开始
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = isMobile ? 1 : 1.5;
    ctx.stroke();
  }
}

/**
 * 绘制雷达图数据
 */
function drawRadarData(ctx, canvas, centerX, centerY, radius, factors, angleStep, isMobile = false) {
  ctx.beginPath();
  
  factors.forEach((factor, index) => {
    const angle = index * angleStep - Math.PI / 2;
    // 将分数（1.0-5.0）映射到半径（0-radius）
    const scoreRadius = (factor.score / 5) * radius;
    const x = centerX + Math.cos(angle) * scoreRadius;
    const y = centerY + Math.sin(angle) * scoreRadius;
    
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  
  ctx.closePath();
  
  // 填充区域
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, 'rgba(24, 144, 255, 0.5)');
  gradient.addColorStop(1, 'rgba(24, 144, 255, 0.2)');
  ctx.fillStyle = gradient;
  ctx.fill();
  
  // 绘制边框
  ctx.strokeStyle = '#1890ff';
  ctx.lineWidth = isMobile ? 2 : 3;
  ctx.stroke();
  
  // 绘制数据点
  factors.forEach((factor, index) => {
    const angle = index * angleStep - Math.PI / 2;
    const scoreRadius = (factor.score / 5) * radius;
    const x = centerX + Math.cos(angle) * scoreRadius;
    const y = centerY + Math.sin(angle) * scoreRadius;
    
    // 根据分数确定颜色
    const severity = getFactorSeverity(factor.score);
    
    ctx.beginPath();
    ctx.arc(x, y, isMobile ? 5 : 7, 0, Math.PI * 2);
    ctx.fillStyle = severity.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = isMobile ? 2 : 2.5;
    ctx.stroke();
  });
}

/**
 * 绘制雷达图标签
 */
function drawRadarLabels(ctx, centerX, centerY, radius, factors, angleStep, isMobile = false) {
  // 根据设备类型调整字体大小和间距
  const nameFontSize = isMobile ? 13 : 18;
  const scoreFontSize = isMobile ? 12 : 16;
  const levelFontSize = isMobile ? 11 : 14;
  const labelOffset = isMobile ? 30 : 40;
  const scoreVerticalOffset = isMobile ? 18 : 25; // 分数垂直偏移，避免与名称重叠
  const levelLabelOffset = isMobile ? 15 : 20;
  
  ctx.font = `bold ${nameFontSize}px Arial, "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1f2937';
  
  factors.forEach((factor, index) => {
    const angle = index * angleStep - Math.PI / 2;
    const labelRadius = radius + labelOffset;
    const x = centerX + Math.cos(angle) * labelRadius;
    const y = centerY + Math.sin(angle) * labelRadius;
    
    // 绘制因子名称
    ctx.textBaseline = 'bottom'; // 名称底部对齐
    ctx.fillText(factor.name, x, y);
    
    // 绘制分数 - 放在名称下方，垂直向下偏移
    const scoreX = x; // 与名称水平对齐
    // 垂直向下偏移，不依赖角度
    const scoreY = y + scoreVerticalOffset;
    
    const severity = getFactorSeverity(factor.score);
    ctx.fillStyle = severity.color;
    ctx.font = `bold ${scoreFontSize}px Arial, "Microsoft YaHei", sans-serif`;
    ctx.textBaseline = 'top'; // 分数顶部对齐
    ctx.fillText(factor.score.toFixed(2), scoreX, scoreY);
    ctx.fillStyle = '#1f2937';
    ctx.font = `bold ${nameFontSize}px Arial, "Microsoft YaHei", sans-serif`;
    ctx.textBaseline = 'middle'; // 恢复默认
  });
  
  // 绘制中心等级标签（移动端不显示，避免拥挤）
  if (!isMobile) {
    for (let level = 1; level <= 5; level++) {
      const r = (radius * level) / 5;
      const labelX = centerX + r + levelLabelOffset;
      const labelY = centerY;
      
      ctx.fillStyle = '#6b7280';
      ctx.font = `${levelFontSize}px Arial, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(level.toFixed(1), labelX, labelY);
      ctx.textAlign = 'center';
    }
  }
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
 * 渲染总体评估结果
 */
function renderOverallResult() {
  const severity = reportData.severity || '有点';
  const severityInfo = calculateOverallSeverity(reportData);
  
  // 更新总分
  document.getElementById('totalScore').textContent = reportData.totalRawScore || 0;
  document.getElementById('totalScore').style.color = severityInfo.color;
  
  // 更新严重程度
  const severityBadge = document.getElementById('severityBadge');
  severityBadge.textContent = severity;
  severityBadge.style.background = severityInfo.color;
  severityBadge.style.boxShadow = `0 8px 24px ${severityInfo.color}40`;
  
  // 更新副标题
  const subtitle = document.getElementById('severitySubtitle');
  if (severity === '有点') {
    subtitle.textContent = '状态良好';
  } else if (severity === '轻微') {
    subtitle.textContent = '需要关注';
  } else if (severity === '中度') {
    subtitle.textContent = '需要重视';
  } else {
    subtitle.textContent = '需要专业帮助';
  }
  subtitle.style.color = severityInfo.color;
  
  // 更新解释
  const interpretation = document.getElementById('overallInterpretation');
  interpretation.innerHTML = `<p>${reportData.interpretation || ''}</p>`;
  interpretation.style.background = `linear-gradient(135deg, ${severityInfo.color}08, ${severityInfo.color}03)`;
  interpretation.style.borderColor = `${severityInfo.color}20`;
}



/**
 * SCL-90 因子详细特征和建议数据
 */
const FACTOR_CHARACTERISTICS = {
  'somatization': {
    name: '躯体化',
    description: '反映身体不适感和植物神经功能紊乱症状',
    levels: {
      '有点': {
        characteristics: '身体感觉良好，精力充沛，睡眠质量佳。很少出现不明原因的身体不适，植物神经系统功能稳定。能够正常应对日常活动，身体各系统协调运作，对身体变化有正常的感知度，不会过度关注轻微的身体感觉。',
        advice: '继续保持良好的生活习惯：每天7-8小时规律睡眠，坚持适量有氧运动（如快走、游泳），保持均衡饮食，定期体检。建立健康的压力管理方式，如深呼吸练习、瑜伽或冥想。'
      },
      '轻微': {
        characteristics: '偶尔出现轻微的身体不适感，如间歇性头痛、轻度疲劳、偶发的胃肠不适。这些症状通常在压力增大或过度劳累时出现，症状持续时间较短，不严重影响日常活动。可能对身体感觉比平常更敏感，容易注意到轻微的身体变化。',
        advice: '学会识别压力信号，建立规律的作息时间表。每天进行20-30分钟的放松练习，如深呼吸、渐进性肌肉放松。适当减少工作压力，增加休息时间。保持适度运动，注意劳逸结合。必要时记录症状日志，观察诱发因素。'
      },
      '中度': {
        characteristics: '经常感到身体不适，出现多种躯体症状如持续性头痛、胸闷气短、消化不良、肌肉紧张、心悸等。症状较为持久，开始影响工作效率和生活质量。可能出现睡眠障碍、食欲改变。对身体感觉过度敏感，容易将轻微症状放大。',
        advice: '建立系统的身心调节计划：每天进行30-45分钟的有氧运动，如快走、游泳、瑜伽；学习深度放松技巧，包括渐进性肌肉放松和腹式呼吸；调整饮食习惯，减少咖啡因、酒精和加工食品摄入；建立规律的睡眠时间表，创造安静舒适的睡眠环境；学习正念冥想，每天练习15-20分钟；记录症状日志，识别引发因素并逐步改善；与信任的朋友家人分享感受，建立情感支持网络。'
      },
      '重度': {
        characteristics: '频繁出现严重的身体症状，如剧烈头痛、严重心悸、持续胃肠道症状、明显疲劳乏力、多部位疼痛等。症状严重影响日常功能，可能无法正常工作或学习。常伴有植物神经功能严重紊乱，如出汗异常、血压波动、睡眠严重障碍。对身体症状极度关注和担忧。',
        advice: '优先进行基础的身心稳定措施：确保每天有充足的休息和睡眠，避免过度劳累；进行温和的身体活动，如散步、太极、轻柔瑜伽；学习并坚持练习深呼吸和放松技巧，每次症状加重时立即使用；简化日常生活，减少不必要的压力源；与家人朋友建立强有力的支持系统，不要独自承受；尝试分散注意力的活动，如听音乐、阅读、手工制作；记录每日症状变化和可能的诱发因素；建议寻求专业帮助进行全面评估和治疗。'
      }
    }
  },
  'obsessiveCompulsive': {
    name: '强迫症状',
    description: '反映强迫思维和强迫行为的严重程度',
    levels: {
      '有点': {
        characteristics: '思维灵活自然，能够有效控制自己的想法和行为。决策过程相对轻松，不会过度纠结于细节。能够接受事物的不完美，不会因为小的瑕疵而过分困扰。对于重要事务有合理的谨慎，但不会发展成重复性行为。思维流畅，不会被某些特定想法长时间占据。',
        advice: '保持当前良好的心理状态，继续培养灵活的思维方式。适度的完美主义是健康的，但要学会在追求完美和效率之间找到平衡。定期进行自我反思，培养接纳不完美的心态。'
      },
      '轻微': {
        characteristics: '偶尔会有重复性的想法或需要重复检查某些事情，如反复确认门是否锁好、作业是否做对等，但一般能够控制并停止这些行为。在重要事情上可能表现出轻微的完美主义倾向，会为小错误感到不安。有时会被某些想法困扰，但不会持续太长时间。',
        advice: '学会接受"足够好"的标准，训练自己在检查1-2次后就停止。练习正念冥想，学会观察自己的想法而不被其控制。当出现重复想法时，可以通过转移注意力、运动或与他人交谈来缓解。建立更加灵活的思维模式。'
      },
      '中度': {
        characteristics: '经常出现强迫性思维，难以摆脱某些固定想法，如担心细菌感染、害怕伤害他人等。可能出现重复检查、过度清洁、反复计数、排列整齐等强迫行为。这些症状开始影响日常生活效率，可能需要额外时间来完成强迫行为。感到焦虑和痛苦，明知这些想法和行为不合理但难以控制。',
        advice: '学习并练习延迟反应技术：当强迫想法出现时，告诉自己"等待15分钟再行动"，逐渐延长等待时间；使用思维阻断技术，当强迫想法出现时大声说"停止"或进行其他活动转移注意力；设定检查次数限制，如只允许自己检查门锁2次，然后强制离开；练习接受不确定性，学会容忍"可能出错"的感觉；建立规律的日程安排，减少空闲时间让强迫思维有机会出现；寻找替代行为，如当想要过度清洁时改为整理物品；与家人朋友分享您的困扰，请他们帮助监督和支持您减少强迫行为。'
      },
      '重度': {
        characteristics: '严重的强迫思维和行为，无法控制重复性想法和行为，可能占用每天数小时时间。强迫症状严重干扰日常生活、工作和人际关系，可能无法按时完成工作或社交活动。可能出现极端的清洁行为、检查行为或其他仪式性行为。感到极度痛苦和无助，生活质量严重下降。',
        advice: '建立基础的日常生活结构：制定固定的作息时间，确保基本的生活需求得到满足；请家人朋友协助监督，在您想要进行强迫行为时提供支持和干预；学习基础的放松和接地技巧，如深呼吸、感官接地法（说出5样看到的、4样听到的、3样摸到的等）；简化生活环境，减少可能触发强迫行为的物品或情境；设定每日最基本的目标，如吃饭、洗澡、睡觉，不给自己太大压力；寻找安全的发泄方式，如运动、艺术创作、写日记；建立紧急应对计划，当强迫症状特别严重时知道该联系谁、该做什么；建议寻求专业心理治疗帮助。'
      }
    }
  },
  'interpersonalSensitivity': {
    name: '人际关系敏感',
    description: '反映在人际交往中的敏感性和不适感',
    levels: {
      '有点': {
        characteristics: '在人际交往中感到自在自然，能够建立和维持良好的人际关系。对他人的评价有适度的在意，但不会过分担心或影响自己的行为。能够在不同的社交场合中表现得体，既不过分迎合他人也不完全忽视他人感受。具有良好的社交技能，能够有效沟通和解决人际冲突。',
        advice: '继续保持开放和真诚的交流方式，培养更深层的同理心和情感智慧。在人际关系中保持健康的边界，学会说"不"和表达自己的需求。多参与不同类型的社交活动，扩展人际网络。'
      },
      '轻微': {
        characteristics: '对他人的态度和反应比较敏感，容易察觉到人际关系中的细微变化，如他人语调的变化、表情的微妙差异等。可能会担心他人对自己的看法，偶尔会过度解读他人的言行。在社交场合中可能会感到轻微的不安，但一般不会影响正常的社交功能。',
        advice: '练习客观评估他人的反应，学会区分事实和自己的想象。可以尝试直接询问他人的想法而非猜测。建议参与一些团体活动或志愿服务，在轻松的环境中增强社交信心。学习基本的沟通技巧和冲突解决方法。'
      },
      '中度': {
        characteristics: '在人际交往中明显感到不适和紧张，过分在意他人的评价和态度，经常担心自己是否被他人接受或喜欢。可能会避免某些社交场合，如聚会、演讲或团体活动。在与他人交往时容易感到焦虑，担心说错话或做错事。可能出现取悦他人的行为模式，难以表达自己的真实想法。',
        advice: '练习自我关怀和接纳：每天写下3件自己做得好的事情，提升自我价值感；学习设定健康的人际边界，练习说"不"和表达自己的需求；从低压力的社交场合开始，如一对一的咖啡聊天，逐步扩展到小组活动；使用积极的自我对话，当担心他人评价时提醒自己"我不能控制他人的想法，但可以做真实的自己"；练习深呼吸和放松技巧，在社交前后进行自我安抚；建立支持网络，与理解您的朋友分享感受；观察和挑战消极的思维模式，问自己"这个担心是基于事实还是假设？"；参与自己感兴趣的团体活动，通过共同兴趣建立自然的社交联系。'
      },
      '重度': {
        characteristics: '严重的人际敏感和社交恐惧，极度害怕他人的负面评价，可能出现明显的社交回避行为。严重影响工作、学习和生活中的人际关系，可能导致社交孤立。在必须进行社交的场合中会感到极度焦虑，甚至出现恐慌症状。可能发展出完全依赖某几个人或完全孤立的极端行为模式。',
        advice: '从最基础的自我照顾开始：建立每日的自我关爱仪式，如洗澡、整理房间、听喜欢的音乐；通过在线平台或书籍等非面对面方式与世界保持联系；与一位最信任的人保持定期联系，哪怕只是短信问候；练习在镜子前与自己对话，提升自我接纳度；学习基础的应急技巧，如在感到恐慌时使用深呼吸或接地技术；设定非常小的社交目标，如向邻居点头问好，庆祝每一个小进步；寻找安全的表达方式，如写日记、绘画或音乐，来处理内心的情感；利用网络社群寻找理解和支持，与有类似经历的人交流；如果可能，请信任的人陪同参加必要的社交场合；建议寻求专业的心理治疗支持。'
      }
    }
  },
  'depression': {
    name: '抑郁',
    description: '反映抑郁情绪和相关症状的严重程度',
    levels: {
      '有点': {
        characteristics: '情绪状态稳定积极，对生活保持乐观的态度和合理的期待。能够体验到快乐和满足感，对日常活动保持兴趣和动机。具有良好的抗挫折能力，能够从困难中恢复并学习成长。对未来有明确的希望和可行的计划，能够设定目标并为之努力。睡眠质量良好，食欲正常，精力充沛。',
        advice: '继续保持积极的生活态度，定期培养和发展多样化的兴趣爱好。维持良好的社会支持网络，与亲友保持密切联系。建立健康的生活习惯，包括规律运动、充足睡眠和均衡饮食。学会感恩和正面思考的技巧。'
      },
      '轻微': {
        characteristics: '偶尔感到情绪低落、沮丧或忧郁，但这些情绪通常是暂时的，能够通过自我调节或外界支持得到缓解。可能在面对压力、挫折或失望时出现消极情绪，但不会持续太长时间。总体上仍能保持对生活的基本兴趣，睡眠和食欲可能偶有波动但不严重影响日常功能。',
        advice: '学会识别和表达自己的情绪，不要压抑负面感受。建立良好的情绪调节习惯，如写日记、与朋友倾诉。通过运动、音乐、艺术等方式改善心情。保持规律的作息时间，确保充足睡眠。建立支持网络，在情绪低落时主动寻求帮助。'
      },
      '中度': {
        characteristics: '经常感到沮丧、悲伤、空虚或绝望，这些情绪持续时间较长且难以自行缓解。对以前感兴趣的活动明显失去兴趣或快感，可能包括工作、社交、娱乐等。出现明显的睡眠障碍（失眠或过度睡眠）和食欲改变（食欲不振或暴饮暴食）。感到疲劳、无精打采，注意力和决策能力下降，开始影响工作和学习效率。',
        advice: '建立基础的情绪调节习惯：每天强制自己进行15-30分钟的轻度运动，如散步或伸展；建立固定的睡眠时间表，即使不想睡觉也要按时上床；每天记录3件小事值得感恩，训练大脑关注积极面；与至少一位信任的人保持定期联系，分享真实感受；将大任务分解成小步骤，每完成一步就给自己肯定；尝试参与让人感到被需要的活动，如照顾植物、宠物或志愿服务；限制社交媒体使用时间，避免与他人比较；学习识别和挑战消极思维，问自己"这个想法是事实还是情绪"；保持基本的个人卫生和营养，即使感觉不想做也要坚持。'
      },
      '重度': {
        characteristics: '持续严重的抑郁情绪，几乎每天大部分时间都感到极度沮丧、绝望和无助。完全失去对任何活动的兴趣或快感，严重的睡眠和食欲障碍。可能出现强烈的无价值感、过度的内疚感。注意力严重受损，思维迟缓，决策困难。严重影响工作、学习和人际关系，可能无法正常生活。可能出现自伤或自杀的想法或行为。',
        advice: '建立生存基础支持系统：请信任的人每天检查您的安全和基本需求（吃饭、喝水、睡觉）；建立简单的日常仪式，如洗脸、换衣服，维持最基本的生活结构；与一位信任的人建立"安全联系"协议，在感到绝望时立即联系；移除家中可能造成伤害的物品，或请他人代为保管；使用简单的安全措施，如写下"这种感觉是暂时的"并贴在显眼位置；如果有自杀想法，立即联系家人朋友或拨打心理危机热线400-161-9995；专注于度过每一个小时、每一天，不要给自己制定长远目标；寻找任何能带来微小安慰的事物，如特定的音乐、毯子或食物；记住这种痛苦是暂时的，等待帮助的到来；强烈建议寻求专业医疗和心理治疗帮助。'
      }
    }
  },
  'anxiety': {
    name: '焦虑',
    description: '反映焦虑情绪和身体紧张症状',
    levels: {
      '有点': {
        characteristics: '在面对挑战时有适度的紧张感，但能够有效应对。身体放松，睡眠质量良好，专注力正常。',
        advice: '继续保持良好的压力应对方式，培养放松技巧，如深呼吸、冥想等，作为日常保健手段。'
      },
      '轻微': {
        characteristics: '在某些情况下会感到紧张和担心，但一般能够控制。可能出现轻微的身体紧张症状，如心跳加快等。',
        advice: '学习识别焦虑触发因素，练习放松技巧。建议规律运动，避免过量咖啡因，保持良好的作息习惯。'
      },
      '中度': {
        characteristics: '经常感到焦虑和担忧，难以放松。可能出现明显的身体症状，如肌肉紧张、失眠等，开始影响日常活动。',
        advice: '学习并练习多种焦虑管理技巧：掌握4-7-8呼吸法（吸气4秒，屏息7秒，呼气8秒）；练习渐进性肌肉放松，从脚趾到头部依次紧张放松各部位肌肉；使用"接地技巧"，专注于当下的感官体验；建立焦虑日志，记录触发因素和缓解方法；限制咖啡因摄入，特别是下午和晚上；增加有氧运动，每天至少20-30分钟；学习挑战焦虑思维，问自己"这个担心现实吗？我能控制什么？"；建立应急计划，准备好在焦虑发作时的应对策略。'
      },
      '重度': {
        characteristics: '严重的焦虑症状，可能出现惊恐发作。身体症状明显，如心悸、出汗、颤抖等，严重影响生活质量。',
        advice: '建立紧急焦虑应对工具包：练习"5-4-3-2-1接地法"（说出5样看到的、4样摸到的、3样听到的、2样闻到的、1样尝到的）；准备应急物品如薄荷油、冰块或安抚物品；学会识别惊恐发作的早期信号并立即使用呼吸技巧；简化日常生活，避免不必要的压力源；建立支持网络，告诉信任的人如何在发作时帮助您；保持规律的作息和基本的自我照顾；避免酒精和刺激性物质；练习自我安抚话语，如"这种感觉会过去的"、"我是安全的"；建议寻求专业心理治疗支持。'
      }
    }
  },
  'hostility': {
    name: '敌对',
    description: '反映敌对、愤怒和冲动控制问题',
    levels: {
      '有点': {
        characteristics: '情绪控制良好，能够以平和的方式处理冲突。很少出现愤怒情绪，即使生气也能适当表达。',
        advice: '继续保持良好的情绪管理能力，培养同理心和包容心，在人际交往中保持理性和友善。'
      },
      '轻微': {
        characteristics: '偶尔会感到愤怒或不耐烦，但一般能够控制情绪。可能在压力大时表现出轻微的急躁或不满。',
        advice: '学习识别愤怒的早期信号，练习冷静技巧。可以通过运动、深呼吸等方式宣泄负面情绪。'
      },
      '中度': {
        characteristics: '经常感到愤怒或烦躁，可能会有冲动行为。在人际关系中容易发生冲突，难以控制情绪反应。',
        advice: '学习识别愤怒升级的早期信号（肌肉紧张、心跳加快、思维加速）并立即使用冷静技巧；练习"暂停技巧"：感到愤怒时说"我需要冷静一下"然后离开现场；使用身体释放技巧，如快走、击打枕头、用力握拳再放松；学习"我感觉"表达法，如"我感觉被忽视了"而不是"你总是忽视我"；建立愤怒日志，记录触发事件、身体感觉和应对方式；练习深呼吸和倒数法（从10倒数到1）；寻找健康的情绪宣泄方式，如运动、音乐、艺术创作；与信任的人分享感受，寻求理解和支持。'
      },
      '重度': {
        characteristics: '严重的愤怒和敌对情绪，可能出现攻击性行为。情绪控制能力严重受损，可能对人际关系造成严重影响。',
        advice: '建立紧急安全计划：识别愤怒即将爆发的警告信号，立即离开现场到安全地方；请家人朋友帮助监督，在您愤怒时提醒您使用应对技巧；移除或锁住可能造成伤害的物品；建立简单的冷静空间，放置安抚物品如软枕头、平静的音乐；学习基础的自我安抚技巧，如冷水洗脸、握冰块、听舒缓音乐；使用替代性的愤怒释放方式，如撕纸、大声喊叫（在隐私场所）、剧烈运动；避免酒精和刺激性物质，它们会降低冲动控制；建立道歉和修复关系的计划，为愤怒后的行为负责；建议寻求专业愤怒管理治疗支持。'
      }
    }
  },
  'phobicAnxiety': {
    name: '恐怖',
    description: '反映对特定对象或情境的恐惧程度',
    levels: {
      '有点': {
        characteristics: '对潜在危险有正常的警觉性，但不会产生过度的恐惧。能够理性地评估风险，不会回避正常的活动。',
        advice: '保持理性的风险评估能力，继续以开放的态度面对新的环境和挑战。'
      },
      '轻微': {
        characteristics: '对某些特定情境可能会感到不适或轻微恐惧，但一般不会严重影响行为。可能会有轻微的回避倾向。',
        advice: '逐步接触引起轻微恐惧的情境，练习放松技巧。可以通过正念练习来增强对当下的觉察能力。'
      },
      '中度': {
        characteristics: '对特定对象或情境有明显的恐惧反应，可能会主动回避这些情况。恐惧开始影响日常生活和活动选择。',
        advice: '练习渐进式暴露：列出恐惧情境，从最轻微的开始，逐步增加接触时间和强度；学习放松应对技巧，在面对恐惧时使用深呼吸、肌肉放松或冥想；使用"安全词"或"安全物品"，在恐惧时给自己安慰；挑战恐惧思维，问自己"真正会发生什么？概率有多大？"；建立支持伙伴，请朋友陪伴您面对轻度的恐惧情境；记录恐惧日志，跟踪进步和触发因素；练习积极的自我对话，如"我可以处理这个"、"这种感觉会过去"；奖励自己的勇敢行为，每次面对恐惧都是进步。'
      },
      '重度': {
        characteristics: '严重的恐惧症状，可能出现惊恐发作。恐惧严重限制了日常活动和生活选择，可能出现广泛性回避行为。',
        advice: '建立基础的恐惧管理策略：创建"安全基地"，一个您感到完全安全的地方；建立紧急应对工具包，包括放松音乐、安抚物品、信任之人的联系方式；学习基础的恐慌发作应对：提醒自己"这是恐慌，不是危险"、"这种感觉会在20分钟内消失"；使用感官接地技巧转移注意力；请信任的人陪伴您处理必要的日常事务；设定非常小的暴露目标，如仅仅想象恐惧对象1分钟；避免完全回避，尝试在安全的条件下保持最少的接触；建立每日安全仪式，提升安全感；使用正面肯定语句增强信心；建议寻求专业恐惧症治疗支持。'
      }
    }
  },
  'paranoidIdeation': {
    name: '偏执',
    description: '反映多疑、猜疑和偏执思维的程度',
    levels: {
      '有点': {
        characteristics: '对他人保持适度的信任，能够客观地评估他人的动机。思维灵活，不会过度猜疑他人的意图。',
        advice: '继续保持开放和信任的态度，在人际关系中保持健康的判断力和适度的防范意识。'
      },
      '轻微': {
        characteristics: '偶尔可能会对他人的动机产生怀疑，但一般能够通过理性思考来澄清。可能在某些情况下显得较为谨慎。',
        advice: '练习验证自己的想法，学会区分合理的谨慎和过度的猜疑。增强与他人的沟通，直接询问而非猜测。'
      },
      '中度': {
        characteristics: '经常怀疑他人的动机，可能认为他人对自己有恶意。开始影响人际关系的建立和维持，可能显得防御性较强。',
        advice: '练习现实检验技巧：当产生怀疑时，写下具体的证据支持和反对这个想法；学习"双重标准"技巧，问自己"如果朋友有同样想法，我会怎么建议他？"；建立信任练习，从小事开始相信他人（如请人代买东西）；记录猜疑日志，观察哪些情况下更容易产生怀疑；练习换位思考，尝试从他人角度理解他们的行为；与一位非常信任的人分享您的担忧，听取他们的客观看法；学习放松技巧减少整体的警觉性和紧张感；寻找积极的人际体验，参与让您感到安全的小组活动。'
      },
      '重度': {
        characteristics: '严重的偏执思维，坚信他人对自己有害或有敌意。可能出现被害妄想，严重影响人际关系和社会功能。',
        advice: '建立基础的安全感和现实定向：创建"安全人员"名单，包括您仍然信任的1-2个人；与这些安全人员建立定期联系，让他们帮助您验证现实；保持简单规律的日常生活，减少可能引发猜疑的复杂社交情境；使用"事实vs想法"练习，区分确凿的事实和您的担忧想法；避免完全孤立，即使只是通过电话或视频与安全人员保持联系；建立应急联系计划，当感到极度害怕时知道该联系谁；使用安抚和接地技巧来管理恐惧感；记录并检查您的担忧想法，寻找现实证据；建议寻求专业精神科和心理治疗支持。'
      }
    }
  },
  'psychoticism': {
    name: '精神病性',
    description: '反映精神病性症状和思维异常',
    levels: {
      '有点': {
        characteristics: '思维清晰条理，逻辑性强，现实检验能力良好。能够准确区分现实和幻想，对周围环境有正确的认知和判断。不会出现异常的知觉体验，如幻听、幻视等。社会认知功能正常，能够理解他人的意图和社会情境。思维内容合理，不会有奇异的信念或想法。与他人的交流顺畅，思维表达清楚连贯。',
        advice: '继续保持良好的现实感和批判性思维能力。定期进行思维训练，如阅读、讨论、解决问题等活动。保持思维的灵活性和开放性，能够接受不同观点。建立健康的生活方式，避免过度压力和物质滥用。'
      },
      '轻微': {
        characteristics: '偶尔可能会有一些不寻常的想法或轻微的知觉异常体验，如听到不太清楚的声音、看到模糊的影像等，但能够认识到这些很可能不是现实，或者能够通过理性分析来纠正这些体验。思维大部分时候清晰正常，日常生活功能基本不受影响。可能在压力大或疲劳时更容易出现这些体验。',
        advice: '密切关注自己的思维模式和知觉体验的变化。如有异常体验要及时与信任的家人、朋友或专业人士分享，不要独自承受。保持规律的作息，确保充足睡眠，避免过度疲劳。减少压力源，学习有效的压力管理技巧。避免使用酒精、毒品等可能影响思维的物质。'
      },
      '中度': {
        characteristics: '出现一些明显的思维异常或不寻常的知觉体验，可能包括轻度的幻听、被害感、关系妄想等。对现实的判断开始出现偏差，可能会相信一些不太可能或不合理的事情。开始影响日常的认知功能和社会交往，可能出现行为异常。思维联想可能变得松散，说话内容可能让他人难以理解。注意力和记忆力可能受到影响。',
        advice: '建立基础的现实定向练习：定期检查时间、地点、人物，写在纸上以帮助保持清醒；与信任的人建立"现实检验"系统，当感到困惑时询问他们的看法；保持简单规律的日常作息，减少环境刺激和混乱；避免使用任何酒精、药物或其他可能影响思维的物质；创建安全、安静的居住环境，减少噪音和强烈光线；学习基础的冷静技巧，如深呼吸、感官接地法（触摸具体物品、听熟悉音乐）；记录异常体验的时间和情况，寻找触发模式；与家人朋友分享您的体验，不要独自承受这些困扰；建议寻求专业心理健康支持。'
      },
      '重度': {
        characteristics: '严重的精神病性症状，可能出现明显的幻觉（听到不存在的声音、看到不存在的事物）、妄想（坚信不真实的事情）或严重的思维紊乱。现实检验能力严重受损，无法准确判断什么是真实的。可能出现奇异的行为，如自言自语、无目的的行走、不适当的情绪反应等。思维内容支离破碎，言语可能难以理解。严重影响日常生活能力和社会功能。',
        advice: '建立基本的安全和生存支持：确保有人24小时陪伴或定期检查您的安全；创建极其简单的日常仪式，如吃饭、洗澡、睡觉的固定时间；与最信任的一个人建立紧急联系协议，在感到害怕或困惑时立即联系；保持环境的简单和安全，移除可能造成伤害的物品；使用简单的安抚物品，如柔软的毯子、熟悉的音乐或照片；当感到声音或影像困扰时，尝试转移注意力到具体的身体感觉（如触摸桌面、握紧拳头）；不要试图与幻觉"争论"，而是寻求现实中的人的帮助；保持基本的营养和水分摄入，即使感觉不想吃喝；记住您的家人朋友在关心您，这些体验是可以改善的；立即寻求专业医疗和精神科治疗支持。'
      }
    }
  },
  'sleep': {
    name: '睡眠',
    description: '反映睡眠质量和睡眠相关问题',
    levels: {
      '有点': {
        characteristics: '睡眠质量良好，通常能在20-30分钟内入睡，睡眠深度适中，很少中途醒来。早晨自然醒来时精神饱满，白天精力充沛。睡眠时间充足（通常7-8小时），睡眠规律稳定。很少出现失眠、早醒或噩梦等问题。睡眠环境舒适，没有明显的睡眠障碍。',
        advice: '继续保持良好的睡眠习惯和规律作息时间表。保持舒适的睡眠环境（适宜的温度、光线和噪音控制）。睡前1-2小时避免刺激性活动，如剧烈运动、激动的电视节目等。建立固定的睡前放松程序。'
      },
      '轻微': {
        characteristics: '偶尔出现入睡困难（需要30分钟以上才能入睡）或睡眠不深，可能受到压力、环境变化或生活事件的影响。有时会在夜间醒来，但通常能再次入睡。整体睡眠质量尚可，白天偶尔感到疲倦，但不严重影响日常功能和工作效率。',
        advice: '建立更严格的睡眠卫生习惯，包括固定的睡眠和起床时间。睡前2小时内避免咖啡因、酒精和大餐。进行放松活动，如温水浴、轻柔音乐、阅读或冥想。保持规律的白天活动和适度运动。记录睡眠日志，识别影响睡眠的因素。'
      },
      '中度': {
        characteristics: '经常出现睡眠问题，如难以入睡（超过1小时）、频繁夜间醒来、早醒（比期望时间早2小时以上醒来）或睡眠质量很差。睡眠时间可能不足或过多，白天明显感到疲劳、困倦、注意力不集中。开始影响工作效率、情绪状态和人际关系。可能需要午睡来补充精力。',
        advice: '建立严格的睡眠卫生习惯：每天同一时间上床和起床，包括周末；睡前2小时内避免咖啡因、酒精、大餐和剧烈运动；创造理想的睡眠环境（凉爽、黑暗、安静），使用遮光窗帘和耳塞；建立放松的睡前仪式，如温水浴、轻柔音乐、阅读或冥想；练习渐进性肌肉放松或深呼吸技巧；如果20分钟内无法入睡，起床进行安静活动直到感到困倦；限制白天睡眠时间不超过30分钟，且在下午3点前；记录睡眠日志，识别影响睡眠的因素；白天增加自然光照射，晚上减少电子设备使用。'
      },
      '重度': {
        characteristics: '严重的睡眠障碍，可能表现为持续性失眠（每周至少3晚，持续3个月以上）、频繁早醒或睡眠极不安稳。睡眠质量极差，经常感到睡眠不足，即使睡眠时间充足也不能恢复精力。睡眠问题严重影响日常生活的各个方面，包括工作能力、情绪状态、身体健康和人际关系。可能伴有严重的白天嗜睡或完全无法入睡。',
        advice: '建立基础的生存睡眠策略：即使无法入睡也要在床上休息，保持眼睛闭合让身体得到部分恢复；不要为失眠而焦虑，接受"今晚可能睡不好"的现实；白天即使疲惫也要坚持基本活动，避免长时间卧床；建立最简单的睡前仪式，如洗脸、换睡衣，信号大脑准备休息；寻求家人朋友的理解和支持，让他们知道您的困扰；保持基本的营养和水分，但避免睡前进食；使用自然的安抚方法，如听白噪音、使用加热垫或加重毯子；不要频繁看时钟，避免增加焦虑；建议寻求专业睡眠医学或心理健康专家的帮助。'
      }
    }
  }
};

/**
 * 获取因子的分数水平（符合SCL-90临床标准）
 */
function getScoreLevel(score) {
  const numScore = typeof score === 'number' ? score : parseFloat(score);
  if (isNaN(numScore)) return '有点';
  if (numScore >= 4.0) return '重度';
  if (numScore >= 3.0) return '中度';
  if (numScore >= 2.0) return '轻微';
  return '有点';
}

/**
 * 渲染因子维度详情 - 添加评估标准说明
 */
function renderFactors() {
  const factorsGrid = document.getElementById('factorsGrid');
  factorsGrid.innerHTML = '';
  
  // 添加评估标准说明
  const standardDiv = document.createElement('div');
  standardDiv.style.width = '100%';
  standardDiv.style.background = '#f8fafc';
  standardDiv.style.padding = '16px';
  standardDiv.style.borderRadius = '8px';
  standardDiv.style.marginBottom = '24px';
  standardDiv.style.border = '1px solid #e2e8f0';
  
  const standardTitle = document.createElement('div');
  standardTitle.style.textAlign = 'center';
  standardTitle.style.marginBottom = '12px';
  standardTitle.innerHTML = '<strong style="font-size: 14px; color: #374151;">评估标准</strong>';
  
  const badgesDiv = document.createElement('div');
  badgesDiv.style.display = 'flex';
  badgesDiv.style.justifyContent = 'center';
  badgesDiv.style.flexWrap = 'wrap';
  badgesDiv.style.gap = '12px';
  
  const standards = [
    { color: '#52c41a', text: '有点 (1.0-2.0)' },
    { color: '#73d13d', text: '轻微 (2.0-3.0)' },
    { color: '#fa8c16', text: '中度 (3.0-4.0)' },
    { color: '#ff4d4f', text: '重度 (4.0-5.0)' }
  ];
  
  standards.forEach(standard => {
    const badge = document.createElement('span');
    badge.style.display = 'inline-block';
    badge.style.padding = '4px 12px';
    badge.style.borderRadius = '12px';
    badge.style.fontSize = '12px';
    badge.style.fontWeight = '600';
    badge.style.background = standard.color;
    badge.style.color = 'white';
    badge.textContent = standard.text;
    badgesDiv.appendChild(badge);
  });
  
  standardDiv.appendChild(standardTitle);
  standardDiv.appendChild(badgesDiv);
  factorsGrid.appendChild(standardDiv);
  
  // 渲染因子卡片
  FACTOR_ORDER.forEach(factorKey => {
    const factor = reportData.factorScores[factorKey];
    if (!factor) return;
    
    const severity = getFactorSeverity(factor.averageScore);
    
    const factorCard = document.createElement('div');
    factorCard.className = 'factor-card';
    factorCard.style.borderColor = `${severity.color}20`;
    factorCard.style.background = `linear-gradient(135deg, ${severity.color}05, ${severity.color}02)`;
    factorCard.style.boxShadow = `0 2px 8px ${severity.color}15`;
    
    factorCard.innerHTML = `
      <div class="factor-name">${factor.name}</div>
      <div class="factor-score" style="color: ${severity.color}">${factor.averageScore.toFixed(2)}</div>
      <div class="factor-level" style="background: ${severity.color}">${severity.level}</div>
    `;
    factorCard.style.display = 'flex';
    factorCard.style.alignItems = 'center';
    factorCard.style.justifyContent = 'space-between';
    
    factorsGrid.appendChild(factorCard);
  });
}

/**
 * 渲染详细因子分析
 */
function renderDetailedAnalysis() {
  const factorDetails = document.getElementById('factorDetails');
  factorDetails.innerHTML = '';
  
  // 检测是否为移动端
  const isMobile = window.innerWidth <= 768;
  
  FACTOR_ORDER.forEach((factorKey, index) => {
    const factor = reportData.factorScores[factorKey];
    if (!factor) return;
    
    const scoreLevel = getScoreLevel(factor.averageScore);
    const characteristics = FACTOR_CHARACTERISTICS[factorKey];
    const levelInfo = characteristics?.levels[scoreLevel];
    const severity = getFactorSeverity(factor.averageScore);
    
    if (!characteristics || !levelInfo) {
      console.warn(`因子 ${factorKey} 的特征数据缺失`);
      return;
    }
    
    // 创建因子详情卡片
    const factorDetailCard = document.createElement('div');
    factorDetailCard.className = 'factor-detail-card';
    factorDetailCard.style.marginBottom = index < FACTOR_ORDER.length - 1 ? '32px' : '0';
    factorDetailCard.style.border = `1px solid ${severity.color}20`;
    factorDetailCard.style.borderRadius = '16px';
    factorDetailCard.style.padding = isMobile ? '16px' : '24px';
    factorDetailCard.style.background = `linear-gradient(135deg, ${severity.color}03, ${severity.color}01)`;
    
    // 因子标题和得分区域
    const headerDiv = document.createElement('div');
    headerDiv.style.display = 'flex';
    headerDiv.style.alignItems = 'center';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.marginBottom = '16px';
    headerDiv.style.flexWrap = 'wrap';
    headerDiv.style.gap = '12px';
    
    const titleDiv = document.createElement('div');
    titleDiv.style.flex = '1';
    titleDiv.style.minWidth = '200px';
    
    const titleWithIcon = document.createElement('div');
    titleWithIcon.style.display = 'flex';
    titleWithIcon.style.alignItems = 'center';
    titleWithIcon.style.marginBottom = '8px';
    
    const dot = document.createElement('div');
    dot.style.width = '12px';
    dot.style.height = '12px';
    dot.style.borderRadius = '50%';
    dot.style.background = severity.color;
    dot.style.marginRight = '12px';
    
    const title = document.createElement('h3');
    title.style.margin = '0';
    title.style.fontSize = isMobile ? '18px' : '20px';
    title.style.color = '#1f2937';
    title.style.fontWeight = '600';
    title.textContent = characteristics.name;
    
    titleWithIcon.appendChild(dot);
    titleWithIcon.appendChild(title);
    
    const desc = document.createElement('p');
    desc.style.fontSize = '14px';
    desc.style.color = '#6b7280';
    desc.style.fontStyle = 'italic';
    desc.style.margin = '0';
    desc.textContent = characteristics.description;
    
    titleDiv.appendChild(titleWithIcon);
    titleDiv.appendChild(desc);
    
    // 得分和等级显示
    const scoreDiv = document.createElement('div');
    scoreDiv.style.display = 'flex';
    scoreDiv.style.alignItems = 'center';
    scoreDiv.style.gap = '16px';
    
    const scoreInfo = document.createElement('div');
    scoreInfo.style.textAlign = 'center';
    
    const scoreValue = document.createElement('div');
    scoreValue.style.fontSize = isMobile ? '24px' : '28px';
    scoreValue.style.fontWeight = 'bold';
    scoreValue.style.color = severity.color;
    scoreValue.style.lineHeight = '1';
    scoreValue.textContent = factor.averageScore.toFixed(2);
    
    const scoreLabel = document.createElement('div');
    scoreLabel.style.fontSize = '12px';
    scoreLabel.style.color = '#9ca3af';
    scoreLabel.style.marginTop = '4px';
    scoreLabel.textContent = '得分';
    
    scoreInfo.appendChild(scoreValue);
    scoreInfo.appendChild(scoreLabel);
    
    const levelBadge = document.createElement('div');
    levelBadge.style.fontSize = '14px';
    levelBadge.style.fontWeight = 'bold';
    levelBadge.style.padding = '6px 12px';
    levelBadge.style.borderRadius = '20px';
    levelBadge.style.background = severity.color;
    levelBadge.style.color = 'white';
    levelBadge.textContent = scoreLevel;
    
    scoreDiv.appendChild(scoreInfo);
    scoreDiv.appendChild(levelBadge);
    
    headerDiv.appendChild(titleDiv);
    headerDiv.appendChild(scoreDiv);
    
    // 特征描述和建议区域（并排显示）
    const contentDiv = document.createElement('div');
    contentDiv.style.display = 'grid';
    contentDiv.style.gridTemplateColumns = isMobile ? '1fr' : '1fr 1fr';
    contentDiv.style.gap = '16px';
    contentDiv.style.marginTop = '16px';
    
    // 心理特征表现
    const characteristicsCard = document.createElement('div');
    characteristicsCard.style.background = 'white';
    characteristicsCard.style.borderRadius = '12px';
    characteristicsCard.style.padding = isMobile ? '16px' : '20px';
    characteristicsCard.style.border = '1px solid #e5e7eb';
    
    const charHeader = document.createElement('div');
    charHeader.style.display = 'flex';
    charHeader.style.alignItems = 'center';
    charHeader.style.marginBottom = '12px';
    
    const charIcon = document.createElement('div');
    charIcon.style.width = '24px';
    charIcon.style.height = '24px';
    charIcon.style.background = '#3b82f6';
    charIcon.style.borderRadius = '50%';
    charIcon.style.display = 'flex';
    charIcon.style.alignItems = 'center';
    charIcon.style.justifyContent = 'center';
    charIcon.style.marginRight = '8px';
    charIcon.innerHTML = '<span style="color: white; font-size: 12px; font-weight: bold;">特</span>';
    
    const charTitle = document.createElement('strong');
    charTitle.style.fontSize = '16px';
    charTitle.style.color = '#374151';
    charTitle.textContent = '心理特征表现';
    
    charHeader.appendChild(charIcon);
    charHeader.appendChild(charTitle);
    
    const charContent = document.createElement('p');
    charContent.style.fontSize = '15px';
    charContent.style.lineHeight = '1.6';
    charContent.style.color = '#4b5563';
    charContent.style.margin = '0';
    charContent.textContent = levelInfo.characteristics;
    
    characteristicsCard.appendChild(charHeader);
    characteristicsCard.appendChild(charContent);
    
    // 改善建议
    const adviceCard = document.createElement('div');
    adviceCard.style.background = 'white';
    adviceCard.style.borderRadius = '12px';
    adviceCard.style.padding = isMobile ? '16px' : '20px';
    adviceCard.style.border = '1px solid #e5e7eb';
    
    const adviceHeader = document.createElement('div');
    adviceHeader.style.display = 'flex';
    adviceHeader.style.alignItems = 'center';
    adviceHeader.style.marginBottom = '12px';
    
    const adviceIcon = document.createElement('div');
    adviceIcon.style.width = '24px';
    adviceIcon.style.height = '24px';
    adviceIcon.style.background = '#10b981';
    adviceIcon.style.borderRadius = '50%';
    adviceIcon.style.display = 'flex';
    adviceIcon.style.alignItems = 'center';
    adviceIcon.style.justifyContent = 'center';
    adviceIcon.style.marginRight = '8px';
    adviceIcon.innerHTML = '<span style="color: white; font-size: 12px; font-weight: bold;">建</span>';
    
    const adviceTitle = document.createElement('strong');
    adviceTitle.style.fontSize = '16px';
    adviceTitle.style.color = '#374151';
    adviceTitle.textContent = '改善建议';
    
    adviceHeader.appendChild(adviceIcon);
    adviceHeader.appendChild(adviceTitle);
    
    const adviceContent = document.createElement('p');
    adviceContent.style.fontSize = '15px';
    adviceContent.style.lineHeight = '1.6';
    adviceContent.style.color = '#4b5563';
    adviceContent.style.margin = '0';
    adviceContent.textContent = levelInfo.advice;
    
    adviceCard.appendChild(adviceHeader);
    adviceCard.appendChild(adviceContent);
    
    contentDiv.appendChild(characteristicsCard);
    contentDiv.appendChild(adviceCard);
    
    // 详细信息（原始总分、题目数、阳性项目数）
    const infoDiv = document.createElement('div');
    infoDiv.style.marginTop = '16px';
    infoDiv.style.padding = '16px';
    infoDiv.style.background = 'rgba(255, 255, 255, 0.6)';
    infoDiv.style.borderRadius = '8px';
    infoDiv.style.border = '1px solid #f3f4f6';
    
    const infoGrid = document.createElement('div');
    infoGrid.style.display = 'grid';
    infoGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(100px, 1fr))';
    infoGrid.style.gap = '16px';
    infoGrid.style.textAlign = 'center';
    
    // 原始总分
    const rawScoreDiv = createInfoItem('原始总分', factor.rawScore || 'N/A');
    // 题目数量
    const questionCountDiv = createInfoItem('题目数量', factor.questionCount || 'N/A');
    // 阳性项目数
    const positiveItemsDiv = createInfoItem('阳性项目', factor.positiveItems || 0);
    
    infoGrid.appendChild(rawScoreDiv);
    infoGrid.appendChild(questionCountDiv);
    infoGrid.appendChild(positiveItemsDiv);
    
    infoDiv.appendChild(infoGrid);
    
    // 组装卡片
    factorDetailCard.appendChild(headerDiv);
    factorDetailCard.appendChild(contentDiv);
    factorDetailCard.appendChild(infoDiv);
    
    factorDetails.appendChild(factorDetailCard);
  });
  
  // 添加底部说明
  const footerNote = document.getElementById('analysisFooterNote');
  if (footerNote) {
    footerNote.innerHTML = `
      <div style="margin-top: 24px; padding: 16px; background: #f8fafc; border-radius: 12px; border: 1px solid #e5e7eb;">
        <p style="font-size: 14px; color: #6b7280; font-style: italic; line-height: 1.5; margin: 0;">
          <strong>说明：</strong>以上分析基于SCL-90标准评分体系，各因子得分反映相应心理维度的症状严重程度。
          建议结合个人实际情况理解分析结果，如需专业指导请咨询心理健康专家。
        </p>
      </div>
    `;
  } else {
    console.warn('找不到分析底部说明容器元素 analysisFooterNote');
  }
}

/**
 * 渲染健康综述
 */
function renderHealthSummary() {
  try {
    const healthSummaryContent = document.getElementById('healthSummaryContent');
    if (!healthSummaryContent) {
      console.error('找不到健康综述容器元素 healthSummaryContent');
      return;
    }
    
    const severity = reportData.severity || '正常';
    const severityInfo = calculateOverallSeverity(reportData);
    const severityColor = severityInfo.color;
  
  let content = '';
  
  if (severity === '正常') {
    content = `
      <div class="health-summary-card" style="background: linear-gradient(135deg, ${severityColor}08, ${severityColor}03); border: 1px solid ${severityColor}20;">
        <div class="health-summary-header">
          <span class="health-summary-icon">💝</span>
          <h3 class="health-summary-title">温馨提示</h3>
        </div>
        <div class="health-summary-text">
          <p>您的整体心理状态保持良好，这说明您正在以积极的方式关心和照顾自己。完成这份测试，本身就是关爱自我的体现。
          请继续保持良好的生活习惯和积极心态，让身心处于健康的节奏中。</p>
          <div class="health-summary-quote" style="border-left: 4px solid ${severityColor};">
            愿您在未来的每一天，都能带着轻松与安宁前行。
          </div>
        </div>
      </div>
    `;
  } else if (severity === '轻度') {
    content = `
      <div class="health-summary-card" style="background: linear-gradient(135deg, ${severityColor}08, ${severityColor}03); border: 1px solid ${severityColor}20;">
        <div class="health-summary-header">
          <span class="health-summary-icon">💝</span>
          <h3 class="health-summary-title">温馨提示</h3>
        </div>
        <div class="health-summary-text">
          <p>结果显示，您在某些方面可能会感到一些压力或不适，这种情况在人生中很常见，也完全可以通过日常调适得到改善。
          您已经迈出了关注自己的第一步，接下来可以尝试规律作息、适度运动、与朋友家人交流来帮助缓解。</p>
          <div class="health-summary-quote" style="border-left: 4px solid ${severityColor};">
            完成这份问卷，是向更好的自己前行的开始。愿您在关爱的陪伴中，慢慢获得安心与力量。
          </div>
        </div>
      </div>
    `;
  } else if (severity === '中度') {
    content = `
      <div class="health-summary-card" style="background: linear-gradient(135deg, ${severityColor}08, ${severityColor}03); border: 1px solid ${severityColor}20;">
        <div class="health-summary-header">
          <span class="health-summary-icon">💝</span>
          <h3 class="health-summary-title">温馨提示</h3>
        </div>
        <div class="health-summary-text">
          <p>报告提示，您在部分方面存在一定程度的心理困扰，这可能会对生活造成一些影响。
          建议您在日常生活中，尝试更多放松和调适的方法，同时也可以考虑与值得信赖的人分享自己的感受。</p>
          <div class="health-summary-info" style="border-left: 4px solid ${severityColor};">
            <p class="health-summary-quote" style="margin-bottom: 12px;">若您觉得这些困扰持续存在，寻求专业支持也会是温柔且有效的选择。</p>
            <div class="health-summary-hotline">
              <strong>心理援助热线：</strong><br>
              全国心理援助热线：12320<br>
              北京心理援助热线：12320-5<br>
              上海市心理援助热线：962525
            </div>
          </div>
          <p class="health-summary-footer">请记得，您并不孤单。</p>
        </div>
      </div>
    `;
  } else {
    content = `
      <div class="health-summary-card" style="background: linear-gradient(135deg, ${severityColor}08, ${severityColor}03); border: 1px solid ${severityColor}20;">
        <div class="health-summary-header">
          <span class="health-summary-icon">💝</span>
          <h3 class="health-summary-title">温馨提示</h3>
        </div>
        <div class="health-summary-text">
          <p>您的结果显示，可能存在较为明显的心理困扰。关心到这里，已经体现了您对自我的重视与勇气。
          在日常调适之外，我们更建议您尝试与专业人士沟通，获得更加贴心与有效的支持。</p>
          <div class="health-summary-info" style="border-left: 4px solid ${severityColor};">
            <p class="health-summary-quote" style="margin-bottom: 12px;">无论面对什么样的困难，请相信有人愿意倾听并陪伴您：</p>
            <div class="health-summary-hotline">
              <strong>心理援助热线：</strong><br>
              全国心理援助热线：12320<br>
              北京心理援助热线：12320-5<br>
              上海市心理援助热线：962525
            </div>
          </div>
          <p class="health-summary-footer">愿您在关爱中，逐渐找到力量与安心。</p>
        </div>
      </div>
    `;
  }
  
  healthSummaryContent.innerHTML = content;
  console.log('健康综述已渲染');
  } catch (error) {
    console.error('渲染健康综述失败:', error);
  }
}

/**
 * 渲染底部说明
 */
function renderFooterNotes() {
  try {
    const footerNote = document.getElementById('reportFooterNote');
    if (!footerNote) {
      console.error('找不到底部说明容器元素 reportFooterNote');
      return;
    }
    
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
  
  footerNote.innerHTML = `
    <div class="footer-note-content">
      <div class="footer-note-time">报告生成时间：${dateStr}</div>
      <div class="footer-note-disclaimer">
        此报告基于 SCL-90 症状自评量表生成，仅供参考，不能替代专业诊断。<br>
        如需进一步评估或治疗建议，请咨询专业心理健康服务提供者。
      </div>
    </div>
  `;
  console.log('底部说明已渲染');
  } catch (error) {
    console.error('渲染底部说明失败:', error);
  }
}

/**
 * 创建信息项元素
 */
function createInfoItem(label, value) {
  const div = document.createElement('div');
  
  const valueDiv = document.createElement('div');
  valueDiv.style.fontSize = '16px';
  valueDiv.style.fontWeight = 'bold';
  valueDiv.style.color = '#374151';
  valueDiv.textContent = value;
  
  const labelDiv = document.createElement('div');
  labelDiv.style.fontSize = '12px';
  labelDiv.style.color = '#9ca3af';
  labelDiv.style.marginTop = '4px';
  labelDiv.textContent = label;
  
  div.appendChild(valueDiv);
  div.appendChild(labelDiv);
  
  return div;
}

/**
 * 导出报告
 */
function exportReport() {
  // 简单的导出功能，将报告内容导出为文本
  const reportText = generateReportText();
  const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SCL-90报告_${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 生成报告文本
 */
function generateReportText() {
  let text = 'SCL-90 心理健康测评报告\n';
  text += '='.repeat(50) + '\n\n';
  
  text += `测评完成时间：${document.getElementById('reportDate').textContent}\n\n`;
  text += `总分：${reportData.totalRawScore} / 450\n`;
  text += `总均分：${reportData.totalAverageScore.toFixed(2)}\n`;
  text += `阳性项目数：${reportData.totalPositiveItems}\n`;
  text += `心理健康程度：${reportData.severity}\n\n`;
  
  text += '因子维度详情：\n';
  text += '-'.repeat(50) + '\n';
  FACTOR_ORDER.forEach(factorKey => {
    const factor = reportData.factorScores[factorKey];
    if (factor) {
      const severity = getFactorSeverity(factor.averageScore);
      text += `${factor.name}：${factor.averageScore.toFixed(2)}（${severity.level}）\n`;
    }
  });
  
  // 添加详细因子分析
  text += '\n\n详细因子特征分析：\n';
  text += '='.repeat(50) + '\n\n';
  
  FACTOR_ORDER.forEach(factorKey => {
    const factor = reportData.factorScores[factorKey];
    if (!factor) return;
    
    const scoreLevel = getScoreLevel(factor.averageScore);
    const characteristics = FACTOR_CHARACTERISTICS[factorKey];
    const levelInfo = characteristics?.levels[scoreLevel];
    
    if (characteristics && levelInfo) {
      text += `${characteristics.name}（${scoreLevel}）\n`;
      text += '-'.repeat(50) + '\n';
      text += `描述：${characteristics.description}\n\n`;
      text += `心理特征表现：\n${levelInfo.characteristics}\n\n`;
      text += `改善建议：\n${levelInfo.advice}\n\n`;
      text += '\n';
    }
  });
  
  return text;
}

/**
 * 显示/隐藏加载提示
 */
function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay');
  overlay.style.display = show ? 'flex' : 'none';
}

