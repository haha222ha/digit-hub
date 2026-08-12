/**
 * 本地存储管理工具（SCL-90独立版本）
 * 用于保存和恢复答题进度、测试结果等数据
 * 
 * 注意：使用测试特定前缀 scl90_test_，避免与其他测试冲突
 */

const STORAGE_PREFIX = 'scl90_test_';

/**
 * 保存答题进度到本地存储
 * @param {Array} answers - 答案数组（90题）
 * @param {number} currentQuestion - 当前题目索引（0-89）
 * @param {Object} extraData - 额外数据
 */
export const saveTestProgress = (answers, currentQuestion, extraData = {}) => {
  try {
    const storageKey = `${STORAGE_PREFIX}progress`;
    const progressData = {
      testKey: 'scl90',
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
      testKey: 'scl90',
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
    // 检查localStorage是否可用（可能被跟踪防护阻止）
    const testKey = 'test_localStorage';
    try {
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
    } catch (e) {
      console.warn('localStorage不可用（可能被跟踪防护阻止）:', e);
      // 尝试从URL参数获取数据
      return getTestResultFromURL();
    }
    
    // 优先从SDK保存的key中读取（test_result_{token}）
    // 尝试从URL中获取token
    let sdkStorageKey = null;
    if (window.linkValidator && window.linkValidator.token) {
      sdkStorageKey = `test_result_${window.linkValidator.token}`;
    } else {
      // 尝试从URL中提取token
      const path = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      
      // 尝试匹配 /test/{test_code}/{token} 格式
      const standardMatch = path.match(/^\/test\/([^\/]+)\/([^\/]+)$/);
      if (standardMatch) {
        sdkStorageKey = `test_result_${standardMatch[2]}`;
      } else {
        // 尝试匹配 /tests/{test_code}/index.html?token={token} 格式
        const staticFileMatch = path.match(/^\/tests\/([^\/]+)\/index\.html$/);
        const tokenFromQuery = searchParams.get('token');
        if (staticFileMatch && tokenFromQuery) {
          sdkStorageKey = `test_result_${tokenFromQuery}`;
        }
      }
    }
    
    // 如果找到了SDK的key，优先读取
    if (sdkStorageKey) {
      const sdkDataStr = localStorage.getItem(sdkStorageKey);
      if (sdkDataStr) {
        try {
          const sdkData = JSON.parse(sdkDataStr);
          // SDK保存的数据格式可能不同，需要转换
          if (sdkData && !sdkData.result) {
            // SDK直接保存的是result对象，需要包装成统一格式
            return {
              testKey: 'scl90',
              result: sdkData,
              completedAt: sdkData.completedAt || new Date().toISOString(),
              timestamp: Date.now(),
              version: '1.0'
            };
          }
          return sdkData;
        } catch (e) {
          console.warn('解析SDK保存的结果失败:', e);
        }
      }
    }
    
    // 如果SDK的key没有数据，尝试从原来的key读取
    const storageKey = `${STORAGE_PREFIX}result`;
    const dataStr = localStorage.getItem(storageKey);
    
    if (!dataStr) {
      // 如果localStorage中没有，尝试从URL参数获取
      return getTestResultFromURL();
    }
    
    return JSON.parse(dataStr);
  } catch (error) {
    console.error('读取测试结果失败:', error);
    // 尝试从URL参数获取
    return getTestResultFromURL();
  }
};

/**
 * 从URL参数中获取测试结果（作为备用方案）
 * @returns {Object|null} 测试结果数据或null
 */
export function getTestResultFromURL() {
  try {
    const params = new URLSearchParams(window.location.search);
    const resultParam = params.get('result');
    if (resultParam) {
      console.log('从URL参数获取测试结果');
      return JSON.parse(decodeURIComponent(resultParam));
    }
  } catch (error) {
    console.error('从URL参数读取测试结果失败:', error);
  }
  return null;
}

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
 * 清理所有过期的SCL-90测试数据
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
 * @param {number} totalQuestions - 总题目数（默认90）
 * @returns {Object} 统计信息
 */
export const getProgressStats = (answers, totalQuestions = 90) => {
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
 * 清除所有SCL-90测试数据（进度和结果）
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

