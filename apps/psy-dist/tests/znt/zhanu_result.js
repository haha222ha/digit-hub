/**
 * 从URL参数获取token（优先从多个来源获取）
 * @returns {string|null} token值，如果不存在则返回null
 */
function getTokenFromURL() {
    // 方法1：从URL查询参数获取
    const urlParams = new URLSearchParams(window.location.search);
    let token = urlParams.get('token');

    // 方法2：如果URL中没有token，尝试从SDK实例获取
    if (!token && window.linkValidator && window.linkValidator.token) {
        token = window.linkValidator.token;
    }

    // 方法3：如果还是没有token，尝试从localStorage获取（从已保存的结果中）
    if (!token) {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('zhanu_result_')) {
                    const foundToken = key.replace('zhanu_result_', '');
                    if (foundToken && foundToken.length > 10) {
                        token = foundToken;
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('从localStorage获取token失败:', error);
        }
    }

    return token;
}

// 人格数据配置
const TYPE_PROFILES = {
  "暖女": {
    icon: "🌸",
    quote: "温柔是你最强的武器",
    desc: "你是一个非常温暖、善良的人，总是优先考虑他人的感受。在感情中，你善于倾听和理解伴侣的需求，愿意为对方付出。你的同理心和包容心让你成为周围人信赖的对象。",
    behaviors: [
      "总是记得重要的日子并准备小惊喜",
      "在对方遇到困难时给予支持和鼓励",
      "善于化解矛盾，避免冲突升级",
      "愿意为对方的幸福做出妥协"
    ],
    advice: [
      { icon: "💡", text: "学会设立健康的边界，过度付出可能让自己疲惫" },
      { icon: "💪", text: "偶尔也要照顾自己的感受，你同样值得被爱" },
      { icon: "🎯", text: "在包容的同时，表达自己的真实需求同样重要" }
    ],
    match: { type: "暖男", icon: "🤎", reason: "彼此都懂得珍惜和付出，能够相互温暖对方" }
  },
  "凤凰女": {
    icon: "🦋",
    quote: "你值得成为更好的自己",
    desc: "你追求成长与进步，也希望伴侣能与自己步调一致。你理性、独立，注重界限与平等，情感里既有热情也有自我约束，希望在亲密关系中实现「我」和「我们」的平衡。",
    behaviors: [
      "看重个人发展与自我提升",
      "沟通清晰，尊重边界和规则",
      "期待彼此共同进步、相互成就",
      "在情绪与理智间保持平衡"
    ],
    advice: [
      { icon: "💕", text: "学会在独立的同时接受依赖，偶尔示弱也是信任" },
      { icon: "🎭", text: "平衡理智与情感，给关系一些感性空间" },
      { icon: "🤝", text: "共同成长需要双方步调协调，多沟通期待" }
    ],
    match: { type: "上进男", icon: "💼", reason: "两人都有追求成长的心，能够相互激励共同进步" }
  },
  "宝妈女": {
    icon: "👶",
    quote: "家的温暖来自你的守护",
    desc: "你以家庭与孩子为重，重视安全与和谐。你有很强的责任感与包容力，会为家人付出并努力营造稳定的环境，也希望伴侣的理解与分担。",
    behaviors: [
      "以家庭为中心，注重稳定和和睦",
      "愿意为孩子和伴侣做出牺牲",
      "出现矛盾时倾向先顾全大局",
      "需要伴侣的陪伴与支持"
    ],
    advice: [
      { icon: "🌱", text: "在照顾家人的同时，别忘了自己的兴趣和社交" },
      { icon: "🗣️", text: "勇敢表达需求，让伴侣知道你的付出需要被看见" },
      { icon: "💝", text: "偶尔给自己放个假，你也需要被照顾" }
    ],
    match: { type: "顾家男", icon: "🏠", reason: "两人都重视家庭，能够一起营造温馨的家庭氛围" }
  },
  "渣女": {
    icon: "🔥",
    quote: "新鲜感诚可贵，真心价更高",
    desc: "你追求自由和新鲜感，可能更关注自我感受，对承诺和长期关系耐心不足。你享受被关注，也可能在情绪上更以自我为中心，需要留意平衡自我与他人需求。",
    behaviors: [
      "容易厌倦长期模式，偏爱新鲜感",
      "情绪波动时先考虑自己的感受",
      "在亲密关系里可能忽视对方需求",
      "更看重当下体验而非长远规划"
    ],
    advice: [
      { icon: "🔮", text: "深入了解自己的情感需求，是渴望刺激还是害怕承诺" },
      { icon: "💫", text: "学会珍惜眼前人，新鲜感可以与熟悉的人一起创造" },
      { icon: "⚖️", text: "在追求自由时，也给对方应有的尊重和安全感" }
    ],
    match: { type: "自由男", icon: "🕊️", reason: "给彼此足够的空间，但也能在需要时相互依靠" }
  },
  "捞女": {
    icon: "💎",
    quote: "现实不是贬义词，理性是成熟的表现",
    desc: "你更看重现实条件与资源匹配，会权衡成本收益，关注物质安全与生活品质。你善于争取对自己有利的选择，但也需要兼顾关系的情感面。",
    behaviors: [
      "择偶或决策时优先看条件与回报",
      "重视经济与生活质量的提升",
      "倾向利益最大化的选择",
      "会评估对自己未来的帮助与价值"
    ],
    advice: [
      { icon: "💖", text: "物质重要，但真挚的感情才是幸福的根基" },
      { icon: "⚖️", text: "学会平衡物质需求与情感需求，两者并不冲突" },
      { icon: "🤔", text: "条件是起点而非终点，用心经营才能长久" }
    ],
    match: { type: "稳定男", icon: "🏦", reason: "两人都重视生活保障，能够一起规划美好的未来" }
  },
  "家暴女": {
    icon: "⚠️",
    quote: "控制情绪，才能掌控人生",
    desc: "你在关系中可能有强控制与攻击倾向，情绪上头时容易走极端。需要警惕言语或行为的压迫对亲密关系造成伤害，学习情绪管理与尊重边界很重要。",
    behaviors: [
      "情绪失控时可能有言语或行为攻击",
      "控制欲强，要求对方服从自己的方式",
      "易忽视伴侣的感受与界限",
      "需要练习情绪调节与换位思考"
    ],
    advice: [
      { icon: "🧘", text: "情绪来临时先深呼吸，给自己10秒钟的冷静期" },
      { icon: "🗣️", text: "学会用语言表达需求，而非用情绪控制对方" },
      { icon: "💪", text: "建立健康的边界，控制不等于爱，平等才是" }
    ],
    match: { type: "包容男", icon: "🛡️", reason: "需要有足够耐心和包容力的人，同时也能帮助她成长" }
  }
};

// 雷达图绘制
function drawRadarChart(canvas, warm, ind, love) {
  const ctx = canvas.getContext('2d');
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = 100;
  
  const labels = ['暖女指数', '独立指数', '情感投入'];
  const values = [warm / 100, ind / 100, love / 100];
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 背景网格
  ctx.strokeStyle = 'rgba(232, 180, 184, 0.15)';
  ctx.lineWidth = 1;
  
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    const r = (radius * i) / 4;
    for (let j = 0; j <= 3; j++) {
      const angle = (Math.PI * 2 * j) / 3 - Math.PI / 2;
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  
  // 轴线
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    const angle = (Math.PI * 2 * i) / 3 - Math.PI / 2;
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
    ctx.stroke();
  }
  
  // 数据区域
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const angle = (Math.PI * 2 * i) / 3 - Math.PI / 2;
    const value = values[i];
    const x = centerX + Math.cos(angle) * radius * value;
    const y = centerY + Math.sin(angle) * radius * value;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  
  // 渐变填充
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, 'rgba(232, 180, 184, 0.4)');
  gradient.addColorStop(1, 'rgba(232, 180, 184, 0.1)');
  ctx.fillStyle = gradient;
  ctx.fill();
  
  // 描边
  ctx.strokeStyle = '#e8b4b8';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // 数据点
  for (let i = 0; i < 3; i++) {
    const angle = (Math.PI * 2 * i) / 3 - Math.PI / 2;
    const value = values[i];
    const x = centerX + Math.cos(angle) * radius * value;
    const y = centerY + Math.sin(angle) * radius * value;
    
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#e8b4b8';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  
  // 标签
  ctx.font = '12px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#c9c0b8';
  ctx.textAlign = 'center';
  
  for (let i = 0; i < 3; i++) {
    const angle = (Math.PI * 2 * i) / 3 - Math.PI / 2;
    const x = centerX + Math.cos(angle) * (radius + 25);
    const y = centerY + Math.sin(angle) * (radius + 25);
    ctx.fillText(labels[i], x, y);
  }
}

// 人格指数调整配置（基于用户答题结果，按人格类型做合理调整）
const TYPE_INDEX_MODIFIERS = {
  "暖女": { warm: 1.0, ind: 1.0, love: 1.0 },      // 保持原始值
  "凤凰女": { warm: 0.9, ind: 1.0, love: 0.85 },   // 降低情感投入，提高独立性
  "宝妈女": { warm: 0.95, ind: 0.6, love: 1.0 },  // 降低独立性
  "渣女": { warm: 0.5, ind: 0.8, love: 0.5 },      // 降低暖女和情感投入
  "捞女": { warm: 0.4, ind: 1.1, love: 0.35 },     // 大幅降低情感投入，提高独立
  "家暴女": { warm: 0.2, ind: 0.7, love: 0.2 }     // 大幅降低暖女和情感投入
};

// 主渲染函数
function render() {
  const token = getTokenFromURL();
  let data = null;

  if (token) {
    const storageKey = `zhanu_result_${token}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try { data = JSON.parse(stored); } catch (e) { console.error(e); }
    }
  }

  // 向后兼容：从旧的key获取
  if (!data) {
    const stored = localStorage.getItem('zhanu_result');
    if (stored) {
      try { data = JSON.parse(stored); } catch (e) { console.error(e); }
    }
  }

  if (!data) {
    window.location.href = 'zhanu_test.html';
    return;
  }

  // 提取结果数据（resultData可能是嵌套在data.result下，也可能直接在data下）
  const resultData = data.result || data;

  const profile = TYPE_PROFILES[resultData.type] || TYPE_PROFILES["渣女"];

  // 填充数据
  document.getElementById('typeName').textContent = resultData.type || '未知';
  document.getElementById('typeIcon').textContent = profile.icon;
  document.getElementById('typeQuote').textContent = `"${profile.quote}"`;
  document.getElementById('scoreVal').textContent = resultData.totalScore ?? 0;
  document.getElementById('featureDesc').textContent = profile.desc;

  // 指数（按人格类型调整）
  const mod = TYPE_INDEX_MODIFIERS[resultData.type] || { warm: 1, ind: 1, love: 1 };
  const warmVal = Math.min(100, Math.round((resultData.warmIdx ?? 0) * mod.warm));
  const indVal = Math.min(100, Math.round((resultData.indIdx ?? 0) * mod.ind));
  const loveVal = Math.min(100, Math.round((resultData.loveIdx ?? 0) * mod.love));
  document.getElementById('warmIdx').textContent = warmVal;
  document.getElementById('indIdx').textContent = indVal;
  document.getElementById('loveIdx').textContent = loveVal;
  
  // 绘制雷达图
  const canvas = document.getElementById('radarCanvas');
  setTimeout(() => drawRadarChart(canvas, warmVal, indVal, loveVal), 100);
  
  // 行为列表
  const behaviorList = document.getElementById('behaviorList');
  behaviorList.innerHTML = '';
  profile.behaviors.forEach(txt => {
    const li = document.createElement('li');
    li.textContent = txt;
    behaviorList.appendChild(li);
  });
  
  // 建议列表
  const adviceList = document.getElementById('adviceList');
  adviceList.innerHTML = '';
  profile.advice.forEach(item => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="advice-icon">${item.icon}</span><span>${item.text}</span>`;
    adviceList.appendChild(li);
  });
  
  // 配对信息
  document.getElementById('matchIcon').textContent = profile.match.icon;
  document.getElementById('matchType').textContent = profile.match.type;
  document.getElementById('matchReason').textContent = profile.match.reason;
}

// 页面加载完成后渲染 + 重新测试（回首页）
document.addEventListener('DOMContentLoaded', function () {
  render();
  const retryBtn = document.getElementById('retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', function (e) {
      e.preventDefault();

      // 清除SDK本地测试结果
      if (window.linkValidator && typeof window.linkValidator.clearLocalResult === 'function') {
        window.linkValidator.clearLocalResult();
        console.log('已清除SDK本地测试结果');
      }

      // 清除localStorage中的测试结果
      const token = getTokenFromURL();
      if (token) {
        const storageKey = `zhanu_result_${token}`;
        try {
          localStorage.removeItem(storageKey);
          console.log('已清除localStorage中的测试结果:', storageKey);
        } catch (error) {
          console.error('清除localStorage失败:', error);
        }
      }

      // 清除旧的key（向后兼容）
      localStorage.removeItem('zhanu_result');

      // 构建首页URL（需要包含token以便SDK验证）
      let indexUrl = 'index.html';
      const urlParams = new URLSearchParams();

      // 获取token和测试模式
      const currentUrlParams = new URLSearchParams(window.location.search);
      let currentToken = currentUrlParams.get('token');
      let isUnlimited = currentUrlParams.get('unlimited') === 'true';

      // 如果URL中没有token，尝试从SDK实例获取
      if (!currentToken && window.linkValidator && window.linkValidator.token) {
        currentToken = window.linkValidator.token;
        isUnlimited = window.linkValidator.unlimited || false;
      }

      // 如果有token，添加到URL参数
      if (currentToken) {
        if (isUnlimited) {
          urlParams.set('unlimited', 'true');
        }
        urlParams.set('token', currentToken);
        // 添加restart参数，告诉首页这是重新测试
        urlParams.set('restart', 'true');
      }

      // 构建完整的URL
      const queryString = urlParams.toString();
      if (queryString) {
        indexUrl = `${indexUrl}?${queryString}`;
      }

      window.location.href = indexUrl;
    });
  }
});
