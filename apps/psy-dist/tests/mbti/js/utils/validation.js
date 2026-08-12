/**
 * 数据验证工具（MBTI独立版本）
 * 用于验证答案、题目数据等的有效性
 */

/**
 * 验证答案数组的有效性（MBTI：93题）
 * @param {Array} answers - 答案数组
 * @returns {Object} 验证结果 { valid: boolean, error: string }
 */
export const validateAnswers = (answers) => {
  if (!Array.isArray(answers)) {
    return { valid: false, error: '答案格式错误：必须是数组' };
  }

  if (answers.length !== 93) {
    return { 
      valid: false, 
      error: `答案数量不正确：应为93题，实际为${answers.length}题` 
    };
  }

  // 检查是否有未回答的题目
  const unansweredIndices = [];
  for (let i = 0; i < answers.length; i++) {
    if (answers[i] === null || answers[i] === undefined || answers[i] === '') {
      unansweredIndices.push(i + 1);
    }
  }

  if (unansweredIndices.length > 0) {
    const firstUnanswered = unansweredIndices[0];
    const totalUnanswered = unansweredIndices.length;
    return { 
      valid: false, 
      error: `还有${totalUnanswered}题未回答，第一个未答题是第${firstUnanswered}题`,
      unansweredIndices
    };
  }

  return { valid: true };
};

/**
 * 验证MBTI选择题答案（E/I, S/N, T/F, J/P）
 * @param {string} answer - 答案值
 * @param {string} dimension - 维度（EI, SN, TF, JP）
 * @returns {Object} 验证结果
 */
export const validateMBTIAnswer = (answer, dimension) => {
  if (typeof answer !== 'string') {
    return { valid: false, error: '答案必须是字符串' };
  }

  const validAnswer = answer.toUpperCase();
  const validValues = {
    'EI': ['E', 'I'],
    'SN': ['S', 'N'],
    'TF': ['T', 'F'],
    'JP': ['J', 'P']
  };

  if (!dimension || !validValues[dimension]) {
    return { valid: false, error: '维度参数无效' };
  }

  if (!validValues[dimension].includes(validAnswer)) {
    return { 
      valid: false, 
      error: `答案必须是以下值之一: ${validValues[dimension].join(', ')}` 
    };
  }

  return { valid: true };
};

/**
 * 验证题目数据格式
 * @param {Array} questions - 题目数组
 * @returns {Object} 验证结果
 */
export const validateQuestions = (questions) => {
  if (!Array.isArray(questions)) {
    return { valid: false, error: '题目数据必须是数组' };
  }

  if (questions.length === 0) {
    return { valid: false, error: '题目数据不能为空' };
  }

  if (questions.length !== 93) {
    return { valid: false, error: `MBTI必须包含93道题目，当前有${questions.length}道` };
  }

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    
    if (!question.id) {
      return { valid: false, error: `第${i + 1}题缺少id字段` };
    }
    
    if (!question.text) {
      return { valid: false, error: `第${i + 1}题缺少text字段` };
    }

    if (!question.dimension) {
      return { valid: false, error: `第${i + 1}题缺少dimension字段` };
    }

    const validDimensions = ['EI', 'SN', 'TF', 'JP'];
    if (!validDimensions.includes(question.dimension)) {
      return { valid: false, error: `第${i + 1}题的dimension无效，必须是${validDimensions.join(', ')}之一` };
    }

    if (!question.options || !Array.isArray(question.options)) {
      return { valid: false, error: `第${i + 1}题缺少options字段或options不是数组` };
    }

    if (question.options.length !== 2) {
      return { valid: false, error: `第${i + 1}题的options必须包含2个选项` };
    }

    for (let j = 0; j < question.options.length; j++) {
      const option = question.options[j];
      if (!option.value || !option.label) {
        return { valid: false, error: `第${i + 1}题的第${j + 1}个选项缺少value或label字段` };
      }
    }
  }

  return { valid: true };
};

