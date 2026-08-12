/**
 * 核心匹配算法
 * 根据用户选择的答案，匹配最相似的动物原型
 */

// 定义所有维度
const DIMENSIONS = ['DOM', 'STR', 'COM', 'SOL', 'AGI', 'SEC', 'AES'];

/**
 * 计算向量的L2范数（模长）
 * @param {Object} vector - 维度向量对象
 * @returns {number} 向量的模长
 */
function calculateL2Norm(vector) {
  let sum = 0;
  for (const dim of DIMENSIONS) {
    sum += Math.pow(vector[dim] || 0, 2);
  }
  return Math.sqrt(sum);
}

/**
 * L2归一化向量
 * @param {Object} vector - 维度向量对象
 * @returns {Object} 归一化后的向量
 */
function normalizeL2(vector) {
  const norm = calculateL2Norm(vector);
  if (norm === 0) return vector;
  
  const normalized = {};
  for (const dim of DIMENSIONS) {
    normalized[dim] = (vector[dim] || 0) / norm;
  }
  return normalized;
}

/**
 * 计算两个向量的余弦相似度
 * @param {Object} vector1 - 第一个向量
 * @param {Object} vector2 - 第二个向量
 * @returns {number} 余弦相似度值（-1到1之间）
 */
function cosineSimilarity(vector1, vector2) {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (const dim of DIMENSIONS) {
    const v1 = vector1[dim] || 0;
    const v2 = vector2[dim] || 0;
    dotProduct += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  }
  
  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (denominator === 0) return 0;
  
  return dotProduct / denominator;
}

/**
 * 计算理论最高分
 * 对每个维度，计算如果每题都选择该维度得分最高的选项，能得到的最高分
 * @param {Array} scoreMap - 计分规则数组
 * @returns {Object} 每个维度的理论最高分
 */
function calculateMaxScores(scoreMap) {
  const maxScores = {};
  
  // 初始化所有维度为0
  for (const dim of DIMENSIONS) {
    maxScores[dim] = 0;
  }
  
  // 遍历每道题
  for (const questionScore of scoreMap) {
    // 对每个维度，找到该题中该维度的最高分
    for (const dim of DIMENSIONS) {
      let maxScoreForDim = 0;
      
      // 遍历所有选项（A, B, C, D）
      for (const option of ['A', 'B', 'C', 'D']) {
        if (questionScore[option] && questionScore[option][dim]) {
          maxScoreForDim = Math.max(maxScoreForDim, questionScore[option][dim]);
        }
      }
      
      maxScores[dim] += maxScoreForDim;
    }
  }
  
  return maxScores;
}

/**
 * 匹配动物原型
 * @param {Array} selectedOptions - 用户选择的答案数组，如 ['A', 'B', 'C', ...]
 * @param {Array} scoreMap - 计分规则数组
 * @param {Object} animalArchetypes - 动物原型对象
 * @returns {Object} 包含匹配结果的对象 { animal: '动物名', similarity: 相似度, userVector: 用户向量 }
 */
function matchAnimal(selectedOptions, scoreMap, animalArchetypes) {
  // 1. 初始化用户得分向量
  const userScores = {};
  for (const dim of DIMENSIONS) {
    userScores[dim] = 0;
  }
  
  // 2. 遍历用户答案，累加各维度得分
  for (let i = 0; i < selectedOptions.length && i < scoreMap.length; i++) {
    const option = selectedOptions[i];
    const questionScore = scoreMap[i];
    
    if (questionScore && questionScore[option]) {
      const optionScores = questionScore[option];
      
      // 累加每个维度的得分
      for (const dim of DIMENSIONS) {
        if (optionScores[dim]) {
          userScores[dim] += optionScores[dim];
        }
      }
    }
  }
  
  // 3. 计算理论最高分
  const maxScores = calculateMaxScores(scoreMap);
  
  // 4. 标准化得分（0-1区间）
  const normalizedScores = {};
  for (const dim of DIMENSIONS) {
    if (maxScores[dim] > 0) {
      normalizedScores[dim] = userScores[dim] / maxScores[dim];
    } else {
      normalizedScores[dim] = 0;
    }
  }
  
  // 5. L2归一化
  const l2Normalized = normalizeL2(normalizedScores);
  
  // 6. 计算与每个动物原型的余弦相似度
  let bestMatch = null;
  let maxSimilarity = -1;
  
  for (const [animalName, animalData] of Object.entries(animalArchetypes)) {
    const animalVector = animalData.vector;
    
    // 对动物向量也进行L2归一化（如果还没有归一化）
    const normalizedAnimalVector = normalizeL2(animalVector);
    
    // 计算余弦相似度
    const similarity = cosineSimilarity(l2Normalized, normalizedAnimalVector);
    
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      bestMatch = {
        animal: animalName,
        similarity: similarity,
        userVector: l2Normalized,
        animalVector: normalizedAnimalVector,
        rawScores: userScores,
        normalizedScores: normalizedScores
      };
    }
  }
  
  return bestMatch;
}

