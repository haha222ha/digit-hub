import { scoreAnswers } from './vendor/scoring-CuPx53JQ-rBnOF_ZDsobST.js';
import { a as qpack } from './vendor/questions-Ct3o4EnI-rBnOF_ZDsobST.js';

const uiQuestions = qpack.questions;
const GENDER_QID = '__historyGenderPreference';
const state = {
  qi: 0,
  answers: {},
  gender: 'all',
  genderChosen: true,
};

function $(id) { return document.getElementById(id); }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
  const quiz = $('screen-quiz');
  if (quiz) quiz.style.display = id === 'screen-quiz' ? 'flex' : 'none';
}

function renderGender() {
  $('screen-gender').classList.add('active');
}

function renderQuestion() {
  const q = uiQuestions[state.qi];
  const total = uiQuestions.length;
  $('q-progress').textContent = `${state.qi + 1} / ${total}`;
  $('progress-fill').style.width = `${((state.qi + 1) / total) * 100}%`;
  $('q-tag').textContent = q.section || '历史场景';
  $('q-note').textContent = q.note || '';
  $('q-title').textContent = q.text;
  const host = $('q-options');
  host.innerHTML = q.options.map(opt => {
    const sel = state.answers[q.id] === opt.id ? ' selected' : '';
    return `<div class="opt${sel}" data-id="${opt.id}"><div class="opt-id">${opt.id}.</div><div class="opt-text">${opt.text}</div></div>`;
  }).join('');
  host.querySelectorAll('.opt').forEach(el => {
    el.onclick = () => {
      state.answers[q.id] = el.dataset.id;
      host.querySelectorAll('.opt').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
      $('btn-next').disabled = false;
    };
  });
  $('btn-next').textContent = state.qi === total - 1 ? '查看结果' : '下一题';
  $('btn-back').style.display = state.qi > 0 ? 'block' : 'none';
  $('btn-next').disabled = !state.answers[q.id];
}

function renderStats(stats) {
  const maxV = Math.max(...stats.map(s => s.value), 1);
  $('radar-wrap').innerHTML = stats.map(s => {
    const pct = Math.round(s.value / maxV * 100);
    return `<div class="radar-row"><span>${s.label}</span><div class="radar-bar"><div class="radar-fill" style="width:${pct}%"></div></div><span>${s.value}</span></div>`;
  }).join('');
}

function renderResult(result) {
  const p = result.primary;
  $('result-type').textContent = p.name;
  $('result-sub').textContent = `${p.author} · ${p.source}`;
  $('result-quote').textContent = p.quote || '';
  $('result-tags').innerHTML = (p.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
  $('result-order').textContent = `匹配度 ${p.orderIndex}/${p.totalArchetypes}`;
  const profiles = p.profile || [];
  $('full-sections').innerHTML = profiles.map((txt, i) =>
    `<div class="full-section"><h3>${i === 0 ? '精神画像' : '内在张力'}</h3><p>${txt}</p></div>`
  ).join('');
  const br = p.bottomReport || {};
  const steps = (br.path && br.path.steps) || [];
  const scenes = br.scenes || [];
  let extra = '';
  if (br.intro) extra += `<div class="full-section"><h3>报告导语</h3><p>${br.intro}</p></div>`;
  steps.forEach(step => {
    extra += `<div class="full-section"><h3>${step.label} ${step.title}</h3><p>${step.copy}</p></div>`;
  });
  scenes.forEach(scene => {
    extra += `<div class="full-section scene-card"><h3>${scene.label}</h3><p class="scene-title">${scene.title}</p><p>${scene.copy}</p><p class="scene-signal">${scene.actionLabel || ''}：${scene.signal || ''}</p></div>`;
  });
  $('full-sections').innerHTML += extra;
  renderStats(result.stats || []);
  showScreen('screen-result');
  if (window.__psyComplete) {
    window.__psyComplete({
      test_code: 'past_new',
      type: p.code,
      name: p.name,
      score: p.orderIndex,
      stats: result.stats,
    });
  }
}

function collectAnswers() {
  const rows = uiQuestions.map(q => ({
    questionId: String(q.id),
    optionId: String(state.answers[q.id] || 'A'),
  }));
  rows.push({ questionId: GENDER_QID, optionId: state.gender });
  return rows;
}

function showResult() {
  const payload = scoreAnswers(collectAnswers(), uiQuestions, '历史人物匹配·新');
  if (!payload || !payload.result) {
    alert('评分失败，请重试');
    return;
  }
  renderResult(payload.result);
}

function bindUi() {
  document.querySelectorAll('[data-gender]').forEach(btn => {
    btn.onclick = () => {
      state.gender = btn.dataset.gender;
      state.genderChosen = true;
      document.querySelectorAll('[data-gender]').forEach(x => x.classList.remove('selected'));
      btn.classList.add('selected');
      $('btn-start').disabled = false;
    };
  });
  $('btn-start').onclick = async () => {
    if (!state.genderChosen) return;
    if (window.linkValidator) {
      if (typeof window.linkValidator.validateForUserAction === 'function') {
        const ok = await window.linkValidator.validateForUserAction();
        if (!ok) return;
      }
      try { await window.linkValidator.startTest(); } catch (e) { console.error(e); return; }
    }
    state.qi = 0;
    state.answers = {};
    showScreen('screen-quiz');
    renderQuestion();
  };
  $('btn-next').onclick = () => {
    if (!state.answers[uiQuestions[state.qi].id]) return;
    if (state.qi < uiQuestions.length - 1) { state.qi++; renderQuestion(); }
    else showResult();
  };
  $('btn-back').onclick = () => { if (state.qi > 0) { state.qi--; renderQuestion(); } };
  $('btn-retry').onclick = () => {
    state.qi = 0;
    state.answers = {};
    showScreen('screen-intro');
    document.body.classList.remove('page-disabled');
  };
}

bindUi();
export {};
