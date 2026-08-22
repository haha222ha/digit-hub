import { scoreAnswers } from './vendor/scoring-CcgIfi_e-rBnOF_ZDsobST.js';
import { questions as allQuestions } from './vendor/questions-DpFs-59k-rBnOF_ZDsobST.js';

const state = {
  qi: 0,
  order: [],
  answers: {},
};

let advanceTimer = null;
let optionLocked = false;

function $(id) { return document.getElementById(id); }

function clearAdvanceTimer() {
  if (advanceTimer) {
    clearTimeout(advanceTimer);
    advanceTimer = null;
  }
}

function advanceAfterSelect() {
  const q = currentQuestion();
  if (!state.answers[q.id]) return;
  if (state.qi < state.order.length - 1) {
    optionLocked = true;
    clearAdvanceTimer();
    advanceTimer = setTimeout(() => {
      advanceTimer = null;
      const cur = currentQuestion();
      if (state.answers[cur.id]) {
        state.qi++;
        optionLocked = false;
        renderQuestion();
      } else {
        optionLocked = false;
      }
    }, 300);
  } else {
    clearAdvanceTimer();
    setTimeout(() => showResult(), 300);
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function currentQuestion() {
  return state.order[state.qi];
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
  const quiz = $('screen-quiz');
  if (quiz) quiz.style.display = id === 'screen-quiz' ? 'flex' : 'none';
}

function renderQuestion() {
  const q = currentQuestion();
  const total = state.order.length;
  $('q-progress').textContent = `${state.qi + 1} / ${total}`;
  $('progress-fill').style.width = `${((state.qi + 1) / total) * 100}%`;
  $('q-tag').textContent = q.topic || '文学场景';
  $('q-note').textContent = q.guide || '';
  $('q-title').textContent = q.text;
  const host = $('q-options');
  host.innerHTML = q.options.map(opt => {
    const sel = state.answers[q.id] === opt.id ? ' selected' : '';
    return `<div class="opt${sel}" data-id="${opt.id}"><div class="opt-id">${opt.id}.</div><div class="opt-text">${opt.text}</div></div>`;
  }).join('');
  host.querySelectorAll('.opt').forEach(el => {
    el.onclick = () => {
      if (optionLocked) return;
      state.answers[q.id] = el.dataset.id;
      host.querySelectorAll('.opt').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
      advanceAfterSelect();
    };
  });
  $('btn-back').style.display = state.qi > 0 ? 'block' : 'none';
}

function renderScoreBars(scores) {
  const entries = Object.entries(scores || {});
  const maxV = Math.max(...entries.map(([, v]) => Number(v)), 1);
  $('radar-wrap').innerHTML = entries.map(([label, value]) => {
    const pct = Math.round(Number(value) / maxV * 100);
    return `<div class="radar-row"><span>${label}</span><div class="radar-bar"><div class="radar-fill" style="width:${pct}%"></div></div><span>${value}</span></div>`;
  }).join('');
}

function renderResult(result) {
  const accent = result.color || '#2d4a6f';
  document.documentElement.style.setProperty('--accent', accent);
  $('result-type').textContent = result.title || '';
  $('result-sub').textContent = result.description || '';
  $('result-score').textContent = `匹配度 ${result.extra?.primaryScore ?? '--'}%`;
  $('result-tags').innerHTML = (result.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
  const sug = result.suggestions || [];
  $('full-sections').innerHTML = '';
  if (sug[0]) {
    $('full-sections').innerHTML += `<div class="full-section"><h3>铠甲 · 你的力量</h3><p>${sug[0]}</p></div>`;
  }
  if (sug[1]) {
    $('full-sections').innerHTML += `<div class="full-section crack"><h3>裂缝 · 你的张力</h3><p>${sug[1]}</p></div>`;
  }
  const echo = result.extra?.echo;
  if (echo) {
    $('full-sections').innerHTML += `<div class="full-section echo"><h3>精神共振 · 第二名</h3><p><strong>${echo.name}</strong> · ${echo.alias || ''}</p><p class="echo-score">共振度 ${result.extra.echoScore || 0}%</p></div>`;
  }
  renderScoreBars(result.scores || {});
  showScreen('screen-result');
  if (window.__psyComplete) {
    window.__psyComplete({
      test_code: 'muse_new',
      type: result.key,
      name: result.title,
      score: result.extra?.primaryScore,
      scores: result.scores,
    });
  }
}

function collectAnswers() {
  return allQuestions.map(q => ({
    questionId: String(q.id),
    optionId: String(state.answers[q.id] || 'A'),
  }));
}

function showResult() {
  const payload = scoreAnswers(collectAnswers(), allQuestions, '文学原型·新');
  if (!payload || !payload.result) {
    alert('评分失败，请重试');
    return;
  }
  renderResult(payload.result);
}

function bindUi() {
  $('btn-start').onclick = async () => {
    if (window.linkValidator) {
      if (typeof window.linkValidator.validateForUserAction === 'function') {
        const ok = await window.linkValidator.validateForUserAction();
        if (!ok) return;
      }
      try { await window.linkValidator.startTest(); } catch (e) { console.error(e); return; }
    }
    state.order = shuffle(allQuestions);
    state.qi = 0;
    state.answers = {};
    showScreen('screen-quiz');
    renderQuestion();
  };
  $('btn-back').onclick = () => {
    if (state.qi > 0) {
      clearAdvanceTimer();
      optionLocked = false;
      state.qi--;
      renderQuestion();
    }
  };
  $('btn-retry').onclick = () => {
    state.qi = 0;
    state.answers = {};
    showScreen('screen-intro');
    document.body.classList.remove('page-disabled');
  };
}

bindUi();
export {};
