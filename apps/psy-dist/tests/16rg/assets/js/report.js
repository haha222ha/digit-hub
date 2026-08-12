/* ============================================
   报告页JavaScript - report.js
   ============================================ */

/**
 * 报告页状态
 */
const ReportPageState = {
    reportData: null,      // 报告数据对象
    mbtiType: null,        // MBTI类型
    answers: [],           // 答案数组
    scores: {},            // 各维度得分
    totalScore: 0,         // 总分
    stage: null            // 阶位信息
};

/**
 * 题目维度映射（从question.js中复制，用于计算）
 */
const QuestionDimensions = {
    1: 'logic', 2: 'logic', 3: 'logic', 4: 'logic', 5: 'logic', 6: 'logic', 7: 'logic', 8: 'logic',
    9: 'innovation', 10: 'innovation', 11: 'innovation', 12: 'innovation', 13: 'innovation', 14: 'innovation', 15: 'innovation', 16: 'innovation',
    17: 'execution', 18: 'execution', 19: 'execution', 20: 'execution', 21: 'execution', 22: 'execution', 23: 'execution', 24: 'execution',
    25: 'communication', 26: 'communication', 27: 'communication', 28: 'communication',
    29: 'learning', 30: 'learning', 31: 'learning', 32: 'learning'
};

/* ============================================
   步骤28：数据计算功能（第一部分）
   ============================================ */

/**
 * 读取答案数据
 * @returns {Array} 答案数组
 */
function loadAnswers() {
    const answers = TestDataManager.loadAnswers();
    ReportPageState.answers = answers;
    return answers;
}

/**
 * 读取MBTI类型
 * @returns {string|null} MBTI类型代码
 */
function loadMBTIType() {
    // 优先从URL参数获取
    let mbtiType = URLUtils.getParam('type');
    
    // 如果没有URL参数，从localStorage获取
    if (!mbtiType) {
        mbtiType = Storage.load(StorageKeys.SELECTED_TYPE, null);
    }
    
    ReportPageState.mbtiType = mbtiType;
    return mbtiType;
}

/**
 * 计算维度得分
 * @param {string} dimension - 维度名称（logic, innovation, execution, communication, learning）
 * @param {Array} answers - 答案数组
 * @returns {number} 维度得分
 */
function calculateDimensionScore(dimension, answers) {
    if (!answers || answers.length === 0) {
        return 0;
    }

    let score = 0;
    let count = 0;

    // 遍历所有答案，找到属于该维度的题目
    answers.forEach(answer => {
        const questionId = answer.questionId;
        const questionDimension = QuestionDimensions[questionId];
        
        if (questionDimension === dimension) {
            score += answer.value; // 答案值（1-5）
            count++;
        }
    });

    // 如果没有该维度的答案，返回0
    if (count === 0) {
        return 0;
    }

    // 返回总分（不计算平均值，因为不同维度的题目数量不同）
    // 逻辑思维、创新能力、执行力：每题1-5分，共8题，最高40分
    // 沟通能力、学习能力：每题1-5分，共4题，最高20分
    return score;
}

/**
 * 计算所有维度得分
 * @param {Array} answers - 答案数组
 * @returns {Object} 维度得分对象
 */
function calculateAllDimensionScores(answers) {
    const dimensions = {
        logic: calculateDimensionScore('logic', answers),
        innovation: calculateDimensionScore('innovation', answers),
        execution: calculateDimensionScore('execution', answers),
        communication: calculateDimensionScore('communication', answers),
        learning: calculateDimensionScore('learning', answers)
    };

    ReportPageState.scores = dimensions;
    return dimensions;
}

/**
 * 计算总分
 * @param {Object} dimensionScores - 维度得分对象
 * @returns {number} 总分
 */
function calculateTotalScore(dimensionScores) {
    if (!dimensionScores) {
        return 0;
    }

    const total = Object.values(dimensionScores).reduce((sum, score) => {
        return sum + (score || 0);
    }, 0);

    ReportPageState.totalScore = total;
    return total;
}

/**
 * 计算维度百分比（用于雷达图显示，0-100%）
 * @param {Object} dimensionScores - 维度得分对象
 * @returns {Object} 维度百分比对象
 */
function calculateDimensionPercentages(dimensionScores) {
    if (!dimensionScores) {
        return {
            logic: 0,
            innovation: 0,
            execution: 0,
            communication: 0,
            learning: 0
        };
    }

    // 各维度的最高分
    const maxScores = {
        logic: 40,        // 8题 × 5分
        innovation: 40,  // 8题 × 5分
        execution: 40,   // 8题 × 5分
        communication: 20, // 4题 × 5分
        learning: 20     // 4题 × 5分
    };

    const percentages = {};
    for (const dim in dimensionScores) {
        if (dimensionScores.hasOwnProperty(dim)) {
            const score = dimensionScores[dim] || 0;
            const maxScore = maxScores[dim] || 100;
            percentages[dim] = Math.round((score / maxScore) * 100);
        }
    }

    return percentages;
}

/* ============================================
   步骤29：阶位判断功能
   ============================================ */

/**
 * 根据总分判断阶位
 * @param {number} totalScore - 总分（32-200分）
 * @returns {Object} 阶位配置对象
 */
function determineStage(totalScore) {
    // 使用common.js中的getStageByScore函数
    // 但需要将总分转换为0-100的百分比
    const maxScore = 160; // 32题 × 5分 = 160分
    const minScore = 32;  // 32题 × 1分 = 32分
    const scoreRange = maxScore - minScore; // 128分
    
    // 将总分转换为0-100的百分比
    const percentage = Math.round(((totalScore - minScore) / scoreRange) * 100);
    
    // 使用getStageByScore函数判断阶位
    const stage = getStageByScore(percentage);
    
    ReportPageState.stage = stage;
    return stage;
}

/**
 * 获取阶位名称
 * @param {Object} stage - 阶位配置对象
 * @returns {string} 阶位名称
 */
function getStageName(stage) {
    if (!stage) {
        return '未觉醒';
    }
    return stage.name || '未觉醒';
}

/**
 * 获取阶位描述
 * @param {Object} stage - 阶位配置对象
 * @returns {string} 阶位描述
 */
function getStageDescription(stage) {
    if (!stage) {
        return '尚未意识到自己的潜能';
    }
    return stage.description || '尚未意识到自己的潜能';
}

/**
 * 计算阶位进度（用于显示阶位环，0-100%）
 * @param {number} totalScore - 总分
 * @returns {number} 阶位进度百分比
 */
function calculateStageProgress(totalScore) {
    const maxScore = 160; // 32题 × 5分 = 160分
    const minScore = 32;  // 32题 × 1分 = 32分
    const scoreRange = maxScore - minScore; // 128分
    
    // 将总分转换为0-100的百分比
    const percentage = Math.round(((totalScore - minScore) / scoreRange) * 100);
    
    // 确保在0-100范围内
    return Math.max(0, Math.min(100, percentage));
}

/**
 * 获取阶位环的进度值（用于SVG动画）
 * @param {number} totalScore - 总分
 * @returns {Object} 包含circumference和offset的对象
 */
function getStageRingProgress(totalScore) {
    const progress = calculateStageProgress(totalScore);
    const radius = 70; // SVG圆的半径
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (progress / 100) * circumference;
    
    return {
        circumference: circumference,
        offset: offset,
        progress: progress
    };
}

/**
 * 获取阶位引用文本（根据阶位和MBTI类型生成）
 * @param {Object} stage - 阶位配置对象
 * @param {string} mbtiType - MBTI类型
 * @returns {string} 引用文本
 */
function getStageQuote(stage, mbtiType) {
    const stageName = getStageName(stage);
    const mbtiInfo = MBTITypes[mbtiType];
    const typeName = mbtiInfo ? mbtiInfo.name : '';
    
    // 根据阶位生成不同的引用文本
    const quotes = {
        '未觉醒': `你拥有${typeName}的潜能，正在探索自我认知的旅程中。`,
        '低阶': `作为${typeName}，你已经开始觉醒，展现出初步的心智特质。`,
        '中阶': `你拥有强大的${typeName}特质，能够在复杂的环境中保持清晰的判断力。`,
        '高阶': `作为${typeName}，你已经完全觉醒，展现出卓越的心智能力和独特的个人魅力。`
    };
    
    return quotes[stageName] || quotes['未觉醒'];
}

/* ============================================
   步骤30：报告数据生成
   ============================================ */

/**
 * 验证报告数据完整性
 * @param {Array} answers - 答案数组
 * @param {string} mbtiType - MBTI类型代码
 * @returns {Object} 验证结果 {valid: boolean, errors: Array}
 */
function validateReportData(answers, mbtiType) {
    const errors = [];
    
    // 验证答案数据
    if (!answers || answers.length === 0) {
        errors.push('未找到答案数据');
    } else {
        // 验证答案格式
        const invalidAnswers = answers.filter(answer => {
            return !answer || typeof answer.questionId !== 'number' || 
                   typeof answer.value !== 'number' || 
                   answer.value < 1 || answer.value > 5;
        });
        if (invalidAnswers.length > 0) {
            errors.push(`发现${invalidAnswers.length}个无效答案`);
        }
    }
    
    // 验证MBTI类型
    if (!mbtiType) {
        errors.push('未找到MBTI类型');
    } else if (!MBTITypes[mbtiType]) {
        errors.push(`无效的MBTI类型: ${mbtiType}`);
    }
    
    return {
        valid: errors.length === 0,
        errors: errors
    };
}

/**
 * 生成完整的报告数据
 * @returns {Object} 报告数据对象
 */
function generateReportData() {
    // 读取答案和MBTI类型
    const answers = loadAnswers();
    const mbtiType = loadMBTIType();
    
    // 验证数据完整性
    const validation = validateReportData(answers, mbtiType);
    if (!validation.valid) {
        console.error('报告数据验证失败:', validation.errors);
        return null;
    }
    
    // 计算维度得分
    const dimensionScores = calculateAllDimensionScores(answers);
    
    // 计算总分
    const totalScore = calculateTotalScore(dimensionScores);
    
    // 判断阶位
    const stage = determineStage(totalScore);
    
    // 计算维度百分比（用于雷达图）
    const dimensionPercentages = calculateDimensionPercentages(dimensionScores);
    
    // 生成报告数据
    const reportData = {
        mbtiType: mbtiType,
        mbtiInfo: MBTITypes[mbtiType] || null,
        totalScore: totalScore,
        stage: stage,
        stageName: getStageName(stage),
        stageDescription: getStageDescription(stage),
        stageProgress: calculateStageProgress(totalScore),
        stageQuote: getStageQuote(stage, mbtiType),
        dimensionScores: dimensionScores,
        dimensionPercentages: dimensionPercentages,
        answers: answers,
        timestamp: Date.now(),
        reportId: ReportModel.generateReportId()
    };
    
    // 保存报告数据
    ReportPageState.reportData = reportData;
    TestDataManager.saveReportData(reportData);
    
    return reportData;
}

/**
 * 格式化维度数据（用于雷达图和维度卡片）
 * @param {Object} dimensionScores - 维度得分对象
 * @param {Object} dimensionPercentages - 维度百分比对象
 * @returns {Array} 格式化后的维度数组
 */
function formatDimensionData(dimensionScores, dimensionPercentages) {
    const dimensionNames = {
        logic: '逻辑思维',
        innovation: '创新能力',
        execution: '执行力',
        communication: '沟通能力',
        learning: '学习能力'
    };
    
    const dimensionIcons = {
        logic: '✧',
        innovation: '◇',
        execution: '○',
        communication: '△',
        learning: '☆'
    };
    
    return Object.keys(dimensionScores).map(key => {
        return {
            name: dimensionNames[key] || key,
            value: dimensionPercentages[key] || 0,
            score: dimensionScores[key] || 0,
            icon: dimensionIcons[key] || '●',
            dimension: key
        };
    });
}

/* ============================================
   步骤31：雷达图初始化
   ============================================ */

let radarChartInstance = null; // 保存Chart.js实例

/**
 * 初始化雷达图
 * @param {Object} reportData - 报告数据对象
 */
function initRadarChart(reportData) {
    const ctx = document.getElementById('radarChart');
    if (!ctx) {
        console.warn('未找到雷达图canvas元素');
        return;
    }

    if (typeof Chart === 'undefined') {
        console.warn('Chart.js未加载');
        return;
    }

    if (!reportData || !reportData.dimensionPercentages) {
        console.warn('报告数据不完整，无法初始化雷达图');
        return;
    }

    // 格式化维度数据
    const dimensionData = formatDimensionData(
        reportData.dimensionScores,
        reportData.dimensionPercentages
    );

    // 获取主题颜色
    const mbtiType = reportData.mbtiType;
    const theme = MBTITheme.getTheme(mbtiType);
    const primaryColor = theme ? theme.primary : '#88619a';
    const lightColor = theme ? theme.light : '#bca0ca';

    // 如果已存在图表实例，先销毁
    if (radarChartInstance) {
        radarChartInstance.destroy();
    }

    // 创建新的Chart.js雷达图
    radarChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: dimensionData.map(d => d.name),
            datasets: [{
                label: '我的得分',
                data: dimensionData.map(d => d.value),
                backgroundColor: hexToRgba(primaryColor, 0.2),
                borderColor: primaryColor,
                borderWidth: 3,
                pointBackgroundColor: '#fff',
                pointBorderColor: primaryColor,
                pointHoverBackgroundColor: primaryColor,
                pointHoverBorderColor: '#fff',
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    min: 0,
                    ticks: {
                        stepSize: 20,
                        display: false
                    },
                    angleLines: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.1)',
                        lineWidth: 1
                    },
                    grid: {
                        circular: true,
                        color: 'rgba(0, 0, 0, 0.1)',
                        lineWidth: 1
                    },
                    pointLabels: {
                        display: true,
                        font: {
                            size: 12,
                            weight: '600'
                        },
                        color: '#475569',
                        padding: 10
                    }
                }
            }
        }
    });

    // 生成维度卡片
    generateDimensionCards(dimensionData);
}

/**
 * 生成维度卡片
 * @param {Array} dimensionData - 格式化后的维度数据数组
 */
function generateDimensionCards(dimensionData) {
    const grid = document.getElementById('dimensions-grid');
    if (!grid) {
        console.warn('未找到维度卡片容器');
        return;
    }

    grid.innerHTML = ''; // 清空现有内容

    dimensionData.forEach(dim => {
        const card = document.createElement('div');
        card.className = 'dim-card';

        card.innerHTML = `
            <div class="dim-info">
                <span class="dim-icon">${dim.icon}</span>
                <span class="dim-name">${dim.name}</span>
            </div>
            <div class="dim-bar">
                <div class="bar-track">
                    <div class="bar-fill" style="width: ${dim.value}%;"></div>
                </div>
                <span class="dim-value">${dim.value}</span>
            </div>
        `;

        grid.appendChild(card);
    });
}

/**
 * 将十六进制颜色转换为rgba格式
 * @param {string} hex - 十六进制颜色（如 #88619a）
 * @param {number} alpha - 透明度（0-1）
 * @returns {string} rgba颜色字符串
 */
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ============================================
   步骤32：报告内容渲染（第一部分 - hero-screen）
   ============================================ */

/**
 * 渲染总分
 * @param {number} totalScore - 总分
 */
function renderTotalScore(totalScore) {
    const scoreElement = document.getElementById('total-score');
    if (scoreElement) {
        scoreElement.textContent = totalScore || 0;
    }
}

/**
 * 渲染阶位环（设置进度）
 * @param {Object} reportData - 报告数据对象
 */
function renderStageRing(reportData) {
    const stageProgress = document.getElementById('stage-ring-progress');
    if (!stageProgress) {
        console.warn('未找到阶位环元素');
        return;
    }

    const ringProgress = getStageRingProgress(reportData.totalScore);
    
    stageProgress.style.strokeDasharray = ringProgress.circumference;
    stageProgress.style.strokeDashoffset = ringProgress.offset;
}

/**
 * 渲染阶位名称
 * @param {string} stageName - 阶位名称
 */
function renderStageName(stageName) {
    const stageNameElement = document.getElementById('stage-name');
    if (stageNameElement) {
        stageNameElement.textContent = stageName || '未觉醒';
    }
}

/**
 * 渲染MBTI类型
 * @param {string} mbtiType - MBTI类型代码
 * @param {string} archetype - 类型名称（原型）
 */
function renderMBTIType(mbtiType, archetype) {
    const typeCodeElement = document.getElementById('mbti-type');
    const archetypeElement = document.getElementById('archetype');
    
    if (typeCodeElement) {
        typeCodeElement.textContent = mbtiType || 'INTJ';
    }
    
    if (archetypeElement) {
        archetypeElement.textContent = archetype || '建筑师';
    }
}

/**
 * 渲染特质标签
 * @param {Object} reportData - 报告数据对象
 */
function renderTraitTags(reportData) {
    const traitTagsContainer = document.getElementById('trait-tags');
    if (!traitTagsContainer) {
        console.warn('未找到特质标签容器');
        return;
    }

    const mbtiInfo = reportData.mbtiInfo;
    const stageName = reportData.stageName;
    
    // 构建标签数组
    const tags = [];
    
    // MBTI类型名称
    if (mbtiInfo && mbtiInfo.name) {
        tags.push(mbtiInfo.name);
    }
    
    // 阶位名称
    if (stageName) {
        // 未觉醒时只显示"未觉醒"，不加"觉醒"
        if (stageName === '未觉醒') {
            tags.push(stageName);
        } else {
            tags.push(`${stageName}觉醒`);
        }
    }
    
    // 添加默认标签
    tags.push('独特天赋');

    // 清空并重新生成标签
    traitTagsContainer.innerHTML = '';
    
    tags.forEach(tagText => {
        const tag = document.createElement('span');
        tag.className = 'trait-tag';
        tag.innerHTML = `
            <span class="tag-dot"></span>
            ${tagText}
        `;
        traitTagsContainer.appendChild(tag);
    });
}

/**
 * 渲染引用文本
 * @param {string} quote - 引用文本
 */
function renderStageQuote(quote) {
    const quoteElement = document.getElementById('stage-quote');
    if (quoteElement) {
        quoteElement.textContent = quote || '正在探索自我认知的旅程中。';
    }
}

/**
 * 渲染hero-screen的所有内容
 * @param {Object} reportData - 报告数据对象
 */
function renderHeroScreen(reportData) {
    if (!reportData) {
        console.warn('报告数据为空，无法渲染hero-screen');
        return;
    }

    // 渲染总分
    renderTotalScore(reportData.totalScore);

    // 渲染阶位环
    renderStageRing(reportData);

    // 渲染阶位名称
    renderStageName(reportData.stageName);

    // 渲染MBTI类型
    const mbtiInfo = reportData.mbtiInfo;
    renderMBTIType(reportData.mbtiType, mbtiInfo ? mbtiInfo.name : '');

    // 渲染特质标签
    renderTraitTags(reportData);

    // 渲染引用文本
    renderStageQuote(reportData.stageQuote);
}

/* ============================================
   导出公共函数
   ============================================ */

// 导出报告数据计算相关函数
window.ReportDataCalculator = {
    loadAnswers,
    loadMBTIType,
    calculateDimensionScore,
    calculateAllDimensionScores,
    calculateTotalScore,
    calculateDimensionPercentages,
    ReportPageState
};

// 导出阶位判断相关函数
window.ReportStageCalculator = {
    determineStage,
    getStageName,
    getStageDescription,
    calculateStageProgress,
    getStageRingProgress,
    getStageQuote
};

// 导出报告数据生成相关函数
window.ReportDataGenerator = {
    generateReportData,
    formatDimensionData
};

// 导出雷达图相关函数
window.ReportRadarChart = {
    initRadarChart,
    generateDimensionCards,
    radarChartInstance: () => radarChartInstance
};

/* ============================================
   步骤33：报告内容渲染（第二部分 - 其他屏幕）
   ============================================ */

/**
 * 格式化文本（将Markdown粗体转换为HTML高亮样式，与成熟版一致）
 * @param {string} text - 原始文本
 * @returns {string} 格式化后的HTML文本
 */
function formatText(text) {
    if (!text) return '';
    // 将 **text** 转换为 <span class="text-highlight">text</span>，与成熟版一致
    return text.replace(/\*\*(.*?)\*\*/g, '<span class="text-highlight">$1</span>');
}

/**
 * 渲染超能力内容（基于维度得分动态生成）
 * @param {Object} reportData - 报告数据对象
 */
function renderPowerContent(reportData) {
    const powerContentElement = document.getElementById('power-content');
    if (!powerContentElement) {
        console.warn('未找到超能力内容元素');
        return;
    }

    const dimensionScores = reportData.dimensionScores || {};
    const mbtiType = reportData.mbtiType;
    const mbtiInfo = MBTITypes[mbtiType] || {};
    
    // 根据维度得分生成超能力描述
    const descriptions = [];
    
    // 逻辑维度得分高
    if (dimensionScores.logic && dimensionScores.logic >= 20) {
        descriptions.push('你拥有强大的逻辑分析能力，能够清晰地梳理复杂的问题。');
    }
    
    // 创新维度得分高
    if (dimensionScores.innovation && dimensionScores.innovation >= 20) {
        descriptions.push('你具备出色的创新思维，总能提出独特的解决方案。');
    }
    
    // 执行维度得分高
    if (dimensionScores.execution && dimensionScores.execution >= 20) {
        descriptions.push('你拥有卓越的执行力，能够将想法转化为实际行动。');
    }
    
    // 沟通维度得分高
    if (dimensionScores.communication && dimensionScores.communication >= 20) {
        descriptions.push('你擅长沟通协调，能够有效地与他人建立连接。');
    }
    
    // 学习维度得分高
    if (dimensionScores.learning && dimensionScores.learning >= 20) {
        descriptions.push('你具备强大的学习能力，能够快速掌握新知识和技能。');
    }
    
    // 如果没有匹配的描述，使用默认文本
    if (descriptions.length === 0) {
        descriptions.push(`作为${mbtiInfo.name || '探索者'}，你拥有独特的天赋和能力，正在探索自我认知的旅程中。`);
    }
    
    // 生成HTML内容
    const contentHTML = descriptions.map(desc => `<p>${desc}</p>`).join('');
    powerContentElement.innerHTML = contentHTML;
}

/**
 * 渲染阶位特质内容
 * @param {Object} reportData - 报告数据对象
 */
function renderStageContent(reportData) {
    const stageContentElement = document.getElementById('stage-content');
    if (!stageContentElement) {
        console.warn('未找到阶位特质内容元素');
        return;
    }

    const stageName = reportData.stageName;
    const stageDescriptions = {
        '未觉醒': '你正在探索自我认知的旅程中，开始意识到自己的潜能和特质。',
        '低阶': '你已经初步觉醒，开始展现出初步的心智特质和思维方式。',
        '中阶': '你已经掌握了<strong>系统化思考</strong>的能力，能够从宏观角度分析问题。你的<strong>决策能力</strong>和<strong>执行力</strong>显著提升，能够在压力下保持冷静。',
        '高阶': '你已经完全觉醒，展现出卓越的心智能力和独特的个人魅力。你能够在复杂环境中游刃有余，展现出<strong>卓越的领导力</strong>和<strong>战略眼光</strong>。'
    };
    
    const content = stageDescriptions[stageName] || stageDescriptions['未觉醒'];
    stageContentElement.innerHTML = `<p>在${stageName}阶段，${content}</p>`;
    
    // 更新卡片标签中的阶位名称
    const stageCardLabel = document.querySelector('.stage-card .card-label');
    if (stageCardLabel) {
        const labelText = stageCardLabel.textContent.trim();
        if (labelText.includes('特质')) {
            stageCardLabel.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
                </svg>
                ${stageName}特质
            `;
        }
    }
}

/**
 * 渲染能量环
 * @param {Object} reportData - 报告数据对象
 */
function renderEnergyRing(reportData) {
    const energyProgressElement = document.getElementById('energy-ring-progress');
    const energyNumElement = document.getElementById('energy-num');
    
    if (!energyProgressElement) {
        console.warn('未找到能量环元素');
        return;
    }

    // 计算心智能量指数（基于总分）
    const maxScore = 160; // 32题 × 5分 = 160分
    const minScore = 32;  // 32题 × 1分 = 32分
    const scoreRange = maxScore - minScore; // 128分
    const energyPercentage = Math.round(((reportData.totalScore - minScore) / scoreRange) * 100);
    
    // 设置能量环进度
    const radius = 52; // SVG圆的半径
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (energyPercentage / 100) * circumference;
    
    energyProgressElement.style.strokeDasharray = circumference;
    energyProgressElement.style.strokeDashoffset = offset;
    
    // 更新能量数值
    if (energyNumElement) {
        energyNumElement.textContent = energyPercentage;
    }
}

/**
 * 渲染机制说明内容
 * @param {Object} reportData - 报告数据对象
 */
function renderMechanismContent(reportData) {
    const mechanismContentElement = document.getElementById('mechanism-content');
    if (!mechanismContentElement) {
        console.warn('未找到机制说明内容元素');
        return;
    }

    const mbtiInfo = reportData.mbtiInfo;
    const dimensionScores = reportData.dimensionScores;
    
    // 找出得分最高的维度
    const topDimension = Object.entries(dimensionScores)
        .sort((a, b) => b[1] - a[1])[0];
    
    const dimensionNames = {
        logic: '逻辑分析',
        innovation: '创新思维',
        execution: '执行效率',
        communication: '沟通协调',
        learning: '学习适应'
    };
    
    const topDimensionName = dimensionNames[topDimension[0]] || '逻辑分析';
    
    // 生成机制说明文本
    const mechanismText = `你的<strong>心智运作机制</strong>以<strong>${topDimensionName}</strong>为核心，通过<strong>系统性思考</strong>来处理信息。你擅长<strong>长期规划</strong>和<strong>战略决策</strong>，能够在复杂环境中保持清晰的判断力。`;
    
    mechanismContentElement.innerHTML = `<p>${mechanismText}</p>`;
}

/**
 * 渲染阶位策略内容
 * @param {Object} reportData - 报告数据对象
 */
function renderStageAdviceContent(reportData) {
    const stageAdviceElement = document.getElementById('stage-advice-content');
    if (!stageAdviceElement) {
        console.warn('未找到阶位策略内容元素');
        return;
    }

    const stageName = reportData.stageName;
    const stageAdvices = {
        '未觉醒': '你需要<strong>开始自我探索</strong>，了解自己的<strong>性格特质</strong>和<strong>思维方式</strong>。通过<strong>持续学习</strong>和<strong>实践反思</strong>，逐步认识自己的潜能。',
        '低阶': '你需要<strong>深化自我认知</strong>，提升<strong>基础能力</strong>。通过<strong>持续学习</strong>和<strong>实践反思</strong>，逐步完善你的<strong>思维框架</strong>和<strong>行动模式</strong>。',
        '中阶': '在中阶阶段，你需要<strong>深化系统思维</strong>，提升<strong>执行效率</strong>。通过<strong>持续学习</strong>和<strong>实践反思</strong>，逐步完善你的<strong>决策框架</strong>和<strong>行动模式</strong>。',
        '高阶': '在高阶阶段，你需要<strong>持续优化</strong>和<strong>创新突破</strong>，保持<strong>学习热情</strong>和<strong>成长动力</strong>。通过<strong>深度思考</strong>和<strong>实践验证</strong>，不断突破自己的<strong>能力边界</strong>。'
    };
    
    const advice = stageAdvices[stageName] || stageAdvices['未觉醒'];
    stageAdviceElement.innerHTML = `<p>${advice}</p>`;
    
    // 更新卡片标签中的阶位名称
    const adviceCardLabel = document.querySelector('.advice-card .card-label');
    if (adviceCardLabel) {
        const labelText = adviceCardLabel.textContent.trim();
        if (labelText.includes('策略')) {
            adviceCardLabel.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 16v-4M12 8h.01"></path>
                </svg>
                ${stageName}策略
            `;
        }
    }
}

/**
 * 渲染行动清单
 * @param {Object} reportData - 报告数据对象
 */
function renderActionList(reportData) {
    const actionListElement = document.getElementById('action-list');
    if (!actionListElement) {
        console.warn('未找到行动清单元素');
        return;
    }

    const stageName = reportData.stageName;
    const dimensionScores = reportData.dimensionScores;
    
    // 根据阶位和维度得分生成行动清单
    const actionTemplates = {
        '未觉醒': [
            '开始自我探索，了解自己的性格特质和思维方式',
            '建立基础的知识体系，定期梳理和更新你的认知框架',
            '培养基础能力，将想法转化为具体的行动',
            '加强人际沟通，学会在合作中发挥优势',
            '保持持续学习和自我反思，不断优化你的成长路径'
        ],
        '低阶': [
            '深化自我认知，提升基础能力和思维框架',
            '建立系统化的知识体系，定期梳理和更新你的认知框架',
            '培养跨领域思维能力，将不同领域的知识进行整合应用',
            '提升执行力和行动力，将想法转化为具体的成果',
            '加强人际沟通和团队协作，学会在合作中发挥优势'
        ],
        '中阶': [
            '建立系统化的知识体系，定期梳理和更新你的认知框架',
            '培养跨领域思维能力，将不同领域的知识进行整合应用',
            '提升执行力和行动力，将想法转化为具体的成果',
            '加强人际沟通和团队协作，学会在合作中发挥优势',
            '保持持续学习和自我反思，不断优化你的成长路径'
        ],
        '高阶': [
            '持续优化和创新突破，保持学习热情和成长动力',
            '深化系统思维和战略眼光，从宏观角度分析问题',
            '提升领导力和影响力，在团队中发挥核心作用',
            '加强跨领域整合能力，将不同领域的知识进行创新应用',
            '保持持续学习和自我反思，不断突破自己的能力边界'
        ]
    };
    
    const actions = actionTemplates[stageName] || actionTemplates['未觉醒'];
    
    // 清空并重新生成行动清单
    actionListElement.innerHTML = '';
    
    actions.forEach((actionText, index) => {
        const actionItem = document.createElement('div');
        actionItem.className = 'action-item';
        actionItem.innerHTML = `
            <div class="action-number">
                <span>${index + 1}</span>
            </div>
            <div class="action-content">${actionText}</div>
        `;
        actionListElement.appendChild(actionItem);
    });
}

/* ============================================
   步骤34：报告内容渲染（第三部分 - 匹配和最终屏幕）
   ============================================ */

/**
 * MBTI类型匹配度配置
 * 根据MBTI类型返回匹配度较高的其他类型
 */
const MBTIMatchConfig = {
    INTJ: [
        { type: 'ENFP', score: 92 },
        { type: 'ENTP', score: 88 },
        { type: 'ENFJ', score: 85 }
    ],
    INTP: [
        { type: 'ENFJ', score: 90 },
        { type: 'ENTJ', score: 87 },
        { type: 'ESFJ', score: 84 }
    ],
    ENTJ: [
        { type: 'INFP', score: 91 },
        { type: 'INTP', score: 88 },
        { type: 'ISFP', score: 85 }
    ],
    ENTP: [
        { type: 'INFJ', score: 93 },
        { type: 'INTJ', score: 89 },
        { type: 'ISFJ', score: 86 }
    ],
    INFJ: [
        { type: 'ENTP', score: 94 },
        { type: 'ENFP', score: 90 },
        { type: 'ESTP', score: 87 }
    ],
    INFP: [
        { type: 'ENTJ', score: 92 },
        { type: 'ENFJ', score: 89 },
        { type: 'ESTJ', score: 85 }
    ],
    ENFJ: [
        { type: 'INFP', score: 91 },
        { type: 'INTP', score: 88 },
        { type: 'ISFP', score: 86 }
    ],
    ENFP: [
        { type: 'INTJ', score: 93 },
        { type: 'INFJ', score: 90 },
        { type: 'ISTJ', score: 87 }
    ],
    ISTJ: [
        { type: 'ESFP', score: 92 },
        { type: 'ESTP', score: 89 },
        { type: 'ENFP', score: 86 }
    ],
    ISFJ: [
        { type: 'ESFP', score: 91 },
        { type: 'ESTP', score: 88 },
        { type: 'ENTP', score: 85 }
    ],
    ESTJ: [
        { type: 'ISFP', score: 90 },
        { type: 'ISTP', score: 87 },
        { type: 'INFP', score: 84 }
    ],
    ESFJ: [
        { type: 'ISFP', score: 89 },
        { type: 'ISTP', score: 86 },
        { type: 'INTP', score: 83 }
    ],
    ISTP: [
        { type: 'ESFJ', score: 91 },
        { type: 'ESTJ', score: 88 },
        { type: 'ENFJ', score: 85 }
    ],
    ISFP: [
        { type: 'ESTJ', score: 90 },
        { type: 'ESFJ', score: 87 },
        { type: 'ENTJ', score: 84 }
    ],
    ESTP: [
        { type: 'ISFJ', score: 92 },
        { type: 'ISTJ', score: 89 },
        { type: 'INFJ', score: 86 }
    ],
    ESFP: [
        { type: 'ISTJ', score: 91 },
        { type: 'ISFJ', score: 88 },
        { type: 'INTJ', score: 85 }
    ]
};

/**
 * 职业方向配置
 * 根据MBTI类型返回适合的职业方向
 */
const CareerConfig = {
    INTJ: ['系统架构师', '战略规划师', '产品经理', '数据分析师', '技术顾问', '研发总监', '创业导师', '投资分析师'],
    INTP: ['软件工程师', '研究科学家', '系统分析师', '技术顾问', '大学教授', '理论物理学家', '数学家', '哲学家'],
    ENTJ: ['企业高管', '战略顾问', '投资银行家', '创业CEO', '管理咨询师', '项目经理', '运营总监', '市场总监'],
    ENTP: ['创业家', '产品经理', '市场营销', '咨询顾问', '投资分析师', '战略规划', '创新顾问', '商业分析师'],
    INFJ: ['心理咨询师', '人力资源', '教育工作者', '作家', '职业规划师', '社会工作者', '培训师', '编辑'],
    INFP: ['作家', '艺术家', '心理咨询师', '教育工作者', '设计师', '翻译', '编辑', '职业规划师'],
    ENFJ: ['人力资源', '培训师', '教育工作者', '公关经理', '市场营销', '管理咨询', '职业规划师', '团队领导'],
    ENFP: ['市场营销', '公关经理', '活动策划', '培训师', '人力资源', '咨询顾问', '创业家', '创意总监'],
    ISTJ: ['会计师', '审计师', '系统管理员', '项目经理', '质量控制', '物流管理', '数据分析', '运营管理'],
    ISFJ: ['护士', '教师', '社会工作者', '人力资源', '行政助理', '客户服务', '医疗管理', '图书管理员'],
    ESTJ: ['项目经理', '运营总监', '质量控制', '企业管理', '系统管理员', '物流管理', '生产管理', '团队领导'],
    ESFJ: ['人力资源', '客户服务', '活动策划', '公关经理', '教育工作者', '医疗管理', '行政助理', '团队协调'],
    ISTP: ['机械工程师', '技术专家', '系统管理员', '飞行员', '运动员', '技术顾问', '维修工程师', '数据分析'],
    ISFP: ['设计师', '艺术家', '音乐家', '摄影师', '室内设计', '时尚设计', '平面设计', '手工艺人'],
    ESTP: ['销售经理', '企业家', '运动员', '市场营销', '活动策划', '投资顾问', '房地产', '创业家'],
    ESFP: ['活动策划', '公关经理', '销售', '市场营销', '演员', '主持人', '旅游顾问', '客户服务']
};

/**
 * 渲染灵魂伴侣匹配
 * @param {Object} reportData - 报告数据对象
 */
function renderSoulmateMatches(reportData) {
    const partnerListElement = document.getElementById('partner-list');
    if (!partnerListElement) {
        console.warn('未找到灵魂伴侣列表元素');
        return;
    }

    const mbtiType = reportData.mbtiType;
    const matches = MBTIMatchConfig[mbtiType] || MBTIMatchConfig['INTJ'];
    
    // 清空并重新生成匹配列表
    partnerListElement.innerHTML = '';
    
    matches.forEach(match => {
        const partnerItem = document.createElement('div');
        partnerItem.className = 'partner-item';
        partnerItem.innerHTML = `
            <span class="partner-type">${match.type}</span>
            <div class="partner-bar">
                <div class="bar-fill" style="width: ${match.score}%"></div>
            </div>
            <span class="partner-score">${match.score}%</span>
        `;
        partnerListElement.appendChild(partnerItem);
    });
}

/**
 * 渲染职业方向
 * @param {Object} reportData - 报告数据对象
 */
function renderCareerDirections(reportData) {
    const careerListElement = document.getElementById('career-list');
    if (!careerListElement) {
        console.warn('未找到职业方向列表元素');
        return;
    }

    const mbtiType = reportData.mbtiType;
    const careers = CareerConfig[mbtiType] || CareerConfig['INTJ'];
    
    // 清空并重新生成职业列表
    careerListElement.innerHTML = '';
    
    careers.forEach(career => {
        const careerChip = document.createElement('span');
        careerChip.className = 'career-chip';
        careerChip.textContent = career;
        careerListElement.appendChild(careerChip);
    });
}

/**
 * 渲染最终引用
 * @param {Object} reportData - 报告数据对象
 */
function renderFinalQuote(reportData) {
    const finalQuoteElement = document.getElementById('high-advice-content');
    if (!finalQuoteElement) {
        console.warn('未找到最终引用元素');
        return;
    }

    const stageName = reportData.stageName;
    const mbtiInfo = reportData.mbtiInfo;
    const typeName = mbtiInfo ? mbtiInfo.name : '你';
    
    const finalQuotes = {
        '未觉醒': `真正的成长不是改变自己，而是<strong>成为更好的自己</strong>。作为${typeName}，你拥有独特的潜能和特质。通过<strong>持续学习</strong>、<strong>深度思考</strong>和<strong>实践验证</strong>，你将逐步解锁自己的<strong>终极形态</strong>，在人生的道路上<strong>发光发热</strong>。`,
        '低阶': `真正的成长不是改变自己，而是<strong>成为更好的自己</strong>。作为${typeName}，你已经开始了觉醒的旅程。通过<strong>持续学习</strong>、<strong>深度思考</strong>和<strong>实践验证</strong>，你将逐步解锁自己的<strong>终极形态</strong>，在人生的道路上<strong>发光发热</strong>。`,
        '中阶': `真正的成长不是改变自己，而是<strong>成为更好的自己</strong>。作为${typeName}，你已经掌握了强大的心智能力。通过<strong>持续学习</strong>、<strong>深度思考</strong>和<strong>实践验证</strong>，你将逐步解锁自己的<strong>终极形态</strong>，在人生的道路上<strong>发光发热</strong>。`,
        '高阶': `真正的成长不是改变自己，而是<strong>成为更好的自己</strong>。作为${typeName}，你已经完全觉醒，展现出卓越的能力。通过<strong>持续学习</strong>、<strong>深度思考</strong>和<strong>实践验证</strong>，你将继续突破自己的<strong>能力边界</strong>，在人生的道路上<strong>发光发热</strong>。`
    };
    
    const quote = finalQuotes[stageName] || finalQuotes['未觉醒'];
    finalQuoteElement.innerHTML = `<p>${quote}</p>`;
}

/**
 * 渲染报告时间
 * @param {Object} reportData - 报告数据对象
 */
function renderReportTime(reportData) {
    const reportTimeElement = document.getElementById('report-time');
    if (!reportTimeElement) {
        console.warn('未找到报告时间元素');
        return;
    }

    const timestamp = reportData.timestamp || Date.now();
    const reportDate = new Date(timestamp);
    
    const timeStr = reportDate.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    reportTimeElement.textContent = timeStr;
}

/**
 * 初始化底部按钮功能
 */
function initBottomButtons() {
    // 重新测试按钮
    const retestBtn = document.getElementById('btn-retest');
    if (retestBtn) {
        retestBtn.addEventListener('click', function(e) {
            // 添加点击反馈效果
            this.classList.add('button-ripple');
            setTimeout(() => {
                this.classList.remove('button-ripple');
            }, 600);
            
            // 获取token（用于清除SDK保存的结果）
            const restartUrlParams = new URLSearchParams(window.location.search);
            let restartToken = restartUrlParams.get('token');
            if (!restartToken && window.linkValidator && window.linkValidator.token) {
                restartToken = window.linkValidator.token;
            }
            
            // 清除SDK本地测试结果
            if (window.linkValidator && typeof window.linkValidator.clearLocalResult === 'function') {
                window.linkValidator.clearLocalResult();
                console.log('已清除SDK本地测试结果');
            }
            
            // 手动清除SDK保存的结果（如果clearLocalResult不存在或失败）
            if (restartToken) {
                try {
                    // 清除普通模式的测试结果
                    localStorage.removeItem(`test_result_${restartToken}`);
                    // 清除无限测试模式的结果（如果有adminId）
                    if (window.linkValidator && window.linkValidator.adminId) {
                        localStorage.removeItem(`unlimited_test_result_${window.linkValidator.adminId}_16rg`);
                    }
                    console.log('已手动清除SDK保存的测试结果');
                } catch (e) {
                    console.error('手动清除SDK保存的测试结果失败:', e);
                }
            }
            
            // 清除localStorage中的测试结果
            try {
                // 清除答案数据
                if (typeof TestDataManager !== 'undefined' && TestDataManager.clearTestData) {
                    TestDataManager.clearTestData();
                }
                // 清除测试状态
                if (typeof Storage !== 'undefined' && typeof StorageKeys !== 'undefined') {
                    Storage.remove(StorageKeys.ANSWERS);
                    Storage.remove(StorageKeys.CURRENT_QUESTION);
                    Storage.remove(StorageKeys.REPORT_DATA);
                    Storage.remove(StorageKeys.TEST_START_TIME);
                }
                console.log('已清除localStorage中的测试结果');
            } catch (error) {
                console.error('清除localStorage失败:', error);
            }
            
            // 构建首页URL（需要包含token以便SDK验证）
            let indexUrl = '../index.html';
            const urlParams = new URLSearchParams();
            
            // 获取token和测试模式（使用之前获取的restartToken）
            let token = restartToken;
            let isUnlimited = restartUrlParams.get('unlimited') === 'true';
            
            // 如果URL中没有token，尝试从SDK实例获取
            if (!token && window.linkValidator && window.linkValidator.token) {
                token = window.linkValidator.token;
                isUnlimited = window.linkValidator.unlimited || false;
            }
            
            // 如果有token，添加到URL参数
            if (token) {
                if (isUnlimited) {
                    urlParams.set('unlimited', 'true');
                }
                urlParams.set('token', token);
                // 添加restart参数，告诉首页这是重新测试
                urlParams.set('restart', 'true');
            }
            
            // 构建完整的URL
            const queryString = urlParams.toString();
            if (queryString) {
                indexUrl = `${indexUrl}?${queryString}`;
            }
            
            // 返回到测试首页（index.html）
            if (window.Navigation) {
                window.Navigation.navigateTo(indexUrl, {}, { showLoading: true });
            } else {
                window.location.href = indexUrl;
            }
        });
    }
}

// 更新导出对象
window.ReportRenderer = {
    renderTotalScore,
    renderStageRing,
    renderStageName,
    renderMBTIType,
    renderTraitTags,
    renderStageQuote,
    renderHeroScreen,
    renderPowerContent,
    renderStageContent,
    renderEnergyRing,
    renderMechanismContent,
    renderStageAdviceContent,
    renderActionList,
    renderSoulmateMatches,
    renderCareerDirections,
    renderFinalQuote,
    renderReportTime,
    initBottomButtons
};

