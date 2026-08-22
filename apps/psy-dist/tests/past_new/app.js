import { scoreAnswers } from './vendor/scoring-CuPx53JQ-rBnOF_ZDsobST.js';
import { a as qpack } from './vendor/questions-Ct3o4EnI-rBnOF_ZDsobST.js';
import { renderPastResult } from '../../shared/past-result-ui.js';
import { optionDelayStyle } from '../../shared/psy-quiz-motion.js';

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

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
}

function showPreferenceFlow() {
  $('pref-flow').hidden = false;
  $('quiz-flow').hidden = true;
}

function showQuizFlow() {
  $('pref-flow').hidden = true;
  $('quiz-flow').hidden = false;
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
    }, 320);
  } else {
    clearAdvanceTimer();
    setTimeout(() => showResult(), 320);
  }
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
  host.innerHTML = q.options.map((opt, i) => {
    const sel = state.answers[q.id] === opt.id ? ' active' : '';
    const locked = optionLocked ? ' locked' : '';
    return `<button type="button" class="fig-quiz-option quiz-enter${sel}${locked}" data-id="${opt.id}" style="${optionDelayStyle(i)}">
      <span class="fig-option-id">${opt.id}.</span>
      <span class="fig-option-text">${opt.text}</span>
    </button>`;
  }).join('');
  host.querySelectorAll('.fig-quiz-option').forEach((el) => {
    el.onclick = () => {
      if (optionLocked) return;
      state.answers[q.id] = el.dataset.id;
      host.querySelectorAll('.fig-quiz-option').forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
      advanceAfterSelect();
    };
  });
  $('btn-back').style.visibility = state.qi > 0 ? 'visible' : 'hidden';
  $('btn-back').disabled = state.qi <= 0;
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
  const rows = uiQuestions.map((q) => ({
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

function bindGenderOptions() {
  document.querySelectorAll('[data-gender]').forEach((btn) => {
    btn.onclick = () => {
      state.gender = btn.dataset.gender;
      state.genderChosen = true;
      document.querySelectorAll('[data-gender]').forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
    };
  });
}

function bindUi() {
  bindGenderOptions();

  $('btn-start').onclick = async () => {
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
    showPreferenceFlow();
  };

  $('btn-pref-back').onclick = () => {
    showScreen('screen-intro');
  };

  $('btn-pref-next').onclick = () => {
    if (!state.genderChosen) return;
    showQuizFlow();
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

  $('btn-home').onclick = () => {
    if (!confirm('确定返回首页？当前答题进度将丢失。')) return;
    clearAdvanceTimer();
    optionLocked = false;
    state.qi = 0;
    state.answers = {};
    showScreen('screen-intro');
  };
}

bindUi();
export {};
