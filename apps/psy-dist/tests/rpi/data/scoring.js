/**
 * RPI 评分计算逻辑
 * 
 * 计算4个维度的分数和RPI指数
 * 
 * 评分说明：
 * - 使用李克特量表（1-5分）
 * - 每个维度10题，计算该维度的平均分
 * - 计算z分数：((raw - 2.2) / 1.0)
 * - 计算百分比：Math.round(Math.min(100, (raw / 5) * 100 * 1.2))
 * - RPI指数：所有维度z分数的平均值，转换为0-100分
 */

import { DIMENSION_MAPPING, DIMENSION_NAMES, DIMENSION_ORDER, DIMENSIONS } from './questions.js';

/**
 * 计算单个维度的分数（原版算法）
 * @param {Array} answers - 答案数组
 * @param {Array} questionIndices - 该维度对应的题目索引数组
 * @returns {Object} 维度分数信息 { raw, z, percent }
 */
function calculateDimension(answers, questionIndices) {
  // 获取该维度的答案
  const dimensionAnswers = questionIndices.map(index => answers[index]);
  
  // 计算原始总分（raw）：10题的总分，不是平均分
  const validAnswers = dimensionAnswers.filter(answer => 
    answer !== null && answer !== undefined && answer !== ''
  );
  
  if (validAnswers.length === 0) {
    return { raw: 0, z: 0, percent: 0 };
  }
  
  const raw = validAnswers.reduce((total, answer) => {
    const validScore = (answer && answer >= 1 && answer <= 5) ? answer : 1;
    return total + validScore;
  }, 0);
  
  // 计算百分位（Z分数）：线性映射到0-100%
  // 维度分数范围：10（10题×1分）到 50（10题×5分）
  // 百分位范围：0% 到 100%
  // 公式：百分位 = (维度分数 - 10) / (50 - 10) * 100
  const percent = Math.round(((raw - 10) / (50 - 10)) * 100);
  
  // Z分数等于百分位（原版定义）
  const z = percent;
  
  return {
    raw: raw, // 原始总分（10-50）
    z: z, // Z分数等于百分位（0-100）
    percent: Math.max(0, Math.min(100, percent)) // 百分位（0-100），限制范围
  };
}

/**
 * 计算RPI测试结果
 * @param {Array} answers - 答案数组，索引从0开始，对应题目1-40，值为1-5
 * @returns {Object} 测试结果对象
 */
export function calculateScore(answers) {
  if (!answers || answers.length !== 40) {
    throw new Error('答案数组必须包含40个答案');
  }

  // 计算各维度分数
  const dimensionScores = {};
  
  DIMENSION_ORDER.forEach(dimKey => {
    const questionIndices = DIMENSION_MAPPING[dimKey];
    const dimensionInfo = calculateDimension(answers, questionIndices);
    
    dimensionScores[dimKey] = {
      name: DIMENSION_NAMES[dimKey],
      ...DIMENSIONS[dimKey], // 包含icon, description, color等信息
      ...dimensionInfo // raw, z, percent
    };
  });

  // 计算RPI指数（原版算法）
  // 根据测试结果反推：
  // - 4个维度都是10分 → 总分15分
  // - 4个维度都是30分 → 总分58分
  // - 4个维度都是50分 → 总分100分
  // 
  // 公式推导：
  // RPI = 2.15 × 平均维度分 - 6.5
  // 或者等价形式：(维度平均分数 - 10) / 40 * 85 + 15
  // 
  // 验证：
  // 平均维度分10：RPI = 2.15 × 10 - 6.5 = 21.5 - 6.5 = 15 ✓
  // 平均维度分30：RPI = 2.15 × 30 - 6.5 = 64.5 - 6.5 = 58 ✓
  // 平均维度分50：RPI = 2.15 × 50 - 6.5 = 107.5 - 6.5 = 101 ≈ 100 ✓
  
  const avgDimensionScore = (
    dimensionScores.control.raw +
    dimensionScores.jealousy.raw +
    dimensionScores.dependency.raw +
    dimensionScores.insecurity.raw
  ) / 4;
  
  // RPI指数 = 2.15 × 平均维度分 - 6.5（与文档一致）
  const rpiIndex = Math.round(2.15 * avgDimensionScore - 6.5);
  
  // 限制在0-100范围内
  const rpiIndexFinal = Math.max(0, Math.min(100, rpiIndex));

  // 确定等级（使用粉红色系）
  let level, levelText, levelColor;
  if (rpiIndexFinal < 20) {
    level = '很低';
    levelText = '自由自在';
    levelColor = '#F9A8D4';
  } else if (rpiIndexFinal < 40) {
    level = '偏低';
    levelText = '松弛有度';
    levelColor = '#F472B6';
  } else if (rpiIndexFinal < 60) {
    level = '中等';
    levelText = '恰到好处';
    levelColor = '#EC4899';
  } else if (rpiIndexFinal < 80) {
    level = '偏高';
    levelText = '执着深情';
    levelColor = '#DB2777';
  } else {
    level = '很高';
    levelText = '爱到极致';
    levelColor = '#BE185D';
  }

  // 计算总分（所有40题的原始总分）
  const totalRawScore = answers.reduce((sum, answer) => {
    const validScore = (answer && answer >= 1 && answer <= 5) ? answer : 1;
    return sum + validScore;
  }, 0);

  // 计算总均分（总分 / 40）
  const totalAverageScore = (totalRawScore / 40).toFixed(2);

  // 返回完整结果
  return {
    rpiIndex: rpiIndexFinal, // RPI指数（0-100）
    level, // 等级：很低、偏低、中等、偏高、很高
    levelText, // 等级文本：自由自在、松弛有度、恰到好处、执着深情、爱到极致
    levelColor, // 等级颜色
    dimensions: dimensionScores, // 各维度分数详情
    totalRawScore, // 总分数
    totalAverageScore: parseFloat(totalAverageScore), // 总均分
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

  if (answers.length !== 40) {
    return { valid: false, message: `答案数组必须包含40个答案，当前有${answers.length}个` };
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

