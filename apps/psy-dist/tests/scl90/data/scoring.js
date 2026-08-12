/**
 * SCL-90 评分计算逻辑
 * 
 * 计算各因子分数、总分、阳性项目数等
 */

import { FACTOR_MAPPING, FACTOR_NAMES, FACTOR_ORDER } from './questions.js';

/**
 * 计算SCL-90测试结果
 * @param {Array} answers - 答案数组，索引从0开始，对应题目1-90
 * @returns {Object} 测试结果对象
 */
export function calculateScore(answers) {
  if (!answers || answers.length !== 90) {
    throw new Error('答案数组必须包含90个答案');
  }

  // 计算各因子分数
  const factorScores = {};
  
  FACTOR_ORDER.forEach(factorKey => {
    const questionIds = FACTOR_MAPPING[factorKey];
    const factorAnswers = questionIds.map(qId => answers[qId - 1]); // 题目编号从1开始，数组索引从0开始
    
    // 计算原始总分
    const rawScore = factorAnswers.reduce((sum, score) => {
      // 确保答案有效（1-5之间）
      const validScore = (score && score >= 1 && score <= 5) ? score : 1;
      return sum + validScore;
    }, 0);
    
    // 计算平均分（因子分数 = 原始总分 / 题目数）
    const questionCount = questionIds.length;
    const averageScore = questionCount > 0 ? (rawScore / questionCount).toFixed(2) : '0.00';
    
    // 计算阳性项目数（得分 >= 2 的题目数）
    const positiveItems = factorAnswers.filter(score => 
      score && score >= 2 && score <= 5
    ).length;
    
    factorScores[factorKey] = {
      name: FACTOR_NAMES[factorKey],
      averageScore: parseFloat(averageScore),
      positiveItems,
      questionCount,
      rawScore
    };
  });

  // 计算总分（所有90题的原始总分）
  const totalRawScore = answers.reduce((sum, score) => {
    const validScore = (score && score >= 1 && score <= 5) ? score : 1;
    return sum + validScore;
  }, 0);

  // 计算总均分（总分 / 90）
  const totalAverageScore = (totalRawScore / 90).toFixed(2);

  // 计算阳性项目数（得分 >= 2 的题目数）
  const totalPositiveItems = answers.filter(score => 
    score && score >= 2 && score <= 5
  ).length;

  // 计算阳性症状均分（阳性项目总分 / 阳性项目数）
  const positiveAnswers = answers.filter(score => 
    score && score >= 2 && score <= 5
  );
  const positiveTotalScore = positiveAnswers.reduce((sum, score) => sum + score, 0);
  const positiveAverageScore = totalPositiveItems > 0 
    ? (positiveTotalScore / totalPositiveItems).toFixed(2)
    : '0.00';

  // 确定严重程度水平
  const getSeverityLevel = (score) => {
    const numScore = parseFloat(score);
    if (isNaN(numScore)) return { level: '数据异常', color: '#d9d9d9' };
    
    if (numScore >= 4.0) return { level: '重度', color: '#ff4d4f' };
    if (numScore >= 3.0) return { level: '中度', color: '#fa8c16' };
    if (numScore >= 2.0) return { level: '轻微', color: '#73d13d' };
    return { level: '有点', color: '#52c41a' };
  };

  // 获取各因子的严重程度
  const factorSeverity = {};
  FACTOR_ORDER.forEach(factorKey => {
    const factor = factorScores[factorKey];
    factorSeverity[factorKey] = getSeverityLevel(factor.averageScore);
  });

  // 返回完整结果
  return {
    factorScores,
    totalRawScore,
    totalAverageScore: parseFloat(totalAverageScore),
    totalPositiveItems,
    positiveAverageScore: parseFloat(positiveAverageScore),
    factorSeverity,
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

  if (answers.length !== 90) {
    return { valid: false, message: `答案数组必须包含90个答案，当前有${answers.length}个` };
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

