/* ============================================
   错误处理和边界情况处理 - error-handler.js
   ============================================ */

/**
 * 错误处理器
 */
const ErrorHandler = {
    /**
     * 初始化错误处理
     */
    init: function() {
        // 全局错误捕获
        window.addEventListener('error', this.handleGlobalError.bind(this));
        
        // Promise未捕获错误
        window.addEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this));
        
        // 检查浏览器兼容性
        this.checkBrowserCompatibility();
        
        console.log('错误处理器初始化完成');
    },

    /**
     * 处理全局错误
     * @param {ErrorEvent} event - 错误事件
     */
    handleGlobalError: function(event) {
        console.error('全局错误:', {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error
        });
        
        // 不阻止默认行为，让浏览器正常显示错误
        // 但可以在这里添加错误上报逻辑
    },

    /**
     * 处理未捕获的Promise错误
     * @param {PromiseRejectionEvent} event - Promise拒绝事件
     */
    handleUnhandledRejection: function(event) {
        console.error('未捕获的Promise错误:', event.reason);
        
        // 阻止默认行为（阻止在控制台显示错误）
        event.preventDefault();
        
        // 可以在这里添加错误上报逻辑
    },

    /**
     * 检查浏览器兼容性
     */
    checkBrowserCompatibility: function() {
        const issues = [];
        
        // 检查localStorage
        if (!Storage.isAvailable()) {
            issues.push('localStorage不可用，数据将无法保存');
        }
        
        // 检查URL API
        if (typeof URL === 'undefined' || typeof URLSearchParams === 'undefined') {
            issues.push('URL API不可用，某些功能可能无法正常工作');
        }
        
        // 检查JSON
        if (typeof JSON === 'undefined' || typeof JSON.stringify === 'undefined') {
            issues.push('JSON API不可用，数据序列化将失败');
        }
        
        // 检查History API
        if (typeof history === 'undefined' || typeof history.replaceState === 'undefined') {
            issues.push('History API不可用，URL参数管理可能无法正常工作');
        }
        
        if (issues.length > 0) {
            console.warn('浏览器兼容性检查发现问题:', issues);
            // 可以在这里显示用户友好的提示
        }
    },

    /**
     * 处理数据损坏
     * @param {string} dataType - 数据类型（'answers', 'type', 'state'等）
     * @param {*} corruptedData - 损坏的数据
     * @returns {boolean} 是否成功恢复
     */
    handleCorruptedData: function(dataType, corruptedData) {
        console.warn(`检测到损坏的${dataType}数据:`, corruptedData);
        
        switch (dataType) {
            case 'answers':
                // 清除损坏的答案数据
                Storage.remove(StorageKeys.ANSWERS);
                console.log('已清除损坏的答案数据');
                return true;
                
            case 'type':
                // 清除损坏的类型数据
                Storage.remove(StorageKeys.SELECTED_TYPE);
                URLUtils.removeParam('type');
                console.log('已清除损坏的类型数据');
                return true;
                
            case 'state':
                // 清除损坏的状态数据
                Storage.remove(StorageKeys.CURRENT_QUESTION);
                console.log('已清除损坏的状态数据');
                return true;
                
            default:
                console.warn('未知的数据类型:', dataType);
                return false;
        }
    },

    /**
     * 安全地解析JSON
     * @param {string} jsonString - JSON字符串
     * @param {*} defaultValue - 默认值
     * @returns {*} 解析后的值或默认值
     */
    safeParseJSON: function(jsonString, defaultValue = null) {
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.warn('JSON解析失败:', e);
            return defaultValue;
        }
    },

    /**
     * 安全地执行函数
     * @param {Function} fn - 要执行的函数
     * @param {*} defaultValue - 出错时的默认返回值
     * @param {...*} args - 函数参数
     * @returns {*} 函数返回值或默认值
     */
    safeExecute: function(fn, defaultValue = null, ...args) {
        try {
            return fn.apply(null, args);
        } catch (e) {
            console.error('函数执行失败:', e);
            return defaultValue;
        }
    }
};

/**
 * 页面状态恢复器
 */
const StateRestorer = {
    /**
     * 恢复答题页状态
     * @returns {Object|null} 恢复的状态对象
     */
    restoreQuestionPageState: function() {
        try {
            // 检查是否有保存的答案
            const answers = TestDataManager.loadAnswers();
            if (!answers || answers.length === 0) {
                return null;
            }

            // 检查是否有保存的当前题目索引
            const currentQuestionIndex = TestDataManager.loadCurrentQuestion();
            if (currentQuestionIndex === null || currentQuestionIndex === undefined) {
                return null;
            }

            // 检查是否有MBTI类型
            const mbtiType = ThemeManager.getCurrentTheme();
            if (!mbtiType) {
                return null;
            }

            return {
                answers: answers,
                currentQuestionIndex: currentQuestionIndex,
                mbtiType: mbtiType,
                hasState: true
            };
        } catch (e) {
            console.error('恢复答题页状态失败:', e);
            return null;
        }
    },

    /**
     * 检查是否需要恢复状态
     * @returns {boolean} 是否需要恢复
     */
    shouldRestoreState: function() {
        // 检查URL参数中是否有恢复标志
        const restoreFlag = URLUtils.getParam('restore');
        if (restoreFlag === 'true') {
            return true;
        }

        // 检查是否有未完成的测试
        const testState = TestDataManager.loadTestState();
        if (testState && !testState.completed) {
            return true;
        }

        return false;
    },

    /**
     * 清除恢复状态
     */
    clearRestoreState: function() {
        URLUtils.removeParam('restore');
    }
};

// 如果是在浏览器环境中，初始化错误处理
if (typeof window !== 'undefined') {
    // 等待DOM加载完成后再初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            ErrorHandler.init();
        });
    } else {
        ErrorHandler.init();
    }
}

// 导出到全局（如果需要）
if (typeof window !== 'undefined') {
    window.ErrorHandler = ErrorHandler;
    window.StateRestorer = StateRestorer;
}

