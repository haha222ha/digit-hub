const loveBrainQuestions = [
    {
        id: 1,
        question: "恋爱时你朋友圈的状态是？",
        options: [
            { text: "和单身一样，基本没人看出变化", score: 1 },
            { text: "偶尔提到，但大多是日常", score: 2 },
            { text: "看心情，开心就晒一下", score: 3 },
            { text: "经常发和TA有关的内容", score: 4 },
            { text: "天天营业，让全世界知道", score: 5 }
        ]
    },
    {
        id: 2,
        question: "你会因为TA的朋友圈内容胡思乱想吗？",
        options: [
            { text: "完全不会，和自己无关", score: 1 },
            { text: "偶尔想想，但能很快放下", score: 2 },
            { text: "会看具体内容再决定", score: 3 },
            { text: "常常猜测他是不是有事瞒着我", score: 4 },
            { text: "立刻问TA到底什么意思", score: 5 }
        ]
    },
    {
        id: 3,
        question: "你能接受恋人不秒回/不回你消息吗？",
        options: [
            { text: "完全没关系，对方有自己的生活", score: 1 },
            { text: "短时间可以，太久会提醒一下", score: 2 },
            { text: "希望说明原因，不然会焦虑", score: 3 },
            { text: "超过半小时就开始不安", score: 4 },
            { text: "必须及时回应，不然要问到明白", score: 5 }
        ]
    },
    {
        id: 4,
        question: "当你喜欢上一个人，你会怎么做？",
        options: [
            { text: "保持距离再观察很久", score: 1 },
            { text: "慢慢接近，看对方反应", score: 2 },
            { text: "暗示和试探并行", score: 3 },
            { text: "主动制造很多交集", score: 4 },
            { text: "完全投进去，恨不得马上确定关系", score: 5 }
        ]
    },
    {
        id: 5,
        question: "你会偷偷测试TA的在乎程度吗？",
        options: [
            { text: "不会，信任感更重要", score: 1 },
            { text: "偶尔用玩笑试探", score: 2 },
            { text: "会看他在小事上的反应", score: 3 },
            { text: "会设点局，看他会不会哄我", score: 4 },
            { text: "经常测试，不测试就不安心", score: 5 }
        ]
    },
    {
        id: 6,
        question: "你和TA吵架时，谁先低头？",
        options: [
            { text: "看谁错谁道歉，冷静的先说", score: 1 },
            { text: "我不太会先认错，但也不拖太久", score: 2 },
            { text: "看事态发展和情绪强度", score: 3 },
            { text: "通常都是我先示弱", score: 4 },
            { text: "我根本吵不起来，很快就先求和", score: 5 }
        ]
    },
    {
        id: 7,
        question: "你认同“恋爱脑”这个词吗？",
        options: [
            { text: "认可，而且我绝不会那样", score: 1 },
            { text: "有点意思，但我会保持清醒", score: 2 },
            { text: "看人而定，我可能偶尔会", score: 3 },
            { text: "我基本认同，它就是在说我", score: 4 },
            { text: "超级认同，我骄傲地承认自己恋爱脑", score: 5 }
        ]
    },
    {
        id: 8,
        question: "你最不能忍的是：",
        options: [
            { text: "失去自我/生活节奏被打乱", score: 1 },
            { text: "对方忽视我的边界", score: 2 },
            { text: "我比TA投入更多", score: 3 },
            { text: "TA敷衍我、不回应情绪", score: 4 },
            { text: "我察觉TA所有事都瞒着我", score: 5 }
        ]
    },
    {
        id: 9,
        question: "你是否会翻TA的点赞、评论、关注列表？",
        options: [
            { text: "不会，那是隐私", score: 1 },
            { text: "偶尔路过看见才点进去", score: 2 },
            { text: "有点好奇，会看看但不过界", score: 3 },
            { text: "会仔细研究，怕错过信息", score: 4 },
            { text: "会常规性排查，必须掌握动向", score: 5 }
        ]
    },
    {
        id: 10,
        question: "你回给TA设置微信特别关注+响铃吗？",
        options: [
            { text: "不会，我不想被提醒牵制", score: 1 },
            { text: "刚开始不会，稳定了才设", score: 2 },
            { text: "看对方的态度决定", score: 3 },
            { text: "会，怕错过他的信息", score: 4 },
            { text: "必须设置，才有安全感", score: 5 }
        ]
    },
    {
        id: 11,
        question: "你觉得恋爱中的你，是情绪稳定的吗？",
        options: [
            { text: "很稳定，几乎不受影响", score: 1 },
            { text: "大多稳定，偶尔会波动", score: 2 },
            { text: "看对方的反馈而定", score: 3 },
            { text: "比较容易因为对方而失控", score: 4 },
            { text: "非常不稳，风吹草动都能 emo", score: 5 }
        ]
    },
    {
        id: 12,
        question: "“爱一个人就应该无条件付出”你怎么看？",
        options: [
            { text: "不同意，爱也要有界限", score: 1 },
            { text: "不完全同意，要看彼此状态", score: 2 },
            { text: "想付出，但也需要被回馈", score: 3 },
            { text: "基本认同，我会尽量付出", score: 4 },
            { text: "完全认同，爱就是不求回报", score: 5 }
        ]
    },
    {
        id: 13,
        question: "你觉得“为爱付出一切”这事？",
        options: [
            { text: "很危险，我绝不会那样", score: 1 },
            { text: "看阶段，如果值得可以试试", score: 2 },
            { text: "我嘴上说不会，但可能真的会", score: 3 },
            { text: "愿意付出，只要对方值得", score: 4 },
            { text: "毫不犹豫，我就是这样的人", score: 5 }
        ]
    },
    {
        id: 14,
        question: "你幻想过和TA的未来吗？",
        options: [
            { text: "不太会，顺其自然", score: 1 },
            { text: "偶尔想想，不会太具体", score: 2 },
            { text: "会聊聊，保持期待", score: 3 },
            { text: "经常脑内模拟各种场景", score: 4 },
            { text: "已经计划好婚礼/房子/孩子名字", score: 5 }
        ]
    },
    {
        id: 15,
        question: "你独处的时间被TA打断了，你会？",
        options: [
            { text: "先处理自己的事，再慢慢回复", score: 1 },
            { text: "看紧急程度，能等就等", score: 2 },
            { text: "有点烦但还是会回", score: 3 },
            { text: "立刻放下手头事陪TA", score: 4 },
            { text: "我根本不会让TA等我", score: 5 }
        ]
    },
    {
        id: 16,
        question: "TA不带你参加朋友聚会，你的内心反应是？",
        options: [
            { text: "理解，每个人都有独自空间", score: 1 },
            { text: "会问问原因，但能接受", score: 2 },
            { text: "会有点失落，想确认关系", score: 3 },
            { text: "怀疑TA不够爱我", score: 4 },
            { text: "会持续追问，直到得到满意答案", score: 5 }
        ]
    },
    {
        id: 17,
        question: "TA30分钟没回消息，你的反应是？",
        options: [
            { text: "继续做自己的事，等他有空", score: 1 },
            { text: "会看他是否忙，再决定要不要提醒", score: 2 },
            { text: "会发一句“在干嘛”试探", score: 3 },
            { text: "开始多发几条消息催促", score: 4 },
            { text: "直接打电话或发语音找人", score: 5 }
        ]
    },
    {
        id: 18,
        question: "你是否会因为谈恋爱耽误考试/工作/目标？",
        options: [
            { text: "不会，生活重点清晰", score: 1 },
            { text: "偶尔，但会及时拉回正轨", score: 2 },
            { text: "会短暂被影响，需要提醒", score: 3 },
            { text: "常常分心，很难兼顾", score: 4 },
            { text: "完全被带节奏，其他都不重要", score: 5 }
        ]
    },
    {
        id: 19,
        question: "你有过因为恋爱“人间蒸发”几天的经历吗？",
        options: [
            { text: "没有，恋爱也要保持社交", score: 1 },
            { text: "很少，除非刚恋爱", score: 2 },
            { text: "有过，但不会太久", score: 3 },
            { text: "会，恋爱对我就是沉浸式", score: 4 },
            { text: "经常，我会彻底消失在朋友面前", score: 5 }
        ]
    },
    {
        id: 20,
        question: "你会因为TA去考编、搬家、换城市吗？",
        options: [
            { text: "绝不会，我有自己的规划", score: 1 },
            { text: "视情况而定，要充分评估", score: 2 },
            { text: "可以考虑，但需要时间", score: 3 },
            { text: "只要看见希望，我可以试", score: 4 },
            { text: "毫不犹豫，为TA改变一切", score: 5 }
        ]
    }
];

const TOTAL_QUESTIONS = loveBrainQuestions.length;
let currentQuestionIndex = 0;
let answers = new Array(TOTAL_QUESTIONS);

let progressBar, questionInfo, questionTitle, optionsList, prevBtn, nextBtn;

function initTest() {
    // 防止重复初始化
    if (typeof window.loveBrainTestInitialized !== 'undefined' && window.loveBrainTestInitialized) {
        return;
    }
    window.loveBrainTestInitialized = true;
    
    // 获取DOM元素
    progressBar = document.getElementById('progressBar');
    questionInfo = document.getElementById('questionInfo');
    questionTitle = document.getElementById('questionTitle');
    optionsList = document.getElementById('optionsList');
    prevBtn = document.getElementById('prevBtn');
    nextBtn = document.getElementById('nextBtn');
    
    // 重新初始化answers数组
    answers = new Array(TOTAL_QUESTIONS).fill(undefined);
    
    // 绑定事件监听器
    if (prevBtn) {
        // 先移除可能存在的旧监听器
        prevBtn.replaceWith(prevBtn.cloneNode(true));
        prevBtn = document.getElementById('prevBtn');
        prevBtn.addEventListener('click', goToPrevious);
    }
    if (nextBtn) {
        // 先移除可能存在的旧监听器
        nextBtn.replaceWith(nextBtn.cloneNode(true));
        nextBtn = document.getElementById('nextBtn');
        nextBtn.addEventListener('click', () => {
            if (currentQuestionIndex === TOTAL_QUESTIONS - 1) {
                completeTest();
            } else {
                goToNext();
            }
        });
    }
    
    currentQuestionIndex = 0;
    showQuestion();
    updateProgress();
    updateButtons();
}

function showQuestion() {
    const question = loveBrainQuestions[currentQuestionIndex];
    
    questionInfo.textContent = `第 ${currentQuestionIndex + 1} 题 / 共 ${TOTAL_QUESTIONS} 题`;
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
        if (currentQuestionIndex < TOTAL_QUESTIONS - 1) {
            goToNext();
        }
    }, 120);
}

function updateProgress() {
    const progress = ((currentQuestionIndex + 1) / TOTAL_QUESTIONS) * 100;
    progressBar.style.width = `${progress}%`;
}

function updateButtons() {
    prevBtn.disabled = currentQuestionIndex === 0;
    
    const hasAnswer = answers[currentQuestionIndex] !== undefined;
    nextBtn.disabled = !hasAnswer;
    
    if (currentQuestionIndex === TOTAL_QUESTIONS - 1) {
        nextBtn.textContent = '完成测试';
    } else {
        nextBtn.textContent = '下一题';
    }
}

function goToPrevious() {
    if (currentQuestionIndex === 0) return;
        currentQuestionIndex--;
        showQuestion();
        updateProgress();
        updateButtons();
}

function goToNext() {
    if (currentQuestionIndex >= TOTAL_QUESTIONS - 1) {
        completeTest();
        return;
    }
        currentQuestionIndex++;
        showQuestion();
        updateProgress();
        updateButtons();
}

async function completeTest() {
    // 计算总分
    const totalScore = answers.reduce((sum, score) => sum + (score || 0), 0);
    
    // 计算恋爱脑指数 (0-100分制)
    const minTotal = TOTAL_QUESTIONS * 1;  // 最低总分
    const maxTotal = TOTAL_QUESTIONS * 5;  // 最高总分
    const ratio = Math.min(1, Math.max(0, (totalScore - minTotal) / (maxTotal - minTotal)));
    const loveBrainPercent = Math.round(ratio * 100);
    const loveBrainScore = Math.round(ratio * 80);

    // 保存结果到localStorage
    const testResult = {
        totalScore: totalScore,
        loveBrainPercent: loveBrainPercent,
        loveBrainScore: loveBrainScore,
        answers: answers,
        testDate: new Date().toISOString(),
        reportNo: generateReportNo()
    };
    
    localStorage.setItem('loveBrainTestResult', JSON.stringify(testResult));
    
    // 调用测试完成API（lbt是单视角测试）
    if (window.linkValidator) {
        try {
            await window.linkValidator.completeTest(undefined, testResult);
            console.log('测试完成记录成功');
        } catch (error) {
            console.error('记录测试完成失败:', error);
            // 测试完成记录失败不影响跳转，只记录错误
        }
    }
    
    // 构建结果页面URL（需要包含token以便SDK验证）
    let resultUrl = 'result.html';
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
    }
    
    // 构建完整的URL
    const queryString = urlParams.toString();
    if (queryString) {
        resultUrl = `${resultUrl}?${queryString}`;
    }
    
    // 跳转到结果页面
    window.location.href = resultUrl;
}

function generateReportNo() {
    const base = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 900) + 100;
    return `10${base}${random}`;
}

// 全局初始化函数，供外部调用
window.initLoveBrainTest = initTest;

// 初始化标记，防止重复初始化
let isInitialized = false;

document.addEventListener('DOMContentLoaded', () => {
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

