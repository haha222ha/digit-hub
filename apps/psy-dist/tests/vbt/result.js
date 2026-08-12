// 你有多容易被人欺负测试结果处理
document.addEventListener('DOMContentLoaded', function() {
    // 从localStorage获取测试结果
    const testResult = JSON.parse(localStorage.getItem('possessivenessTestResult'));
    
    if (!testResult) {
        // 如果没有测试结果,重定向到测试页面
        window.location.href = 'index.html';
        return;
    }
    
    // 显示测试结果
    displayResults(testResult);
    
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
        localStorage.removeItem('possessivenessTestResult');
        
        // 重置测试完成标志（包括localStorage中的标志）
        window.__vbt_test_completed = false;
        const completionFlagKey = `vbt_test_completed_${window.linkValidator ? window.linkValidator.token : ''}`;
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

function displayResults(result) {
    const possessivenessIndex = result.possessivenessIndex;
    
    // 确定测试等级和人格类型
    const level = determineLevel(possessivenessIndex);
    const personalityType = determinePersonalityType(result);
    const attachmentType = determineAttachmentType(result);
    
    // 更新页面元素
    document.getElementById('possessivenessIndex').textContent = possessivenessIndex;
    document.getElementById('levelIndicator').textContent = level.name;
    document.getElementById('description').innerHTML = `你的被欺负指数为<span class="highlight">${possessivenessIndex}</span>,处于<span class="highlight">${level.name}</span>水平`;
    
    // 更新进度条
    const progressFill = document.getElementById('progressFill');
    progressFill.style.width = possessivenessIndex + '%';
    
    // 显示四个维度的分数
    displayDimensions(result);
    
    // 绘制雷达图
    drawRadarChart(result);
    drawAttachmentRadar(result);
    
    // 显示人格类型
    displayPersonalityType(level, personalityType);
    
    // 显示依恋类型
    displayAttachmentType(attachmentType);
    
    // 显示详细分数
    displayDetailedScores(result);
    
    // 显示顶部模块的结果解释和个性化建议
    displayTopExplanation(possessivenessIndex, level);
    displayTopSuggestions(level);
}

function displayDimensions(result) {
    // 边界感与拒绝能力
    document.getElementById('controlScoreDisplay').textContent = result.controlScore;
    const controlProgress = document.getElementById('controlProgress');
    controlProgress.style.width = ((result.controlScore / 50) * 100) + '%';
    
    // 自我主张与表达能力
    document.getElementById('jealousyScoreDisplay').textContent = result.jealousyScore;
    const jealousyProgress = document.getElementById('jealousyProgress');
    jealousyProgress.style.width = ((result.jealousyScore / 50) * 100) + '%';
    
    // 社交应对与冲突处理
    document.getElementById('dependenceScoreDisplay').textContent = result.dependenceScore;
    const dependenceProgress = document.getElementById('dependenceProgress');
    dependenceProgress.style.width = ((result.dependenceScore / 50) * 100) + '%';
    
    // 情绪管理与心理韧性
    document.getElementById('insecurityScoreDisplay').textContent = result.insecurityScore;
    const insecurityProgress = document.getElementById('insecurityProgress');
    insecurityProgress.style.width = ((result.insecurityScore / 50) * 100) + '%';
}

function drawRadarChart(result) {
    const canvas = document.getElementById('radarChart');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 320 * dpr;
    canvas.height = 320 * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const centerX = 160;
    const centerY = 160;
    const radius = 85;
    
    // 计算归一化值 (0-100)
    const control = (result.controlScore / 50) * 100;
    const jealousy = (result.jealousyScore / 50) * 100;
    const dependence = (result.dependenceScore / 50) * 100;
    const insecurity = (result.insecurityScore / 50) * 100;
    
    // 绘制网格
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    
    // 绘制同心圆
    for (let i = 1; i <= 5; i++) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * i / 5, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    // 绘制轴线
    const axes = 4;
    const labels = ['边界感与拒绝能力', '自我与表达', '社交应对与冲突处理', '情绪与心理'];
    
    for (let i = 0; i < axes; i++) {
        const angle = (Math.PI * 2 * i) / axes - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.stroke();
        
        // 绘制标签
        const labelX = centerX + Math.cos(angle) * (radius + 30);
        const labelY = centerY + Math.sin(angle) * (radius + 30);
        ctx.fillStyle = '#333';
        ctx.font = '14px Microsoft YaHei';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labels[i], labelX, labelY);
    }
    
    // 绘制数据区域
    ctx.fillStyle = 'rgba(255, 107, 157, 0.2)';
    ctx.strokeStyle = '#ff6b9d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    for (let i = 0; i < axes; i++) {
        const angle = (Math.PI * 2 * i) / axes - Math.PI / 2;
        let value;
        
        if (i === 0) value = control;
        else if (i === 1) value = jealousy;
        else if (i === 2) value = dependence;
        else value = insecurity;
        
        const r = (value / 100) * radius;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function drawAttachmentRadar(result) {
    const canvas = document.getElementById('attachRadar');
    if (!canvas) return;
  
    const dpr = window.devicePixelRatio || 1;
    const w = 320, h = 320;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
  
    const centerX = w / 2;
    const centerY = h / 2;
    const radius = 85;
  
    // 原始计算逻辑
    const anxiety = Math.min(80, Math.max(20, Math.round((result.insecurityScore / 50) * 60 + 20)));
    const avoidance = Math.min(80, Math.max(20, Math.round((50 - result.dependenceScore) / 50 * 60 + 20)));
    const fearful = Math.min(80, Math.max(20, Math.round(((result.insecurityScore + (50 - result.dependenceScore)) / 100) * 60 + 20)));
    const secure = Math.min(80, Math.max(20, Math.round((result.dependenceScore + (50 - result.insecurityScore)) / 100 * 60 + 20)));
    let values = [secure, anxiety, fearful, avoidance];
    const labels = ['安全型', '焦虑型', '恐惧型', '回避型'];
  
    // 获取主导依恋类型（文本显示）
    const at = determineAttachmentType(result);
    const dominant = at && at.name ? at.name : '';
  
    // 用主导类型“加权”雷达值，让图形和文字同步
    const mapIdx = { '安全型': 0, '焦虑型': 1, '恐惧型': 2, '回避型': 3 };
    if (mapIdx.hasOwnProperty(dominant)) {
      const idx = mapIdx[dominant];
      values = values.map((v, i) => (i === idx ? 80 : v * 0.8)); // 主导轴拉满，其他轴略降
    }
  
    // 绘制背景网格
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * i / 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  
    // 绘制数据区
    ctx.fillStyle = 'rgba(255, 46, 126, 0.18)';
    ctx.strokeStyle = '#ff2e7e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2;
      const r = (values[i] / 80) * radius;
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  
    // 高亮主导轴标签
    let leadIdx = mapIdx[dominant] ?? values.indexOf(Math.max(...values));
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI * 2 * i) / 4 - Math.PI / 2;
      const lx = centerX + Math.cos(angle) * (radius + 30);
      const ly = centerY + Math.sin(angle) * (radius + 30);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = i === leadIdx ? 'bold 14px "Microsoft YaHei"' : '14px "Microsoft YaHei"';
      ctx.fillStyle = i === leadIdx ? '#ff2e7e' : '#333';
      ctx.fillText(labels[i], lx, ly);
    }
  
    // 主导点高亮圆
    if (typeof leadIdx === 'number') {
      const angle = (Math.PI * 2 * leadIdx) / 4 - Math.PI / 2;
      const leadR = (values[leadIdx] / 80) * radius;
      const px = centerX + Math.cos(angle) * leadR;
      const py = centerY + Math.sin(angle) * leadR;
      ctx.beginPath();
      ctx.fillStyle = '#ff2e7e';
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
  
      ctx.font = '12px "Microsoft YaHei"';
      ctx.fillStyle = '#555';
      ctx.textAlign = 'center';
      ctx.fillText('主导依恋：' + (dominant || labels[leadIdx]), centerX, h - 12);
    }
  
    // 页面同步文字
    const el = document.getElementById('leadAttachment');
    if (el) el.textContent = dominant || labels[leadIdx] || '';
  
    // 调试日志（可删）
    console.debug('Radar Values:', { secure, anxiety, fearful, avoidance, dominant });
  }
  


function displayPersonalityType(level, personalityType) {
    // 标题与说明
    const levelTitle = document.getElementById('personalityLevel');
    if (levelTitle) levelTitle.textContent = personalityType.name;
    document.getElementById('personalityContent').textContent = personalityType.description;
    // 核心特征
    const traitsWrap = document.getElementById('personalityTraits');
    if (traitsWrap) {
        traitsWrap.innerHTML = '';
        const traits = personalityType.traits || [];
        traits.forEach(t => {
            const div = document.createElement('div');
            div.className = 'trait-pill';
            div.textContent = t;
            traitsWrap.appendChild(div);
        });
    }
    
    // 设置优点、缺点和建议
    const advantagesList = document.getElementById('advantagesList');
    advantagesList.innerHTML = '';
    personalityType.advantages.forEach(item => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.textContent = item;
        advantagesList.appendChild(div);
    });
    
    const disadvantagesList = document.getElementById('disadvantagesList');
    disadvantagesList.innerHTML = '';
    personalityType.disadvantages.forEach(item => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.textContent = item;
        disadvantagesList.appendChild(div);
    });
    
    const suggestionsList = document.getElementById('personalitySuggestionsList');
    suggestionsList.innerHTML = '';
    personalityType.suggestions.forEach(item => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.textContent = item;
        suggestionsList.appendChild(div);
    });
}

function displayAttachmentType(attachmentType) {
    const levelTitle = document.getElementById('attachmentLevel');
    if (levelTitle) levelTitle.textContent = attachmentType.name;
    document.getElementById('attachmentContent').textContent = attachmentType.description;
    // 核心特征
    const traitsWrap = document.getElementById('attachmentTraits');
    if (traitsWrap) {
        traitsWrap.innerHTML = '';
        const traits = attachmentType.traits || [];
        traits.forEach(t => {
            const div = document.createElement('div');
            div.className = 'trait-pill';
            div.textContent = t;
            traitsWrap.appendChild(div);
        });
    }
    
    const advantagesList = document.getElementById('attachmentAdvantagesList');
    advantagesList.innerHTML = '';
    attachmentType.advantages.forEach(item => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.textContent = item;
        advantagesList.appendChild(div);
    });
    
    const disadvantagesList = document.getElementById('attachmentDisadvantagesList');
    disadvantagesList.innerHTML = '';
    attachmentType.disadvantages.forEach(item => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.textContent = item;
        disadvantagesList.appendChild(div);
    });
    
    const suggestionsList = document.getElementById('attachmentSuggestionsList');
    suggestionsList.innerHTML = '';
    attachmentType.suggestions.forEach(item => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.textContent = item;
        suggestionsList.appendChild(div);
    });
}

function displayDetailedScores(result) {
    // 显示分数数字
    document.getElementById('controlDetailScore').textContent = result.controlScore;
    document.getElementById('jealousyDetailScore').textContent = result.jealousyScore;
    document.getElementById('dependenceDetailScore').textContent = result.dependenceScore;
    document.getElementById('insecurityDetailScore').textContent = result.insecurityScore;
    // 计算并显示Z分数(以10题*5分=50为满分,标准化到-1~+1附近,仅用于展示)
    const z = (score) => ((score - 25) / 25).toFixed(2);
    document.getElementById('controlZ').textContent = `Z分数:${z(result.controlScore)}`;
    document.getElementById('jealousyZ').textContent = `Z分数:${z(result.jealousyScore)}`;
    document.getElementById('dependenceZ').textContent = `Z分数:${z(result.dependenceScore)}`;
    document.getElementById('insecurityZ').textContent = `Z分数:${z(result.insecurityScore)}`;
}

function getScoreDesc(score) {
    if (score >= 40) return '很高';
    if (score >= 30) return '较高';
    if (score >= 20) return '中等';
    if (score >= 10) return '较低';
    return '很低';
}

function displayTopExplanation(possessivenessIndex, level) {
    const explanationContent = document.getElementById('explanationContent');
    
    let content = '';
    
    switch (level.class) { // 使用顶层指数区间来描述整体水位
        case 'very-high': // 161-200
            content = `
                <p>你的被欺负指数为${possessivenessIndex}分,处于「${level.name}」水平。</p>
                <p>这表明你在人际关系中自我保护能力非常薄弱,极易受到欺负。你几乎没有边界感,不敢拒绝别人,总是委屈自己。强烈建议寻求专业心理咨询帮助。</p>
            `;
            break;
            
        case 'high': // 121-160
            content = `
                <p>你的被欺负指数为${possessivenessIndex}分,处于「${level.name}」水平。</p>
                <p>这表明你在人际关系中比较容易被欺负。你害怕冲突,习惯性忍让和逃避,边界感较弱。需要学习如何表达自己的真实想法和感受。</p>
            `;
            break;
            
        case 'medium': // 81-120
            content = `
                <p>你的被欺负指数为${possessivenessIndex}分,处于「${level.name}」水平。</p>
                <p>这表明你在人际关系中有一定的自我保护意识,但还不够坚定。你渴望被认可,为了维持关系有时会过度妥协。建议练习设立边界和拒绝他人。</p>
            `;
            break;
            
        case 'low': // 40-80
            content = `
                <p>你的被欺负指数为${possessivenessIndex}分,处于「${level.name}」水平。</p>
                <p>这表明你有较强的自我保护能力,不容易被欺负。你有清晰的边界感,能够坚定地表达自己的想法,不害怕冲突。继续保持这种健康的人际交往模式。</p>
            `;
            break;
            
        case 'very-low': // 0-39 (理论上不太可能这么低)
            content = `
                <p>你的被欺负指数为${possessivenessIndex}分,处于「${level.name}」水平。</p>
                <p>这表明你拥有非常强的自我保护能力,几乎不可能被欺负。你自信、坚定,有明确的底线。注意在坚持原则的同时,也要保持适度的灵活性。</p>
            `;
            break;
    }
    
    explanationContent.innerHTML = content;
}

function displayTopSuggestions(level) {
    const suggestionsList = document.getElementById('suggestionsList');
    
    let suggestions = [];
    
    switch (level.class) {
        case 'very-high':
            suggestions = [
                '立即寻求专业心理咨询,建立自我价值感。',
                '远离持续伤害你的人和环境,寻找安全的支持系统。',
                '从最小的"不"开始练习,今天就拒绝一件你不想做的小事。',
                '每天写"我值得"清单,提醒自己值得被尊重。'
            ];
            break;
            
        case 'high':
            suggestions = [
                '学习表达不满的方式,温和但坚定的表达也很有力量。',
                '从安全的关系开始练习表达真实感受。',
                '认识到冲突不一定是坏事,健康的冲突可以解决问题。',
                '寻求心理咨询,调整回避型模式。'
            ];
            break;
            
        case 'medium':
            suggestions = [
                '从低风险场景开始练习拒绝,如拒绝推销。',
                '学习边界感话术,准备一些拒绝的句式。',
                '提升自我价值感,相信自己值得被尊重。',
                '区分"善良"和"软弱",学会在适当时候坚持。'
            ];
            break;
            
        case 'low':
            suggestions = [
                '继续保持这种健康的自我保护意识。',
                '在某些场合可以更加灵活一些。',
                '帮助身边容易被欺负的朋友建立边界。',
                '注意在坚持原则时保持温和的沟通方式。'
            ];
            break;
            
        case 'very-low':
            suggestions = [
                '保持你的自信和边界感,这是很珍贵的特质。',
                '在需要妥协的场合,学会战略性退让。',
                '用更柔和的方式表达,效果可能更好。',
                '继续帮助他人建立健康的人际边界。'
            ];
            break;
    }
    
    let html = '';
    suggestions.forEach(suggestion => {
        html += `
            <div class="suggestion-item">
                <span class="suggestion-icon">✓</span>
                <span>${suggestion}</span>
            </div>
        `;
    });
    
    suggestionsList.innerHTML = html;
}

function determineLevel(possessivenessIndex) {
    if (possessivenessIndex >= 80) {
        return {
            name: '极高(天生老好人)',
            class: 'very-high'
        };
    } else if (possessivenessIndex >= 60) {
        return {
            name: '很高(生气不敢表达)',
            class: 'high'
        };
    } else if (possessivenessIndex >= 40) {
        return {
            name: '一般(看心情发火)',
            class: 'medium'
        };
    } else if (possessivenessIndex >= 20) {
        return {
            name: '很低(笑着拒绝)',
            class: 'low'
        };
    } else {
        return {
            name: '极低(人狠话少)',
            class: 'very-low'
        };
    }
}

function determinePersonalityType(result) {
    const avgScore = (result.controlScore + result.jealousyScore + result.dependenceScore + result.insecurityScore) / 4;
    
    if (avgScore >= 40) {
        return {
            name: '极度脆弱型',
            description: '几乎完全丧失自我保护能力,极度缺乏自我价值感,任何人都可以随意侵犯你的边界。你不仅不敢反抗,甚至会为欺负你的人找借口。',
            traits: ['无边界感','极度自卑','不敢拒绝','严重自责'],
            advantages: [
                '善良温和',
                '不与人争',
                '善解人意',
                '包容性强'
            ],
            disadvantages: [
                '完全没有底线',
                '极易被利用',
                '长期委屈压抑',
                '可能有心理创伤'
            ],
            suggestions: [
                '立即寻求心理咨询',
                '远离有害关系',
                '建立最基本的底线',
                '加入支持小组'
            ]
        };
    } else if (avgScore >= 30) {
        return {
            name: '高度易受伤型',
            description: '自我保护能力很弱,极度害怕冲突和对抗,会本能地选择逃避、隐忍或沉默。你已经形成了"习得性无助"的模式。',
            traits: ['逃避冲突','习惯忍让','不敢表达','自我压抑'],
            advantages: [
                '温和友善',
                '避免冲突',
                '体贴他人',
                '忍耐力强'
            ],
            disadvantages: [
                '极度害怕冲突',
                '长期压抑情绪',
                '容易被忽视',
                '缺乏存在感'
            ],
            suggestions: [
                '学习表达不满',
                '从安全关系开始练习',
                '认识到冲突的积极面',
                '寻求专业帮助'
            ]
        };
    } else if (avgScore >= 20) {
        return {
            name: '讨好妥协型',
            description: '有一定自我意识但不够坚定,非常在意别人的看法。为了获得认可和避免冲突,常常做出超出自己意愿的事情。',
            traits: ['渴望认可','害怕拒绝','容易妥协','事后后悔'],
            advantages: [
                '善于维系关系',
                '考虑他人感受',
                '愿意付出',
                '责任心强'
            ],
            disadvantages: [
                '过度在意评价',
                '边界感不清',
                '容易焦虑',
                '委屈自己'
            ],
            suggestions: [
                '练习说"不"',
                '提升自我价值感',
                '区分善良和软弱',
                '从小事开始坚持'
            ]
        };
    } else {
        return {
            name: '自我保护型',
            description: '拥有强大的自我保护意识和清晰的边界感,很难被人欺负。你自信、坚定,敢于表达真实想法,不会为了表面和谐而委屈自己。',
            traits: ['边界清晰','自信坚定','敢于表达','不怕冲突'],
            advantages: [
                '自我价值感强',
                '能保护自己',
                '敢于说不',
                '独立自主'
            ],
            disadvantages: [
                '有时过于强硬',
                '可能显得不够温和',
                '需要注意方式'
            ],
            suggestions: [
                '保持这种自我保护能力',
                '适度保持灵活性',
                '用温和方式表达',
                '帮助他人建立边界'
            ]
        };
    }
}

function determineAttachmentType(result) {
    const totalInsecurity = result.insecurityScore + result.dependenceScore;
    // alert(result.insecurityScore);
    // alert(result.dependenceScore);
    if (totalInsecurity >= 70) {
        return {
            name: '恐惧型',
            description: '既渴望亲密关系又害怕靠近别人,这种矛盾让你陷入深深的痛苦。极度缺乏自我价值感,几乎没有边界感。',
            traits: ['矛盾痛苦','渴望又恐惧','极度自卑','无边界感'],
            advantages: [
                '情感细腻',
                '善于观察',
                '同理心强',
                '珍惜关系'
            ],
            disadvantages: [
                '内心极度矛盾',
                '严重缺乏安全感',
                '容易陷入有害关系',
                '可能有创伤经历'
            ],
            suggestions: [
                '必须寻求专业心理咨询',
                '进行创伤疗愈',
                '建立基本自我价值感',
                '远离有害环境'
            ]
        };
    } else if (totalInsecurity >= 50) {
        return {
            name: '焦虑型',
            description: '渴望被接纳和认可,但又害怕被拒绝。过度关注他人反应,为了获得认可常常妥协自己的需求和感受。',
            traits: ['渴望认可','害怕拒绝','过度敏感','容易焦虑'],
            advantages: [
                '关注关系质量',
                '善于照顾他人',
                '情感投入度高',
                '忠诚度强'
            ],
            disadvantages: [
                '过度在意评价',
                '容易焦虑不安',
                '边界感不清',
                '委屈自己'
            ],
            suggestions: [
                '建立自我价值感',
                '学会信任自己',
                '练习设立边界',
                '降低对他人认可的依赖'
            ]
        };
    } else if (totalInsecurity >= 30) {
        return {
            name: '回避型',
            description: '极度害怕冲突,习惯性选择逃避、忍让和沉默。你不是不知道被欺负,但选择"算了""忍一忍"。',
            traits: ['逃避冲突','习惯忍让','情绪压抑','不敢表达'],
            advantages: [
                '温和平静',
                '不制造冲突',
                '独立性强',
                '自我消化能力强'
            ],
            disadvantages: [
                '极度恐惧冲突',
                '长期压抑情绪',
                '不会表达需求',
                '容易积累怨气'
            ],
            suggestions: [
                '学习表达真实感受',
                '认识冲突的必要性',
                '从安全关系开始练习',
                '寻求心理支持'
            ]
        };
    } else {
        return {
            name: '安全型',
            description: '拥有健康的自我保护意识,有清晰的边界感,既能维护自己的权益,也能尊重他人。不害怕冲突,能够坚定而温和地表达自己。',
            traits: ['边界清晰','自信坚定','沟通良好','情绪稳定'],
            advantages: [
                '自我保护能力强',
                '不容易被欺负',
                '能坚定表达立场',
                '关系健康平衡'
            ],
            disadvantages: [
                '有时可能过于理想化',
                '需要持续维护边界'
            ],
            suggestions: [
                '继续保持健康边界',
                '适度保持灵活性',
                '帮助他人建立边界',
                '持续自我成长'
            ]
        };
    }
}