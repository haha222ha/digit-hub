// 恋爱占有欲测试题目数据
const possessivenessTestQuestions = [
    // 边界感与拒绝能力量表 (1-10)
    {
        id: 1,
        category: 'control',
        question: "朋友临时让你帮忙做一件很麻烦的事,但你本来有自己的安排,你会答应吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 2,
        category: 'control',
        question: "同事让你帮忙做本该他自己完成的工作时,你会答应吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 3,
        category: 'control',
        question: "有人向你借钱(数额较大)时,即使你不想借,你还是会借吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 4,
        category: 'control',
        question: "别人未经允许翻看你的手机或私人物品时,你会选择不吭声吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 5,
        category: 'control',
        question: "聚餐时大家让你买单(但不该你买),你会默默付钱吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 6,
        category: 'control',
        question: "有人开你的玩笑让你感到不舒服时,你会假装没事吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 7,
        category: 'control',
        question: "别人强行要求你参与你不感兴趣的活动时,你会勉强参加吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 8,
        category: 'control',
        question: "有人占用了你的座位/车位,你会选择自己另找地方吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 9,
        category: 'control',
        question: "朋友经常迟到让你等很久,你会一直等不抱怨吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 10,
        category: 'control',
        question: "有人当众指责你(但其实是他自己的错),你会选择沉默不反驳吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    // 自我主张与表达能力量表 (11-20)
    {
        id: 11,
        category: 'jealousy',
        question: "团队讨论时你有不同意见,但大家都支持另一个方案,你会放弃自己的想法吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 12,
        category: 'jealousy',
        question: "买的东西有质量问题时,你会因为嫌麻烦而不去维权吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 13,
        category: 'jealousy',
        question: "工作中你的成果被同事冒领时,你会选择不说什么吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 14,
        category: 'jealousy',
        question: "餐厅上错菜或菜品有问题时,你会将就着吃不说什么吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 15,
        category: 'jealousy',
        question: "别人打断你说话时,你会立刻停下让对方先说吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 16,
        category: 'jealousy',
        question: "老板/老师不公平地批评你时,你会选择默默接受不辩解吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 17,
        category: 'jealousy',
        question: "朋友当众说了关于你的不实信息时,你会不吭声吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 18,
        category: 'jealousy',
        question: "工作量明显超出你的岗位职责时,你会默默全部接受吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 19,
        category: 'jealousy',
        question: "有人在群里点名批评你(但你没错)时,你会选择不回应吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 20,
        category: 'jealousy',
        question: "你的创意/想法被否定且被嘲笑后,你会以后不再敢提想法吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    // 社交应对与冲突处理量表 (21-30)
    {
        id: 21,
        category: 'dependence',
        question: "听说有人在背后说你坏话时,你会假装不知道、不敢面对吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 22,
        category: 'dependence',
        question: "朋友圈里有人阴阳怪气地针对你时,你会装作没看见吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 23,
        category: 'dependence',
        question: "有人故意在公共场合让你难堪时,你会尴尬地低头不敢回应吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 24,
        category: 'dependence',
        question: "网上有人恶意攻击你时,你会吓得删帖或退出吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 25,
        category: 'dependence',
        question: "约好的事对方爽约且没有道歉,你会选择不说什么、下次还约TA吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 26,
        category: 'dependence',
        question: "有人当面质疑你的能力时,你会自我怀疑、觉得自己真的不行吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 27,
        category: 'dependence',
        question: "群体活动中你被孤立时,你会默默待在角落很难受吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 28,
        category: 'dependence',
        question: "有人故意在领导/老师面前给你穿小鞋时,你会选择忍着不敢反抗吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 29,
        category: 'dependence',
        question: "朋友总是忽视你的感受、只考虑自己,你会继续忍受不想失去朋友吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 30,
        category: 'dependence',
        question: "有人用你的秘密威胁你时,你会因为害怕而完全妥协吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    // 情绪管理与心理韧性量表 (31-40)
    {
        id: 31,
        category: 'insecurity',
        question: "被人无端指责后,你会好几天都走不出来吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 32,
        category: 'insecurity',
        question: "有人故意试探你的底线时,你会一退再退吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 33,
        category: 'insecurity',
        question: "听到别人评价你'老实''好欺负'时,你会觉得这就是自己的性格、改不了吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 34,
        category: 'insecurity',
        question: "经历过被欺负后,你会变得更加胆小怕事吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 35,
        category: 'insecurity',
        question: "有人对你态度突然变差时,你会反思是不是自己做错了什么吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 36,
        category: 'insecurity',
        question: "面对不合理要求时,你会因为'拒绝了对方会不高兴'而答应吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 37,
        category: 'insecurity',
        question: "别人说话语气不好时,你会觉得是自己的问题、更加小心翼翼吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 38,
        category: 'insecurity',
        question: "当遇到不公平对待时,你会用'吃亏是福'来安慰自己吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 39,
        category: 'insecurity',
        question: "当有人欺负你时,你会觉得是自己不够好、才会被欺负吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    },
    {
        id: 40,
        category: 'insecurity',
        question: "遇到需要维护自己权益的情况时,你会因为害怕冲突而选择忍让吗?",
        options: [
            { text: "从不", score: 1 },
            { text: "很少", score: 2 },
            { text: "有时", score: 3 },
            { text: "经常", score: 4 },
            { text: "总是", score: 5 }
        ]
    }
];

// 测试状态管理
let currentQuestionIndex = 0;
let answers = [];
let totalQuestions = possessivenessTestQuestions.length;

// DOM 元素
let progressBar, questionInfo, questionTitle, optionsList, prevBtn, nextBtn;

// 初始化测试
function initTest() {
    // 防止重复初始化
    if (typeof window.vbtTestInitialized !== 'undefined' && window.vbtTestInitialized) {
        return;
    }
    window.vbtTestInitialized = true;
    
    // 获取DOM元素
    progressBar = document.getElementById('progressBar');
    questionInfo = document.getElementById('questionInfo');
    questionTitle = document.getElementById('questionTitle');
    optionsList = document.getElementById('optionsList');
    prevBtn = document.getElementById('prevBtn');
    nextBtn = document.getElementById('nextBtn');
    
    // 绑定事件监听器
    if (prevBtn) {
        prevBtn.replaceWith(prevBtn.cloneNode(true));
        prevBtn = document.getElementById('prevBtn');
        prevBtn.addEventListener('click', goToPrevious);
    }
    if (nextBtn) {
        nextBtn.replaceWith(nextBtn.cloneNode(true));
        nextBtn = document.getElementById('nextBtn');
        nextBtn.addEventListener('click', goToNext);
    }
    
    currentQuestionIndex = 0;
    answers = [];
    showQuestion();
    updateProgress();
    updateButtons();
}

// 全局初始化函数，供外部调用
window.initVBTTest = initTest;

// 显示当前题目
function showQuestion() {
    const question = possessivenessTestQuestions[currentQuestionIndex];
    
    questionInfo.textContent = `第 ${currentQuestionIndex + 1} 题 / 共 ${totalQuestions} 题`;
    questionTitle.textContent = question.question;
    
    // 清空选项列表
    optionsList.innerHTML = '';
    
    // 创建选项
    question.options.forEach((option, index) => {
        const optionElement = document.createElement('div');
        optionElement.className = 'option-card';
        optionElement.innerHTML = `
            <input type="radio" name="answer" value="${option.score}" class="option-radio" id="option${index}">
            <label for="option${index}">${option.text}</label>
        `;
        
        // 如果已经回答过，显示选中状态
        if (answers[currentQuestionIndex] !== undefined) {
            const radio = optionElement.querySelector('input[type="radio"]');
            if (radio.value == answers[currentQuestionIndex]) {
                radio.checked = true;
                optionElement.classList.add('selected');
            }
        }
        
        // 添加点击事件
        optionElement.addEventListener('click', function() {
            selectOption(this, option.score);
        });
        
        optionsList.appendChild(optionElement);
    });
}

// 选择选项
function selectOption(element, score) {

    // 移除其他选项选中状态
    document.querySelectorAll('.option-card').forEach(card => {
        card.classList.remove('selected');
    });

    // 添加当前选中样式
    element.classList.add('selected');

    // 保存答案
    answers[currentQuestionIndex] = score;

    // 更新按钮状态
    updateButtons();

    // 自动下一题
    setTimeout(() => {
        if (currentQuestionIndex < totalQuestions - 1) {
            goToNext();
        }
    }, 100);

}

// 更新进度条
function updateProgress() {
    const progress = ((currentQuestionIndex + 1) / totalQuestions) * 100;
    progressBar.style.width = progress + '%';
}

// 更新按钮状态
function updateButtons() {
    prevBtn.disabled = currentQuestionIndex === 0;
    
    const hasAnswer = answers[currentQuestionIndex] !== undefined;
    nextBtn.disabled = !hasAnswer;
    
    if (currentQuestionIndex === totalQuestions - 1) {
        nextBtn.textContent = '完成测试';
    } else {
        nextBtn.textContent = '下一题';
    }
}

// 上一题
function goToPrevious() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        showQuestion();
        updateProgress();
        updateButtons();
    }
}

// 下一题
function goToNext() {
    if (currentQuestionIndex < totalQuestions - 1) {
        currentQuestionIndex++;
        showQuestion();
        updateProgress();
        updateButtons();
    } else {
        // 完成测试，跳转到结果页面
        completeTest();
    }
}

// 完成测试
async function completeTest() {
    // 计算各维度分数
    const controlScores = answers.slice(0, 10).filter(s => s !== undefined && s !== null);
    const jealousyScores = answers.slice(10, 20).filter(s => s !== undefined && s !== null);
    const dependenceScores = answers.slice(20, 30).filter(s => s !== undefined && s !== null);
    const insecurityScores = answers.slice(30, 40).filter(s => s !== undefined && s !== null);
    
    const controlScore = controlScores.reduce((sum, score) => sum + score, 0);
    const jealousyScore = jealousyScores.reduce((sum, score) => sum + score, 0);
    const dependenceScore = dependenceScores.reduce((sum, score) => sum + score, 0);
    const insecurityScore = insecurityScores.reduce((sum, score) => sum + score, 0);
    
    // 计算总分
    const totalScore = answers.reduce((sum, score) => sum + (score || 0), 0);
    
    // 计算恋爱占有欲指数 (0-100分制)
    const minTotal = 40;  // 最低总分
    const maxTotal = 200;  // 最高总分
    const possessivenessIndex = Math.round(((totalScore - minTotal) / (maxTotal - minTotal)) * 100);
    
    // 保存结果到localStorage
    const testResult = {
        totalScore: totalScore,
        possessivenessIndex: possessivenessIndex,
        controlScore: controlScore,
        jealousyScore: jealousyScore,
        dependenceScore: dependenceScore,
        insecurityScore: insecurityScore,
        answers: answers,
        testDate: new Date().toISOString(),
        testType: 'love_possessiveness'
    };
    
    // 构建测试结果对象
    const testResultForAPI = {
        totalScore: totalScore,
        possessivenessIndex: possessivenessIndex,
        controlScore: controlScore,
        jealousyScore: jealousyScore,
        dependenceScore: dependenceScore,
        insecurityScore: insecurityScore,
        completedAt: new Date().toISOString()
    };

    // 调用测试完成API（VBT是单视角测试）
    // 双重防重复机制：1. 检查window标志 2. 检查localStorage中的完成标志
    const completionFlagKey = `vbt_test_completed_${window.linkValidator ? window.linkValidator.token : ''}`;
    const alreadyCompleted = window.__vbt_test_completed || localStorage.getItem(completionFlagKey) === 'true';
    
    if (!alreadyCompleted && window.linkValidator) {
        try {
            window.__vbt_test_completed = true;
            // 在localStorage中标记已完成，防止刷新后重复调用
            localStorage.setItem(completionFlagKey, 'true');
            await window.linkValidator.completeTest(undefined, testResultForAPI);
            console.log('测试完成记录成功');
        } catch (error) {
            console.error('记录测试完成失败:', error);
            // 如果失败，清除标志，允许重试
            window.__vbt_test_completed = false;
            localStorage.removeItem(completionFlagKey);
        }
    } else if (alreadyCompleted) {
        console.log('检测到测试已完成，跳过completeTest调用（避免重复扣除次数）');
    }

    localStorage.setItem('possessivenessTestResult', JSON.stringify(testResult));
    
    // 传递token参数到结果页
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const unlimited = urlParams.get('unlimited');
    let resultUrl = 'result.html';
    if (token) {
        resultUrl += '?token=' + encodeURIComponent(token);
        if (unlimited) {
            resultUrl += '&unlimited=' + encodeURIComponent(unlimited);
        }
    }
    
    window.location.href = resultUrl;
}

// 初始化标记，防止重复初始化
let isInitialized = false;

// 页面加载完成后初始化测试
document.addEventListener('DOMContentLoaded', function() {
    // 检查是否在欢迎页面，如果是则不初始化测试
    const welcomePage = document.getElementById('welcomePage');
    const testPage = document.getElementById('testPage');
    
    // 如果存在欢迎页面且测试页面是隐藏的，则不初始化
    if (welcomePage && testPage) {
        const welcomeDisplay = window.getComputedStyle(welcomePage).display;
        const testDisplay = window.getComputedStyle(testPage).display;
        
        if (welcomeDisplay !== 'none' && testDisplay === 'none') {
            // 欢迎页面显示中，等待用户点击开始测试
            return;
        }
    }
    
    // 没有欢迎页面或欢迎页面已隐藏，正常初始化
    if (!isInitialized) {
        isInitialized = true;
        initTest();
    }
});

