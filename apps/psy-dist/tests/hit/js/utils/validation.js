/**
 * 数据验证工具（Holland独立版本）
 * 用于验证答案、题目数据等的有效性
 */

/**
 * 验证答案数组的有效性（Holland：90题）
 * @param {Array} answers - 答案数组
 * @returns {Object} 验证结果 { valid: boolean, error: string }
 */
export const validateAnswers = (answers) => {
  if (!Array.isArray(answers)) {
    return { valid: false, error: '答案格式错误：必须是数组' };
  }

  if (answers.length !== 90) {
    return { 
      valid: false, 
      error: `答案数量不正确：应为90题，实际为${answers.length}题` 
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

  // 验证每个答案是否在0-1之间（二元选择）
  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i];
    const numAnswer = Number(answer);
    
    if (isNaN(numAnswer) || !Number.isInteger(numAnswer)) {
      return { 
        valid: false, 
        error: `第${i + 1}题答案无效：必须是整数` 
      };
    }
    
    if (numAnswer !== 0 && numAnswer !== 1) {
      return { 
        valid: false, 
        error: `第${i + 1}题答案无效：必须是0（不喜欢）或1（喜欢）` 
      };
    }
  }

  return { valid: true };
};

/**
 * 验证二元选择答案（0或1）
 * @param {number} answer - 答案值
 * @returns {Object} 验证结果
 */
export const validateBinaryAnswer = (answer) => {
  if (typeof answer !== 'number') {
    return { valid: false, error: '答案必须是数字' };
  }
  if (answer !== 0 && answer !== 1) {
    return { valid: false, error: '答案必须是0（不喜欢）或1（喜欢）' };
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

  if (questions.length !== 90) {
    return { valid: false, error: `Holland必须包含90道题目，当前有${questions.length}道` };
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

    const validDimensions = ['R', 'I', 'A', 'S', 'E', 'C'];
    if (!validDimensions.includes(question.dimension)) {
      return { valid: false, error: `第${i + 1}题的dimension无效，必须是${validDimensions.join(', ')}之一` };
    }
  }

  return { valid: true };
};

/**
 * 验证选项数据格式
 * @param {Array} options - 选项数组
 * @returns {Object} 验证结果
 */
export const validateOptions = (options) => {
  if (!Array.isArray(options)) {
    return { valid: false, error: '选项数据必须是数组' };
  }

  if (options.length === 0) {
    return { valid: false, error: '选项数据不能为空' };
  }

  // Holland应该有2个选项（二元选择）
  if (options.length !== 2) {
    return { valid: false, error: `Holland应该有2个选项，当前有${options.length}个` };
  }

  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    
    if (option.value === undefined || option.value === null) {
      return { valid: false, error: `第${i + 1}个选项缺少value字段` };
    }
    
    if (!option.label) {
      return { valid: false, error: `第${i + 1}个选项缺少label字段` };
    }
    
    // 检查value是否在0-1之间
    if (option.value !== 0 && option.value !== 1) {
      return { valid: false, error: `第${i + 1}个选项的value必须是0或1` };
    }
  }

  return { valid: true };
};

