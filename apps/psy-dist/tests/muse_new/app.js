import { scoreAnswers } from './vendor/scoring-CcgIfi_e-rBnOF_ZDsobST.js';
import { questions as allQuestions } from './vendor/questions-DpFs-59k-rBnOF_ZDsobST.js';
import { renderMuseResult } from '../../shared/muse-result-ui.js';
import { flashQuestionBody, optionDelayStyle } from '../../shared/psy-quiz-motion.js';

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
  host.innerHTML = q.options.map((opt, i) => {
    const sel = state.answers[q.id] === opt.id ? ' selected' : '';
    return `<div class="opt${sel}" data-id="${opt.id}" style="${optionDelayStyle(i)}"><div class="opt-id">${opt.id}.</div><div class="opt-text">${opt.text}</div></div>`;
  }).join('');
  flashQuestionBody();
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

function renderResultView(result) {
  renderMuseResult($('result-root'), result, {
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
  renderResultView(payload.result);
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
}

bindUi();
export {};
