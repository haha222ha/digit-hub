// 渣女测试题库与逻辑
// 评分：A-F 分别 1-6
const zhanuQuestions = [
    { q: "当你和伴侣发生争执时，你通常会怎么做：", opts: ["冷静沟通，寻找解决办法","暂时离开，冷静后再处理","担心争执影响感情，主动妥协","无所谓，大不了换一个","考虑争执是否影响自己的利益","情绪拉满，可能会有过激行为"] },
    { q: "你如何看待金钱在感情中的作用：", opts: ["够用就好，感情更重要","经济独立很重要，但感情也不能忽视","为了家庭，愿意牺牲自己的经济利益","对方的钱就是我的钱，随便花","对方的经济条件是重要考量因素","钱是我的，对方靠边"] },
    { q: "当朋友遇到困难向你求助时，你会：", opts: ["尽力帮助，不计回报","分析情况，提供实际建议","优先考虑自己家庭责任","找借口推脱，不想麻烦","考虑是否对自己有好处","不耐烦，觉得对方烦"] },
    { q: "你对未来的规划更倾向于：", opts: ["和伴侣共同奋斗，相互支持","专注于自己的事业发展","以家庭和孩子为中心","享受当下，不想太多","寻找经济条件好的伴侣","姐先管好自己，顾不上他人"] },
    { q: "当你发现伴侣有缺点时，你会：", opts: ["理解并包容，帮助对方改进","理性沟通，希望对方改变","来，干了这碗“丝瓜汤”（接受摆烂，继续好好生活吧）","无法接受，考虑分手","权衡利弊，看是否影响自己","指责对方，甚至贬低对方"] },
    { q: "你如何处理异性的示好？", opts: ["明确拒绝，保持距离","礼貌回应，但保持界限","担心影响家庭，赶紧躲开","享受被追求的感觉，不拒绝","考虑对方的条件，再决定","觉得对方烦，一个字“滚”"] },
    { q: "在家庭责任分配上，你认为：", opts: ["应该共同承担，相互理解","根据各自能力合理分配","自己多承担一些，让家人轻松","尽量少承担，享受就好","对方应该承担更多","对方必须听我的安排"] },
    { q: "当你感到压力很大时，你会：", opts: ["和伴侣或朋友倾诉","自己想办法解决，不麻烦别人","为了家人，默默承受","通过购物或娱乐发泄","寻找能帮助自己的人","对身边的人发脾气"] },
    { q: "你怎么看待婚姻？", opts: ["相互扶持，共同成长","是人生的重要阶段，但不是全部","是生活的中心，需要用心经营","又不一定长久，开心就好啦","很想提升自己的生活品质","是一种束缚，我要掌控他"] },
    { q: "遇到价值观不同的伴侣，你会：", opts: ["尊重差异，求同存异","理性讨论，寻找平衡点","为了和谐，委屈自己迁就对方","无法接受，我想要改变对方","看是否影响自己的利益","强迫对方认同自己"] },
    { q: "你怎么来看待自己的事业？", opts: ["重要，但家庭更重要","非常重要，是自我价值的体现","我能兼顾家庭和事业","不重要，开心就好","可以提升自己的魅力","是自己掌控生活的手段"] },
    { q: "当你需要做重要决定时，你会怎么做：", opts: ["和伴侣商量，共同决定","自己分析，也会听取他人建议","优先考虑家人的意见","凭感觉，随意就好","考虑对自己利益最大的选择","自己决定就好，管别人干嘛"] },
    { q: "伴侣的前任你如何处理？", opts: ["尊重过去，相信伴侣","理性看待，不过分纠结","虽然在意，但为了家庭选择信任","无法接受，经常提起","比较自己和前任的优缺点","心理不舒服，无理瞎闹"] },
    { q: "你怎么看待社交活动？", opts: ["喜欢和朋友相处，分享快乐","选择性参加，选择质量高的","更愿意陪伴家人","喜欢热闹，享受被关注","有价值的人脉也在，我才参加","不喜欢，只想躺着"] },
    { q: "当伴侣忘记重要的日子时，你会：", opts: ["理解对方可能忙，提醒一下","沟通表达自己的感受","有点委屈，但不发作","非常生气，觉得对方不在乎","考虑对方是否值得继续","指责对方，破口大骂"] },
    { q: "你如何看待伴侣的缺点？", opts: ["人无完人，包容理解","可以接受，但希望改进","为了家庭，选择看不见","无法容忍，经常抱怨","看是否影响自己的利益","无法接受，必须改变"] },
    { q: "在教育孩子方面，你更倾向于：", opts: ["注重孩子的身心健康和快乐","注重培养孩子的独立能力","愿意为孩子付出一切","太麻烦了，不太想管","希望孩子将来有出息，给自己争光","严格要求，甚至体罚"] },
    { q: "当你和伴侣的家人发生矛盾时，你会：", opts: ["尽量化解，维护家庭和谐","理性处理，保持界限","为了伴侣，选择妥协","无法容忍，可能会吵架","考虑对自己的影响","我是对的，那就“干到底”"] },
    { q: "你如何看待浪漫和仪式感？", opts: ["重要，可以增进感情","有一定必要，但不过度追求","为了家人，可以创造一些小惊喜","无所谓，可有可无","希望对方为自己创造","我本佛系，万物皆空"] },
    { q: "当你发现伴侣撒谎时，你会：", opts: ["了解原因，给予信任","沟通清楚，看看是否值得原谅","为了家庭，选择相信","无法接受，立即分手","考虑对方的动机和影响","妹要报复"] },
    { q: "你对自我提升的态度是：", opts: ["持续学习，和伴侣共同进步","非常重视，不断提升自己","在照顾家庭之余，尽量提升","觉得麻烦，不想努力","看是否对自己有利","觉得自己已经很好，不需要提升"] },
    { q: "当你和伴侣的兴趣爱好不同，你会：", opts: ["尊重差异，尝试理解","各自保留，互不干涉","为了伴侣，尝试接受","无所谓，可能会吵架","看是否对自己有好处","贬低对方的爱好"] },
    { q: "你如何看待伴侣的异性朋友？", opts: ["相信伴侣，给予空间","保持理性，不过分敏感","虽然在意，但选择信任","无所谓，可有可无","比较自己和对方的优劣","怀疑，可能会跟踪或查岗"] },
    { q: "在消费观念上，你更倾向于：", opts: ["适度消费，注重品质","理性消费，注重性价比","优先考虑家庭和孩子的需求","及时行乐，喜欢就买","注重品牌和面子","控制欲拉满，要求对方按照自己的方式消费"] },
    { q: "当你感到疲惫时，你希望伴侣：", opts: ["给予关心和安慰","理解并支持自己","主动分担家务","哄自己开心","为自己提供帮助","离我远一点"] },
    { q: "伴侣的成功你怎么期待？", opts: ["觉得对方很棒，共同分享","认可对方的努力，并向他学习","为家庭感到高兴","觉得对方应该对自己更好","看是否能给自己带来好处","怎么感觉有点护城河啊"] },
    { q: "在处理家务方面，你怎么看：", opts: ["应该共同承担，相互理解","根据各自时间合理分配","自己多做一些，让家人轻松","尽量少做，享受就好","对方应该承担更多","我说怎么做对方就应该听我的"] },
    { q: "你如何看待长期关系中的平淡期？", opts: ["正常，需要用心经营","可以接受，生活本来就是平淡的","为了家庭，愿意维持","无法忍受，想要新鲜感","考虑是否值得继续","感到焦虑，可能会找借口吵架"] },
    { q: "当伴侣需要你的支持时，你会：", opts: ["尽力支持，给予鼓励","提供实际帮助和建议","放下自己的事情，优先帮助","看自己是否方便","考虑是否对自己有好处","可能会不耐烦"] },
    { q: "你对未来的期望是：", opts: ["家庭幸福，平淡温馨","事业有成，实现自我价值","孩子健康成长，家庭美满","自由自在，快乐就好","生活优渥，被人羡慕","妹想干啥就干啥，不受约束"] }
  ];
  
  const TOTAL_Q = zhanuQuestions.length;
  const answers = new Array(TOTAL_Q);
  const scoreMap = [1,2,3,4,5,6];
  
  // 选择器
  const progressBar = document.getElementById('progressBar');
  const questionInfo = document.getElementById('questionInfo');
  const questionTitle = document.getElementById('questionTitle');
  const optionsList = document.getElementById('optionsList');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  
  let current = 0;
  let jumpTimer = null;
  
  function renderQuestion() {
    const item = zhanuQuestions[current];
    questionInfo.textContent = `第 ${current + 1} 题 / 共 ${TOTAL_Q} 题`;
    questionTitle.textContent = item.q;
    optionsList.innerHTML = '';
    optionsList.classList.remove('fade-in');
    void optionsList.offsetWidth; // 触发重绘
    optionsList.classList.add('fade-in');
    
    item.opts.forEach((text, idx) => {
      const card = document.createElement('div');
      card.className = 'option-card';
      card.innerHTML = `
        <input type="radio" name="answer" value="${scoreMap[idx]}" class="option-radio" id="option${idx}">
        <span class="option-letter">${String.fromCharCode(65 + idx)}</span>
        <label for="option${idx}">${text}</label>
      `;
      if (answers[current] === scoreMap[idx]) {
        card.classList.add('selected');
        card.querySelector('input').checked = true;
      }
      card.addEventListener('click', () => selectOption(card, scoreMap[idx]));
      optionsList.appendChild(card);
    });
    updateButtons();
    updateProgress();
  }
  
  function selectOption(el, score) {
    document.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected', 'selecting');
    answers[current] = score;
    updateButtons();
    // 取消上一次未执行的跳转，防止快速点击导致多次跳转
    if (jumpTimer) {
      clearTimeout(jumpTimer);
      jumpTimer = null;
    }
    // 选中后延迟 400ms 跳转，让用户看到选择效果
    jumpTimer = setTimeout(() => {
      jumpTimer = null;
      goNext();
    }, 400);
  }
  
  function updateButtons() {
    prevBtn.disabled = current === 0;
    nextBtn.disabled = answers[current] == null;
    nextBtn.textContent = current === TOTAL_Q - 1 ? '查看分析结果' : '下一题';
  }
  
  function updateProgress() {
    progressBar.style.width = `${((current + 1) / TOTAL_Q) * 100}%`;
  }
  
  function goPrev() {
    if (current === 0) return;
    current--;
    renderQuestion();
  }
  
  function goNext() {
    if (current >= TOTAL_Q - 1) {
      finishTest();
    } else {
      current++;
      renderQuestion();
    }
  }
  
  async function finishTest() {
    const totalScore = answers.reduce((s, v) => s + (v || 0), 0);
    // 指数映射（正负差值算法）：
    // 暖女指数 = A出现次数 - F出现次数
    // 独立指数 = B出现次数 - D出现次数
    // 情感投入 = C出现次数 - E出现次数
    const warmIdx = calcAxis([1], [6]);    // A vs F
    const indIdx  = calcAxis([2], [4]);    // B vs D
    const loveIdx = calcAxis([3], [5]);     // C vs E

    // 计算每项正面/负面出现的次数，用于结果展示
    const warmPos = answers.filter(v => v === 1).length;   // A
    const warmNeg = answers.filter(v => v === 6).length;   // F
    const indPos  = answers.filter(v => v === 2).length;   // B
    const indNeg  = answers.filter(v => v === 4).length;   // D
    const lovePos = answers.filter(v => v === 3).length;   // C
    const loveNeg = answers.filter(v => v === 5).length;   // E

    const resultType = pickType(totalScore);

    const result = {
      totalScore,
      warmIdx,
      indIdx,
      loveIdx,
      warmPos,
      warmNeg,
      indPos,
      indNeg,
      lovePos,
      loveNeg,
      type: resultType,
      answers,
      ts: Date.now()
    };

    // 优先使用SDK的token保存结果，如果没有则生成本地token
    let token = null;
    if (window.linkValidator && window.linkValidator.token) {
        token = window.linkValidator.token;
    } else {
        token = 'local_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    }

    // 保存结果到localStorage（使用SDK的token作为key）
    const storageKey = `zhanu_result_${token}`;
    try {
        const resultData = {
            token: token,
            result: result,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(storageKey, JSON.stringify(resultData));
    } catch (error) {
        console.error('保存到localStorage失败:', error);
    }

    // 调用测试完成API（必须await，等待完成后才跳转）
    if (window.linkValidator) {
        try {
            await window.linkValidator.completeTest(undefined, result);
            console.log('测试完成记录成功');
        } catch (error) {
            console.error('记录测试完成失败:', error);
            // API调用失败，但结果已保存到localStorage，仍然可以显示报告
        }
    }

    // 构建报告页面URL（需要包含token以便SDK验证）
    let reportUrl = 'zhanu_result.html';
    const urlParams = new URLSearchParams();

    // 获取token和测试模式
    const finalToken = window.linkValidator && window.linkValidator.token || token;
    const isUnlimited = window.linkValidator && window.linkValidator.unlimited;

    // 如果是无限测试模式，添加unlimited和token参数
    if (isUnlimited && finalToken) {
        urlParams.set('unlimited', 'true');
        urlParams.set('token', finalToken);
    } else if (finalToken) {
        urlParams.set('token', finalToken);
    }

    // 构建完整的URL
    const queryString = urlParams.toString();
    if (queryString) {
        reportUrl = `${reportUrl}?${queryString}`;
    }

    // 跳转到报告页
    window.location.href = reportUrl;
  }

  // 正负差值算法：正面 - 负面，结果映射到 0~100
  function calcAxis(posChoices, negChoices) {
    const pos = answers.filter(v => posChoices.includes(v)).length;
    const neg = answers.filter(v => negChoices.includes(v)).length;
    // 差值范围是 -TOTAL_Q 到 +TOTAL_Q，映射到 0~100
    const raw = pos - neg;
    return Math.round(((raw + TOTAL_Q) / (TOTAL_Q * 2)) * 100);
  }
  
function pickType(score) {
  if (score <= 40) return '暖女';
  if (score <= 75) return '宝妈女';
  if (score <= 105) return '凤凰女';
  if (score <= 135) return '渣女';
  if (score <= 165) return '捞女';
  return '家暴女';
}

prevBtn.addEventListener('click', goPrev);
nextBtn.addEventListener('click', goNext);

document.addEventListener('DOMContentLoaded', () => {
  renderQuestion();
});

  