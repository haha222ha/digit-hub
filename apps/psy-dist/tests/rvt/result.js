document.addEventListener('DOMContentLoaded', function(){
  const result = JSON.parse(localStorage.getItem('loveViewResult'));
  if (!result){ window.location.href = 'index.html'; return; }
  render(result);
  
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
    localStorage.removeItem('loveViewResult');
    
    // 重置测试完成标志（包括localStorage中的标志）
    window.__rvt_test_completed = false;
    const completionFlagKey = `rvt_test_completed_${window.linkValidator ? window.linkValidator.token : ''}`;
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

function render(r){
  const lvi = clamp(Math.round(r.lvi),0,100);
  const level = levelOf(lvi);
  text('lviScore', lvi);
  text('levelIndicator', level.name);
  html('description', `你的恋爱观指数为<span class="highlight">${lvi}</span>，整体倾向：<span class="highlight">${level.name}</span>`);
  styleWidth('progressFill', lvi+'%');
  // dims
  dim('intimacy', r.intimacy);
  dim('commit', r.commit);
  dim('indep', r.indep);
  dim('express', r.express);
  // details
  text('intimacyDetail', r.intimacy); text('commitDetail', r.commit); text('indepDetail', r.indep); text('expressDetail', r.express);
  text('intimacyZ', `Z分数：${z(r.intimacy)}`);
  text('commitZ', `Z分数：${z(r.commit)}`);
  text('indepZ', `Z分数：${z(r.indep)}`);
  text('expressZ', `Z分数：${z(r.express)}`);
  // charts
  drawRadar(r);
  drawStyleRadar(r);
  // types
  const p = determinePersonality(r);
  const a = determineAttachment(r);
  displayPersonalityType(p);
  displayAttachmentType(a);
  // explanations
  explanation(level);
  suggestions(level);
}

function dim(key, score){
  text(key+'Display', score);
  styleWidth(key+'Progress', ((score/50)*100)+'%');
}

function levelOf(lvi){
  if (lvi>=80) return {name:'极高（恋爱观天花板）',cls:'very-high'};
  if (lvi>=60) return {name:'较高（恋爱不迷路）',cls:'high'};
  if (lvi>=40) return {name:'一般（半梦半醒）',cls:'medium'};
  if (lvi>=20) return {name:'较低（三分钟清醒）',cls:'low'};
  return {name:'极低（为爱痴狂）',cls:'very-low'};
}

function explanation(level){
  let htmlStr='';
  switch(level.cls){
    case 'very-high':
      htmlStr = `<p>你对亲密有深度理解，对承诺有责任感，对独立有尊重，对表达有温度。你不会在爱情中“溺爱”或“冷处理”，而是能在人性复杂的情境里保持平衡。你的恋爱观正得刚刚好——不是冷静到疏离，而是清醒中带柔光。</p><p>你是少数能把爱做到“有质量”的人。别因为这个世界的浮躁，怀疑自己坚持的温度。</p>`;break;
    case 'high':
      htmlStr = `<p>你的恋爱观已经非常健康。你能平衡“亲密”与“独立”，会沟通、懂修复、不内耗。你不会把爱当做逃避，也不会因为关系失控而否定自我。你的伴侣通常会感受到安全、被理解、又不被束缚。</p><p>保持这种“柔中带界”的状态。不要因为别人情绪的波动，去质疑自己的稳定。</p>`;break;
    case 'medium':
      htmlStr = `<p>你已经具备了较成熟的恋爱观，懂得亲密需要沟通、自由需要边界。但当情绪起伏或冲突出现时，你可能会临时“退化”——要么封闭自己，要么过度解释。</p><p>你已经具备了较成熟的恋爱观，懂得亲密需要沟通、自由需要边界。但当情绪起伏或冲突出现时，你可能会临时“退化”——要么封闭自己，要么过度解释。</p>`;break;
    case 'low': 
      htmlStr = `<p>你在爱情里的姿态常常是矛盾的：一方面渴望被在乎，另一方面又怕被束缚。你懂得理性，却总被情绪反噬。承诺对你来说既安全又沉重，亲密让你安心，也让你焦虑。</p><p>你需要学习“情绪稳定下的亲密”。恋爱不是考试，不需要每次都对，只要彼此能共同成长。</p>`;break;
    default:
      htmlStr = `<p>你的恋爱观目前非常依赖情绪驱动，容易在关系中“失重”——想要亲密，却常常忽略自我界限。你可能会陷入“他开心我才安心”的循环。在爱情里，你倾向于“全身心投入”，但也因此容易被忽视、被操控。</p><p>在投入之前，先确认自己是否被尊重。真正的爱不是“把自己消失”，而是“两个完整的人同行”。</p>`;break;
  }
  html('explanationContent', htmlStr);
}

function suggestions(level){
  let arr=[];
  switch(level.cls){
    case 'very-high':
      arr=['每周1次高质量相处','重要议题清单化','月度小回顾'];break;
    case 'high':
      arr=['明确联系频率预期','共享年度/季度计划','设置冲突停用词'];break;
    case 'medium':
      arr=['独立时间固定为日程','透明替代监控','确定争吵流程卡'];break;
    case 'low':
      arr=['建立亲密边界','明确替代方案','适当寻求第三方辅导'];break;
    default:
      arr=['从一个维度先建立共识','复盘触发点并找可行替代','必要时寻求第三方辅导'];break;
  }
  const htmlStr = arr.map(t=>`
    <div class="suggestion-item"><span class="suggestion-icon">✓</span><span>${t}</span></div>
  `).join('');
  html('suggestionsList', htmlStr);
}

// Radar charts
function drawRadar(r){
  const canvas = document.getElementById('radarChart'); if (!canvas) return;
  const dpr = window.devicePixelRatio || 1; canvas.width = 320*dpr; canvas.height=320*dpr; const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  const cx=160, cy=160, R=85; const vals=[r.intimacy, r.commit, r.indep, r.express].map(s=>Math.min(100,(s/50)*100));
  const labels=['亲密需求','承诺倾向','独立边界','表达风格'];
  ctx.strokeStyle='#e0e0e0'; for(let i=1;i<=5;i++){ ctx.beginPath(); ctx.arc(cx,cy,R*i/5,0,Math.PI*2); ctx.stroke(); }
  for(let i=0;i<4;i++){ const ang=(Math.PI*2*i)/4 - Math.PI/2; const x=cx+Math.cos(ang)*R, y=cy+Math.sin(ang)*R; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(x,y); ctx.stroke(); const lx=cx+Math.cos(ang)*(R+30), ly=cy+Math.sin(ang)*(R+30); ctx.fillStyle='#333'; ctx.font='14px Microsoft YaHei'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(labels[i], lx, ly);} 
  ctx.fillStyle='rgba(255, 138, 0, 0.18)'; ctx.strokeStyle='#ff8a00'; ctx.lineWidth=3; ctx.beginPath();
  for(let i=0;i<4;i++){ const ang=(Math.PI*2*i)/4 - Math.PI/2; const r0=(vals[i]/100)*R; const x=cx+Math.cos(ang)*r0, y=cy+Math.sin(ang)*r0; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.closePath(); ctx.fill(); ctx.stroke();
}

function drawStyleRadar(r){
  const canvas = document.getElementById('attachRadar'); if (!canvas) return;
  const dpr=window.devicePixelRatio||1; canvas.width=320*dpr; canvas.height=320*dpr; const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  const cx=160, cy=160, R=85;
  // 四风格：亲密派、承诺派、自由派、表达派
  const vals=[r.intimacy, r.commit, r.indep, r.express].map(s=>clamp(Math.round((s/50)*60+20),20,80));
  const labels=['亲密派','承诺派','自由派','表达派'];
  ctx.strokeStyle='#e0e0e0'; for(let i=1;i<=5;i++){ ctx.beginPath(); ctx.arc(cx,cy,R*i/5,0,Math.PI*2); ctx.stroke(); }
  for(let i=0;i<4;i++){ const ang=(Math.PI*2*i)/4 - Math.PI/2; const x=cx+Math.cos(ang)*R, y=cy+Math.sin(ang)*R; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(x,y); ctx.stroke(); const lx=cx+Math.cos(ang)*(R+30), ly=cy+Math.sin(ang)*(R+30); ctx.fillStyle='#333'; ctx.font='14px Microsoft YaHei'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(labels[i], lx, ly);} 
  ctx.fillStyle='rgba(255, 168, 46, 0.15)'; ctx.strokeStyle='#ffb300'; ctx.lineWidth=3; ctx.beginPath();
  for(let i=0;i<4;i++){ const ang=(Math.PI*2*i)/4 - Math.PI/2; const r0=(vals[i]/80)*R; const x=cx+Math.cos(ang)*r0, y=cy+Math.sin(ang)*r0; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.closePath(); ctx.fill(); ctx.stroke();
  const idx=vals.indexOf(Math.max(...vals)); const lead=labels[idx]; const el=document.getElementById('leadAttachment'); if (el) el.textContent=lead;
}

// Types
function determinePersonality(r){
  const avg=(r.intimacy+r.commit+r.indep+r.express)/4;
  const maxVal=Math.max(r.intimacy,r.commit,r.indep,r.express);
  const maxKey=['intimacy','commit','indep','express'][[r.intimacy,r.commit,r.indep,r.express].indexOf(maxVal)];
  if (avg>=35){
    const nameMap={intimacy:'依恋温暖型',commit:'承诺稳重型',indep:'自由理性型',express:'热情表达型'};
    return {
      name: nameMap[maxKey]||'均衡进阶型',
      description:'你在恋爱观上有鲜明主导色：把优势用规则固定下来，就能形成稳定与松弛的同频。',
      traits:['有主张','愿沟通','能坚持','重体验'],
      advantages:['方向感稳定','投入且可持续','可复制的相处节奏'],
      disadvantages:['在冲突时可能固化','需要包容差异'],
      suggestions:['用清单化降低模糊','差异点做小步试错','定期复盘更新规则']
    };
  } else if (avg>=25){
    return {
      name:'均衡协商型',
      description:'整体较均衡，差异可协商。通过“仪式+规则”就能把稳定性再抬高一格。',
      traits:['易协商','愿让步','重公平','重体验'],
      advantages:['成本低','磨合效率高'],
      disadvantages:['遇高压情境易摇摆'],
      suggestions:['固定每周高质量相处','共享未来计划','把争吵流程卡贴在手心']
    };
  }
  return {
    name:'理性弹性型',
    description:'尊重边界与自由，强调自我节奏。适度增强热度表达可提升连接饱和度。',
    traits:['理性','自持','尊重边界','节奏稳定'],
    advantages:['情绪噪声低','自由度高'],
    disadvantages:['表达密度低','共情热度不足'],
    suggestions:['设置小型仪式','明确“在乎的证据”','月度回顾关系节奏']
  };
}

function displayPersonalityType(p){
  const levelTitle=document.getElementById('personalityLevel'); if (levelTitle) levelTitle.textContent=p.name;
  const content=document.getElementById('personalityContent'); if (content) content.textContent=p.description;
  const traitsWrap=document.getElementById('personalityTraits'); if (traitsWrap){ traitsWrap.innerHTML=''; (p.traits||[]).forEach(t=>{ const d=document.createElement('div'); d.className='trait-pill'; d.textContent=t; traitsWrap.appendChild(d); }); }
  const adv=document.getElementById('advantagesList'); if (adv) adv.innerHTML=(p.advantages||[]).map(i=>`<div class=\"list-item\">${i}</div>`).join('');
  const dis=document.getElementById('disadvantagesList'); if (dis) dis.innerHTML=(p.disadvantages||[]).map(i=>`<div class=\"list-item\">${i}</div>`).join('');
  const sug=document.getElementById('personalitySuggestionsList'); if (sug) sug.innerHTML=(p.suggestions||[]).map(i=>`<div class=\"list-item\">${i}</div>`).join('');
}

function determineAttachment(r){
  const closeness=r.intimacy + r.express; // 亲密+表达
  const structure=r.commit + (50 - Math.min(50, r.indep)); // 承诺+（反向独立）
  if (closeness>=70 && structure>=70){
    return { name:'亲密-承诺同频型', description:'亲密与承诺双高，偏向稳定而热烈的互动节奏。', traits:['热度高','稳定强','节奏清晰'], advantages:['安全感足','连接饱满'], disadvantages:['自由度受限'], suggestions:['保留个人时间','避免过度日程化'] };
  } else if (structure>=70){
    return { name:'承诺稳态型', description:'重视长期与秩序，互动偏理性与有规划。', traits:['计划感','责任感','复盘感'], advantages:['抗风险强'], disadvantages:['浪漫密度可能偏低'], suggestions:['增加表达与情绪确认'] };
  } else if (closeness>=70){
    return { name:'亲密热度型', description:'连接热度高，表达丰富，容易形成高饱和亲密体验。', traits:['表达足','靠近频繁'], advantages:['氛围好'], disadvantages:['界限可能模糊'], suggestions:['明确边界规则','设置缓冲时间'] };
  }
  return { name:'弹性协商型', description:'四维相对均衡，通过协商与小规则维持良好互动。', traits:['弹性','公平','协商'], advantages:['成本可控'], disadvantages:['遇大变动需要预案'], suggestions:['建立争吵流程卡','共享关键日程'] };
}

function displayAttachmentType(a){
  const levelTitle=document.getElementById('attachmentLevel'); if (levelTitle) levelTitle.textContent=a.name;
  const content=document.getElementById('attachmentContent'); if (content) content.textContent=a.description;
  const traitsWrap=document.getElementById('attachmentTraits'); if (traitsWrap){ traitsWrap.innerHTML=''; (a.traits||[]).forEach(t=>{ const d=document.createElement('div'); d.className='trait-pill'; d.textContent=t; traitsWrap.appendChild(d); }); }
  const adv=document.getElementById('attachmentAdvantagesList'); if (adv) adv.innerHTML=(a.advantages||[]).map(i=>`<div class=\"list-item\">${i}</div>`).join('');
  const dis=document.getElementById('attachmentDisadvantagesList'); if (dis) dis.innerHTML=(a.disadvantages||[]).map(i=>`<div class=\"list-item\">${i}</div>`).join('');
  const sug=document.getElementById('attachmentSuggestionsList'); if (sug) sug.innerHTML=(a.suggestions||[]).map(i=>`<div class=\"list-item\">${i}</div>`).join('');
}

function text(id, val){ const el=document.getElementById(id); if (el) el.textContent=val; }
function html(id, val){ const el=document.getElementById(id); if (el) el.innerHTML=val; }
function styleWidth(id, w){ const el=document.getElementById(id); if (el) el.style.width = w; }
function z(score){ return ((score-25)/25).toFixed(2); }
function clamp(v,min,max){ return Math.max(min, Math.min(max,v)); }


