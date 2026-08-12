/* ============================================
   公共JavaScript文件 - common.js
   包含：工具函数、数据模型、配置
   ============================================ */

/* ============================================
   步骤10：基础工具函数
   ============================================ */

/**
 * URL参数处理
 */
const URLUtils = {
    /**
     * 获取URL参数
     * @param {string} name - 参数名
     * @param {string} defaultValue - 默认值
     * @returns {string|null} 参数值
     */
    getParam: function(name, defaultValue = null) {
        try {
            const url = new URL(window.location.href);
            const value = url.searchParams.get(name);
            return value !== null ? value : defaultValue;
        } catch (e) {
            // 兼容旧浏览器
            const params = new URLSearchParams(window.location.search);
            const value = params.get(name);
            return value !== null ? value : defaultValue;
        }
    },

    /**
     * 设置URL参数（不刷新页面）
     * @param {string} name - 参数名
     * @param {string} value - 参数值
     */
    setParam: function(name, value) {
        try {
            const url = new URL(window.location.href);
            url.searchParams.set(name, value);
            window.history.replaceState({}, '', url.toString());
        } catch (e) {
            // 兼容旧浏览器
            const params = new URLSearchParams(window.location.search);
            params.set(name, value);
            const newUrl = window.location.pathname + '?' + params.toString();
            window.history.replaceState({}, '', newUrl);
        }
    },

    /**
     * 移除URL参数
     * @param {string} name - 参数名
     */
    removeParam: function(name) {
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete(name);
            window.history.replaceState({}, '', url.toString());
        } catch (e) {
            const params = new URLSearchParams(window.location.search);
            params.delete(name);
            const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
            window.history.replaceState({}, '', newUrl);
        }
    },

    /**
     * 获取所有URL参数
     * @returns {Object} 参数对象
     */
    getAllParams: function() {
        const params = {};
        try {
            const url = new URL(window.location.href);
            url.searchParams.forEach((value, key) => {
                params[key] = value;
            });
        } catch (e) {
            const urlParams = new URLSearchParams(window.location.search);
            urlParams.forEach((value, key) => {
                params[key] = value;
            });
        }
        return params;
    }
};

/**
 * localStorage封装（带错误处理）
 */
const Storage = {
    /**
     * 检查localStorage是否可用
     * @returns {boolean}
     */
    isAvailable: function() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    },

    /**
     * 保存数据到localStorage
     * @param {string} key - 键名
     * @param {*} value - 值（会自动JSON序列化）
     * @returns {boolean} 是否成功
     */
    save: function(key, value) {
        if (!this.isAvailable()) {
            console.warn('localStorage不可用，数据将无法保存');
            return false;
        }
        try {
            const jsonValue = JSON.stringify(value);
            localStorage.setItem(key, jsonValue);
            return true;
        } catch (e) {
            console.error('保存数据失败:', e);
            return false;
        }
    },

    /**
     * 从localStorage读取数据
     * @param {string} key - 键名
     * @param {*} defaultValue - 默认值
     * @returns {*} 数据值
     */
    load: function(key, defaultValue = null) {
        if (!this.isAvailable()) {
            return defaultValue;
        }
        try {
            const jsonValue = localStorage.getItem(key);
            if (jsonValue === null) {
                return defaultValue;
            }
            
            // 使用安全的JSON解析（如果ErrorHandler可用）
            let parsed;
            if (typeof window !== 'undefined' && window.ErrorHandler && window.ErrorHandler.safeParseJSON) {
                parsed = window.ErrorHandler.safeParseJSON(jsonValue, defaultValue);
            } else {
                parsed = JSON.parse(jsonValue);
            }
            
            // 如果解析失败，尝试处理数据损坏
            if (parsed === defaultValue && jsonValue !== null) {
                console.warn('数据可能已损坏，尝试清除:', key);
                // 根据数据类型决定是否清除
                if (key.includes('answer') || key.includes('type') || key.includes('state')) {
                    localStorage.removeItem(key);
                }
            }
            
            return parsed;
        } catch (e) {
            console.error('读取数据失败:', e);
            // 如果读取失败，尝试清除可能损坏的数据
            try {
                localStorage.removeItem(key);
            } catch (clearError) {
                console.error('清除损坏数据失败:', clearError);
            }
            return defaultValue;
        }
    },

    /**
     * 删除localStorage中的数据
     * @param {string} key - 键名
     * @returns {boolean} 是否成功
     */
    remove: function(key) {
        if (!this.isAvailable()) {
            return false;
        }
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.error('删除数据失败:', e);
            return false;
        }
    },

    /**
     * 清空所有localStorage数据
     * @returns {boolean} 是否成功
     */
    clear: function() {
        if (!this.isAvailable()) {
            return false;
        }
        try {
            localStorage.clear();
            return true;
        } catch (e) {
            console.error('清空数据失败:', e);
            return false;
        }
    }
};

/**
 * 页面导航工具
 */
const Navigation = {
    /**
     * 显示加载遮罩
     */
    showLoading: function() {
        let overlay = document.getElementById('page-loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'page-loading-overlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = '<div class="spinner"></div>';
            document.body.appendChild(overlay);
        }
        overlay.classList.add('active');
    },

    /**
     * 隐藏加载遮罩
     */
    hideLoading: function() {
        const overlay = document.getElementById('page-loading-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            // 延迟移除元素，等待动画完成
            setTimeout(() => {
                if (overlay && overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 300);
        }
    },

    /**
     * 跳转到指定页面（带过渡动画）
     * @param {string} path - 页面路径（相对于根目录）
     * @param {Object} params - URL参数对象
     * @param {Object} options - 选项对象 {showLoading: boolean, transition: string}
     */
    navigateTo: function(path, params = {}, options = {}) {
        try {
            // 默认选项
            const defaultOptions = {
                showLoading: true,
                transition: 'fade'
            };
            const opts = Object.assign({}, defaultOptions, options);

            // 显示加载遮罩
            if (opts.showLoading) {
                this.showLoading();
            }

            // 添加页面退出动画
            const mainContent = document.querySelector('.page-container') || 
                               document.querySelector('main') || 
                               document.body;
            if (mainContent) {
                mainContent.classList.add('page-exit');
            }

            // 延迟跳转，等待动画完成
            setTimeout(() => {
                let url = path;
                if (Object.keys(params).length > 0) {
                    const urlParams = new URLSearchParams();
                    for (const key in params) {
                        if (params.hasOwnProperty(key)) {
                            urlParams.set(key, params[key]);
                        }
                    }
                    url += '?' + urlParams.toString();
                }
                window.location.href = url;
            }, opts.showLoading ? 300 : 0);
        } catch (e) {
            console.error('页面跳转失败:', e);
            this.hideLoading();
        }
    },

    /**
     * 返回上一页
     */
    goBack: function() {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            // 如果没有历史记录，跳转到首页
            this.navigateTo('index.html');
        }
    },

    /**
     * 刷新当前页面
     */
    reload: function() {
        window.location.reload();
    }
};

/**
 * MBTI类型主题颜色配置
 */
const MBTITheme = {
    // 分析家组（Analysts）
    INTJ: {
        name: '建筑师',
        group: 'analysts',
        primary: '#88619a',
        light: '#bca0ca',
        dark: '#634373'
    },
    INTP: {
        name: '逻辑学家',
        group: 'analysts',
        primary: '#88619a',
        light: '#bca0ca',
        dark: '#634373'
    },
    ENTJ: {
        name: '指挥官',
        group: 'analysts',
        primary: '#88619a',
        light: '#bca0ca',
        dark: '#634373'
    },
    ENTP: {
        name: '辩论家',
        group: 'analysts',
        primary: '#88619a',
        light: '#bca0ca',
        dark: '#634373'
    },

    // 外交家组（Diplomats）
    INFJ: {
        name: '提倡者',
        group: 'diplomats',
        primary: '#33a474',
        light: '#4fc08d',
        dark: '#26855c'
    },
    INFP: {
        name: '调停者',
        group: 'diplomats',
        primary: '#33a474',
        light: '#4fc08d',
        dark: '#26855c'
    },
    ENFJ: {
        name: '主人公',
        group: 'diplomats',
        primary: '#33a474',
        light: '#4fc08d',
        dark: '#26855c'
    },
    ENFP: {
        name: '竞选者',
        group: 'diplomats',
        primary: '#33a474',
        light: '#4fc08d',
        dark: '#26855c'
    },

    // 守护者组（Sentinels）
    ISTJ: {
        name: '物流师',
        group: 'sentinels',
        primary: '#4298b4',
        light: '#5fb8d4',
        dark: '#2d7a94'
    },
    ISFJ: {
        name: '守卫者',
        group: 'sentinels',
        primary: '#4298b4',
        light: '#5fb8d4',
        dark: '#2d7a94'
    },
    ESTJ: {
        name: '总经理',
        group: 'sentinels',
        primary: '#4298b4',
        light: '#5fb8d4',
        dark: '#2d7a94'
    },
    ESFJ: {
        name: '执政官',
        group: 'sentinels',
        primary: '#4298b4',
        light: '#5fb8d4',
        dark: '#2d7a94'
    },

    // 探险家组（Explorers）
    ISTP: {
        name: '鉴赏家',
        group: 'explorers',
        primary: '#e2a03f',
        light: '#f0b85c',
        dark: '#c8872a'
    },
    ISFP: {
        name: '探险家',
        group: 'explorers',
        primary: '#e2a03f',
        light: '#f0b85c',
        dark: '#c8872a'
    },
    ESTP: {
        name: '企业家',
        group: 'explorers',
        primary: '#e2a03f',
        light: '#f0b85c',
        dark: '#c8872a'
    },
    ESFP: {
        name: '表演者',
        group: 'explorers',
        primary: '#e2a03f',
        light: '#f0b85c',
        dark: '#c8872a'
    },

    /**
     * 根据MBTI类型获取主题配置
     * @param {string} type - MBTI类型（如 'INTJ'）
     * @returns {Object|null} 主题配置对象
     */
    getTheme: function(type) {
        if (!type) return null;
        const upperType = type.toUpperCase();
        return this[upperType] || null;
    },

    /**
     * 根据MBTI类型获取组别
     * @param {string} type - MBTI类型
     * @returns {string|null} 组别名称
     */
    getGroup: function(type) {
        const theme = this.getTheme(type);
        return theme ? theme.group : null;
    },

    /**
     * 应用主题颜色到页面
     * @param {string} type - MBTI类型
     * @param {HTMLElement} element - 要应用主题的元素（可选，默认是document.documentElement）
     */
    applyTheme: function(type, element = document.documentElement) {
        const theme = this.getTheme(type);
        if (!theme) {
            console.warn('未知的MBTI类型:', type);
            return;
        }

        // 设置CSS变量
        element.style.setProperty('--theme-primary', theme.primary);
        element.style.setProperty('--theme-light', theme.light);
        element.style.setProperty('--theme-dark', theme.dark);
        element.style.setProperty('--glow-color-1', theme.primary);
        element.style.setProperty('--glow-color-2', theme.light);

        // 添加主题类名
        const groupClass = 'theme-' + theme.group;
        element.classList.remove('theme-analysts', 'theme-diplomats', 'theme-sentinels', 'theme-explorers');
        element.classList.add(groupClass);
    }
};

/* ============================================
   步骤11：数据模型和配置
   ============================================ */

/**
 * MBTI类型配置（16种类型，4个组别）
 */
const MBTITypes = {
    // 分析家组（Analysts）
    INTJ: { code: 'INTJ', name: '建筑师', group: 'analysts', groupName: '分析家' },
    INTP: { code: 'INTP', name: '逻辑学家', group: 'analysts', groupName: '分析家' },
    ENTJ: { code: 'ENTJ', name: '指挥官', group: 'analysts', groupName: '分析家' },
    ENTP: { code: 'ENTP', name: '辩论家', group: 'analysts', groupName: '分析家' },

    // 外交家组（Diplomats）
    INFJ: { code: 'INFJ', name: '提倡者', group: 'diplomats', groupName: '外交家' },
    INFP: { code: 'INFP', name: '调停者', group: 'diplomats', groupName: '外交家' },
    ENFJ: { code: 'ENFJ', name: '主人公', group: 'diplomats', groupName: '外交家' },
    ENFP: { code: 'ENFP', name: '竞选者', group: 'diplomats', groupName: '外交家' },

    // 守护者组（Sentinels）
    ISTJ: { code: 'ISTJ', name: '物流师', group: 'sentinels', groupName: '守护者' },
    ISFJ: { code: 'ISFJ', name: '守卫者', group: 'sentinels', groupName: '守护者' },
    ESTJ: { code: 'ESTJ', name: '总经理', group: 'sentinels', groupName: '守护者' },
    ESFJ: { code: 'ESFJ', name: '执政官', group: 'sentinels', groupName: '守护者' },

    // 探险家组（Explorers）
    ISTP: { code: 'ISTP', name: '鉴赏家', group: 'explorers', groupName: '探险家' },
    ISFP: { code: 'ISFP', name: '探险家', group: 'explorers', groupName: '探险家' },
    ESTP: { code: 'ESTP', name: '企业家', group: 'explorers', groupName: '探险家' },
    ESFP: { code: 'ESFP', name: '表演者', group: 'explorers', groupName: '探险家' }
};

/**
 * 阶位配置
 */
const StageLevels = {
    UNCONSCIOUS: {
        code: 'unconscious',
        name: '未觉醒',
        minScore: 0,
        maxScore: 25,
        description: '尚未意识到自己的潜能'
    },
    LOW: {
        code: 'low',
        name: '低阶',
        minScore: 26,
        maxScore: 50,
        description: '初步觉醒，开始探索自我'
    },
    MID: {
        code: 'mid',
        name: '中阶',
        minScore: 51,
        maxScore: 75,
        description: '深入理解，持续成长'
    },
    HIGH: {
        code: 'high',
        name: '高阶',
        minScore: 76,
        maxScore: 100,
        description: '完全觉醒，知行合一'
    }
};

/**
 * 根据分数获取阶位
 * @param {number} score - 分数（0-100）
 * @returns {Object} 阶位配置对象
 */
function getStageByScore(score) {
    if (score <= 25) return StageLevels.UNCONSCIOUS;
    if (score <= 50) return StageLevels.LOW;
    if (score <= 75) return StageLevels.MID;
    return StageLevels.HIGH;
}

/**
 * 题目数据结构定义
 */
const QuestionModel = {
    /**
     * 创建题目对象
     * @param {number} id - 题目ID
     * @param {string} text - 题目文本
     * @param {Array} options - 选项数组
     * @param {string} dimension - 维度（如 'T', 'F', 'S', 'N'等）
     * @returns {Object} 题目对象
     */
    create: function(id, text, options, dimension) {
        return {
            id: id,
            text: text,
            options: options || [
                { value: 1, label: '完全不符合' },
                { value: 2, label: '比较不符合' },
                { value: 3, label: '不确定' },
                { value: 4, label: '比较符合' },
                { value: 5, label: '完全符合' }
            ],
            dimension: dimension || '',
            answered: false,
            answer: null
        };
    }
};

/**
 * 答案数据结构定义
 */
const AnswerModel = {
    /**
     * 创建答案对象
     * @param {number} questionId - 题目ID
     * @param {number} value - 答案值（1-5）
     * @param {number} timestamp - 答题时间戳
     * @returns {Object} 答案对象
     */
    create: function(questionId, value, timestamp = Date.now()) {
        return {
            questionId: questionId,
            value: value,
            timestamp: timestamp
        };
    }
};

/**
 * 报告数据结构定义
 */
const ReportModel = {
    /**
     * 创建报告对象
     * @param {string} mbtiType - MBTI类型
     * @param {Object} scores - 各维度得分
     * @param {Object} stage - 阶位信息
     * @param {Array} answers - 答案数组
     * @returns {Object} 报告对象
     */
    create: function(mbtiType, scores, stage, answers) {
        return {
            mbtiType: mbtiType,
            mbtiInfo: MBTITypes[mbtiType] || null,
            scores: scores || {},
            stage: stage || StageLevels.UNCONSCIOUS,
            answers: answers || [],
            dimensions: this.calculateDimensions(scores || {}),
            timestamp: Date.now(),
            reportId: this.generateReportId()
        };
    },

    /**
     * 计算各维度得分
     * @param {Object} scores - 原始得分
     * @returns {Object} 维度得分对象
     */
    calculateDimensions: function(scores) {
        return {
            logic: scores.logic || 0,        // 逻辑思维
            innovation: scores.innovation || 0,  // 创新能力
            execution: scores.execution || 0,     // 执行力
            communication: scores.communication || 0, // 沟通能力
            learning: scores.learning || 0        // 学习能力
        };
    },

    /**
     * 生成报告ID
     * @returns {string} 报告ID
     */
    generateReportId: function() {
        return 'report_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
};

/**
 * 测试数据存储键名
 */
const StorageKeys = {
    SELECTED_TYPE: 'mbti16_selected_type',      // 选择的MBTI类型
    ANSWERS: 'mbti16_answers',                  // 答案数据
    CURRENT_QUESTION: 'mbti16_current_question', // 当前题目索引
    REPORT_DATA: 'mbti16_report_data',          // 报告数据
    TEST_START_TIME: 'mbti16_test_start_time'    // 测试开始时间
};

/* ============================================
   步骤12：主题切换功能增强
   ============================================ */

/**
 * 主题管理器
 */
const ThemeManager = {
    /**
     * 初始化主题（从存储或URL参数中读取）
     * @param {HTMLElement} element - 要应用主题的元素（可选）
     * @returns {string|null} 应用的MBTI类型
     */
    init: function(element = document.documentElement) {
        // 优先从URL参数获取
        let mbtiType = URLUtils.getParam('type');
        
        // 如果没有URL参数，从localStorage获取
        if (!mbtiType) {
            mbtiType = Storage.load(StorageKeys.SELECTED_TYPE, null);
        }
        
        // 如果找到类型，应用主题
        if (mbtiType) {
            this.setTheme(mbtiType, element);
            return mbtiType;
        }
        
        return null;
    },

    /**
     * 设置主题并保存
     * @param {string} type - MBTI类型
     * @param {HTMLElement} element - 要应用主题的元素（可选）
     */
    setTheme: function(type, element = document.documentElement) {
        // 验证MBTI类型
        if (!type || typeof type !== 'string') {
            console.warn('无效的MBTI类型:', type);
            return;
        }
        
        if (!MBTITypes[type]) {
            console.warn('未知的MBTI类型:', type);
            return;
        }

        // 应用主题颜色
        MBTITheme.applyTheme(type, element);
        
        // 保存到localStorage
        const saveSuccess = Storage.save(StorageKeys.SELECTED_TYPE, type);
        if (!saveSuccess) {
            console.warn('保存MBTI类型到localStorage失败');
        }
        
        // 保存到URL参数（不刷新页面）
        try {
            URLUtils.setParam('type', type);
        } catch (e) {
            console.warn('保存MBTI类型到URL参数失败:', e);
        }
    },

    /**
     * 清除主题
     * @param {HTMLElement} element - 要清除主题的元素（可选）
     */
    clearTheme: function(element = document.documentElement) {
        // 移除主题类名
        element.classList.remove('theme-analysts', 'theme-diplomats', 'theme-sentinels', 'theme-explorers');
        
        // 清除CSS变量
        element.style.removeProperty('--theme-primary');
        element.style.removeProperty('--theme-light');
        element.style.removeProperty('--theme-dark');
        element.style.removeProperty('--glow-color-1');
        element.style.removeProperty('--glow-color-2');
        
        // 清除存储
        Storage.remove(StorageKeys.SELECTED_TYPE);
        URLUtils.removeParam('type');
    },

    /**
     * 获取当前主题类型
     * @returns {string|null} 当前MBTI类型
     */
    getCurrentTheme: function() {
        // 优先从localStorage获取
        let mbtiType = Storage.load(StorageKeys.SELECTED_TYPE, null);
        
        // 如果没有，从URL参数获取
        if (!mbtiType) {
            mbtiType = URLUtils.getParam('type');
        }
        
        // 验证类型是否有效
        if (mbtiType && !MBTITypes[mbtiType]) {
            console.warn('无效的MBTI类型:', mbtiType);
            return null;
        }
        
        return mbtiType;
    },

    /**
     * 动态设置CSS变量
     * @param {string} variable - CSS变量名（不需要--前缀）
     * @param {string} value - 变量值
     * @param {HTMLElement} element - 要设置的元素（可选）
     */
    setCSSVariable: function(variable, value, element = document.documentElement) {
        const varName = variable.startsWith('--') ? variable : '--' + variable;
        element.style.setProperty(varName, value);
    },

    /**
     * 批量设置CSS变量
     * @param {Object} variables - CSS变量对象（键名不需要--前缀）
     * @param {HTMLElement} element - 要设置的元素（可选）
     */
    setCSSVariables: function(variables, element = document.documentElement) {
        for (const key in variables) {
            if (variables.hasOwnProperty(key)) {
                this.setCSSVariable(key, variables[key], element);
            }
        }
    }
};

/* ============================================
   步骤13：数据存储管理
   ============================================ */

/**
 * 测试数据管理器
 */
const TestDataManager = {
    /**
     * 保存答案
     * @param {Array} answers - 答案数组
     * @returns {boolean} 是否成功
     */
    saveAnswers: function(answers) {
        if (!Array.isArray(answers)) {
            console.error('答案必须是数组');
            return false;
        }
        return Storage.save(StorageKeys.ANSWERS, answers);
    },

    /**
     * 读取答案
     * @returns {Array} 答案数组
     */
    loadAnswers: function() {
        const answers = Storage.load(StorageKeys.ANSWERS, []);
        
        // 验证答案数据格式
        if (!Array.isArray(answers)) {
            console.warn('答案数据格式错误，返回空数组');
            return [];
        }
        
        // 过滤无效答案
        const validAnswers = answers.filter(answer => {
            return answer && 
                   typeof answer.questionId === 'number' && 
                   typeof answer.value === 'number' &&
                   answer.questionId >= 1 && answer.questionId <= 32 &&
                   answer.value >= 1 && answer.value <= 5;
        });
        
        if (validAnswers.length !== answers.length) {
            console.warn(`发现${answers.length - validAnswers.length}个无效答案，已过滤`);
            // 保存过滤后的答案
            Storage.save(StorageKeys.ANSWERS, validAnswers);
        }
        
        return validAnswers;
    },

    /**
     * 保存单个答案
     * @param {number} questionId - 题目ID
     * @param {number} value - 答案值
     * @returns {boolean} 是否成功
     */
    saveAnswer: function(questionId, value) {
        // 验证参数
        if (!questionId || typeof questionId !== 'number' || questionId < 1 || questionId > 32) {
            console.warn('无效的题目ID:', questionId);
            return false;
        }
        if (!value || typeof value !== 'number' || value < 1 || value > 5) {
            console.warn('无效的答案值:', value);
            return false;
        }

        const answers = this.loadAnswers();
        // 查找是否已有该题目的答案
        const index = answers.findIndex(a => a.questionId === questionId);
        const answer = AnswerModel.create(questionId, value);
        
        if (index >= 0) {
            // 更新现有答案
            answers[index] = answer;
        } else {
            // 添加新答案
            answers.push(answer);
        }
        
        return this.saveAnswers(answers);
    },

    /**
     * 获取单个答案
     * @param {number} questionId - 题目ID
     * @returns {Object|null} 答案对象
     */
    getAnswer: function(questionId) {
        const answers = this.loadAnswers();
        return answers.find(a => a.questionId === questionId) || null;
    },

    /**
     * 保存测试状态
     * @param {Object} state - 状态对象
     * @returns {boolean} 是否成功
     */
    saveTestState: function(state) {
        const currentState = this.loadTestState();
        const newState = Object.assign({}, currentState, state, {
            lastUpdate: Date.now()
        });
        return Storage.save('mbti16_test_state', newState);
    },

    /**
     * 读取测试状态
     * @returns {Object} 状态对象
     */
    loadTestState: function() {
        return Storage.load('mbti16_test_state', {
            currentQuestionIndex: 0,
            totalQuestions: 32,
            startTime: null,
            lastUpdate: null
        });
    },

    /**
     * 保存当前题目索引
     * @param {number} index - 题目索引
     * @returns {boolean} 是否成功
     */
    saveCurrentQuestion: function(index) {
        return Storage.save(StorageKeys.CURRENT_QUESTION, index);
    },

    /**
     * 读取当前题目索引
     * @returns {number} 题目索引
     */
    loadCurrentQuestion: function() {
        return Storage.load(StorageKeys.CURRENT_QUESTION, 0);
    },

    /**
     * 保存报告数据
     * @param {Object} reportData - 报告数据对象
     * @returns {boolean} 是否成功
     */
    saveReportData: function(reportData) {
        return Storage.save(StorageKeys.REPORT_DATA, reportData);
    },

    /**
     * 读取报告数据
     * @returns {Object|null} 报告数据对象
     */
    loadReportData: function() {
        return Storage.load(StorageKeys.REPORT_DATA, null);
    },

    /**
     * 保存测试开始时间
     * @param {number} timestamp - 时间戳（可选，默认当前时间）
     * @returns {boolean} 是否成功
     */
    saveTestStartTime: function(timestamp = Date.now()) {
        return Storage.save(StorageKeys.TEST_START_TIME, timestamp);
    },

    /**
     * 读取测试开始时间
     * @returns {number|null} 时间戳
     */
    loadTestStartTime: function() {
        return Storage.load(StorageKeys.TEST_START_TIME, null);
    },

    /**
     * 清除所有测试数据
     * @returns {boolean} 是否成功
     */
    clearTestData: function() {
        const keys = [
            StorageKeys.SELECTED_TYPE,
            StorageKeys.ANSWERS,
            StorageKeys.CURRENT_QUESTION,
            StorageKeys.REPORT_DATA,
            StorageKeys.TEST_START_TIME,
            'mbti16_test_state'
        ];
        
        let success = true;
        keys.forEach(key => {
            if (!Storage.remove(key)) {
                success = false;
            }
        });
        
        return success;
    },

    /**
     * 检查是否有未完成的测试
     * @returns {boolean} 是否有未完成的测试
     */
    hasIncompleteTest: function() {
        const answers = this.loadAnswers();
        const state = this.loadTestState();
        return answers.length > 0 && answers.length < state.totalQuestions;
    },

    /**
     * 获取答题进度
     * @returns {Object} 进度对象 { answered: number, total: number, percentage: number }
     */
    getProgress: function() {
        const answers = this.loadAnswers();
        const state = this.loadTestState();
        const total = state.totalQuestions || 32;
        const answered = answers.length;
        const percentage = total > 0 ? Math.round((answered / total) * 100) : 0;
        
        return {
            answered: answered,
            total: total,
            percentage: percentage
        };
    }
};

// 导出到全局
if (typeof window !== 'undefined') {
    window.URLUtils = URLUtils;
    window.Storage = Storage;
    window.Navigation = Navigation;
    window.MBTITheme = MBTITheme;
    window.MBTITypes = MBTITypes;
    window.StageLevels = StageLevels;
    window.getStageByScore = getStageByScore;
    window.QuestionModel = QuestionModel;
    window.AnswerModel = AnswerModel;
    window.ReportModel = ReportModel;
    window.StorageKeys = StorageKeys;
    window.ThemeManager = ThemeManager;
    window.TestDataManager = TestDataManager;
}

