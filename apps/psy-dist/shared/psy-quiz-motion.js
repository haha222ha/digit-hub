export function flashQuestionBody(bodyId = 'q-body') {
  const body = document.getElementById(bodyId);
  if (!body) return;
  body.classList.remove('quiz-enter');
  void body.offsetWidth;
  body.classList.add('quiz-enter');
}

export function optionDelayStyle(index) {
  return `animation-delay:${(index * 0.055).toFixed(3)}s`;
}
