/**
 * SRI 评分计算逻辑
 * 
 * 计算4个维度的分数和总分
 * 
 * 评分说明：
 * - 分数越低（1-2分）= 越保守 = 对性没那么多追求 = 越健康不压抑
 * - 分数越高（4-5分）= 越开放 = 可能压抑
 * - 分数在3分左右 = 平衡状态
 */

import { DIMENSION_MAPPING, DIMENSION_NAMES, DIMENSION_ORDER } from './questions.js';

/**
 * 计算SRI测试结果
 * @param {Array} answers - 答案数组，索引从0开始，对应题目1-50，值为1-5
 * @returns {Object} 测试结果对象
 */
export function calculateScore(answers) {
  if (!answers || answers.length !== 50) {
    throw new Error('答案数组必须包含50个答案');
  }

  // 计算各维度分数
  const dimensionScores = {};
  
  DIMENSION_ORDER.forEach(dimKey => {
    const questionIndices = DIMENSION_MAPPING[dimKey];
    const dimensionAnswers = questionIndices.map(index => answers[index]);
    
    // 计算原始总分
    const rawScore = dimensionAnswers.reduce((sum, score) => {
      // 确保答案有效（1-5之间）
      const validScore = (score && score >= 1 && score <= 5) ? score : 1;
      return sum + validScore;
    }, 0);
    
    // 计算平均分（因子分数 = 原始总分 / 题目数）
    const questionCount = questionIndices.length;
    const averageScore = questionCount > 0 ? (rawScore / questionCount).toFixed(2) : '0.00';
    
    dimensionScores[dimKey] = {
      name: DIMENSION_NAMES[dimKey],
      averageScore: parseFloat(averageScore),
      questionCount,
      rawScore
    };
  });

  // 计算总分（所有50题的原始总分）
  const totalRawScore = answers.reduce((sum, score) => {
    const validScore = (score && score >= 1 && score <= 5) ? score : 1;
    return sum + validScore;
  }, 0);

  // 计算总均分（总分 / 50）
  const totalAverageScore = (totalRawScore / 50).toFixed(2);

  // 计算总均分的百分比（用于报告展示）
  // 分数范围1-5，转换为0-100%：((average - 1) / 4) * 100
  const totalPercent = Math.round(((parseFloat(totalAverageScore) - 1) / 4) * 100);

  // 确定总体水平（基于总均分）
  const getOverallLevel = (averageScore) => {
    const score = parseFloat(averageScore);
    
    if (score < 2.0) return { level: '低欲望型', text: '低欲望型', color: '#52c41a' };
    if (score < 2.5) return { level: '平衡型', text: '平衡型', color: '#1890ff' };
    if (score < 3.5) return { level: '高欲望型', text: '高欲望型', color: '#faad14' };
    return { level: '强欲望型', text: '强欲望型', color: '#ff7a45' };
  };

  // 确定各维度的水平（基于平均分）
  const getDimensionLevel = (averageScore) => {
    const score = parseFloat(averageScore);
    
    if (score < 1.5) return { level: '非常低', color: '#52c41a' };
    if (score < 2.0) return { level: '低', color: '#95de64' };
    if (score < 2.5) return { level: '中等偏低', color: '#91d5ff' };
    if (score < 3.0) return { level: '中等', color: '#1890ff' };
    if (score < 3.5) return { level: '中等偏高', color: '#ffd666' };
    if (score < 4.0) return { level: '高', color: '#ff7a45' };
    return { level: '非常高', color: '#f5222d' };
  };

  // 为各维度添加水平信息
  const dimensionsWithLevel = {};
  DIMENSION_ORDER.forEach(dimKey => {
    const dimension = dimensionScores[dimKey];
    dimensionsWithLevel[dimKey] = {
      ...dimension,
      ...getDimensionLevel(dimension.averageScore)
    };
  });

  // 获取总体水平
  const overallLevel = getOverallLevel(totalAverageScore);

  // 返回完整结果
  return {
    dimensions: dimensionsWithLevel,
    totalRawScore,
    totalAverageScore: parseFloat(totalAverageScore),
    totalPercent,
    overallLevel: overallLevel.level,
    overallLevelText: overallLevel.text,
    overallLevelColor: overallLevel.color,
    completedAt: new Date().toISOString()
  };
}

/**
 * 验证答案数组是否完整有效
 * @param {Array} answers - 答案数组
 * @returns {Object} { valid: boolean, message: string }
 */
export function validateAnswers(answers) {
  if (!answers || !Array.isArray(answers)) {
    return { valid: false, message: '答案必须是一个数组' };
  }

  if (answers.length !== 50) {
    return { valid: false, message: `答案数组必须包含50个答案，当前有${answers.length}个` };
  }

  // 检查每个答案是否有效（1-5之间，或者为空/null/undefined表示未答）
  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i];
    // 允许空值（未答），但如果有值必须在1-5之间
    if (answer !== null && answer !== undefined && answer !== '') {
      const numAnswer = Number(answer);
      if (isNaN(numAnswer) || numAnswer < 1 || numAnswer > 5) {
        return { 
          valid: false, 
          message: `第${i + 1}题的答案无效，必须是1-5之间的数字` 
        };
      }
    }
  }

  return { valid: true, message: '答案验证通过' };
}

