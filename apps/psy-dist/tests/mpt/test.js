// 题库（按照用户提供问题，5级同意度）
const MILU_QUESTIONS = [
  '是否可以扔掉一切的自尊心换取更好的性体验？',
  '在情感关系中，如果伴侣能够为自己做正确的选择，自己会表现得非常听话？',
  '是否面对他人的痛苦感到无动于衷，甚至还有点享受？',
  '是否会对伴侣的精神出轨表现出强烈的排斥和不能容忍？',
  '面对自己喜欢的人是否会故意制造某些情景，寻求更多接触的机会？',
  '是否对不同的性行为都会有浓厚的兴趣，并且愿意积极地去尝试实践？',
  '是否常常会产生强烈的自我厌恶情绪？',
  '是否会喜欢那种想反抗又无力反抗的性体验？',
  '面对比自己弱的人，常常会产生优越感和看不起的态度？',
  '是否常常会幻想与多人同时发生性关系？',
  '是否感到自己心爱的东西或人被他人所占有而感到兴奋？',
  '是否会喜欢与伴侣进行性别互换的体验？',
  '是否并不太服从于规则或权威，总是会做一些违反规定的行为？',
  '是否会喜欢拍摄一些自己露骨的照片，并会有分享给陌生人看的冲动？',
  '在性关系中，是否会希望自己能够完全被束缚任由对方随便差遣？',
  '在性幻想中，是否有时会把自己代入异性的身份和视角来获得快感？',
  '是否会时刻想了解伴侣的行踪和人际关系？',
  '在性生活中，是否会希望伴侣被迫服从于自己？',
  '是否会认同性生活的精神上的共鸣比生理上的发泄重要很多？',
  '是否感到自己并不抗拒与同性好友之间亲密的肢体接触，并且非常喜欢？',
  '是否会把情感关系当成一种评估自身价值或段位的体现？',
  '是否为了满足自己的需求和感受有时会变得不择手段？',
  '是否对异性的身体和某些款式衣服会有羡慕或崇拜感，常常会幻想穿上它的样子？',
  '是否会因为被他人察觉自己浪荡的一面而感到异常的兴奋？',
  '是否会故意做一些恶作剧来吸引他人的注意和关注？',
  '对异性的某些贴身衣物是否会特别情有独钟，看到会情不自禁地陷入幻想？',
  '是否在某些情绪压力的刺激下会产生自我伤害的冲动？',
  '在性生活中，伴侣的反抗会让自己更兴奋？',
  '是否对极端暴力的行为有着特殊的迷恋？',
  '相比平等的情感关系，是否会更喜欢崇拜或仰慕自己的伴侣？',
  '有时某些生理的痛点会让自己产生愉悦感或兴奋感？',
  '是否有时会幻想在公共场合尝试性活动？',
  '假如自己无法满足伴侣的某些性需求，是否会支持让他人来满足？',
  '是否有时会对某些同性产生特殊的情感和幻想？',
  '在情感关系中，是否会常常在自尊心的驱使下故意说些违背自己意愿和感受的话？',
  '是否会把某些特定的物品和性幻想联系在一起？',
  '当面对某些情绪上头时总是变得非常暴躁，极度渴望通过暴力方式来宣泄？',
  '有时嗅觉上的刺激相比于视觉上的刺激会更有吸引力？',
  '在情感关系中通常表现得比较被动，希望对方来承担主导者的角色？',
  '是否会故意说一些气人的话或反话来试探伴侣的反应？',
  '面对弱势群体是否容易心生怜悯，觉得自己应该承担保护他们的责任？',
  '在情感关系中，一切尽在自己的掌控中对自己来说才是最安全的？',
  '面对他人的痛苦或求助，是否愿意积极地提供帮助和支持？',
  '在情感关系中，总会要求伴侣按照自己的意愿来行事？',
  '生活中是否会为了某些纪念节日而精心策划一番？',
  '在情感关系中，是否常常会产生强烈的不配感？',
  '是否常常无故对他人产生敌意和攻击性？',
  '是否对不确定的情感结果会表现得特别担忧和焦虑？',
  '长期一对一的性生活是否会让自己感到枯燥麻木？',
  '对于某些汗臭味和分泌物的味道并没有那么排斥，甚至有点迷恋？',
  '是否会经常利用肢体语言来传达自己的意图？',
  '是否认同性关系一定要建立在爱情的基础上？',
  '有时会喜欢用语言攻击或嘲讽别人来体现自己的优越感？',
  '是否会更喜欢以卑微乞求的状态来获得性满足？',
  '如果在保证安全的情况下，是否愿意尝试体验一下某些特殊的性派对？',
  '对于自己喜欢的人和东西是否会有特别强烈的执念，一定要占为己有？',
  '是否对未知不确定的事情会充满担忧和焦虑，常常难以做出决策？',
  '在性生活中，是否会特别注重前期的调情过程并实践？',
  '如果伴侣足够优秀的话，是否会非常乐意充当弱势的一方，并臣服于对方？',
  '是否会喜欢通过一些暗示性的行为或语言来诱导伴侣？',
  '被完全束缚所带来的性满足是否会让自己减轻很多道德上的压力或人设包袱？',
  '假如抛开道德和社会舆论的压力，是否会期待自己以异性的身份来生活？',
  '是否容易被弱小可爱的动物或人所吸引，并且缺乏抵抗力？',
  '是否对没有情感基础的对象不会产生任何的生理性冲动？',
  '在性关系中，只要伴侣有需求都会尽力配合并满足对方？',
  '是否对一些突破自己道德底线的性行为会表现得特别着迷？',
  '在性生活中，是否会希望伴侣在毫无抵抗力的情况下任自己为所欲为？',
  '面对自己喜欢的人是否会积极地展现自己性感的一面？'
];

const OPTIONS = [
  { text:'非常不认同', score:1 },
  { text:'比较不认同', score:2 },
  { text:'中立', score:3 },
  { text:'比较认同', score:4 },
  { text:'非常认同', score:5 }
];

const LABELS = ['虐待','羞辱','征服','控制','强迫','保护','受虐','屈辱','臣服','服从','被迫','叛逆','放纵','暴露','群体','跨性','同性','恋物','NTR','纯爱','诱导','情调'];

let idx = 0; let answers = [];
let progressBar, questionInfo, questionTitle, optionsList, prevBtn, nextBtn;

function init(){
  // 防止重复初始化
  if (typeof window.miluTestInitialized !== 'undefined' && window.miluTestInitialized) {
    return;
  }
  window.miluTestInitialized = true;
  
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
    prevBtn.addEventListener('click', prev);
  }
  if (nextBtn) {
    nextBtn.replaceWith(nextBtn.cloneNode(true));
    nextBtn = document.getElementById('nextBtn');
    nextBtn.addEventListener('click', next);
  }
  
  idx = 0;
  answers = [];
  render();
  updateProgress();
  updateButtons();
}

// 全局初始化函数，供外部调用
window.initMiluTest = init;

function render(){
  questionInfo.textContent = `第 ${idx+1} 题 / 共 ${MILU_QUESTIONS.length} 题`;
  questionTitle.textContent = MILU_QUESTIONS[idx];
  optionsList.innerHTML = '';
  OPTIONS.forEach((op, i)=>{
    const el = document.createElement('div');
    el.className = 'option-card';
    el.innerHTML = `<input type="radio" name="answer" value="${op.score}" class="option-radio" id="op${i}"><label for="op${i}">${op.text}</label>`;
    if (answers[idx] && answers[idx]===op.score){ el.classList.add('selected'); el.querySelector('input').checked = true; }
    el.addEventListener('click', ()=> select(el, op.score));
    optionsList.appendChild(el);
  });
}

function select(el, score){
  document.querySelectorAll('.option-card').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected'); answers[idx] = score; updateButtons();
  setTimeout(()=>{ if (idx < MILU_QUESTIONS.length-1) next(); }, 100);
}

function updateProgress(){ progressBar.style.width = (((idx+1)/MILU_QUESTIONS.length)*100) + '%'; }
function updateButtons(){ prevBtn.disabled = idx===0; nextBtn.disabled = answers[idx]==null; nextBtn.textContent = idx===MILU_QUESTIONS.length-1 ? '完成测试' : '下一题'; }
function prev(){ if (idx>0){ idx--; render(); updateProgress(); updateButtons(); } }
function next(){ if (idx<MILU_QUESTIONS.length-1){ idx++; render(); updateProgress(); updateButtons(); } else { finish(); } }

async function finish(){
  // 将题目按顺序轮询映射到22个维度，计算平均（0-5）
  const sums = new Array(LABELS.length).fill(0);
  const counts = new Array(LABELS.length).fill(0);
  answers.forEach((s, i)=>{ const k = i % LABELS.length; sums[k] += (s||0); counts[k]++; });
  const scores = LABELS.map((name, i)=>({ name, value: counts[i] ? (sums[i]/counts[i]) : 0 }));
  const result = { scores, date:new Date().toISOString() };
  
  // 构建测试结果对象
  const testResult = {
    scores: scores.map(s => ({ name: s.name, value: s.value })),
    completedAt: new Date().toISOString()
  };

  // 调用测试完成API（MPT是单视角测试）
  // 双重防重复机制：1. 检查window标志 2. 检查localStorage中的完成标志
  const completionFlagKey = `mpt_test_completed_${window.linkValidator ? window.linkValidator.token : ''}`;
  const alreadyCompleted = window.__mpt_test_completed || localStorage.getItem(completionFlagKey) === 'true';
  
  if (!alreadyCompleted && window.linkValidator) {
    try {
      window.__mpt_test_completed = true;
      // 在localStorage中标记已完成，防止刷新后重复调用
      localStorage.setItem(completionFlagKey, 'true');
      await window.linkValidator.completeTest(undefined, testResult);
      console.log('测试完成记录成功');
    } catch (error) {
      console.error('记录测试完成失败:', error);
      // 如果失败，清除标志，允许重试
      window.__mpt_test_completed = false;
      localStorage.removeItem(completionFlagKey);
    }
  } else if (alreadyCompleted) {
    console.log('检测到测试已完成，跳过completeTest调用（避免重复扣除次数）');
  }

  localStorage.setItem('miluPreferenceResult', JSON.stringify(result));
  
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
    init();
  }
});


