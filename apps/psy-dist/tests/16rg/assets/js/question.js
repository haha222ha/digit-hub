/* ============================================
   答题页JavaScript - question.js
   ============================================ */

/**
 * 答题页状态
 */
const QuestionPageState = {
    currentQuestionIndex: 0,  // 当前题目索引（从0开始）
    totalQuestions: 32,        // 总题目数
    questions: [],              // 题目数据数组
    answers: [],                // 答案数组
    isProcessing: false         // 是否正在处理选项点击（防止重复点击）
};

/**
 * 题目数据定义（32道题目）
 * 每道题目包含：id, text, dimension（维度）
 */
const QuestionsData = [
    // 逻辑思维维度（1-8题）
    { id: 1, text: '面对缺乏逻辑的观点，我能保持耐心，并尝试理解对方的思路。', dimension: 'logic' },
    { id: 2, text: '在做决策时，我更倾向于依赖数据和事实，而不是直觉。', dimension: 'logic' },
    { id: 3, text: '我喜欢分析复杂的问题，并找出其中的规律和模式。', dimension: 'logic' },
    { id: 4, text: '在讨论中，我经常指出逻辑上的漏洞和不一致之处。', dimension: 'logic' },
    { id: 5, text: '我能够快速理解抽象的概念和理论框架。', dimension: 'logic' },
    { id: 6, text: '我喜欢用系统化的方法来解决问题。', dimension: 'logic' },
    { id: 7, text: '在评估方案时，我会仔细分析其可行性和逻辑性。', dimension: 'logic' },
    { id: 8, text: '我倾向于用客观的标准来评判事物，而不是主观感受。', dimension: 'logic' },

    // 创新能力维度（9-16题）
    { id: 9, text: '我经常能够提出新颖的想法和解决方案。', dimension: 'innovation' },
    { id: 10, text: '我喜欢探索未知的领域和可能性。', dimension: 'innovation' },
    { id: 11, text: '我能够从不同的角度思考问题，找到创新的切入点。', dimension: 'innovation' },
    { id: 12, text: '我不满足于现状，总是寻求改进和优化的方法。', dimension: 'innovation' },
    { id: 13, text: '我能够将看似不相关的概念联系起来，产生新的想法。', dimension: 'innovation' },
    { id: 14, text: '我喜欢尝试新的方法和工具，即使它们可能失败。', dimension: 'innovation' },
    { id: 15, text: '我能够突破传统思维的束缚，提出突破性的想法。', dimension: 'innovation' },
    { id: 16, text: '我享受创造和设计新事物的过程。', dimension: 'innovation' },

    // 执行力维度（17-24题）
    { id: 17, text: '我能够将计划转化为具体的行动步骤。', dimension: 'execution' },
    { id: 18, text: '我善于组织和协调资源，确保任务按时完成。', dimension: 'execution' },
    { id: 19, text: '我能够专注于目标，不受外界干扰。', dimension: 'execution' },
    { id: 20, text: '我喜欢制定详细的计划，并严格按照计划执行。', dimension: 'execution' },
    { id: 21, text: '我能够在压力下保持高效的工作状态。', dimension: 'execution' },
    { id: 22, text: '我善于分解复杂任务，逐步完成。', dimension: 'execution' },
    { id: 23, text: '我能够及时调整策略，确保目标的实现。', dimension: 'execution' },
    { id: 24, text: '我注重细节，确保工作质量达到标准。', dimension: 'execution' },

    // 沟通能力维度（25-28题）
    { id: 25, text: '我能够清晰地表达自己的观点和想法。', dimension: 'communication' },
    { id: 26, text: '我善于倾听他人的意见，并理解他们的需求。', dimension: 'communication' },
    { id: 27, text: '我能够在团队中有效地协调和沟通。', dimension: 'communication' },
    { id: 28, text: '我能够根据不同对象调整沟通方式。', dimension: 'communication' },

    // 学习能力维度（29-32题）
    { id: 29, text: '我能够快速学习新的知识和技能。', dimension: 'learning' },
    { id: 30, text: '我喜欢主动学习，不断更新自己的知识体系。', dimension: 'learning' },
    { id: 31, text: '我能够从错误和失败中吸取教训，不断改进。', dimension: 'learning' },
    { id: 32, text: '我善于将学到的知识应用到实际工作中。', dimension: 'learning' }
];

/**
 * 选项数据（5个选项，对应1-5分）
 */
const OptionData = [
    { value: 1, label: '完全不符合' },
    { value: 2, label: '比较不符合' },
    { value: 3, label: '不确定' },
    { value: 4, label: '比较符合' },
    { value: 5, label: '完全符合' }
];

/**
 * 初始化题目数据
 */
function initQuestions() {
    // 将题目数据转换为完整的题目对象
    QuestionPageState.questions = QuestionsData.map(q => {
        return QuestionModel.create(q.id, q.text, OptionData, q.dimension);
    });

    // 从存储中恢复答案
    QuestionPageState.answers = TestDataManager.loadAnswers();

    // 从存储中恢复当前题目索引
    QuestionPageState.currentQuestionIndex = TestDataManager.loadCurrentQuestion();

    console.log('题目数据初始化完成，共', QuestionPageState.questions.length, '道题目');
}

/**
 * 加载指定索引的题目
 * @param {number} index - 题目索引（从0开始）
 * @returns {Object|null} 题目对象
 */
function loadQuestion(index) {
    if (index < 0 || index >= QuestionPageState.questions.length) {
        console.warn('题目索引超出范围:', index);
        return null;
    }

    const question = QuestionPageState.questions[index];
    
    // 检查是否已有答案
    const answer = TestDataManager.getAnswer(question.id);
    if (answer) {
        question.answered = true;
        question.answer = answer.value;
    } else {
        question.answered = false;
        question.answer = null;
    }

    return question;
}

/**
 * 获取当前题目
 * @returns {Object|null} 当前题目对象
 */
function getCurrentQuestion() {
    return loadQuestion(QuestionPageState.currentQuestionIndex);
}

/**
 * 获取题目总数
 * @returns {number} 题目总数
 */
function getTotalQuestions() {
    return QuestionPageState.totalQuestions;
}

/**
 * 获取当前题目索引
 * @returns {number} 当前题目索引
 */
function getCurrentQuestionIndex() {
    return QuestionPageState.currentQuestionIndex;
}

/**
 * 设置当前题目索引
 * @param {number} index - 题目索引
 */
function setCurrentQuestionIndex(index) {
    if (index < 0 || index >= QuestionPageState.questions.length) {
        console.warn('题目索引超出范围:', index);
        return;
    }
    QuestionPageState.currentQuestionIndex = index;
    TestDataManager.saveCurrentQuestion(index);
}

/**
 * 检查是否还有下一题
 * @returns {boolean}
 */
function hasNextQuestion() {
    return QuestionPageState.currentQuestionIndex < QuestionPageState.questions.length - 1;
}

/**
 * 检查是否还有上一题
 * @returns {boolean}
 */
function hasPreviousQuestion() {
    return QuestionPageState.currentQuestionIndex > 0;
}

/**
 * 检查是否所有题目都已答题
 * @returns {boolean}
 */
function isAllAnswered() {
    return QuestionPageState.answers.length >= QuestionPageState.questions.length;
}

/* ============================================
   步骤21：答案记录功能
   ============================================ */

/**
 * 保存答案
 * @param {number} questionId - 题目ID
 * @param {number} value - 答案值（1-5）
 * @returns {boolean} 是否成功
 */
function saveAnswer(questionId, value) {
    if (value < 1 || value > 5) {
        console.warn('答案值超出范围:', value);
        return false;
    }

    // 使用TestDataManager保存答案
    const success = TestDataManager.saveAnswer(questionId, value);
    
    if (success) {
        // 更新本地状态
        QuestionPageState.answers = TestDataManager.loadAnswers();
        
        // 更新题目状态
        const question = QuestionPageState.questions.find(q => q.id === questionId);
        if (question) {
            question.answered = true;
            question.answer = value;
        }
    }
    
    return success;
}

/**
 * 获取答案
 * @param {number} questionId - 题目ID
 * @returns {Object|null} 答案对象
 */
function getAnswer(questionId) {
    return TestDataManager.getAnswer(questionId);
}

/**
 * 获取当前题目的答案
 * @returns {Object|null} 答案对象
 */
function getCurrentAnswer() {
    const currentQuestion = getCurrentQuestion();
    if (!currentQuestion) {
        return null;
    }
    return getAnswer(currentQuestion.id);
}

/**
 * 修改答案（重新选择）
 * @param {number} questionId - 题目ID
 * @param {number} newValue - 新答案值（1-5）
 * @returns {boolean} 是否成功
 */
function updateAnswer(questionId, newValue) {
    return saveAnswer(questionId, newValue);
}

/**
 * 删除答案
 * @param {number} questionId - 题目ID
 * @returns {boolean} 是否成功
 */
function deleteAnswer(questionId) {
    const answers = TestDataManager.loadAnswers();
    const index = answers.findIndex(a => a.questionId === questionId);
    
    if (index >= 0) {
        answers.splice(index, 1);
        const success = TestDataManager.saveAnswers(answers);
        
        if (success) {
            QuestionPageState.answers = answers;
            
            // 更新题目状态
            const question = QuestionPageState.questions.find(q => q.id === questionId);
            if (question) {
                question.answered = false;
                question.answer = null;
            }
        }
        
        return success;
    }
    
    return false;
}

/**
 * 获取所有答案
 * @returns {Array} 答案数组
 */
function getAllAnswers() {
    return TestDataManager.loadAnswers();
}

/**
 * 获取已答题数量
 * @returns {number} 已答题数量
 */
function getAnsweredCount() {
    return QuestionPageState.answers.length;
}

/* ============================================
   步骤22：进度管理功能
   ============================================ */

/**
 * 更新进度显示
 */
function updateProgress() {
    const progress = TestDataManager.getProgress();
    const currentIndex = QuestionPageState.currentQuestionIndex;
    const total = QuestionPageState.totalQuestions;
    
    // 更新题目计数显示（第X题，共32题）
    const questionNumberEl = document.querySelector('.question-number');
    if (questionNumberEl) {
        questionNumberEl.textContent = 'Q' + (currentIndex + 1);
    }
    
    const progressTextEl = document.querySelector('.progress-text span');
    if (progressTextEl) {
        const strongEl = progressTextEl.querySelector('strong');
        if (strongEl) {
            strongEl.textContent = currentIndex + 1;
        }
    }
    
    // 更新已答题数统计
    const statAnsweredEl = document.querySelector('.stat-answered');
    if (statAnsweredEl) {
        statAnsweredEl.textContent = progress.answered;
    }
    
    const statTotalEl = document.querySelector('.stat-total');
    if (statTotalEl) {
        statTotalEl.textContent = total;
    }
    
    // 更新进度条
    const progressBarFillEl = document.querySelector('.progress-bar-fill');
    if (progressBarFillEl) {
        progressBarFillEl.style.width = progress.percentage + '%';
    }
    
    // 更新进度百分比
    const progressPercentageEl = document.querySelector('.progress-percentage');
    if (progressPercentageEl) {
        progressPercentageEl.textContent = progress.percentage + '%';
    }
}

/**
 * 获取进度百分比
 * @returns {number} 进度百分比（0-100）
 */
function getProgressPercentage() {
    const progress = TestDataManager.getProgress();
    return progress.percentage;
}

/**
 * 获取进度信息
 * @returns {Object} 进度对象 { answered: number, total: number, percentage: number }
 */
function getProgressInfo() {
    return TestDataManager.getProgress();
}

/* ============================================
   步骤23：顺序导航功能
   ============================================ */

/**
 * 初始化导航按钮
 */
function initNavigationButtons() {
    const btnBack = document.querySelector('.btn-nav.btn-back');
    const btnNext = document.querySelector('.btn-nav.btn-next');
    
    if (btnBack) {
        btnBack.addEventListener('click', handlePreviousQuestion);
    }
    
    if (btnNext) {
        btnNext.addEventListener('click', handleNextQuestion);
    }
    
    // 更新按钮状态
    updateNavigationButtons();
}

/**
 * 更新导航按钮状态
 */
function updateNavigationButtons() {
    const btnBack = document.querySelector('.btn-nav.btn-back');
    const btnNext = document.querySelector('.btn-nav.btn-next');
    const currentIndex = QuestionPageState.currentQuestionIndex;
    const total = QuestionPageState.totalQuestions;
    
    // 更新"上一题"按钮
    if (btnBack) {
        if (currentIndex === 0) {
            // 第一题，禁用"上一题"按钮
            btnBack.disabled = true;
        } else {
            btnBack.disabled = false;
        }
    }
    
    // 更新"下一题"按钮
    if (btnNext) {
        if (currentIndex === total - 1) {
            // 最后一题，按钮文字变为"提交"
            const span = btnNext.querySelector('span');
            if (span) {
                span.textContent = '提交';
            }
        } else {
            // 不是最后一题，按钮文字为"下一题"
            const span = btnNext.querySelector('span');
            if (span) {
                span.textContent = '下一题';
            }
        }
    }
}

/**
 * 处理上一题
 */
function handlePreviousQuestion() {
    if (!hasPreviousQuestion()) {
        return;
    }
    
    // 切换到上一题
    goToPreviousQuestion();
}

/**
 * 处理下一题/提交
 */
function handleNextQuestion() {
    const currentIndex = QuestionPageState.currentQuestionIndex;
    const total = QuestionPageState.totalQuestions;
    
    if (currentIndex === total - 1) {
        // 最后一题，执行提交
        handleSubmit();
    } else {
        // 不是最后一题，切换到下一题
        goToNextQuestion();
    }
}

/**
 * 切换到上一题
 */
function goToPreviousQuestion() {
    if (!hasPreviousQuestion()) {
        return;
    }
    
    const newIndex = QuestionPageState.currentQuestionIndex - 1;
    goToQuestion(newIndex);
}

/**
 * 切换到下一题
 */
function goToNextQuestion() {
    if (!hasNextQuestion()) {
        return;
    }
    
    const newIndex = QuestionPageState.currentQuestionIndex + 1;
    goToQuestion(newIndex);
}

/**
 * 跳转到指定题目
 * @param {number} index - 题目索引
 */
function goToQuestion(index) {
    if (index < 0 || index >= QuestionPageState.questions.length) {
        console.warn('题目索引超出范围:', index);
        return;
    }
    
    // 重置处理标志（切换题目时重置）
    QuestionPageState.isProcessing = false;
    
    setCurrentQuestionIndex(index);
    renderQuestion();
    updateNavigationButtons();
    updateProgress();
}

/**
 * 渲染当前题目
 */
function renderQuestion() {
    const question = getCurrentQuestion();
    if (!question) {
        console.warn('无法获取当前题目');
        return;
    }
    
    // 更新题目文本
    const questionTextEl = document.querySelector('.question-text');
    if (questionTextEl) {
        questionTextEl.textContent = question.text;
    }
    
    // 更新选项
    renderOptions(question);
}

/**
 * 渲染选项
 * @param {Object} question - 题目对象
 */
function renderOptions(question) {
    const optionsContainer = document.querySelector('.options-container');
    if (!optionsContainer || !question.options) {
        console.warn('未找到选项容器或题目选项');
        return;
    }

    // 获取当前题目的答案
    const currentAnswer = getAnswer(question.id);
    const selectedValue = currentAnswer ? currentAnswer.value : null;

    // 清空选项容器
    optionsContainer.innerHTML = '';

    // 渲染每个选项
    question.options.forEach(option => {
        const optionButton = document.createElement('button');
        optionButton.className = 'option-card';
        
        // 如果当前选项被选中，添加选中样式
        if (selectedValue === option.value) {
            optionButton.classList.add('is-selected');
        }

        // 创建选项指示器
        const indicator = document.createElement('div');
        indicator.className = 'option-indicator';
        
        if (selectedValue === option.value) {
            // 选中状态：显示勾选图标
            indicator.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;
        } else {
            // 未选中状态：显示圆点
            indicator.innerHTML = '<span class="indicator-dot"></span>';
        }

        // 创建选项文本
        const optionText = document.createElement('span');
        optionText.className = 'option-text';
        optionText.textContent = option.label;

        // 组装选项按钮
        optionButton.appendChild(indicator);
        optionButton.appendChild(optionText);

        // 添加点击事件
        optionButton.addEventListener('click', function(e) {
            // 添加点击反馈效果
            this.classList.add('button-ripple');
            setTimeout(() => {
                this.classList.remove('button-ripple');
            }, 600);
            
            handleOptionClick(question.id, option.value);
        });

        // 添加到容器
        optionsContainer.appendChild(optionButton);
    });
}

/**
 * 处理选项点击
 * @param {number} questionId - 题目ID
 * @param {number} value - 选项值（1-5）
 */
function handleOptionClick(questionId, value) {
    // 防止重复点击
    if (QuestionPageState.isProcessing) {
        console.log('正在处理中，请稍候...');
        return;
    }

    // 获取当前题目，确保点击的是当前题目
    const currentQuestion = getCurrentQuestion();
    if (!currentQuestion || currentQuestion.id !== questionId) {
        console.warn('题目ID不匹配，可能是快速切换导致的');
        return;
    }

    // 设置处理标志
    QuestionPageState.isProcessing = true;

    // 禁用所有选项按钮（防止重复点击）
    const optionsContainer = document.querySelector('.options-container');
    if (optionsContainer) {
        const optionButtons = optionsContainer.querySelectorAll('.option-card');
        optionButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.6';
        });
    }

    // 保存答案
    const success = saveAnswer(questionId, value);
    
    if (!success) {
        console.warn('保存答案失败');
        // 恢复处理标志和按钮状态
        QuestionPageState.isProcessing = false;
        if (optionsContainer) {
            const optionButtons = optionsContainer.querySelectorAll('.option-card');
            optionButtons.forEach(btn => {
                btn.disabled = false;
                btn.style.pointerEvents = '';
                btn.style.opacity = '';
            });
        }
        return;
    }

    // 更新进度
    updateProgress();

    // 重新渲染选项（更新选中状态）
    if (currentQuestion) {
        renderOptions(currentQuestion);
    }

    // 延迟后自动跳转到下一题（给用户视觉反馈的时间）
    setTimeout(() => {
        // 再次验证答案是否真的保存成功
        const savedAnswer = getAnswer(questionId);
        if (!savedAnswer || savedAnswer.value !== value) {
            console.warn('答案验证失败，不跳转');
            // 恢复处理标志
            QuestionPageState.isProcessing = false;
            // 重新渲染选项（恢复按钮状态）
            if (currentQuestion) {
                renderOptions(currentQuestion);
            }
            return;
        }

        // 恢复处理标志
        QuestionPageState.isProcessing = false;

        // 确认答案已保存，可以跳转
        if (hasNextQuestion()) {
            goToNextQuestion();
        } else {
            // 最后一题，显示提交提示或直接提交
            handleSubmit();
        }
    }, 300); // 300ms延迟
}

/* ============================================
   步骤24：提交功能
   ============================================ */

/**
 * 验证答案是否完整
 * @returns {Object} 验证结果 { valid: boolean, missingCount: number, missingIds: Array }
 */
function validateAnswers() {
    const total = QuestionPageState.totalQuestions;
    const answers = getAllAnswers();
    const answeredIds = answers.map(a => a.questionId);
    const missingIds = [];
    
    for (let i = 1; i <= total; i++) {
        if (!answeredIds.includes(i)) {
            missingIds.push(i);
        }
    }
    
    return {
        valid: missingIds.length === 0,
        missingCount: missingIds.length,
        missingIds: missingIds
    };
}

/**
 * 处理提交
 */
async function handleSubmit() {
    // 验证答案
    const validation = validateAnswers();
    
    if (!validation.valid) {
        // 显示未完成提示
        showIncompleteAlert(validation.missingCount);
        return;
    }
    
    // 隐藏未完成提示
    hideIncompleteAlert();
    
    // 保存完整的答案和测试状态
    const answers = getAllAnswers();
    const saveSuccess = TestDataManager.saveAnswers(answers);
    
    if (!saveSuccess) {
        console.error('保存答案失败');
        alert('保存答案失败，请重试');
        return;
    }
    
    // 更新测试状态为已完成
    TestDataManager.saveTestState({
        currentQuestionIndex: QuestionPageState.currentQuestionIndex,
        completed: true,
        completedTime: Date.now()
    });
    
    // 确保MBTI类型已保存（从URL参数或当前主题获取）
    const mbtiType = URLUtils.getParam('type') || ThemeManager.getCurrentTheme();
    if (mbtiType && MBTITypes[mbtiType]) {
        Storage.save(StorageKeys.SELECTED_TYPE, mbtiType);
    } else {
        console.warn('提交时未找到MBTI类型');
    }
    
    // 调用测试完成API（在跳转之前）
    // 确保window.linkValidator存在且有效
    if (window.linkValidator) {
        try {
            // 构建测试结果数据
            const testResult = {
                answers: answers,
                mbtiType: mbtiType,
                completedTime: Date.now()
            };
            
            // 确保completeTest方法存在
            if (typeof window.linkValidator.completeTest === 'function') {
                await window.linkValidator.completeTest(undefined, testResult);
                console.log('测试完成记录成功');
                
                // 如果validator没有saveResultToLocalStorage方法（手动创建的对象），手动保存结果
                if (!window.linkValidator.saveResultToLocalStorage && window.linkValidator.token) {
                    try {
                        const storageKey = `test_result_${window.linkValidator.token}`;
                        const fullResult = {
                            ...testResult,
                            completedAt: new Date().toISOString(),
                            testCode: '16rg'
                        };
                        localStorage.setItem(storageKey, JSON.stringify(fullResult));
                        console.log('手动保存测试结果到localStorage:', storageKey);
                    } catch (e) {
                        console.error('手动保存测试结果失败:', e);
                    }
                }
            } else {
                console.warn('window.linkValidator.completeTest 方法不存在，无法记录测试完成');
                // 如果completeTest不存在，手动保存结果（至少保存到localStorage）
                if (window.linkValidator.token) {
                    try {
                        const storageKey = `test_result_${window.linkValidator.token}`;
                        const fullResult = {
                            ...testResult,
                            completedAt: new Date().toISOString(),
                            testCode: '16rg'
                        };
                        localStorage.setItem(storageKey, JSON.stringify(fullResult));
                        console.log('手动保存测试结果到localStorage（completeTest不存在）:', storageKey);
                    } catch (e) {
                        console.error('手动保存测试结果失败:', e);
                    }
                }
            }
        } catch (error) {
            console.error('记录测试完成失败:', error);
            // 即使API调用失败，也尝试保存到localStorage（至少能显示报告）
            if (window.linkValidator && window.linkValidator.token) {
                try {
                    const storageKey = `test_result_${window.linkValidator.token}`;
                    const fullResult = {
                        answers: answers,
                        mbtiType: mbtiType,
                        completedTime: Date.now(),
                        completedAt: new Date().toISOString(),
                        testCode: '16rg'
                    };
                    localStorage.setItem(storageKey, JSON.stringify(fullResult));
                    console.log('API失败后手动保存测试结果到localStorage:', storageKey);
                } catch (e) {
                    console.error('手动保存测试结果失败:', e);
                }
            }
            // 即使记录失败，也继续跳转（不影响用户体验）
        }
    } else {
        console.warn('window.linkValidator 不存在，无法记录测试完成');
    }
    
    // 跳转到加载页（question.html在pages/目录下，所以使用相对路径）
    // 传递token参数以便后续页面使用
    const params = { type: mbtiType };
    if (window.linkValidator && window.linkValidator.token) {
        params.token = window.linkValidator.token;
        if (window.linkValidator.unlimited) {
            params.unlimited = 'true';
        }
    }
    Navigation.navigateTo('loading.html', params);
}

/**
 * 显示未完成提示
 * @param {number} missingCount - 未答题数量
 */
function showIncompleteAlert(missingCount) {
    const alertEl = document.querySelector('.incomplete-alert');
    if (alertEl) {
        const strongEl = alertEl.querySelector('.alert-text strong');
        if (strongEl) {
            strongEl.textContent = missingCount;
        }
        alertEl.style.display = 'block';
    }
}

/**
 * 隐藏未完成提示
 */
function hideIncompleteAlert() {
    const alertEl = document.querySelector('.incomplete-alert');
    if (alertEl) {
        alertEl.style.display = 'none';
    }
}

/* ============================================
   答题页初始化
   ============================================ */

/**
 * 更新身份徽章
 * @param {string} mbtiType - MBTI类型代码
 */
function updateTypeBadge(mbtiType) {
    const typeCodeElement = document.querySelector('.type-badge .type-code');
    const typeNameElement = document.querySelector('.type-badge .type-name');
    
    if (!typeCodeElement || !typeNameElement) {
        console.warn('未找到身份徽章元素');
        return;
    }
    
    // 获取MBTI类型信息
    const mbtiInfo = MBTITypes[mbtiType];
    if (!mbtiInfo) {
        console.warn('未找到MBTI类型信息:', mbtiType);
        return;
    }
    
    // 更新类型代码和名称
    typeCodeElement.textContent = mbtiType;
    typeNameElement.textContent = mbtiInfo.name || '';
}

/**
 * 恢复答题页状态（页面刷新后）
 */
function restoreQuestionPageState() {
    // 检查是否有保存的状态
    const restoredState = StateRestorer.restoreQuestionPageState();
    
    if (restoredState && restoredState.hasState) {
        console.log('检测到未完成的测试，恢复状态...');
        
        // 恢复答案
        QuestionPageState.answers = restoredState.answers || [];
        
        // 恢复当前题目索引（确保在有效范围内）
        const savedIndex = restoredState.currentQuestionIndex || 0;
        const validIndex = Math.max(0, Math.min(savedIndex, QuestionPageState.totalQuestions - 1));
        QuestionPageState.currentQuestionIndex = validIndex;
        
        // 恢复MBTI类型
        if (restoredState.mbtiType && MBTITypes[restoredState.mbtiType]) {
            // 确保类型已保存
            Storage.save(StorageKeys.SELECTED_TYPE, restoredState.mbtiType);
            URLUtils.setParam('type', restoredState.mbtiType);
        }
        
        console.log('状态恢复完成:', {
            currentQuestionIndex: QuestionPageState.currentQuestionIndex,
            answeredCount: QuestionPageState.answers.length,
            mbtiType: restoredState.mbtiType
        });
        
        return true;
    }
    
    return false;
}

/**
 * 初始化答题页
 */
function initQuestionPage() {
    // 检查是否选择了MBTI类型（优先从URL参数获取，因为刚跳转过来）
    let selectedType = URLUtils.getParam('type');
    if (!selectedType) {
        selectedType = ThemeManager.getCurrentTheme();
    }
    
    // 如果还是没有，尝试从localStorage获取
    if (!selectedType) {
        selectedType = Storage.load(StorageKeys.SELECTED_TYPE, null);
    }
    
    // 验证MBTI类型是否有效
    if (!selectedType || !MBTITypes[selectedType]) {
        // 尝试恢复状态（可能是页面刷新）
        const restored = restoreQuestionPageState();
        if (restored) {
            // 从恢复的状态中获取类型
            selectedType = Storage.load(StorageKeys.SELECTED_TYPE, null);
        }
        
        // 如果还是没有有效的类型，跳转到选择页
        if (!selectedType || !MBTITypes[selectedType]) {
            console.warn('未选择MBTI类型或类型无效，跳转到选择页');
            Navigation.navigateTo('select.html');
            return;
        }
    }

    // 确保类型已保存到localStorage和URL（数据同步）
    if (!Storage.load(StorageKeys.SELECTED_TYPE, null)) {
        Storage.save(StorageKeys.SELECTED_TYPE, selectedType);
    }
    if (!URLUtils.getParam('type')) {
        URLUtils.setParam('type', selectedType);
    }

    // 尝试恢复页面状态（页面刷新后）
    const stateRestored = restoreQuestionPageState();
    
    // 更新身份徽章
    updateTypeBadge(selectedType);

    // 应用主题颜色到答题页容器（.mbti16stage-questionnaire）
    const questionContainer = document.querySelector('.mbti16stage-questionnaire');
    if (questionContainer) {
        ThemeManager.setTheme(selectedType, questionContainer);
    } else {
        // 如果找不到容器，应用到documentElement
        ThemeManager.setTheme(selectedType);
    }

    // 初始化题目数据
    initQuestions();

    // 初始化导航按钮
    initNavigationButtons();

    // 渲染当前题目
    renderQuestion();

    // 更新进度显示
    updateProgress();

    // 更新导航按钮状态
    updateNavigationButtons();

    console.log('答题页初始化完成');
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuestionPage);
} else {
    // DOM已经加载完成
    initQuestionPage();
}

