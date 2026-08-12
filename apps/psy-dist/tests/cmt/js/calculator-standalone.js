// 城市匹配算法（传统script标签版本）
// 注意：此版本不使用ES6模块，可以直接通过script标签加载
// 需要先加载 dimensions.js, questions.js, cities.js（通过type="module"加载）

// 辅助函数：从window对象获取全局变量
// 注意：由于模块是异步加载的，变量可能在脚本执行时还未准备好
// 所以在函数内部获取变量，而不是在文件顶部
function getQuestions() {
    if (typeof window !== 'undefined' && window.QUESTIONS) {
        return window.QUESTIONS;
    }
    throw new Error('QUESTIONS 未定义，请确保 questions.js 已通过 type="module" 加载');
}

function getCities() {
    if (typeof window !== 'undefined' && window.CITIES) {
        return window.CITIES;
    }
    throw new Error('CITIES 未定义，请确保 cities.js 已通过 type="module" 加载');
}

function getDimensions() {
    if (typeof window !== 'undefined' && window.DIMENSIONS) {
        return window.DIMENSIONS;
    }
    throw new Error('DIMENSIONS 未定义，请确保 dimensions.js 已通过 type="module" 加载');
}

function getDimensionPreferences() {
    if (typeof window !== 'undefined' && window.DIMENSION_PREFERENCES) {
        return window.DIMENSION_PREFERENCES;
    }
    throw new Error('DIMENSION_PREFERENCES 未定义，请确保 dimensions.js 已通过 type="module" 加载');
}

/**
 * 计算城市匹配结果
 * @param {Object} answers - 用户答案对象，格式为 {questionId: "A"|"B"|"C"|"D", ...}
 * @returns {Object} 匹配结果对象
 */
function calculateCityMatch(answers) {
    // 获取全局变量（在函数内部获取，确保模块已加载）
    const QUESTIONS = getQuestions();
    const CITIES = getCities();
    const DIMENSIONS = getDimensions();
    const DIMENSION_PREFERENCES = getDimensionPreferences();

    // 步骤1: 初始化所有城市得分为0
    const cityScores = {};
    Object.keys(CITIES).forEach(cityCode => {
        cityScores[cityCode] = 0;
    });

    // 步骤2: 遍历每道题目，根据用户答案计算城市得分
    QUESTIONS.forEach(question => {
        const userAnswer = answers[question.id];
        if (!userAnswer) {
            // 如果该题未作答，跳过
            return;
        }

        // 找到用户选择的选项
        const selectedOption = question.options.find(opt => opt.value === userAnswer);
        if (selectedOption && selectedOption.cities) {
            // 将该选项关联的城市得分+1
            selectedOption.cities.forEach(cityCode => {
                if (cityScores.hasOwnProperty(cityCode)) {
                    cityScores[cityCode] += 1;
                }
            });
        }
    });

    // 步骤3: 生成城市排名列表（包含得分、百分比、排名）
    const cityRanking = Object.entries(cityScores)
        .map(([code, score]) => {
            const city = CITIES[code];
            return {
                code: code,
                name: city ? city.name : code,
                score: score
            };
        })
        .sort((a, b) => b.score - a.score)  // 按得分降序排序
        .map((city, index, arr) => {
            const maxScore = arr[0] ? arr[0].score : 0;
            let percentage = 0;

            if (maxScore > 0) {
                if (index === 0) {
                    // 第一名：根据领先优势在 90-95 区间内波动
                    const secondScore = arr[1] ? arr[1].score : maxScore;
                    let leadRatio = 0;
                    if (secondScore < maxScore) {
                        leadRatio = (maxScore - secondScore) / maxScore; // 0-1 之间
                    }
                    const base = 90;
                    const extra = Math.round(leadRatio * 5); // 0-5 分的浮动
                    percentage = base + extra; // 90-95 之间
                } else {
                    // 其他城市：相对于第一名按比例缩放到 0-89 之间
                    const ratio = city.score / maxScore;
                    percentage = Math.round(ratio * 89);
                }
            }

            return {
                ...city,
                percentage,
                rank: index + 1  // 设置排名
            };
        });

    // 步骤5: 提取前3名城市
    const topCities = cityRanking.slice(0, 3);

    // 步骤6: 进行维度分析
    const dimensionAnalysis = analyzeDimensions(answers);

    // 步骤7: 返回完整结果
    return {
        cityRanking: cityRanking,
        topCities: topCities,
        dimensionAnalysis: dimensionAnalysis,
        answers: answers,
        testDate: new Date().toISOString(),
        duration: 0  // 可以后续添加测试时长
    };
}

/**
 * 分析用户在11个维度上的偏好
 * @param {Object} answers - 用户答案对象
 * @returns {Array} 维度分析结果数组
 */
function analyzeDimensions(answers) {
    // 获取全局变量（在函数内部获取，确保模块已加载）
    const QUESTIONS = getQuestions();
    const DIMENSIONS = getDimensions();
    const DIMENSION_PREFERENCES = getDimensionPreferences();
    
    // 初始化每个维度的答案统计
    const dimensionStats = {
        A: {}, B: {}, C: {}, D: {}, E: {},
        F: {}, G: {}, H: {}, I: {}, J: {}, K: {}
    };

    // 统计每个维度各选项的选择次数
    QUESTIONS.forEach(question => {
        const userAnswer = answers[question.id];
        if (!userAnswer) {
            return;  // 未作答跳过
        }

        const dimension = question.dimension;
        if (dimensionStats[dimension]) {
            if (!dimensionStats[dimension][userAnswer]) {
                dimensionStats[dimension][userAnswer] = 0;
            }
            dimensionStats[dimension][userAnswer] += 1;
        }
    });

    // 生成维度分析结果
    const analysis = [];
    const dimensionKeys = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];

    dimensionKeys.forEach(dimensionKey => {
        const stats = dimensionStats[dimensionKey];
        const entries = Object.entries(stats);

        if (entries.length === 0) {
            // 该维度未作答
            analysis.push({
                dimension: dimensionKey,
                name: DIMENSIONS[dimensionKey] ? DIMENSIONS[dimensionKey].name : dimensionKey,
                preference: "未作答"
            });
        } else {
            // 找到选择次数最多的选项
            const sortedEntries = entries.sort(([, countA], [, countB]) => countB - countA);
            const mostSelectedOption = sortedEntries[0][0];  // 例如 "A", "B", "C", "D"

            // 获取对应的偏好标签
            const preferenceLabel = DIMENSION_PREFERENCES[dimensionKey] 
                ? (DIMENSION_PREFERENCES[dimensionKey][mostSelectedOption] || "综合偏好")
                : "综合偏好";

            analysis.push({
                dimension: dimensionKey,
                name: DIMENSIONS[dimensionKey] ? DIMENSIONS[dimensionKey].name : dimensionKey,
                preference: preferenceLabel
            });
        }
    });

    return analysis;
}

// 注意：此版本不使用export，函数直接暴露在全局作用域

