import { scoreAnswers } from './vendor/scoring-CcgIfi_e-rBnOF_ZDsobST.js';
import { questions as allQuestions } from './vendor/questions-DpFs-59k-rBnOF_ZDsobST.js';
import { renderMuseResult } from '../../shared/muse-result-ui.js';
import { optionDelayStyle } from '../../shared/psy-quiz-motion.js';

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
    }, 320);
  } else {
    clearAdvanceTimer();
    setTimeout(() => showResult(), 320);
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

function playTransitionThen(callback) {
  const transition = $('muse-transition');
  const panel = $('quiz-panel');
  const pctEl = $('mt-pct');
  if (!transition || !panel) {
    callback();
    return;
  }
  panel.hidden = true;
  transition.hidden = false;
  if (pctEl) pctEl.textContent = '0%';
  const start = performance.now();
  const duration = 1800;
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    if (pctEl) pctEl.textContent = `${Math.round(t * 100)}%`;
    if (t < 1) requestAnimationFrame(tick);
    else {
      transition.hidden = true;
      panel.hidden = false;
      callback();
    }
  }
  requestAnimationFrame(tick);
}

function resetQuizChrome() {
  const transition = $('muse-transition');
  const panel = $('quiz-panel');
  if (transition) transition.hidden = true;
  if (panel) panel.hidden = false;
  if ($('mt-pct')) $('mt-pct').textContent = '0%';
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
  if (id !== 'screen-quiz') resetQuizChrome();
}

function renderQuestion() {
  const q = currentQuestion();
  const total = state.order.length;
  $('q-progress').textContent = `${state.qi + 1} / ${total}`;
  $('progress-fill').style.width = `${((state.qi + 1) / total) * 100}%`;
  $('q-note').textContent = q.guide || q.topic || '';
  $('q-title').textContent = q.text;
  const host = $('q-options');
  host.innerHTML = q.options.map((opt, i) => {
    const sel = state.answers[q.id] === opt.id ? ' wx-quiz__option--selected' : '';
    const locked = optionLocked ? ' style="pointer-events:none;opacity:.7"' : ` style="${optionDelayStyle(i)}"`;
    return `<button type="button" class="wx-quiz__option quiz-enter${sel}" data-id="${opt.id}"${locked}>
      <span class="wx-quiz__radio"></span>
      <span class="wx-quiz__option-text"><strong>${opt.id}.</strong> ${opt.text}</span>
    </button>`;
  }).join('');
  host.querySelectorAll('.wx-quiz__option').forEach((el) => {
    el.onclick = () => {
      if (optionLocked) return;
      state.answers[q.id] = el.dataset.id;
      host.querySelectorAll('.wx-quiz__option').forEach((x) => x.classList.remove('wx-quiz__option--selected'));
      el.classList.add('wx-quiz__option--selected');
      advanceAfterSelect();
    };
  });
  $('btn-back').disabled = state.qi <= 0;
  $('btn-back').style.visibility = state.qi > 0 ? 'visible' : 'hidden';
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
  return allQuestions.map((q) => ({
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
  playTransitionThen(() => renderResultView(payload.result));
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
    resetQuizChrome();
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
