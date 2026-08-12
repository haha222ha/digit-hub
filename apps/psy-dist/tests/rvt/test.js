// 恋爱观测试题库（4维度×10题，共40题，1-5分）
const loveViewQuestions = [
  // 亲密需求 intimacy 1-10
  {id:1,cat:'intimacy',q:'在约会地点里，我更偏爱“温馨小馆/有氛围的咖啡店”。'},
  {id:2,cat:'intimacy',q:'我更向往“雨天一起窝在家”而不是“各自外出各忙各的”。'},
  {id:3,cat:'intimacy',q:'我喜欢用肢体接触（拥抱/牵手）来表达亲近。'},
  {id:4,cat:'intimacy',q:'我更乐于把日常小确幸第一时间分享给对方。'},
  {id:5,cat:'intimacy',q:'在假期，我会倾向安排“只属于我们”的二人时光。'},
  {id:6,cat:'intimacy',q:'如果只能二选一，我选“陪伴”胜过“昂贵礼物”。'},
  {id:7,cat:'intimacy',q:'我享受固定的“晚安/早安”互动仪式。'},
  {id:8,cat:'intimacy',q:'我偏爱安静但能靠近的相处（看电影/散步/阅读）。'},
  {id:9,cat:'intimacy',q:'纪念日会让我感觉到关系被认真地对待。'},
  {id:10,cat:'intimacy',q:'对我来说，“同频聊天”比“华丽活动”更重要。'},
  // 承诺倾向 commit 11-20
  {id:11,cat:'commit',q:'选择一只动物做关系的图腾，我会选“候鸟/企鹅”这类“长期陪伴”的意象。'},
  {id:12,cat:'commit',q:'我更喜欢“慢慢经营的长期关系”而非“强烈但短暂的火花”。'},
  {id:13,cat:'commit',q:'我愿意与对方讨论未来三年的愿景与安排。'},
  {id:14,cat:'commit',q:'我倾向公开关系（向亲友或在社交圈主动介绍）。'},
  {id:15,cat:'commit',q:'我认同“共同目标清单”能让关系稳定成长。'},
  {id:16,cat:'commit',q:'冲突对我来说是可修复的，我愿意迭代相处规则。'},
  {id:17,cat:'commit',q:'我愿意将重要日程（旅行/家庭计划）纳入共享日历。'},
  {id:18,cat:'commit',q:'我更欣赏对承诺与边界坦诚清晰的表达。'},
  {id:19,cat:'commit',q:'在关键节点我愿意优先考虑“我们”的利益。'},
  {id:20,cat:'commit',q:'若遇分歧，我更愿意通过第三方或资料查证来求同。'},
  // 独立边界 independence 21-30
  {id:21,cat:'indep',q:'在出游方式上，我更偏好“自由行”而非“全程跟团”。'},
  {id:22,cat:'indep',q:'我认为“各自拥有朋友圈/兴趣圈”很重要。'},
  {id:23,cat:'indep',q:'在工作/学习高峰期，我希望关系能给我不被打扰的窗口。'},
  {id:24,cat:'indep',q:'我更喜欢“透明+规则”的信任感，而不是互相检查。'},
  {id:25,cat:'indep',q:'我支持“各自保留个人小秘密”的边界。'},
  {id:26,cat:'indep',q:'短期异地或忙碌期对我而言是可被接受的。'},
  {id:27,cat:'indep',q:'在重要选择上，我希望保有最终决定权或共同投票。'},
  {id:28,cat:'indep',q:'我欣赏对方能专注自我成长而不是时刻围绕我。'},
  {id:29,cat:'indep',q:'我会明确表达我的底线与禁区。'},
  {id:30,cat:'indep',q:'我认同“亲密与自由”应该动态平衡。'},
  // 表达风格 express 31-40
  {id:31,cat:'express',q:'若用天气比喻我的表达风格，我更像“晴天/微风”，而非“闷雷/暴雨”。'},
  {id:32,cat:'express',q:'我会用小手作/便签/语音等方式表达在乎。'},
  {id:33,cat:'express',q:'我习惯用“我感受”而非“你总是”来开启沟通。'},
  {id:34,cat:'express',q:'情绪上头时，我愿意先冷静一段时间再沟通。'},
  {id:35,cat:'express',q:'吵完架后，我能主动发起修复对话。'},
  {id:36,cat:'express',q:'我愿意在重要节点（纪念日/节点）做一点小浪漫。'},
  {id:37,cat:'express',q:'我能包容对方与我不一样的表达节奏与风格。'},
  {id:38,cat:'express',q:'在价值观议题上，我会明确表达立场并尊重不同。'},
  {id:39,cat:'express',q:'我愿意学习更好的倾听/复述/共情技巧。'},
  {id:40,cat:'express',q:'遇到问题时，我会把情绪转化为可执行的行动建议。'},
];

function opts(){
  return [
    {text:'非常不同意',score:1},
    {text:'不同意',score:2},
    {text:'一般',score:3},
    {text:'同意',score:4},
    {text:'非常同意',score:5},
  ];
}

// 扩展为带选项
const questions = loveViewQuestions.map(item => ({
  id:item.id, category:item.cat, question:item.q, options:opts()
}));

let currentQuestionIndex = 0;
let answers = [];
const totalQuestions = questions.length;

let progressBar, questionInfo, questionTitle, optionsList, prevBtn, nextBtn;

function initTest(){
  // 防止重复初始化
  if (typeof window.loveViewTestInitialized !== 'undefined' && window.loveViewTestInitialized) {
    return;
  }
  window.loveViewTestInitialized = true;
  
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
  const q = questions[currentQuestionIndex];
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
        radio.checked = true; el.classList.add('selected');
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
  setTimeout(() => { if (currentQuestionIndex < totalQuestions - 1) goToNext(); }, 100);
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
    currentQuestionIndex--; showQuestion(); updateProgress(); updateButtons();
  }
}
function goToNext(){
  if (currentQuestionIndex < totalQuestions - 1){
    currentQuestionIndex++; showQuestion(); updateProgress(); updateButtons();
  } else { completeTest(); }
}

async function completeTest(){
  const intimacy = answers.slice(0,10).filter(Boolean).reduce((s,v)=>s+v,0);
  const commit = answers.slice(10,20).filter(Boolean).reduce((s,v)=>s+v,0);
  const indep = answers.slice(20,30).filter(Boolean).reduce((s,v)=>s+v,0);
  const express = answers.slice(30,40).filter(Boolean).reduce((s,v)=>s+v,0);
  const total = answers.reduce((s,v)=>s+(v||0),0);
  const minTotal = 40, maxTotal = 200;
  const lvi = Math.round(((total - minTotal) / (maxTotal - minTotal)) * 100);
  const result = { intimacy, commit, indep, express, total, lvi, answers, testDate:new Date().toISOString(), testType:'love_view' };
  
  // 构建测试结果对象
  const testResult = {
    intimacy,
    commit,
    indep,
    express,
    total,
    lvi,
    completedAt: new Date().toISOString()
  };

  // 调用测试完成API（RVT是单视角测试）
  // 双重防重复机制：1. 检查window标志 2. 检查localStorage中的完成标志
  const completionFlagKey = `rvt_test_completed_${window.linkValidator ? window.linkValidator.token : ''}`;
  const alreadyCompleted = window.__rvt_test_completed || localStorage.getItem(completionFlagKey) === 'true';
  
  if (!alreadyCompleted && window.linkValidator) {
    try {
      window.__rvt_test_completed = true;
      // 在localStorage中标记已完成，防止刷新后重复调用
      localStorage.setItem(completionFlagKey, 'true');
      await window.linkValidator.completeTest(undefined, testResult);
      console.log('测试完成记录成功');
    } catch (error) {
      console.error('记录测试完成失败:', error);
      // 如果失败，清除标志，允许重试
      window.__rvt_test_completed = false;
      localStorage.removeItem(completionFlagKey);
    }
  } else if (alreadyCompleted) {
    console.log('检测到测试已完成，跳过completeTest调用（避免重复扣除次数）');
  }

  localStorage.setItem('loveViewResult', JSON.stringify(result));
  
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
window.initLoveViewTest = initTest;

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


