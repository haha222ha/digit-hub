/**
 * 本地存储管理工具（MBTI独立版本）
 * 用于保存和恢复答题进度、测试结果等数据
 * 
 * 注意：使用测试特定前缀 mbti_test_，避免与其他测试冲突
 */

const STORAGE_PREFIX = 'mbti_test_';

/**
 * 保存答题进度到本地存储
 * @param {Array} answers - 答案数组（93题）
 * @param {number} currentQuestion - 当前题目索引（0-92）
 * @param {Object} extraData - 额外数据
 */
export const saveTestProgress = (answers, currentQuestion, extraData = {}) => {
  try {
    const storageKey = `${STORAGE_PREFIX}progress`;
    const progressData = {
      testKey: 'mbti',
      answers,
      currentQuestion,
      timestamp: Date.now(),
      version: '1.0',
      ...extraData
    };
    
    localStorage.setItem(storageKey, JSON.stringify(progressData));
    return true;
  } catch (error) {
    console.error('保存答题进度失败:', error);
    // 如果localStorage已满，尝试清理过期数据
    cleanupExpiredProgress();
    return false;
  }
};

/**
 * 获取答题进度
 * @returns {Object|null} 答题进度数据或null
 */
export const getTestProgress = () => {
  try {
    const storageKey = `${STORAGE_PREFIX}progress`;
    const dataStr = localStorage.getItem(storageKey);
    
    if (!dataStr) {
      return null;
    }
    
    const progressData = JSON.parse(dataStr);
    
    // 验证数据完整性
    if (!progressData.testKey || !Array.isArray(progressData.answers)) {
      console.warn('本地存储的答题数据格式不正确');
      clearTestProgress();
      return null;
    }
    
    // 检查数据是否过期（30天）
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - progressData.timestamp > THIRTY_DAYS) {
      console.log('答题进度已过期，已清除');
      clearTestProgress();
      return null;
    }
    
    return progressData;
  } catch (error) {
    console.error('读取答题进度失败:', error);
    return null;
  }
};

/**
 * 清除答题进度
 */
export const clearTestProgress = () => {
  try {
    const storageKey = `${STORAGE_PREFIX}progress`;
    localStorage.removeItem(storageKey);
    return true;
  } catch (error) {
    console.error('清除答题进度失败:', error);
    return false;
  }
};

/**
 * 保存测试结果
 * @param {Object} result - 测试结果数据
 */
export const saveTestResult = (result) => {
  try {
    const storageKey = `${STORAGE_PREFIX}result`;
    const resultData = {
      testKey: 'mbti',
      result,
      completedAt: new Date().toISOString(),
      timestamp: Date.now(),
      version: '1.0'
    };
    
    localStorage.setItem(storageKey, JSON.stringify(resultData));
    return true;
  } catch (error) {
    console.error('保存测试结果失败:', error);
    return false;
  }
};

/**
 * 获取测试结果
 * @returns {Object|null} 测试结果数据或null
 */
export const getTestResult = () => {
  try {
    const storageKey = `${STORAGE_PREFIX}result`;
    const dataStr = localStorage.getItem(storageKey);
    
    if (!dataStr) {
      return null;
    }
    
    return JSON.parse(dataStr);
  } catch (error) {
    console.error('读取测试结果失败:', error);
    return null;
  }
};

/**
 * 清除测试结果
 */
export const clearTestResult = () => {
  try {
    const storageKey = `${STORAGE_PREFIX}result`;
    localStorage.removeItem(storageKey);
    return true;
  } catch (error) {
    console.error('清除测试结果失败:', error);
    return false;
  }
};

/**
 * 检查是否有未完成的答题进度
 * @returns {boolean}
 */
export const hasTestProgress = () => {
  const progress = getTestProgress();
  return progress !== null;
};

/**
 * 检查是否有已完成的测试结果
 * @returns {boolean}
 */
export const hasTestResult = () => {
  const result = getTestResult();
  return result !== null;
};

/**
 * 清理所有过期的MBTI测试数据
 */
export const cleanupExpiredProgress = () => {
  try {
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const keys = Object.keys(localStorage);
    
    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        try {
          const dataStr = localStorage.getItem(key);
          const data = JSON.parse(dataStr);
          
          if (data.timestamp && Date.now() - data.timestamp > THIRTY_DAYS) {
            localStorage.removeItem(key);
            console.log(`已清除过期的数据: ${key}`);
          }
        } catch (error) {
          // 如果数据格式有问题，直接删除
          localStorage.removeItem(key);
        }
      }
    });
  } catch (error) {
    console.error('清理过期数据失败:', error);
  }
};

/**
 * 获取答题进度统计信息
 * @param {Array} answers - 答案数组
 * @param {number} totalQuestions - 总题目数（默认93）
 * @returns {Object} 统计信息
 */
export const getProgressStats = (answers, totalQuestions = 93) => {
  const answeredCount = answers.filter(answer => 
    answer !== null && answer !== undefined && answer !== ''
  ).length;
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100);
  
  return {
    answeredCount,
    totalQuestions,
    unansweredCount: totalQuestions - answeredCount,
    progressPercent,
    isComplete: answeredCount === totalQuestions
  };
};

/**
 * 清除所有MBTI测试数据（进度和结果）
 */
export const clearAllData = () => {
  try {
    clearTestProgress();
    clearTestResult();
    return true;
  } catch (error) {
    console.error('清除所有数据失败:', error);
    return false;
  }
};

