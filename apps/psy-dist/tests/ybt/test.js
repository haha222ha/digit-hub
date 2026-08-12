// 病娇体质测试题目（4维度，各10题，1-5分）
const yandereQuestions = [
    // A 恋爱依附力 1-10
    { id: 1, category: 'attach', question: '我经常需要对方不断确认“你还爱我吗”。', options: opt() },
    { id: 2, category: 'attach', question: '当他不回消息时，我会情绪失控地想象各种最坏结果。', options: opt() },
    { id: 3, category: 'attach', question: '如果对方很忙，我会觉得自己被冷落了。', options: opt() },
    { id: 4, category: 'attach', question: '我喜欢两个人黏在一起的感觉。', options: opt() },
    { id: 5, category: 'attach', question: '分开太久会让我感到不安。', options: opt() },
    { id: 6, category: 'attach', question: '我害怕对方哪天突然不见了。', options: opt() },
    { id: 7, category: 'attach', question: '我常会偷偷看他的社交动态确认安全感。', options: opt() },
    { id: 8, category: 'attach', question: '我希望对方能理解我所有的小情绪。', options: opt() },
    { id: 9, category: 'attach', question: '我需要对方的陪伴来维持情绪稳定。', options: opt() },
    { id: 10, category: 'attach', question: '当我喜欢一个人，我几乎放弃其他社交圈。', options: opt() },

    // B 独占欲能量 11-20
    { id: 11, category: 'possess', question: '他和异性多聊几句我都会不舒服。', options: opt() },
    { id: 12, category: 'possess', question: '我希望他只属于我。', options: opt() },
    { id: 13, category: 'possess', question: '我会刻意了解他和别人说了什么。', options: opt() },
    { id: 14, category: 'possess', question: '我觉得他不该和前任保持任何联系。', options: opt() },
    { id: 15, category: 'possess', question: '如果他夸别人漂亮，我会生气。', options: opt() },
    { id: 16, category: 'possess', question: '我觉得“真爱”就该互相控制。', options: opt() },
    { id: 17, category: 'possess', question: '我喜欢让对方把行程告诉我。', options: opt() },
    { id: 18, category: 'possess', question: '我想成为他生活的中心。', options: opt() },
    { id: 19, category: 'possess', question: '我会因为他没和我商量就决定事情而不开心。', options: opt() },
    { id: 20, category: 'possess', question: '我希望对方在社交媒体上公开我们的关系。', options: opt() },

    // C 情绪不稳定性（情绪波动率）21-30
    { id: 21, category: 'neuro', question: '我情绪变化很快，有时自己都控制不住。', options: opt() },
    { id: 22, category: 'neuro', question: '小事也可能让我大起大落。', options: opt() },
    { id: 23, category: 'neuro', question: '我容易感到被误解或忽视。', options: opt() },
    { id: 24, category: 'neuro', question: '当对方态度变冷时，我会立刻情绪低落。', options: opt() },
    { id: 25, category: 'neuro', question: '我在恋爱中常有“极度开心”和“极度难过”的切换。', options: opt() },
    { id: 26, category: 'neuro', question: '我生气时会说出让自己后悔的话。', options: opt() },
    { id: 27, category: 'neuro', question: '我在感情中像坐过山车。', options: opt() },
    { id: 28, category: 'neuro', question: '我常觉得“他不懂我”。', options: opt() },
    { id: 29, category: 'neuro', question: '我会因为对方一个眼神就猜测他变心。', options: opt() },
    { id: 30, category: 'neuro', question: '我有时觉得“我控制不了自己的爱”。', options: opt() },

    // D 理智自控力（理智临界线，分数越高=越冲动）31-40
    { id: 31, category: 'rational', question: '当我情绪上头时，我可能做出冲动的决定。', options: opt() },
    { id: 32, category: 'rational', question: '我争吵时很难停下来冷静思考。', options: opt() },
    { id: 33, category: 'rational', question: '当对方不理我时，我会立刻想要做点事让他注意我。', options: opt() },
    { id: 34, category: 'rational', question: '我会翻旧账。', options: opt() },
    { id: 35, category: 'rational', question: '有时我觉得自己像被情绪“劫持”了一样。', options: opt() },
    { id: 36, category: 'rational', question: '我在冲动时会删掉聊天记录或拉黑。', options: opt() },
    { id: 37, category: 'rational', question: '吵完架后我常后悔自己的反应太激烈。', options: opt() },
    { id: 38, category: 'rational', question: '我知道冷静更好，但那一刻真的做不到。', options: opt() },
    { id: 39, category: 'rational', question: '我容易被“爱与不爱”的感觉推着走。', options: opt() },
    { id: 40, category: 'rational', question: '我常在感情后期意识到“其实没必要那样做”。', options: opt() },
];

function opt(){
    return [
        { text: '非常不同意', score: 1 },
        { text: '不同意', score: 2 },
        { text: '一般', score: 3 },
        { text: '同意', score: 4 },
        { text: '非常同意', score: 5 }
    ];
}

let currentQuestionIndex = 0;
let answers = [];
const totalQuestions = yandereQuestions.length;

let progressBar, questionInfo, questionTitle, optionsList, prevBtn, nextBtn;

function initTest(){
    // 防止重复初始化
    if (typeof window.yandereTestInitialized !== 'undefined' && window.yandereTestInitialized) {
        return;
    }
    window.yandereTestInitialized = true;
    
    // 获取DOM元素
    progressBar = document.getElementById('progressBar');
    questionInfo = document.getElementById('questionInfo');
    questionTitle = document.getElementById('questionTitle');
    optionsList = document.getElementById('optionsList');
    prevBtn = document.getElementById('prevBtn');
    nextBtn = document.getElementById('nextBtn');
    
    // 绑定事件监听器
    if (prevBtn) prevBtn.addEventListener('click', goToPrevious);
    if (nextBtn) nextBtn.addEventListener('click', goToNext);
    
    currentQuestionIndex = 0;
    answers = [];
    showQuestion();
    updateProgress();
    updateButtons();
}

function showQuestion(){
    const q = yandereQuestions[currentQuestionIndex];
    questionInfo.textContent = `第 ${currentQuestionIndex + 1} 题 / 共 ${totalQuestions} 题`;
    questionTitle.textContent = q.question;
    optionsList.innerHTML = '';
    q.options.forEach((option, idx) => {
        const el = document.createElement('div');
        el.className = 'option-card';
        el.innerHTML = `
            <input type="radio" name="answer" value="${option.score}" class="option-radio" id="option${idx}">
            <label for="option${idx}">${option.text}</label>
        `;
        if (answers[currentQuestionIndex] !== undefined){
            const radio = el.querySelector('input[type="radio"]');
            if (Number(radio.value) === answers[currentQuestionIndex]){
                radio.checked = true;
                el.classList.add('selected');
            }
        }
        el.addEventListener('click', function(){ selectOption(this, option.score); });
        optionsList.appendChild(el);
    });
}

function selectOption(el, score){
    document.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    answers[currentQuestionIndex] = score;
    updateButtons();
    setTimeout(() => {
        if (currentQuestionIndex < totalQuestions - 1){
            goToNext();
        }
    }, 100);
}

function updateProgress(){
    const progress = ((currentQuestionIndex + 1) / totalQuestions) * 100;
    progressBar.style.width = progress + '%';
}

function updateButtons(){
    prevBtn.disabled = currentQuestionIndex === 0;
    const hasAnswer = answers[currentQuestionIndex] !== undefined;
    nextBtn.disabled = !hasAnswer;
    nextBtn.textContent = currentQuestionIndex === totalQuestions - 1 ? '完成测试' : '下一题';
}

function goToPrevious(){
    if (currentQuestionIndex > 0){
        currentQuestionIndex--;
        showQuestion();
        updateProgress();
        updateButtons();
    }
}

function goToNext(){
    if (currentQuestionIndex < totalQuestions - 1){
        currentQuestionIndex++;
        showQuestion();
        updateProgress();
        updateButtons();
    } else {
        completeTest();
    }
}

async function completeTest(){
    const attachScores = answers.slice(0, 10).filter(v => v != null);
    const possessScores = answers.slice(10, 20).filter(v => v != null);
    const neuroScores = answers.slice(20, 30).filter(v => v != null);
    const rationalScores = answers.slice(30, 40).filter(v => v != null);

    const attachScore = attachScores.reduce((s, v) => s + v, 0);
    const possessScore = possessScores.reduce((s, v) => s + v, 0);
    const neuroScore = neuroScores.reduce((s, v) => s + v, 0);
    const rationalScore = rationalScores.reduce((s, v) => s + v, 0);

    const totalScore = answers.reduce((s, v) => s + (v || 0), 0);
    const minTotal = 40, maxTotal = 200;
    const yandereIndex = Math.round(((totalScore - minTotal) / (maxTotal - minTotal)) * 100);

    const result = {
        totalScore,
        yandereIndex,
        attachScore,
        possessScore,
        neuroScore,
        rationalScore,
        answers,
        testDate: new Date().toISOString(),
        testType: 'yandere'
    };

    // 构建测试结果对象
    const testResult = {
        totalScore,
        yandereIndex,
        attachScore,
        possessScore,
        neuroScore,
        rationalScore,
        completedAt: new Date().toISOString()
    };

    // 调用测试完成API（YBT是单视角测试）
    // 双重防重复机制：1. 检查window标志 2. 检查localStorage中的完成标志
    const completionFlagKey = `ybt_test_completed_${window.linkValidator ? window.linkValidator.token : ''}`;
    const alreadyCompleted = window.__ybt_test_completed || localStorage.getItem(completionFlagKey) === 'true';
    
    if (!alreadyCompleted && window.linkValidator) {
        try {
            window.__ybt_test_completed = true;
            // 在localStorage中标记已完成，防止刷新后重复调用
            localStorage.setItem(completionFlagKey, 'true');
            await window.linkValidator.completeTest(undefined, testResult);
            console.log('测试完成记录成功');
        } catch (error) {
            console.error('记录测试完成失败:', error);
            // 如果失败，清除标志，允许重试
            window.__ybt_test_completed = false;
            localStorage.removeItem(completionFlagKey);
        }
    } else if (alreadyCompleted) {
        console.log('检测到测试已完成，跳过completeTest调用（避免重复扣除次数）');
    }

    localStorage.setItem('yandereTestResult', JSON.stringify(result));
    
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

// 全局初始化函数，供外部调用
window.initYandereTest = initTest;

// 初始化标记，防止重复初始化
let isInitialized = false;

document.addEventListener('DOMContentLoaded', function(){
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




