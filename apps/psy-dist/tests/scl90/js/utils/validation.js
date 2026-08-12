/**
 * 数据验证工具（SCL-90独立版本）
 * 用于验证答案、题目数据等的有效性
 */

/**
 * 验证答案数组的有效性（SCL-90：90题）
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

  // 验证每个答案是否在1-5之间
  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i];
    const numAnswer = Number(answer);
    
    if (isNaN(numAnswer) || !Number.isInteger(numAnswer)) {
      return { 
        valid: false, 
        error: `第${i + 1}题答案无效：必须是整数` 
      };
    }
    
    if (numAnswer < 1 || numAnswer > 5) {
      return { 
        valid: false, 
        error: `第${i + 1}题答案无效：必须在1-5之间` 
      };
    }
  }

  return { valid: true };
};

/**
 * 验证李克特量表答案（1-5分，SCL-90使用）
 * @param {number} answer - 答案值
 * @returns {Object} 验证结果
 */
export const validateLikertAnswer = (answer) => {
  if (typeof answer !== 'number') {
    return { valid: false, error: '答案必须是数字' };
  }
  if (!Number.isInteger(answer)) {
    return { valid: false, error: '答案必须是整数' };
  }
  if (answer < 1 || answer > 5) {
    return { valid: false, error: '答案必须在1-5之间' };
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
    return { valid: false, error: `SCL-90必须包含90道题目，当前有${questions.length}道` };
  }

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    
    if (!question.id) {
      return { valid: false, error: `第${i + 1}题缺少id字段` };
    }
    
    if (!question.text) {
      return { valid: false, error: `第${i + 1}题缺少text字段` };
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

  // SCL-90应该只有5个选项
  if (options.length !== 5) {
    return { valid: false, error: `SCL-90应该有5个选项，当前有${options.length}个` };
  }

  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    
    if (option.value === undefined || option.value === null) {
      return { valid: false, error: `第${i + 1}个选项缺少value字段` };
    }
    
    if (!option.label) {
      return { valid: false, error: `第${i + 1}个选项缺少label字段` };
    }
    
    // 检查value是否在1-5之间
    if (option.value < 1 || option.value > 5) {
      return { valid: false, error: `第${i + 1}个选项的value必须在1-5之间` };
    }
  }

  return { valid: true };
};

