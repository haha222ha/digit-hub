// 测试页逻辑 (questionnaire.js)
// 注意：此文件需要先加载 questions.js, dimensions.js, cities.js, calculator-standalone.js

(function() {
    'use strict';

    // 全局变量
    let currentQuestionIndex = 0;  // 当前题目索引（从0开始）
    let answers = {};              // 存储用户答案 {questionId: "A"|"B"|"C"|"D", ...}
    let questions = [];            // 题目数组
    let totalQuestions = 0;        // 总题数
    let isProcessingSelection = false; // 是否正在处理选择（防止快速重复点击）
    let autoJumpTimer = null;      // 自动跳转定时器
    
    // DOM元素缓存（性能优化）
    let $elements = {};

    // 等待DOM加载完成
    document.addEventListener('DOMContentLoaded', function() {
        // 检查数据是否已加载
        if (typeof window.QUESTIONS === 'undefined') {
            console.error('QUESTIONS 未定义，请确保 questions.js 已正确加载');
            return;
        }
        if (typeof window.DIMENSIONS === 'undefined') {
            console.error('DIMENSIONS 未定义，请确保 dimensions.js 已正确加载');
            return;
        }

        // 初始化
        init();
    });

    /**
     * 初始化页面
     */
    async function init() {
        // 缓存常用DOM元素（性能优化）
        cacheDOMElements();
        
        // 加载题目数据
        questions = window.QUESTIONS;
        if (!questions || !Array.isArray(questions) || questions.length === 0) {
            console.error('题目数据无效');
            showError('题目数据加载失败，请刷新页面重试');
            return;
        }
        totalQuestions = questions.length;

        // 初始化当前题目索引（从0开始）
        currentQuestionIndex = 0;

        // 初始化答案存储对象
        answers = {};

        // 更新总题数显示
        updateTotalQuestions();

        // 显示第一题
        showQuestion(currentQuestionIndex);

        // 绑定事件
        bindEvents();

        // 调用测试开始API（单视角测试）
        if (window.linkValidator) {
            try {
                await window.linkValidator.startTest();
                console.log('测试开始记录成功');
            } catch (error) {
                console.error('记录测试开始失败:', error);
                // 测试开始失败，可以显示错误提示或返回欢迎页
                // 这里不阻止用户继续答题，只记录错误
            }
        }
    }
    
    /**
     * 缓存常用DOM元素（性能优化）
     */
    function cacheDOMElements() {
        $elements = {
            progressText: document.getElementById('progress-text'),
            progressPercentage: document.getElementById('progress-percentage'),
            progressBarFill: document.getElementById('progress-bar-fill'),
            dimensionIcon: document.getElementById('dimension-icon'),
            dimensionName: document.getElementById('dimension-name'),
            questionText: document.getElementById('question-text'),
            currentQuestion: document.getElementById('current-question'),
            totalQuestions: document.getElementById('total-questions'),
            optionsContainer: document.getElementById('options-container'),
            prevBtn: document.getElementById('prev-btn'),
            nextBtn: document.getElementById('next-btn'),
            submitBtn: document.getElementById('submit-btn')
        };
    }
    
    /**
     * 显示错误信息
     * @param {string} message - 错误信息
     */
    function showError(message) {
        const container = document.querySelector('.questionnaire-container');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px;">
                    <h2 style="color: #e53e3e; margin-bottom: 20px;">⚠️ 错误</h2>
                    <p style="color: #4a5568; margin-bottom: 30px; font-size: 16px;">${message}</p>
                    <button onclick="window.location.reload()" class="btn btn-primary">刷新页面</button>
                </div>
            `;
        } else {
            alert(message);
        }
    }

    /**
     * 更新总题数显示
     */
    function updateTotalQuestions() {
        if ($elements.totalQuestions) {
            $elements.totalQuestions.textContent = totalQuestions;
        }
    }

    /**
     * 显示指定索引的题目
     * @param {number} index - 题目索引
     */
    function showQuestion(index) {
        if (index < 0 || index >= questions.length) {
            console.error('题目索引超出范围:', index);
            return;
        }

        const question = questions[index];
        if (!question) {
            console.error('题目不存在:', index);
            return;
        }

        // 清除任何正在进行的自动跳转定时器
        if (autoJumpTimer) {
            clearTimeout(autoJumpTimer);
            autoJumpTimer = null;
        }

        // 重置处理标志（新题目时重置）
        isProcessingSelection = false;

        // 更新当前题目索引
        currentQuestionIndex = index;

        // 显示题目（带淡入动画）
        displayQuestion(question);

        // 更新进度信息
        updateProgressInfo();

        // 更新维度信息
        updateDimensionInfo(question);

        // 更新导航按钮状态
        updateNavigationButtons();

        // 滚动到顶部（移动端优化）
        scrollToTop();
    }

    /**
     * 滚动到顶部（移动端优化）
     */
    function scrollToTop() {
        // 平滑滚动到顶部
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }

    /**
     * 更新导航按钮状态
     */
    function updateNavigationButtons() {
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const submitBtn = document.getElementById('submit-btn');

        // 获取当前题目
        const currentQuestion = questions[currentQuestionIndex];
        const isAnswered = currentQuestion && answers[currentQuestion.id];

        // 更新"上一题"按钮状态
        if (prevBtn) {
            if (currentQuestionIndex === 0) {
                // 第一题时禁用
                prevBtn.disabled = true;
            } else {
                prevBtn.disabled = false;
            }
        }

        // 更新"下一题"和"提交"按钮显示
        if (currentQuestionIndex === questions.length - 1) {
            // 最后一题时显示"提交测评"按钮，隐藏"下一题"按钮
            if (nextBtn) {
                nextBtn.style.display = 'none';
            }
            if (submitBtn) {
                submitBtn.style.display = 'inline-flex';
                // 提交按钮只有在已作答时才可点击
                submitBtn.disabled = !isAnswered;
            }
        } else {
            // 不是最后一题时显示"下一题"按钮，隐藏"提交"按钮
            if (nextBtn) {
                nextBtn.style.display = 'inline-flex';
                // 下一题按钮只有在已作答时才可点击
                nextBtn.disabled = !isAnswered;
            }
            if (submitBtn) {
                submitBtn.style.display = 'none';
            }
        }
    }

    /**
     * 显示题目内容
     * @param {Object} question - 题目对象
     */
    function displayQuestion(question) {
        // 显示题目文本
        const questionTextEl = document.getElementById('question-text');
        if (questionTextEl) {
            questionTextEl.textContent = question.text || '';
        }

        // 显示当前题目编号
        const currentQuestionEl = document.getElementById('current-question');
        if (currentQuestionEl) {
            currentQuestionEl.textContent = question.id || (currentQuestionIndex + 1);
        }

        // 生成选项按钮
        renderOptions(question);
    }

    /**
     * 生成选项按钮
     * @param {Object} question - 题目对象
     */
    function renderOptions(question) {
        const optionsContainer = document.getElementById('options-container');
        if (!optionsContainer || !question.options) {
            return;
        }

        // 清空现有选项
        optionsContainer.innerHTML = '';

        // 获取当前题目的已选答案
        const currentAnswer = answers[question.id];

        // 为每个选项创建按钮
        question.options.forEach(option => {
            const optionBtn = createOptionButton(option, question.id, currentAnswer === option.value);
            optionsContainer.appendChild(optionBtn);
        });
    }

    /**
     * 创建选项按钮元素
     * @param {Object} option - 选项对象
     * @param {number} questionId - 题目ID
     * @param {boolean} isSelected - 是否已选中
     * @returns {HTMLElement} 选项按钮元素
     */
    function createOptionButton(option, questionId, isSelected) {
        const button = document.createElement('button');
        // 根据选项值（A/B/C/D）添加颜色类
        const colorIndex = option.value.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
        const colorClass = `option-color-${(colorIndex % 6) + 1}`; // 循环使用1-6种颜色
        button.className = `option-btn ${colorClass}`;
        if (isSelected) {
            button.classList.add('selected');
        }
        button.setAttribute('data-value', option.value);
        button.setAttribute('data-question-id', questionId);

        // 创建选项标签（A/B/C/D）
        const label = document.createElement('span');
        label.className = 'option-label';
        label.textContent = option.value;

        // 创建选项文本
        const text = document.createElement('span');
        text.className = 'option-text';
        text.textContent = option.label || '';

        // 组装按钮
        button.appendChild(label);
        button.appendChild(text);

        // 添加点击事件
        button.addEventListener('click', function() {
            selectOption(questionId, option.value);
        });

        return button;
    }

    /**
     * 选择选项
     * @param {number} questionId - 题目ID
     * @param {string} answerValue - 答案值（A/B/C/D）
     */
    function selectOption(questionId, answerValue) {
        // 防止快速重复点击：如果正在处理选择，直接返回
        if (isProcessingSelection) {
            return;
        }

        // 检查是否已经选择了当前题目（防止重复选择）
        const currentQuestion = questions[currentQuestionIndex];
        if (currentQuestion && currentQuestion.id !== questionId) {
            // 选择的不是当前题目的答案，忽略
            return;
        }

        // 标记为正在处理
        isProcessingSelection = true;

        // 清除之前的自动跳转定时器（防止快速点击导致多个定时器）
        if (autoJumpTimer) {
            clearTimeout(autoJumpTimer);
            autoJumpTimer = null;
        }

        // 保存答案（立即保存，确保数据同步）
        answers[questionId] = answerValue;
        if (typeof window.Questionnaire !== 'undefined' && window.Questionnaire.setAnswer) {
            window.Questionnaire.setAnswer(questionId, answerValue);
        }

        // 更新选项的选中状态
        updateOptionSelection(questionId, answerValue);

        // 更新导航按钮状态（立即更新，确保按钮可用）
        updateNavigationButtons();

        // 更新进度条（基于已答题数量）
        const answeredProgress = getAnsweredProgress();
        updateProgressBar(answeredProgress);
        
        // 更新已完成题目数量显示
        updateAnsweredCount();
        
        // 自动跳转到下一题（延迟500ms，让用户看到选中效果）
        autoJumpTimer = setTimeout(function() {
            // 再次验证答案已保存（双重检查）
            const savedAnswer = answers[questionId];
            if (!savedAnswer || savedAnswer !== answerValue) {
                // 如果答案未正确保存，重新保存
                answers[questionId] = answerValue;
                if (typeof window.Questionnaire !== 'undefined' && window.Questionnaire.setAnswer) {
                    window.Questionnaire.setAnswer(questionId, answerValue);
                }
            }

            // 重置处理标志
            isProcessingSelection = false;

            // 检查是否是最后一题
            if (currentQuestionIndex < questions.length - 1) {
                // 不是最后一题，自动跳转到下一题（跳过未作答检查，因为已经选择了答案）
                goToNextQuestion(true);
            } else {
                // 是最后一题，更新导航按钮显示提交按钮
                updateNavigationButtons();
            }

            // 清除定时器引用
            autoJumpTimer = null;
        }, 500);
    }

    /**
     * 更新选项的选中状态
     * @param {number} questionId - 题目ID
     * @param {string} selectedValue - 选中的答案值
     */
    function updateOptionSelection(questionId, selectedValue) {
        const optionsContainer = document.getElementById('options-container');
        if (!optionsContainer) {
            return;
        }

        // 获取所有选项按钮
        const optionButtons = optionsContainer.querySelectorAll('.option-btn');

        optionButtons.forEach(button => {
            const buttonValue = button.getAttribute('data-value');
            const buttonQuestionId = button.getAttribute('data-question-id');

            // 只更新当前题目的选项
            if (buttonQuestionId == questionId) {
                if (buttonValue === selectedValue) {
                    // 选中当前选项
                    button.classList.add('selected');
                } else {
                    // 取消其他选项的选中状态
                    button.classList.remove('selected');
                }
            }
        });
    }

    /**
     * 更新进度信息
     */
    function updateProgressInfo() {
        const currentNumber = currentQuestionIndex + 1;
        
        // 更新进度文本（使用缓存的DOM元素）
        if ($elements.progressText) {
            $elements.progressText.textContent = `第 ${currentNumber} 题 / 共 ${totalQuestions} 题`;
        }

        // 更新进度百分比（基于当前题目位置）
        const progressPercentage = Math.round((currentNumber / totalQuestions) * 100);
        if ($elements.progressPercentage) {
            $elements.progressPercentage.textContent = `${progressPercentage}%`;
        }

        // 更新进度条（基于当前题目位置）
        updateProgressBar(progressPercentage);

        // 更新已完成题目数量
        updateAnsweredCount();
    }

    /**
     * 更新进度条
     * @param {number} percentage - 进度百分比（0-100）
     */
    function updateProgressBar(percentage) {
        if ($elements.progressBarFill) {
            // 确保百分比在0-100之间
            const clampedPercentage = Math.max(0, Math.min(100, percentage));
            $elements.progressBarFill.style.width = `${clampedPercentage}%`;
        }
    }

    /**
     * 更新已完成题目数量
     */
    function updateAnsweredCount() {
        // 计算已答题数量
        const answeredCount = Object.keys(answers).length;
        
        // 可以在这里添加显示已完成题数的功能
        // 例如：在进度文本旁边显示"已完成 X/45 题"
        // 目前进度文本显示的是当前题数，可以根据需要调整
    }

    /**
     * 获取已答题数量
     * @returns {number} 已答题数量
     */
    function getAnsweredCount() {
        return Object.keys(answers).length;
    }

    /**
     * 获取答题进度百分比（基于已答题数量）
     * @returns {number} 答题进度百分比（0-100）
     */
    function getAnsweredProgress() {
        if (totalQuestions === 0) {
            return 0;
        }
        const answeredCount = getAnsweredCount();
        return Math.round((answeredCount / totalQuestions) * 100);
    }

    /**
     * 更新维度信息
     * @param {Object} question - 题目对象
     */
    function updateDimensionInfo(question) {
        const dimensionCode = question.dimension;
        if (!dimensionCode) {
            return;
        }

        // 获取维度信息
        const dimension = window.DIMENSIONS[dimensionCode];
        if (!dimension) {
            return;
        }

        // 更新维度图标
        const dimensionIconEl = document.getElementById('dimension-icon');
        if (dimensionIconEl) {
            dimensionIconEl.textContent = dimension.icon || '📋';
        }

        // 更新维度名称
        const dimensionNameEl = document.getElementById('dimension-name');
        if (dimensionNameEl) {
            // 优先使用题目的dimensionName，如果没有则使用DIMENSIONS中的name
            dimensionNameEl.textContent = question.dimensionName || dimension.name || dimensionCode;
        }
    }

    /**
     * 绑定事件
     */
    function bindEvents() {
        // 上一题按钮
        const prevBtn = document.getElementById('prev-btn');
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                goToPreviousQuestion();
            });
        }

        // 下一题按钮
        const nextBtn = document.getElementById('next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                goToNextQuestion();
            });
        }

        // 提交按钮
        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', function() {
                submitAnswers();
            });
        }

        // 绑定键盘快捷键
        bindKeyboardShortcuts();
    }

    /**
     * 绑定键盘快捷键
     */
    function bindKeyboardShortcuts() {
        document.addEventListener('keydown', function(event) {
            // 如果用户正在输入框中输入，不触发快捷键
            const activeElement = document.activeElement;
            if (activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.isContentEditable
            )) {
                return;
            }

            // A/B/C/D 键选择答案
            if (event.key === 'A' || event.key === 'a' ||
                event.key === 'B' || event.key === 'b' ||
                event.key === 'C' || event.key === 'c' ||
                event.key === 'D' || event.key === 'd') {
                event.preventDefault();
                const answerValue = event.key.toUpperCase();
                selectAnswerByKey(answerValue);
                return;
            }

            // 左右箭头键切换题目
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                goToPreviousQuestion();
                return;
            }

            if (event.key === 'ArrowRight') {
                event.preventDefault();
                goToNextQuestion();
                return;
            }

            // Enter键提交（如果是最后一题且已作答）
            if (event.key === 'Enter') {
                const currentQuestion = questions[currentQuestionIndex];
                if (currentQuestion && 
                    currentQuestionIndex === questions.length - 1 &&
                    answers[currentQuestion.id]) {
                    event.preventDefault();
                    submitAnswers();
                    return;
                }
            }
        });
    }

    /**
     * 通过键盘选择答案
     * @param {string} answerValue - 答案值（A/B/C/D）
     */
    function selectAnswerByKey(answerValue) {
        const currentQuestion = questions[currentQuestionIndex];
        if (!currentQuestion) {
            return;
        }

        // 检查该选项是否存在
        const option = currentQuestion.options.find(opt => opt.value === answerValue);
        if (!option) {
            // 该选项不存在，不执行任何操作
            return;
        }

        // 选择该选项
        selectOption(currentQuestion.id, answerValue);
    }

    /**
     * 跳转到上一题
     */
    function goToPreviousQuestion() {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            showQuestion(currentQuestionIndex);
        }
    }

    /**
     * 跳转到下一题
     * @param {boolean} skipCheck - 是否跳过未作答检查（用于自动跳转）
     */
    function goToNextQuestion(skipCheck) {
        // 检查当前题目是否已作答（除非明确跳过检查）
        if (!skipCheck) {
            const currentQuestion = questions[currentQuestionIndex];
            if (currentQuestion && !answers[currentQuestion.id]) {
                // 如果当前题目未作答，直接阻止跳转，不弹出确认对话框
                // 可以添加一个提示动画或提示文字
                showAnswerRequiredHint();
                return;
            }
        }

        if (currentQuestionIndex < questions.length - 1) {
            currentQuestionIndex++;
            showQuestion(currentQuestionIndex);
        }
    }
    
    /**
     * 显示需要答题的提示
     */
    function showAnswerRequiredHint() {
        // 获取选项容器
        const optionsContainer = document.getElementById('options-container');
        if (!optionsContainer) {
            return;
        }
        
        // 添加提示动画类
        optionsContainer.classList.add('answer-required');
        
        // 2秒后移除动画类
        setTimeout(function() {
            optionsContainer.classList.remove('answer-required');
        }, 2000);
        
        // 也可以添加一个短暂的提示文字（可选）
        // 这里我们使用CSS动画来提示用户
    }

    /**
     * 跳转到第一个未答题
     * @returns {boolean} 是否找到未答题
     */
    function goToFirstUnanswered() {
        for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            if (!answers[question.id]) {
                // 找到未答题，跳转过去
                currentQuestionIndex = i;
                showQuestion(currentQuestionIndex);
                return true;
            }
        }
        // 所有题目都已作答
        return false;
    }

    /**
     * 跳转到指定题目
     * @param {number} questionId - 题目ID
     */
    function goToQuestion(questionId) {
        const index = questions.findIndex(q => q.id === questionId);
        if (index !== -1) {
            currentQuestionIndex = index;
            showQuestion(currentQuestionIndex);
        }
    }

    /**
     * 提交答案
     */
    async function submitAnswers() {
        // 检查是否所有题目都已回答
        if (!checkAllAnswered()) {
            const unansweredCount = totalQuestions - getAnsweredCount();
            if (confirm(`还有 ${unansweredCount} 道题目未作答，是否确定提交？\n\n提示：未作答的题目将不会影响匹配结果。`)) {
                // 用户确认提交，继续
            } else {
                // 用户取消，不提交
                return;
            }
        }

        // 显示提交中状态
        showSubmittingState();

        // 计算匹配结果
        try {
            const result = calculateAndSaveResults();
            
            // 调用测试完成API（单视角测试）
            if (window.linkValidator) {
                try {
                    await window.linkValidator.completeTest(undefined, result);
                    console.log('测试完成记录成功');
                } catch (error) {
                    console.error('记录测试完成失败:', error);
                    // 测试完成失败，不影响跳转，只记录错误
                }
            }
            
            // 构建报告页面URL（需要包含token以便SDK验证）
            let reportUrl = 'report.html';
            const urlParams = new URLSearchParams();
            
            // 获取token和测试模式
            const token = window.linkValidator && window.linkValidator.token;
            const isUnlimited = window.linkValidator && window.linkValidator.unlimited;
            
            // 如果是无限测试模式，添加unlimited和token参数
            if (isUnlimited && token) {
                urlParams.set('unlimited', 'true');
                urlParams.set('token', token);
            } else if (token) {
                // 普通模式，只添加token
                urlParams.set('token', token);
            } else if (result && result.token) {
                // 如果没有从SDK获取到token，使用本地生成的token（向后兼容）
                urlParams.set('token', result.token);
            }
            
            // 构建完整的URL
            const queryString = urlParams.toString();
            if (queryString) {
                reportUrl = `${reportUrl}?${queryString}`;
            }
            
            // 跳转到报告页
            window.location.href = reportUrl;
        } catch (error) {
            console.error('提交失败:', error);
            alert('提交失败，请重试。错误信息：' + error.message);
            hideSubmittingState();
        }
    }

    /**
     * 检查是否所有题目都已回答
     * @returns {boolean} 是否所有题目都已回答
     */
    function checkAllAnswered() {
        return getAnsweredCount() === totalQuestions;
    }

    /**
     * 计算匹配结果并保存
     * @returns {Object} 包含token的结果对象
     */
    function calculateAndSaveResults() {
        // 检查calculator函数是否可用
        if (typeof calculateCityMatch === 'undefined') {
            throw new Error('匹配算法未加载，请确保 calculator-standalone.js 已正确加载');
        }

        // 调用匹配算法计算结果
        const matchResult = calculateCityMatch(answers);

        // 优先使用SDK的token，如果没有则生成本地token
        let token = null;
        if (window.linkValidator && window.linkValidator.token) {
            token = window.linkValidator.token;
        } else {
            // 如果没有SDK token，生成本地token（向后兼容）
            token = generateToken();
        }

        // 检查是否为无限测试模式
        const isUnlimited = window.linkValidator && window.linkValidator.unlimited;

        // 准备保存的数据
        const resultData = {
            token: token,
            answers: answers,
            result: matchResult,
            timestamp: new Date().toISOString(),
            totalQuestions: totalQuestions,
            answeredCount: getAnsweredCount(),
            isUnlimited: isUnlimited  // 标记是否为无限测试
        };

        // 保存到localStorage
        // 无限测试：使用固定key，避免token变化导致找不到结果
        // 普通测试：使用token作为key，支持多个结果
        const storageKey = isUnlimited ? 'city_match_result_unlimited' : `city_match_result_${token}`;
        try {
            localStorage.setItem(storageKey, JSON.stringify(resultData));
            
            // 普通测试才保存token列表
            if (!isUnlimited) {
                saveTokenToList(token);
            }
            
            return resultData;
        } catch (error) {
            console.error('保存到localStorage失败:', error);
            throw new Error('保存结果失败，可能是存储空间不足');
        }
    }

    /**
     * 生成唯一token
     * @returns {string} 唯一token
     */
    function generateToken() {
        // 使用时间戳 + 随机字符串生成唯一token
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `${timestamp}${random}`;
    }

    /**
     * 保存token到列表
     * @param {string} token - token值
     */
    function saveTokenToList(token) {
        try {
            const tokenListKey = 'city_match_tokens';
            let tokenList = [];
            
            // 获取现有token列表
            const existingList = localStorage.getItem(tokenListKey);
            if (existingList) {
                tokenList = JSON.parse(existingList);
            }
            
            // 添加新token（最多保存最近10个）
            tokenList.unshift(token);
            if (tokenList.length > 10) {
                tokenList = tokenList.slice(0, 10);
            }
            
            // 保存更新后的列表
            localStorage.setItem(tokenListKey, JSON.stringify(tokenList));
        } catch (error) {
            console.warn('保存token列表失败:', error);
            // 不影响主流程，只记录警告
        }
    }

    /**
     * 显示提交中状态
     */
    function showSubmittingState() {
        if ($elements.submitBtn) {
            $elements.submitBtn.disabled = true;
            $elements.submitBtn.classList.add('loading');
            const btnText = $elements.submitBtn.querySelector('.btn-text');
            if (btnText) {
                btnText.textContent = '提交中...';
            }
        }

        // 显示加载遮罩
        showLoadingOverlay('正在计算匹配结果...');
    }

    /**
     * 隐藏提交中状态
     */
    function hideSubmittingState() {
        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
            const btnText = submitBtn.querySelector('.btn-text');
            if (btnText) {
                btnText.textContent = '提交测评';
            }
        }

        // 隐藏加载遮罩
        hideLoadingOverlay();
    }

    /**
     * 显示加载遮罩
     * @param {string} text - 加载文本
     */
    function showLoadingOverlay(text) {
        // 检查是否已存在遮罩
        let overlay = document.getElementById('loading-overlay');
        if (!overlay) {
            // 创建遮罩
            overlay = document.createElement('div');
            overlay.id = 'loading-overlay';
            overlay.className = 'loading-overlay';
            
            const spinner = document.createElement('div');
            spinner.className = 'loading-spinner';
            
            const loadingText = document.createElement('div');
            loadingText.className = 'loading-text';
            loadingText.textContent = text || '加载中...';
            
            overlay.appendChild(spinner);
            overlay.appendChild(loadingText);
            document.body.appendChild(overlay);
        } else {
            // 更新文本
            const loadingText = overlay.querySelector('.loading-text');
            if (loadingText) {
                loadingText.textContent = text || '加载中...';
            }
        }

        // 显示遮罩
        setTimeout(() => {
            overlay.classList.add('active');
        }, 10);
    }

    /**
     * 隐藏加载遮罩
     */
    function hideLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            // 延迟移除元素，等待动画完成
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 300);
        }
    }

    // 导出函数供后续步骤使用
    window.Questionnaire = {
        getCurrentQuestionIndex: function() {
            return currentQuestionIndex;
        },
        getAnswers: function() {
            return answers;
        },
        getQuestions: function() {
            return questions;
        },
        getTotalQuestions: function() {
            return totalQuestions;
        },
        setAnswer: function(questionId, answer) {
            answers[questionId] = answer;
        },
        showQuestion: showQuestion
    };

})();

