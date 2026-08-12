/**
 * MBTI 评分计算逻辑
 * 
 * 计算4个维度的分数（E/I, S/N, T/F, J/P）并确定16种人格类型
 */

import { QUESTIONS, DIMENSION_ORDER, MBTI_TYPES } from './questions.js';

/**
 * 计算MBTI测试结果
 * @param {Array} answers - 答案数组，索引从0开始，对应题目1-93，值为'E'/'I', 'S'/'N', 'T'/'F', 'J'/'P'
 * @returns {Object} 测试结果对象
 */
export function calculateScore(answers) {
  if (!answers || answers.length !== 93) {
    throw new Error('答案数组必须包含93个答案');
  }

  // 初始化各维度的分数计数器
  const dimensionScores = {
    'EI': { E: 0, I: 0 },
    'SN': { S: 0, N: 0 },
    'TF': { T: 0, F: 0 },
    'JP': { J: 0, P: 0 }
  };

  // 遍历所有答案，统计各维度的分数
  let skippedAnswers = [];
  
  answers.forEach((answer, index) => {
    const question = QUESTIONS[index];
    
    if (!question) {
      console.error(`第${index + 1}题不存在`);
      skippedAnswers.push({ index: index + 1, reason: '题目不存在' });
      return;
    }
    
    if (!answer || answer === null || answer === undefined || answer === '') {
      console.error(`第${index + 1}题答案为空`);
      skippedAnswers.push({ index: index + 1, reason: '答案为空' });
      return;
    }

    const dimension = question.dimension;
    const validAnswer = answer.toUpperCase(); // 转换为大写

    // 检查答案是否有效（必须是该维度的两个选项之一）
    let scoreAdded = false;
    if (dimension === 'EI' && (validAnswer === 'E' || validAnswer === 'I')) {
      dimensionScores['EI'][validAnswer]++;
      scoreAdded = true;
    } else if (dimension === 'SN' && (validAnswer === 'S' || validAnswer === 'N')) {
      dimensionScores['SN'][validAnswer]++;
      scoreAdded = true;
    } else if (dimension === 'TF' && (validAnswer === 'T' || validAnswer === 'F')) {
      dimensionScores['TF'][validAnswer]++;
      scoreAdded = true;
    } else if (dimension === 'JP' && (validAnswer === 'J' || validAnswer === 'P')) {
      dimensionScores['JP'][validAnswer]++;
      scoreAdded = true;
    }
    
    // 如果答案没有被计入分数，记录错误
    if (!scoreAdded) {
      const validOptions = question.options.map(opt => opt.value.toUpperCase()).join('或');
      console.error(`第${index + 1}题答案"${answer}"不匹配维度"${dimension}"，有效选项应为：${validOptions}`);
      skippedAnswers.push({ 
        index: index + 1, 
        reason: `答案"${answer}"不匹配维度"${dimension}"`,
        dimension: dimension,
        answer: answer,
        validOptions: validOptions
      });
    }
  });
  
  // 如果有答案被跳过，记录警告（但不抛出错误，以便调试）
  if (skippedAnswers.length > 0) {
    console.warn(`${skippedAnswers.length}个答案未被计入分数：`, skippedAnswers);
  }

  // 确定每个维度的类型（选择分数更高的那一侧）
  // 如果分数相等，使用标准的MBTI做法：使用 >= 来选择第一个字母（左侧字母）
  // 这是大多数在线MBTI测试平台（如16personalities、Truity等）采用的标准做法
  // 注意：TF维度有23题（奇数），理论上不会完全相等；其他维度都是偶数题，可能相等
  const typeLetters = [];
  const ambiguousDimensions = []; // 记录分数相等的维度（用于可选的结果提示）
  
  // E/I维度：使用 >= 选择（相等时选择E，这是标准MBTI做法）
  const eiE = dimensionScores['EI'].E || 0;
  const eiI = dimensionScores['EI'].I || 0;
  const eiType = eiE >= eiI ? 'E' : 'I';
  if (eiE === eiI) {
    ambiguousDimensions.push('EI');
  }
  typeLetters.push(eiType);
  
  // S/N维度：使用 >= 选择（相等时选择S）
  const snS = dimensionScores['SN'].S || 0;
  const snN = dimensionScores['SN'].N || 0;
  const snType = snS >= snN ? 'S' : 'N';
  if (snS === snN) {
    ambiguousDimensions.push('SN');
  }
  typeLetters.push(snType);
  
  // T/F维度：使用 >= 选择（相等时选择T，但TF有23题，理论上不会完全相等）
  const tfT = dimensionScores['TF'].T || 0;
  const tfF = dimensionScores['TF'].F || 0;
  const tfType = tfT >= tfF ? 'T' : 'F';
  if (tfT === tfF) {
    ambiguousDimensions.push('TF');
  }
  typeLetters.push(tfType);
  
  // J/P维度：使用 >= 选择（相等时选择J）
  const jpJ = dimensionScores['JP'].J || 0;
  const jpP = dimensionScores['JP'].P || 0;
  const jpType = jpJ >= jpP ? 'J' : 'P';
  if (jpJ === jpP) {
    ambiguousDimensions.push('JP');
  }
  typeLetters.push(jpType);
  
  // 如果有维度分数相等，记录信息（可用于后续的结果说明）
  if (ambiguousDimensions.length > 0) {
    console.log(`以下维度分数相等，使用了标准MBTI做法（>= 选择左侧字母）：${ambiguousDimensions.join(', ')}`);
  }

  // 组合成4字母类型（如：INTJ）
  const type = typeLetters.join('');
  
  // 验证类型是否有效
  let finalType = type;
  if (!MBTI_TYPES.includes(type)) {
    console.warn(`计算出的类型 ${type} 不在有效类型列表中，使用默认类型`);
    // 如果类型无效，使用INTJ作为默认值
    finalType = 'INTJ';
  }

  // 计算每个维度的百分比
  // 注意：leftLabel对应左边的选项，rightLabel对应右边的选项
  // 对于EI维度：leftLabel是'内向 (I)'，rightLabel是'外向 (E)'
  // 所以leftScore应该是I的分数，rightScore应该是E的分数
  const dimensions = {};
  DIMENSION_ORDER.forEach(dim => {
    const scores = dimensionScores[dim];
    let leftScore, rightScore;
    
    // 明确指定leftScore和rightScore，确保与报告页面的标签对应
    if (dim === 'EI') {
      leftScore = scores.I || 0;  // 内向分数（对应leftLabel）
      rightScore = scores.E || 0; // 外向分数（对应rightLabel）
    } else if (dim === 'SN') {
      leftScore = scores.S || 0;  // 感觉分数（对应leftLabel）
      rightScore = scores.N || 0; // 直觉分数（对应rightLabel）
    } else if (dim === 'TF') {
      leftScore = scores.T || 0;  // 思维分数（对应leftLabel）
      rightScore = scores.F || 0; // 情感分数（对应rightLabel）
    } else if (dim === 'JP') {
      leftScore = scores.J || 0;  // 判断分数（对应leftLabel）
      rightScore = scores.P || 0; // 知觉分数（对应rightLabel）
    } else {
      // 兜底逻辑
      leftScore = scores[Object.keys(scores)[0]] || 0;
      rightScore = scores[Object.keys(scores)[1]] || 0;
    }
    
    const total = leftScore + rightScore;
    const leftPercentage = total > 0 ? Math.round((leftScore / total) * 100) : 50;
    const rightPercentage = 100 - leftPercentage;

    dimensions[dim] = {
      ...scores,
      total,
      leftPercentage,
      rightPercentage
    };
  });

  // 返回完整结果
  const result = {
    type: finalType, // 4字母类型（如：INTJ）
    dimensions, // 各维度分数详情
    completedAt: new Date().toISOString()
  };
  
  // 如果有维度分数相等，添加到结果中（用于前端提示用户）
  if (ambiguousDimensions.length > 0) {
    result.ambiguousDimensions = ambiguousDimensions;
  }
  
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

  if (answers.length !== 93) {
    return { valid: false, message: `答案数组必须包含93个答案，当前有${answers.length}个` };
  }

  // 检查每个答案是否有效
  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i];
    const question = QUESTIONS[i];
    
    if (!question) {
      return { valid: false, message: `第${i + 1}题不存在` };
    }

    // 允许空值（未答），但如果有值必须在该题目的选项中
    if (answer !== null && answer !== undefined && answer !== '') {
      const validAnswer = answer.toUpperCase();
      const validOptions = question.options.map(opt => opt.value.toUpperCase());
      
      if (!validOptions.includes(validAnswer)) {
        return { 
          valid: false, 
          message: `第${i + 1}题答案无效，必须是${question.options.map(o => o.value).join('或')}之一` 
        };
      }
    }
  }

  return { valid: true, message: '答案验证通过' };
}

/**
 * 获取未回答的题目索引
 * @param {Array} answers - 答案数组
 * @returns {Array} 未答题目的索引数组（从1开始）
 */
export function getUnansweredQuestions(answers) {
  const unanswered = [];
  
  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i];
    if (answer === null || answer === undefined || answer === '') {
      unanswered.push(i + 1); // 题目编号从1开始
    }
  }
  
  return unanswered;
}

