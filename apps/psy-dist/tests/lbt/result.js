const DEFAULT_FOREWORD = [
    "每个人表达爱的方式不同，有人清醒独立，有人深情执着。以下是你在爱情中的典型特征，只是你爱的样子。",
    "得分越高，说明你的恋爱脑倾向越明显，可能更容易沉浸在爱情中，忽视其他生活方面的平衡。"
];

const LOVE_PROFILES = [
    {
        max: 25,
        type: "🧊 AI型恋人",
        tagline: "你像理性航海员，懂得在浪漫与自我之间保持距离。",
        analysis: "你在恋爱中依旧保持自己的节奏。你擅长与情绪保持距离，会审视关系是否健康，也很懂得在亲密和独立之间切换。这种状态让你在亲密关系里少了一些戏剧性，却多了一份稳定与可靠。继续保持自我，同时学会适度表达柔软，让对方能看见你的在乎。"
    },
    {
        max: 50,
        type: "🔥 嘴硬心软型",
        tagline: "你表面清醒，内心汹涌。嘴上说着无所谓，心里已经排演了三季爱情片。",
        analysis: "你是那种典型的“表面清醒、内心上头”的恋人。你嘴上说着“随缘吧”“无所谓”，但内心已经小剧场演了三季。你在恋爱中会控制情绪，但一旦陷进去就真的拔不出来。你会默默付出，也会偷偷吃醋；你会说“别来烦我”，下一秒又在等TA消息。你有情绪，也有期待，你也会emo，但你不希望对方看出来。这种“嘴硬心软”的状态，让你在感情中既有趣又危险——有趣的是你细腻又敏感，危险的是你容易被忽略后自我怀疑。"
    },
    {
        max: 70,
        type: "💘 恋爱脑轻度患者",
        tagline: "你喜欢沉浸式热恋，安全感和情绪回应是你的养分。",
        analysis: "当你恋爱时，生活的优先级会自动重排。你愿意花时间、精力、情绪去灌溉一段关系，想把最好的都给对方。你需要即时反馈，也渴望被看见的感觉。有时你也明白该理性一点，但爱情里的你会更感性、更主动、更在乎细节。学会在热情与自我照顾之间找到平衡，才能让热恋状态走得更久。"
    },
    {
        max: 100,
        type: "💥 恋爱脑爆炸型",
        tagline: "一旦爱上就全力沉没，世界可以很小，只装得下“我们”。",
        analysis: "你把爱情当成生活的底色，一旦投入就会不惜一切去守护它。你乐于改变计划、调整城市、甚至重新制定人生路线，只为靠近对方。你细腻、敏感、极富共情，但也容易因为爱而忽略自我。请记得：真正的亲密不是捆绑，而是互相成就。照顾对方的同时，也别忘记照顾自己。"
    }
];

const elements = {
    reportNo: document.getElementById('reportNo'),
    resultType: document.getElementById('resultType'),
    resultTagline: document.getElementById('resultTagline'),
    scoreValue: document.getElementById('scoreValue'),
    scoreRing: document.getElementById('scoreRing'),
    forewordList: document.getElementById('forewordList'),
    analysisText: document.getElementById('analysisText'),
    homeBtn: document.getElementById('homeBtn'),
    shareBtn: document.getElementById('shareBtn')
};

function init() {
    const stored = localStorage.getItem('loveBrainTestResult');
    if (!stored) {
        window.location.href = 'Lian_ai_nao_test.html';
        return;
    }
    
    let data;
    try {
        data = JSON.parse(stored);
    } catch (e) {
        console.error('Failed to parse test result:', e);
        window.location.href = 'Lian_ai_nao_test.html';
        return;
    }
    
    const percent = data.loveBrainPercent ?? 0;
    const score = data.loveBrainScore ?? 0;
    const profile = getProfile(percent);

    if (elements.reportNo) fillReportNumber(data.reportNo);
    if (elements.scoreValue && elements.scoreRing) renderScore(score);
    if (elements.resultType && elements.resultTagline) renderTexts(profile);
    if (elements.forewordList) renderForeword(DEFAULT_FOREWORD);
    if (elements.analysisText) elements.analysisText.textContent = profile.analysis;
    bindActions();
}

function fillReportNumber(existingNo) {
    const no = existingNo || String(10000000 + Math.floor(Math.random() * 89999999));
    elements.reportNo.textContent = no;
}

function renderScore(score) {
    const clamped = Math.min(80, Math.max(0, score));
    elements.scoreValue.textContent = clamped;
    const deg = Math.round((clamped / 80) * 360);
    elements.scoreRing.style.background = `conic-gradient(#ff7c5c 0deg, #ff7c5c ${deg}deg, #ffe4d0 ${deg}deg 360deg)`;
}

function renderTexts(profile) {
    elements.resultType.textContent = profile.type;
    elements.resultTagline.textContent = profile.tagline;
}

function renderForeword(list) {
    elements.forewordList.innerHTML = '';
    list.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        elements.forewordList.appendChild(li);
    });
}

function getProfile(percent) {
    return LOVE_PROFILES.find(profile => percent <= profile.max) || LOVE_PROFILES[LOVE_PROFILES.length - 1];
}

function bindActions() {
    if (elements.homeBtn) {
        elements.homeBtn.addEventListener('click', () => {
            // 获取token（从URL参数或window.linkValidator）
            const urlParams = new URLSearchParams(window.location.search);
            let token = urlParams.get('token');
            
            // 如果URL中没有token，尝试从window.linkValidator获取
            if (!token && window.linkValidator && window.linkValidator.token) {
                token = window.linkValidator.token;
            }
            
            // 构建跳转URL（需要包含token以便SDK验证）
            let indexUrl = 'index.html';
            if (token) {
                const queryParams = new URLSearchParams();
                queryParams.set('token', token);
                queryParams.set('restart', 'true'); // 标记为重新测试
                
                // 检查是否是无限测试模式
                const isUnlimited = urlParams.get('unlimited') === 'true';
                if (isUnlimited) {
                    queryParams.set('unlimited', 'true');
                }
                
                const queryString = queryParams.toString();
                if (queryString) {
                    indexUrl = `${indexUrl}?${queryString}`;
                }
            }
            
            window.location.href = indexUrl;
        });
    }

    if (elements.shareBtn) {
        elements.shareBtn.addEventListener('click', async () => {
            const text = `我的恋爱脑得分：${elements.scoreValue.textContent}/80，类型：${elements.resultType.textContent}`;

            if (navigator.share) {
                try {
                    await navigator.share({ title: '恋爱脑测试', text, url: window.location.href });
                } catch (err) {
                    console.warn('Share dismissed:', err);
                }
            } else if (navigator.clipboard) {
                await navigator.clipboard.writeText(text);
                elements.shareBtn.textContent = '已复制';
                setTimeout(() => (elements.shareBtn.textContent = '分享'), 1500);
            } else {
                alert(text);
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', init);
