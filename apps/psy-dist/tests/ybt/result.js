// 病娇体质测试结果渲染
document.addEventListener('DOMContentLoaded', function(){
    const result = JSON.parse(localStorage.getItem('yandereTestResult'));
    if (!result){ window.location.href = 'index.html'; return; }
    // 启用病娇主题
    document.body.classList.add('yandere-theme');
    displayResults(result);
    
    // 初始化重新测试按钮
    initializeRestartButton();
});

/**
 * 初始化重新测试按钮
 */
function initializeRestartButton() {
    const restartButton = document.getElementById('restartButton');
    if (!restartButton) {
        console.warn('重新测试按钮未找到');
        return;
    }
    
    restartButton.addEventListener('click', function() {
        // 清除本地测试结果（用于重新测试）
        if (window.linkValidator && window.linkValidator.clearLocalResult) {
            window.linkValidator.clearLocalResult();
            console.log('已清除本地测试结果');
        }
        
        // 清除测试结果
        localStorage.removeItem('yandereTestResult');
        
        // 重置测试完成标志（包括localStorage中的标志）
        window.__ybt_test_completed = false;
        const completionFlagKey = `ybt_test_completed_${window.linkValidator ? window.linkValidator.token : ''}`;
        localStorage.removeItem(completionFlagKey);
        console.log('已清除测试完成标志');
        
        // 获取token参数，如果有则传递到首页
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        const unlimited = urlParams.get('unlimited');
        
        let indexUrl = 'index.html';
        if (token) {
            indexUrl += '?token=' + encodeURIComponent(token);
            if (unlimited) {
                indexUrl += '&unlimited=' + encodeURIComponent(unlimited);
            }
            indexUrl += '&restart=true';
        }
        
        window.location.href = indexUrl;
    });
}

function displayResults(result){
    const idx = clamp(result.yandereIndex, 0, 100);
    const level = determineLevel(idx);

    document.getElementById('yandereIndex').textContent = idx;
    document.getElementById('levelIndicator').textContent = level.name;
    document.getElementById('description').innerHTML = `你的病娇体质指数为<span class="highlight">${idx}</span>，处于<span class="highlight">${level.name}</span>水平`;
    document.getElementById('progressFill').style.width = idx + '%';

    // 维度分数
    setDim('attach', result.attachScore);
    setDim('possess', result.possessScore);
    setDim('neuro', result.neuroScore);
    setDim('rational', result.rationalScore);

    // 雷达图（结构与占有欲结果页一致：radarChart / attachRadar + 主导标签）
    drawRadarChart(result);
    drawAttachmentRadar(result);

    // 人格/调适类型
    const personalityType = determinePersonalityType(result);
    const attachmentType = determineAttachmentType(result);
    displayPersonalityType(personalityType);
    displayAttachmentType(attachmentType);

    // 详细分数 + Z
    setDetail('attach', result.attachScore);
    setDetail('possess', result.possessScore);
    setDetail('neuro', result.neuroScore);
    setDetail('rational', result.rationalScore);

    displayTopExplanation(idx, level);
    displayTopSuggestions(level);
}

function setDim(key, score){
    const map = {
        attach: ['attachScoreDisplay','attachProgress'],
        possess: ['possessScoreDisplay','possessProgress'],
        neuro: ['neuroScoreDisplay','neuroProgress'],
        rational: ['rationalScoreDisplay','rationalProgress']
    };
    const [sId, pId] = map[key];
    const sEl = document.getElementById(sId);
    const pEl = document.getElementById(pId);
    if (sEl) sEl.textContent = score;
    if (pEl) pEl.style.width = ((score / 50) * 100) + '%';
}

// 分享模块已移除

function setDetail(key, score){
    const sMap = {
        attach: 'attachDetailScore',
        possess: 'possessDetailScore',
        neuro: 'neuroDetailScore',
        rational: 'rationalDetailScore'
    };
    const zMap = {
        attach: 'attachZ',
        possess: 'possessZ',
        neuro: 'neuroZ',
        rational: 'rationalZ'
    };
    const sEl = document.getElementById(sMap[key]);
    const zEl = document.getElementById(zMap[key]);
    if (sEl) sEl.textContent = score;
    if (zEl) zEl.textContent = `Z分数：${z(score)}`;
}

function z(score){ return ((score - 25) / 25).toFixed(2); }
function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

function determineLevel(index){
    if (index >= 80) return { name: '危险区（黑化病娇）', cls: 'danger' };
    if (index >= 60) return { name: '轻病娇（嘴甜心狠）', cls: 'high' };
    if (index >= 40) return { name: '理智型（口嫌体直）', cls: 'medium' };
    return { name: '佛系恋爱（直球纯爱）', cls: 'low' };
}

// 四维病娇体质雷达图
function drawRadarChart(result){
    const canvas = document.getElementById('radarChart');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 320 * dpr;
    canvas.height = 320 * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const centerX = 160, centerY = 160, radius = 85;
    const values = [
        (result.attachScore / 50) * 100,
        (result.possessScore / 50) * 100,
        (result.neuroScore / 50) * 100,
        (result.rationalScore / 50) * 100
    ];
    const labels = ['恋爱依附力','独占欲能量','情绪波动率','理智临界线'];
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++){
        ctx.beginPath(); ctx.arc(centerX, centerY, radius * i / 5, 0, Math.PI * 2); ctx.stroke();
    }
    for (let i = 0; i < 4; i++){
        const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        ctx.beginPath(); ctx.moveTo(centerX, centerY); ctx.lineTo(x, y); ctx.stroke();
        const lx = centerX + Math.cos(angle) * (radius + 30);
        const ly = centerY + Math.sin(angle) * (radius + 30);
        ctx.fillStyle = '#333'; ctx.font = '14px Microsoft YaHei'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(labels[i], lx, ly);
    }
    ctx.fillStyle = 'rgba(255, 107, 157, 0.2)';
    ctx.strokeStyle = '#ff6b9d'; ctx.lineWidth = 3; ctx.beginPath();
    for (let i = 0; i < 4; i++){
        const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2;
        const r = (values[i] / 100) * radius;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
}

// 风格倾向雷达图（相对 20-80 区间），并给出主导风格
function drawAttachmentRadar(result){
    const canvas = document.getElementById('attachRadar');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 320 * dpr;
    canvas.height = 320 * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const centerX = 160, centerY = 160, radius = 85;
    // 四个风格：依附甜、独占控、情绪流、冲动派
    const sweetAttach = clamp(Math.round((result.attachScore / 50) * 60 + 20), 20, 80);
    const controlObsess = clamp(Math.round((result.possessScore / 50) * 60 + 20), 20, 80);
    const emoFlow = clamp(Math.round((result.neuroScore / 50) * 60 + 20), 20, 80);
    const impulsive = clamp(Math.round((result.rationalScore / 50) * 60 + 20), 20, 80);
    const values = [sweetAttach, controlObsess, emoFlow, impulsive];
    const labels = ['依附甜','独占控','情绪流','冲动派'];
    ctx.strokeStyle = '#e0e0e0';
    for (let i = 1; i <= 5; i++){ ctx.beginPath(); ctx.arc(centerX, centerY, radius * i / 5, 0, Math.PI * 2); ctx.stroke(); }
    for (let i = 0; i < 4; i++){
        const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        ctx.beginPath(); ctx.moveTo(centerX, centerY); ctx.lineTo(x, y); ctx.stroke();
        const lx = centerX + Math.cos(angle) * (radius + 30);
        const ly = centerY + Math.sin(angle) * (radius + 30);
        ctx.fillStyle = '#333'; ctx.font = '14px Microsoft YaHei'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(labels[i], lx, ly);
    }
    ctx.fillStyle = 'rgba(255, 46, 126, 0.18)';
    ctx.strokeStyle = '#ff2e7e'; ctx.lineWidth = 3; ctx.beginPath();
    for (let i = 0; i < 4; i++){
        const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2;
        const r = (values[i] / 80) * radius;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    const idx = values.indexOf(Math.max(...values));
    const lead = labels[idx];
    const el = document.getElementById('leadAttachment');
    if (el) el.textContent = lead;
}

function displayPersonalityType(personality){
    const levelTitle = document.getElementById('personalityLevel');
    if (levelTitle) levelTitle.textContent = personality.name;
    const content = document.getElementById('personalityContent');
    if (content) content.textContent = personality.description;
    const traitsWrap = document.getElementById('personalityTraits');
    if (traitsWrap){
        traitsWrap.innerHTML = '';
        (personality.traits || []).forEach(t => {
            const div = document.createElement('div');
            div.className = 'trait-pill';
            div.textContent = t;
            traitsWrap.appendChild(div);
        });
    }
    const advantagesList = document.getElementById('advantagesList');
    const disadvantagesList = document.getElementById('disadvantagesList');
    const suggestionsList = document.getElementById('personalitySuggestionsList');
    if (advantagesList){ advantagesList.innerHTML = (personality.advantages || []).map(i => `<div class="list-item">${i}</div>`).join(''); }
    if (disadvantagesList){ disadvantagesList.innerHTML = (personality.disadvantages || []).map(i => `<div class="list-item">${i}</div>`).join(''); }
    if (suggestionsList){ suggestionsList.innerHTML = (personality.suggestions || []).map(i => `<div class="list-item">${i}</div>`).join(''); }
}

function displayAttachmentType(att){
    const levelTitle = document.getElementById('attachmentLevel');
    if (levelTitle) levelTitle.textContent = att.name;
    const content = document.getElementById('attachmentContent');
    if (content) content.textContent = att.description;
    const traitsWrap = document.getElementById('attachmentTraits');
    if (traitsWrap){
        traitsWrap.innerHTML = '';
        (att.traits || []).forEach(t => {
            const div = document.createElement('div');
            div.className = 'trait-pill';
            div.textContent = t;
            traitsWrap.appendChild(div);
        });
    }
    const advantagesList = document.getElementById('attachmentAdvantagesList');
    const disadvantagesList = document.getElementById('attachmentDisadvantagesList');
    const suggestionsList = document.getElementById('attachmentSuggestionsList');
    if (advantagesList){ advantagesList.innerHTML = (att.advantages || []).map(i => `<div class="list-item">${i}</div>`).join(''); }
    if (disadvantagesList){ disadvantagesList.innerHTML = (att.disadvantages || []).map(i => `<div class="list-item">${i}</div>`).join(''); }
    if (suggestionsList){ suggestionsList.innerHTML = (att.suggestions || []).map(i => `<div class="list-item">${i}</div>`).join(''); }
}

// 类型判定（结合四维均值与主导维度）
function determinePersonalityType(result){
    const avg = (result.attachScore + result.possessScore + result.neuroScore + result.rationalScore) / 4;
    const maxVal = Math.max(result.attachScore, result.possessScore, result.neuroScore, result.rationalScore);
    const maxKey = ['attach','possess','neuro','rational'][[result.attachScore, result.possessScore, result.neuroScore, result.rationalScore].indexOf(maxVal)];
    if (avg >= 35){
        return {
            name: maxKey === 'possess' ? '独占主导型' : maxKey === 'attach' ? '依附主导型' : maxKey === 'neuro' ? '情绪主导型' : '冲动主导型',
            description: '深情炽热、在乎具体又在乎全部。你的主导维度像色彩滤镜，决定你如何靠近与守护，也决定冲突时的走向。',
            traits: ['深情而执着','需要确认与靠近','容易被细节触发','边界与透明度需求高'],
            advantages: ['忠诚与投入','强连接欲望','愿意修复与付出','行动感强'],
            disadvantages: ['情绪溢出/控制过载','空间压缩感','误读与反应过快'],
            suggestions: ['触发记事薄+复盘','规则化透明（时间/回应）','非暴力沟通NVC','自我安抚与延迟反应']
        };
    } else if (avg >= 25){
        return {
            name: '平衡倾向型',
            description: '能在独立与亲密之间切换自如，除非遇到触发点，一般都能维持温和的节奏与秩序。',
            traits: ['在乎但可自控','能退也能进','需要明确规则','愿意协商'],
            advantages: ['节奏稳定','修复成本低','对关系友好'],
            disadvantages: ['触发点未标注时易失衡','情绪延迟爆发的风险'],
            suggestions: ['整理触发清单','建立争吵流程卡','周度深聊仪式']
        };
    }
    return {
        name: '理性稳定型',
        description: '更独立与稳重，愿意给自己与伴侣足够呼吸空间。适度的热度表达会让连接更甜。',
        traits: ['自持理性','稳定节奏','信任友好','尊重边界'],
        advantages: ['情绪噪声低','空间健康','决策稳健'],
        disadvantages: ['表达密度偏低','对浪漫的敏感度偏弱'],
        suggestions: ['明确“在乎的证据”','小型浪漫仪式','月度关系盘点']
    };
}

function determineAttachmentType(result){
    // 综合“情绪波动率 + 理智临界线(冲动)”与“依附/独占”的平衡，给出调适模式
    const reactivity = result.neuroScore + result.rationalScore; // 反应强度
    const bonding = result.attachScore + result.possessScore; // 亲密/占有倾向
    if (reactivity >= 70 && bonding >= 70){
        return {
            name: '高反应-高黏附',
            description: '像霓虹一样炽烈：靠得很近、反应很快。需要“边界+理智通道”做稳压器。',
            traits: ['靠近需求强','高敏感','反应迅速','确认频繁'],
            advantages: ['爱意强度高','修复动力足'],
            disadvantages: ['冲突强度大','能耗高'],
            suggestions: ['停用词与冷静协议','固定个人时间','透明规则替代监控']
        };
    } else if (reactivity >= 70){
        return {
            name: '高反应-自我调适中',
            description: '情绪引擎更强，需要更清晰的“降噪流程”。当你有路径，甜度和稳定度会同时提升。',
            traits: ['起伏明显','触发敏感','流程依赖'],
            advantages: ['真实直接','修复速度快'],
            disadvantages: ['言语过激风险','事后后悔'],
            suggestions: ['触发清单与替代行为','情绪停顿练习','对事不对人']
        };
    } else if (bonding >= 70){
        return {
            name: '高黏附-温和反应',
            description: '更喜欢靠近与公开标记，但反应温和。通过“公开感+规则”，安全感就会变得很轻。',
            traits: ['靠近偏好','公开偏好','确认需求'],
            advantages: ['稳定投入','承诺感强'],
            disadvantages: ['空间压缩感','自主性受限'],
            suggestions: ['边界规则上线','回复预期约定','拓展个人时间']
        };
    }
    return {
        name: '平衡调适',
        description: '整体平衡，既能表达也能收放。保持“自我照顾+沟通仪式”的双轨前行即可。',
        traits: ['节奏平衡','从容应对','边界清晰'],
        advantages: ['双赢空间大','修复成本低'],
        disadvantages: ['压力期仍需预案'],
        suggestions: ['每周例会式沟通','危机预案小卡片','持续共创成长']
    };
}

function displayTopExplanation(index, level){
    const el = document.getElementById('explanationContent');
    let html = '';
    if (level.cls === 'danger'){
        html = `
            <p>你的病娇体质指数处于高区，这意味着在爱情里你会更强烈地追求“唯一的确认”和“不可替代的占有”。</p>
            <p>这份强度既代表着深情与投入，也可能让情绪像霓虹一样忽明忽暗、在爱与不安之间快速切换。</p>
            <p>建议先为自己点亮“理智临界线”：当强情绪来临时，做一次呼吸停顿，推迟反应30分钟；再回到事实与需求，降低误伤。</p>
        `;
    } else if (level.cls === 'high'){
        html = `
            <p>你的病娇体质偏高：你在亲密里更需要确认与靠近，对关系的专属感也更敏锐。</p>
            <p>只要给理智一点点舞台——例如约定消息回复的预期、固定“深聊仪式”，你就能把深情变成稳定的陪伴力。</p>
        `;
    } else if (level.cls === 'medium'){
        html = `
            <p>你总体较为平衡：既能在乎也能克制，既愿意表达也尊重边界。</p>
            <p>继续保持“双轨”节奏：一条是自我照顾（兴趣、自我时间），一条是亲密联结（固定的情绪对话），两者相互托举。</p>
        `;
    } else {
        html = `
            <p>你更偏理性与稳定，面对情绪波动能保持自持，具备让关系“降噪”的能力。</p>
            <p>适度增加表达与小确幸的仪式感，会让你的稳更有温度，也让对方清晰被爱。</p>
        `;
    }
    el.innerHTML = html;
}

function displayTopSuggestions(level){
    const list = document.getElementById('suggestionsList');
    let items = [];
    switch (level.cls){
        case 'danger':
            items = [
                '“三段式复盘”：触发-情绪-需求（避免贴标签与指责）',
                '制定“争吵停用词”与冷静通道（短暂分开+定点再聊）',
                '每周一次深聊仪式：确认彼此在意与边界',
                '把“查看/控制”改为“透明与约定”（行程/回复预期）'
            ];
            break;
        case 'high':
            items = [
                '记录触发点，找出“安全感按钮”，对症约定',
                '保留固定个人时间（运动/兴趣/朋友）作为情绪缓冲',
                '建立“重要话题清单”，按清单而非情绪走'
            ];
            break;
        case 'medium':
            items = [
                '巩固每周的高质量相处（约会或共同任务）',
                '定期自检理智阈值：最近一次冲突如何降噪？',
                '把“我感受”作为开场语，减少误读'
            ];
            break;
        default:
            items = [
                '适度增加“我在乎你的证据”（小卡片/语音/即时回应）',
                '继续保持开放沟通与共情，勿过度理性化情绪'
            ];
    }
    list.innerHTML = items.map(t => `
        <div class="suggestion-item">
            <span class="suggestion-icon">✓</span><span>${t}</span>
        </div>
    `).join('');
}


