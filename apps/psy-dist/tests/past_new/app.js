import { scoreAnswers } from './vendor/scoring-CuPx53JQ-rBnOF_ZDsobST.js';
import { a as qpack } from './vendor/questions-Ct3o4EnI-rBnOF_ZDsobST.js';
import { renderPastResult } from '../../shared/past-result-ui.js';

const uiQuestions = qpack.questions;
const GENDER_QID = '__historyGenderPreference';
const state = {
  qi: 0,
  answers: {},
  gender: 'all',
  genderChosen: true,
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
  const q = uiQuestions[state.qi];
  if (!state.answers[q.id]) return;
  if (state.qi < uiQuestions.length - 1) {
    optionLocked = true;
    clearAdvanceTimer();
    advanceTimer = setTimeout(() => {
      advanceTimer = null;
      const cur = uiQuestions[state.qi];
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

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
  const quiz = $('screen-quiz');
  if (quiz) quiz.style.display = id === 'screen-quiz' ? 'flex' : 'none';
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
      if (optionLocked) return;
      state.answers[q.id] = el.dataset.id;
      host.querySelectorAll('.opt').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
      advanceAfterSelect();
    };
  });
  $('btn-back').style.display = state.qi > 0 ? 'block' : 'none';
}

function renderResult(result) {
  const p = result.primary;
  renderPastResult($('result-root'), result, {
    showActions: true,
    result,
    onRetry: () => {
      state.qi = 0;
      state.answers = {};
      showScreen('screen-intro');
      document.body.classList.remove('page-disabled');
    },
  });
  showScreen('screen-result');
  if (window.__psyComplete) {
    window.__psyComplete({
      test_code: 'past_new',
      type: p.code,
      name: p.name,
      score: p.orderIndex,
      stats: result.stats,
      referenceStats: result.referenceStats,
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
  $('btn-back').onclick = () => {
    if (state.qi > 0) {
      clearAdvanceTimer();
      optionLocked = false;
      state.qi--;
      renderQuestion();
    }
  };
}

bindUi();
export {};
