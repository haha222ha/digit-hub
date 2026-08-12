/**
 * Holland 评分计算逻辑
 * 
 * 计算6个维度的分数并生成RIASEC代码（3字母组合）
 * 
 * 评分说明：
 * - 每个维度15题，每题1分（喜欢）或0分（不喜欢）
 * - 每个维度的分数 = 该维度所有题目的得分总和（0-15分）
 * - Holland Code = 分数最高的3个维度（按分数从高到低排列）
 */

import { DIMENSION_MAPPING, DIMENSION_NAMES, DIMENSION_ORDER } from './questions.js';
import { TYPE_DETAILED_INFO, generateInterpretation, generateRecommendations } from './type-info.js';

/**
 * 计算Holland测试结果
 * @param {Array} answers - 答案数组，索引从0开始，对应题目1-90，值为1（喜欢）或0（不喜欢）
 * @returns {Object} 测试结果对象
 */
export function calculateScore(answers) {
  if (!answers || answers.length !== 90) {
    throw new Error('答案数组必须包含90个答案');
  }

  // 计算各维度分数
  const dimensionScores = {};
  
  DIMENSION_ORDER.forEach(dimKey => {
    const questionIndices = DIMENSION_MAPPING[dimKey];
    const dimensionAnswers = questionIndices.map(index => answers[index]);
    
    // 计算原始总分（选择"喜欢"的题目数，即值为1的题目数）
    const rawScore = dimensionAnswers.reduce((sum, score) => {
      // 确保答案有效（0或1）
      const validScore = (score === 1 || score === 0) ? score : 0;
      return sum + validScore;
    }, 0);
    
    // 计算百分比（原始分 / 15题 * 100%）
    const questionCount = questionIndices.length; // 15
    const percentage = questionCount > 0 ? Math.round((rawScore / questionCount) * 100) : 0;
    
    // 确定兴趣等级
    let level = '中等';
    if (percentage >= 80) {
      level = '很高';
    } else if (percentage >= 60) {
      level = '较高';
    } else if (percentage >= 40) {
      level = '中等';
    } else if (percentage >= 20) {
      level = '较低';
    } else {
      level = '很低';
    }
    
    dimensionScores[dimKey] = {
      name: DIMENSION_NAMES[dimKey],
      rawScore, // 原始分数（0-15）
      percentage, // 百分比（0-100%）
      questionCount,
      level // 兴趣等级
    };
  });

  // 按分数从高到低排序维度，生成Holland Code
  // 当分数相同时，按照RIASEC标准顺序（R, I, A, S, E, C）排序，而不是字母顺序
  const sortedDimensions = DIMENSION_ORDER.map(dim => ({
    key: dim,
    ...dimensionScores[dim],
    orderIndex: DIMENSION_ORDER.indexOf(dim) // 添加顺序索引
  })).sort((a, b) => {
    // 先按原始分数排序
    if (b.rawScore !== a.rawScore) {
      return b.rawScore - a.rawScore;
    }
    // 分数相同时，按照RIASEC标准顺序（R, I, A, S, E, C）排序
    return a.orderIndex - b.orderIndex;
  });

  // 取分数最高的3个维度组成Holland Code
  const hollandCode = sortedDimensions.slice(0, 3).map(dim => dim.key).join('');
  
  // 主类型、第二类型、第三类型
  const primaryType = sortedDimensions[0].key;
  const secondaryType = sortedDimensions[1]?.key;
  const tertiaryType = sortedDimensions[2]?.key;

  // 生成typeInfo对象（包含primary、secondary、tertiary的完整信息）
  const typeInfo = {
    primary: TYPE_DETAILED_INFO[primaryType] || {},
    secondary: TYPE_DETAILED_INFO[secondaryType] || {},
    tertiary: TYPE_DETAILED_INFO[tertiaryType] || {}
  };

  // 生成组合类型解读
  const interpretation = generateInterpretation(
    primaryType,
    secondaryType,
    tertiaryType,
    DIMENSION_NAMES
  );

  // 生成职业发展建议
  const recommendations = generateRecommendations(
    primaryType,
    secondaryType,
    tertiaryType,
    DIMENSION_NAMES
  );

  // 计算总分数（所有90题中选"喜欢"的题目数）
  const totalRawScore = answers.reduce((sum, score) => {
    const validScore = (score === 1 || score === 0) ? score : 0;
    return sum + validScore;
  }, 0);

  // 计算总百分比（总分 / 90题 * 100%）
  const totalPercentage = Math.round((totalRawScore / 90) * 100);

  // 返回完整结果（兼容原版数据结构）
  return {
    dimensions: dimensionScores, // 各维度分数详情（保留兼容性）
    dimensionScores: dimensionScores, // 原版使用的字段名
    sortedDimensions, // 排序后的维度（用于报告展示）
    hollandCode, // 3字母Holland Code（如：RIS、EIA等）
    primaryType, // 主类型（分数最高的维度）
    secondaryType, // 第二类型
    tertiaryType, // 第三类型
    typeInfo, // 类型详细信息（包含primary、secondary、tertiary）
    interpretation, // 组合类型解读文本
    recommendations, // 职业发展建议数组
    totalRawScore, // 总分数（0-90）
    totalPercentage, // 总百分比（0-100%）
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

  // 检查每个答案是否有效（0或1，或者为空/null/undefined表示未答）
  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i];
    // 允许空值（未答），但如果有值必须是0或1
    if (answer !== null && answer !== undefined && answer !== '') {
      const numAnswer = Number(answer);
      if (isNaN(numAnswer) || (numAnswer !== 0 && numAnswer !== 1)) {
        return { 
          valid: false, 
          message: `第${i + 1}题的答案无效，必须是0（不喜欢）或1（喜欢）` 
        };
      }
    }
  }

  return { valid: true, message: '答案验证通过' };
}

