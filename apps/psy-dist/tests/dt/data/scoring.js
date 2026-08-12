/**
 * DarkTriad 评分计算逻辑
 * 
 * 计算10个维度的分数和D因子（Dark Factor）核心指标
 * 
 * 评分说明：
 * - 使用5点李克特量表（1=完全不同意，5=完全同意）
 * - 部分题目为反向计分题（reverse: true），需要反向处理（6 - 原分数）
 * - D因子是所有10个维度的共同核心，通过各维度平均分计算
 */

import { 
  DIMENSION_MAPPING, 
  DIMENSION_NAMES, 
  DIMENSION_ORDER, 
  REVERSE_SCORING_MAP 
} from './questions.js';
import { getDimensionDescription } from './dimension-descriptions.js';

/**
 * 反向计分处理（李克特量表：1->5, 2->4, 3->3, 4->2, 5->1）
 * @param {number} score - 原始分数
 * @returns {number} 反向计分后的分数
 */
function reverseScore(score) {
  if (typeof score !== 'number' || score < 1 || score > 5) {
    return score; // 如果分数无效，返回原值
  }
  return 6 - score; // 1->5, 2->4, 3->3, 4->2, 5->1
}

/**
 * 计算DarkTriad测试结果
 * @param {Array} answers - 答案数组，索引从0开始，对应题目1-70，值为1-5
 * @returns {Object} 测试结果对象
 */
export function calculateScore(answers) {
  if (!answers || answers.length !== 70) {
    throw new Error('答案数组必须包含70个答案');
  }

  // 计算各维度分数
  const dimensionScores = {};
  
  DIMENSION_ORDER.forEach(dimKey => {
    const questionIndices = DIMENSION_MAPPING[dimKey];
    const dimensionAnswers = questionIndices.map(index => {
      const answer = answers[index];
      
      // 检查是否需要反向计分
      const needsReverse = REVERSE_SCORING_MAP[index] === true;
      
      // 确保答案有效（1-5之间）
      let validScore = (answer && answer >= 1 && answer <= 5) ? answer : 1;
      
      // 如果需要反向计分，则反向处理
      if (needsReverse) {
        validScore = reverseScore(validScore);
      }
      
      return validScore;
    });
    
    // 计算原始总分
    const rawScore = dimensionAnswers.reduce((sum, score) => sum + score, 0);
    
    // 计算平均分（因子分数 = 原始总分 / 题目数）
    const questionCount = questionIndices.length; // 7题
    const averageScore = questionCount > 0 ? (rawScore / questionCount).toFixed(2) : '0.00';
    
    // 生成维度描述（基于得分水平，使用更详细的描述）
    const avgScore = parseFloat(averageScore);
    
    // 使用详细的描述生成函数（为所有10个维度提供不同得分范围的描述）
    let description = '';
    try {
      description = getDimensionDescription(dimKey, avgScore);
    } catch (e) {
      // 如果导入失败，使用默认描述
      console.warn(`无法加载维度描述，使用默认描述:`, e);
      const dimName = DIMENSION_NAMES[dimKey];
      if (avgScore >= 3.5) {
        description = `您在${dimName}维度上得分较高（${avgScore.toFixed(2)}/5.00），表现出较强的相关特质。`;
      } else if (avgScore >= 2.5) {
        description = `您在${dimName}维度上得分中等（${avgScore.toFixed(2)}/5.00），表现出适度的相关特质。`;
      } else {
        description = `您在${dimName}维度上得分较低（${avgScore.toFixed(2)}/5.00），相关特质表现较弱。`;
      }
    }
    
    dimensionScores[dimKey] = {
      name: DIMENSION_NAMES[dimKey],
      averageScore: parseFloat(averageScore),
      rawScore,
      questionCount,
      description
    };
  });

  // 计算D因子（Dark Factor）
  // D因子 = 所有10个维度的平均分的平均值
  const dimensionAverages = DIMENSION_ORDER.map(dimKey => 
    dimensionScores[dimKey].averageScore
  );
  const dFactor = (dimensionAverages.reduce((sum, avg) => sum + avg, 0) / 10).toFixed(2);

  // 计算总分（所有70题的原始总分，已处理反向计分）
  const allScores = answers.map((answer, index) => {
    const validScore = (answer && answer >= 1 && answer <= 5) ? answer : 1;
    const needsReverse = REVERSE_SCORING_MAP[index] === true;
    return needsReverse ? reverseScore(validScore) : validScore;
  });
  const totalRawScore = allScores.reduce((sum, score) => sum + score, 0);

  // 计算总均分（总分 / 70）
  const totalAverageScore = (totalRawScore / 70).toFixed(2);

  // 确定D因子水平（魔丸/灵珠）
  const dFactorNum = parseFloat(dFactor);
  const dFactorPercent = Math.round((dFactorNum / 5) * 100);
  
  let moLing; // 魔丸/灵珠
  if (dFactorNum >= 4.0) {
    moLing = { 
      type: '魔丸', 
      level: '极高', 
      color: '#ff4757', 
      description: 'D因子极高',
      title: '魔丸',
      interpretation: '您具有极高的D因子，表现出强烈的自我中心倾向和竞争力。您像哪吒的魔丸一样，拥有强大的力量和决断力，能够在竞争激烈的环境中脱颖而出。',
      quote: '我命由我不由天'
    };
  } else if (dFactorNum >= 3.5) {
    moLing = { 
      type: '魔丸', 
      level: '高', 
      color: '#ff6348', 
      description: 'D因子较高',
      title: '魔丸',
      interpretation: '您具有较高的D因子，表现出较强的自主性和竞争力。您像哪吒的魔丸一样，拥有强大的力量和决断力，能够在竞争激烈的环境中脱颖而出。',
      quote: '我命由我不由天'
    };
  } else if (dFactorNum >= 3.0) {
    moLing = { 
      type: '魔丸', 
      level: '中等', 
      color: '#ff7f50', 
      description: 'D因子中等',
      title: '魔丸',
      interpretation: '您具有中等的D因子，表现出一定的自主性和竞争力。您像哪吒的魔丸一样，拥有一定的力量和决断力，能够在需要竞争的环境中发挥优势。',
      quote: '我命由我不由天'
    };
  } else if (dFactorNum >= 2.5) {
    moLing = { 
      type: '灵珠', 
      level: '偏低', 
      color: '#4b7bec', 
      description: 'D因子偏低',
      title: '灵珠',
      interpretation: '您具有偏低的D因子，表现出较强的同理心和利他倾向。您像原本的灵珠一样，温和正义，是值得信赖的伙伴，能够在需要合作的环境中发挥优势。',
      quote: '善良是最大的力量'
    };
  } else if (dFactorNum >= 2.0) {
    moLing = { 
      type: '灵珠', 
      level: '低', 
      color: '#3867d6', 
      description: 'D因子较低',
      title: '灵珠',
      interpretation: '您具有较低的D因子，表现出强烈的同理心和利他倾向。您像原本的灵珠一样，温和正义，是值得信赖的伙伴，能够在需要合作的环境中发挥优势。',
      quote: '善良是最大的力量'
    };
  } else {
    moLing = { 
      type: '灵珠', 
      level: '很低', 
      color: '#1e90ff', 
      description: 'D因子很低',
      title: '灵珠',
      interpretation: '您具有很低的D因子，表现出非常强烈的同理心和利他倾向。您像原本的灵珠一样，温和正义，是值得信赖的伙伴，能够在需要合作的环境中发挥优势。',
      quote: '善良是最大的力量'
    };
  }

  // 计算D因子对象（包含百分比和等级）
  const dFactorObj = {
    averageScore: dFactorNum,
    percentage: dFactorPercent,
    level: moLing.level
  };

  // 计算主导特质（Top 3）
  const sortedDimensions = Object.entries(dimensionScores)
    .map(([key, dim]) => ({ key, ...dim }))
    .sort((a, b) => b.averageScore - a.averageScore)
    .slice(0, 3);
  
  const dominantTraits = sortedDimensions.map(dim => dim.key);
  
  // 生成主导特质分析文本
  const dominantTraitAnalysis = `您的主导特质组合为：${sortedDimensions.map((d, i) => `${i + 1}. ${d.name}`).join('、')}。这些特质共同反映了您在黑暗人格维度上的表现，帮助您更好地理解自己的行为模式和决策倾向。`;

  // 生成D因子解读
  const interpretation = `您的D因子得分为 ${dFactorNum.toFixed(2)}，属于"${moLing.title}"体质（${moLing.level}水平）。D因子是黑暗人格特质的核心指标，反映了您最大化自身效用而忽视他人利益的倾向。每个人都有一定程度的D因子，这是正常的人格变异。了解自己的D因子有助于更好地理解自己的行为动机，提升人际敏感度。`;

  // 生成建议
  const recommendations = [
    '了解自己的黑暗人格特质不是为了评判好坏，而是为了更好地认识自我',
    moLing.type === '魔丸' 
      ? '您的D因子较高，建议在追求个人目标时，更多考虑他人感受，建立和谐的人际关系'
      : '您的D因子较低，建议在保持同理心的同时，也要学会保护自己的利益，适当表达需求',
    '适度水平的黑暗人格特质可能是优势，但需要平衡个人利益与他人关系',
    '通过自我觉察和反思，可以更好地管理自己的行为，提升人际敏感度',
    '建议结合自己的实际生活和工作情况，思考如何将测评结果应用于实际'
  ];

  // 为每个维度添加百分比和等级
  Object.keys(dimensionScores).forEach(key => {
    const dim = dimensionScores[key];
    dim.percentage = Math.round((dim.averageScore / 5) * 100);
    if (dim.averageScore >= 4.0) {
      dim.level = '极高';
    } else if (dim.averageScore >= 3.5) {
      dim.level = '高';
    } else if (dim.averageScore >= 3.0) {
      dim.level = '中等';
    } else if (dim.averageScore >= 2.5) {
      dim.level = '偏低';
    } else if (dim.averageScore >= 2.0) {
      dim.level = '低';
    } else {
      dim.level = '很低';
    }
  });

  // 返回完整结果（兼容原版数据结构）
  const result = {
    dimensions: dimensionScores, // 各维度分数详情
    dFactor: dFactorObj, // D因子核心指标（包含averageScore, percentage, level）
    moLing, // 魔丸/灵珠分类（包含title, interpretation, quote）
    dominantTraits, // 主导特质Top 3（key数组）
    dominantTraitAnalysis, // 主导特质分析文本
    interpretation, // D因子解读
    recommendations, // 建议数组
    totalRawScore, // 总分数（已处理反向计分）
    totalAverageScore: parseFloat(totalAverageScore), // 总均分
    completedAt: new Date().toISOString()
  };
  
  // 为了兼容原版的数据访问方式（result[traitKey]），将维度数据也扁平化到顶层
  // 原版使用result[config.key]访问维度数据
  Object.keys(dimensionScores).forEach(key => {
    result[key] = dimensionScores[key];
  });
  
  return result;
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

  if (answers.length !== 70) {
    return { valid: false, message: `答案数组必须包含70个答案，当前有${answers.length}个` };
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

