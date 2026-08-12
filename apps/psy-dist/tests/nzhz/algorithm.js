// 生命频率测试 - 算法计算模块
// 包含维度计算、总分计算等核心算法

// ========== 题目到维度映射 ==========
// 题目到维度的映射（1-based 题号映射到 0-based 维度索引）
// 维度顺序：[逆境商, 人际场, 财富流, 自我感, 世界观, 身心态, 灵性度]
const QUESTION_TO_DIM = [];
for (let i = 1; i <= 5; i++) QUESTION_TO_DIM[i] = 0;      // 题1-5: 逆境商
for (let i = 6; i <= 10; i++) QUESTION_TO_DIM[i] = 1;     // 题6-10: 人际场
for (let i = 11; i <= 15; i++) QUESTION_TO_DIM[i] = 2;    // 题11-15: 财富流
for (let i = 16; i <= 20; i++) QUESTION_TO_DIM[i] = 3;    // 题16-20: 自我感
for (let i = 21; i <= 25; i++) QUESTION_TO_DIM[i] = 4;    // 题21-25: 世界观
for (let i = 26; i <= 30; i++) QUESTION_TO_DIM[i] = 5;    // 题26-30: 身心态
for (let i = 31; i <= 40; i++) QUESTION_TO_DIM[i] = 6;    // 题31-40: 灵性度

// 维度名称数组
const DIMENSION_NAMES = [
    "逆境商",
    "人际场",
    "财富流",
    "自我感",
    "世界观",
    "身心态",
    "灵性度"
];

// ========== 维度计算函数 ==========
/**
 * 计算7个维度的平均分
 * @param {number[]} scores - 40题的得分数组（索引0-39对应题1-40）
 * @returns {number[]} 7个维度的平均分数组
 */
function computeDimensions(scores) {
    const sums = new Array(7).fill(0);
    const counts = new Array(7).fill(0);

    for (let i = 0; i < 40; i++) {
        const questionId = i + 1; // 题号从1开始
        const dimIndex = QUESTION_TO_DIM[questionId];
        sums[dimIndex] += scores[i];
        counts[dimIndex] += 1;
    }

    // 计算每个维度的平均值（等权平均）
    return sums.map((sum, i) => sum / counts[i]);
}

// ========== 总分计算函数 ==========
// 原版算法：按题目数量加权平均
// 每个维度的题目数量：[5, 5, 5, 5, 5, 5, 10]（逆境商5题，人际场5题...灵性度10题）
const DIM_QUESTION_COUNTS = [5, 5, 5, 5, 5, 5, 10];
const TOTAL_QUESTIONS = 40;

/**
 * 根据7个维度得分计算总分
 * 原版算法：按题目数量加权平均
 * @param {number[]} dims - 7个维度的平均分数组
 * @returns {number} 总分（30-600之间）
 */
function computeTotalScoreFromDims(dims) {
    // 计算加权和：每个维度的平均分 × 该维度的题目数量
    let weightedSum = 0;
    for (let i = 0; i < 7; i++) {
        weightedSum += dims[i] * DIM_QUESTION_COUNTS[i];
    }
    // 除以总题目数得到加权平均
    let raw = weightedSum / TOTAL_QUESTIONS;
    // 四舍五入到整数
    let score = Math.round(raw);
    // 安全范围限定（根据题目分值范围）
    if (score < 30) score = 30;
    if (score > 600) score = 600;
    return score;
}

/**
 * 一步算出总分的封装函数（从40题得分直接计算总分）
 * @param {number[]} scores - 40题的得分数组（索引0-39对应题1-40）
 * @returns {number} 总分（30-600之间）
 */
function computeTotalScoreFromAnswers(scores) {
    const dims = computeDimensions(scores);
    return computeTotalScoreFromDims(dims);
}

// ========== 层级判定函数 ==========
/**
 * 根据总分匹配对应的频率层级
 * @param {number} score - 总分
 * @param {Array} levelDefinitions - 层级定义数组，每个元素应包含 score 属性
 * @returns {Object|null} 匹配的层级对象，如果未找到则返回 null
 */
function pickLevelByScore(score, levelDefinitions) {
    if (!levelDefinitions || levelDefinitions.length === 0) {
        return null;
    }
    
    // 按 score 从高到低排序（确保正确匹配）
    const sortedLevels = [...levelDefinitions].sort((a, b) => b.score - a.score);
    
    // 从高到低遍历，找到第一个 score >= threshold 的层级
    for (const level of sortedLevels) {
        if (score >= level.score) {
            return level;
        }
    }
    
    // 如果所有层级都不匹配，返回最低层级（保险措施）
    return sortedLevels[sortedLevels.length - 1];
}

