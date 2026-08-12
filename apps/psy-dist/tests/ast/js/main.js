// 数据验证
console.log('当前题目数:', questions.length);
console.log('当前规则数:', scoreMap.length);
console.log('当前动物数:', Object.keys(animalArchetypes).length);

// ==================== 全局变量 ====================
let currentQuestion = 0;
let answers = [];

// ==================== 页面切换函数 ====================
/**
 * 显示指定页面，隐藏其他页面
 * @param {string} pageName - 页面名称：'start', 'quiz', 'result'
 */
function showPage(pageName) {
  // 隐藏所有页面
  const pages = ['start-screen', 'quiz-screen', 'result-screen'];
  pages.forEach(pageId => {
    const page = document.getElementById(pageId);
    if (page) {
      page.classList.add('hidden');
    }
  });
  
  // 显示指定页面
  const targetPage = document.getElementById(pageName + '-screen');
  if (targetPage) {
    targetPage.classList.remove('hidden');
  }
  
  // 控制页脚显示：只在首页和结果页显示
  const footer = document.querySelector('.site-footer');
  if (footer) {
    if (pageName === 'quiz') {
      // 答题页面隐藏页脚
      footer.classList.add('hidden');
    } else {
      // 首页和结果页显示页脚
      footer.classList.remove('hidden');
    }
  }
}

// ==================== 测试流程函数 ====================
/**
 * 开始测试，重置数据
 * @param {boolean} skipValidation - 是否跳过验证（用于恢复进度时）
 */
async function startQuiz(skipValidation = false) {
  // 如果不是恢复进度，需要验证链接并调用startTest
  if (!skipValidation) {
    // 等待SDK初始化完成（最多等待3秒）
    let waitCount = 0;
    while (!window.linkValidator && waitCount < 30) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitCount++;
    }
    
    // 检查SDK是否初始化
    if (!window.linkValidator) {
      console.error('SDK未初始化，无法开始测试');
      alert('验证SDK未初始化，无法开始测试。请刷新页面重试。');
      return;
    }
    
    // 先验证链接有效性（如果无效会显示弹窗）
    let isValid = false;
    if (typeof window.linkValidator.validateForUserAction === 'function') {
      try {
        isValid = await window.linkValidator.validateForUserAction();
        console.log('验证结果:', { isValid, valid: window.linkValidator.valid, error: window.linkValidator.validationError });
        
        // 检查验证结果和验证状态（双重检查）
        if (!isValid || window.linkValidator.valid === false) {
          // 链接无效，已显示弹窗，不进入答题页面
          console.warn('链接验证失败，无法开始测试', {
            isValid,
            valid: window.linkValidator.valid,
            error: window.linkValidator.validationError
          });
          return;
        }
      } catch (error) {
        // 验证失败，已显示弹窗，不进入答题页面
        console.error('链接验证失败:', error);
        if (window.linkValidator) {
          window.linkValidator.valid = false;
        }
        return;
      }
    } else {
      // 如果validateForUserAction不存在，检查valid状态
      if (window.linkValidator.valid === false) {
        alert(window.linkValidator.validationError || '测试链接无效，请检查链接是否正确');
        return;
      }
      isValid = window.linkValidator.valid !== false;
    }
    
    // 最终检查：确保验证通过才进入答题页面
    if (!isValid || (window.linkValidator && window.linkValidator.valid === false)) {
      console.warn('最终验证检查失败，无法开始测试');
      return;
    }
    
    // 链接验证通过，调用测试开始API（ast是单视角测试）
    if (window.linkValidator) {
      try {
        await window.linkValidator.startTest();
        console.log('测试开始记录成功');
      } catch (error) {
        console.error('记录测试开始失败:', error);
        // 测试开始失败，不进入答题页面
        return;
      }
    }
  }
  
  // 重置全局变量
  currentQuestion = 0;
  answers = [];
  
  // 尝试从 localStorage 恢复进度
  const savedProgress = localStorage.getItem('quizProgress');
  if (savedProgress) {
    try {
      const progress = JSON.parse(savedProgress);
      currentQuestion = progress.currentQuestion || 0;
      answers = progress.answers || [];
      
      // 如果还有未完成的题目，继续测试（跳过验证，因为这是恢复进度）
      if (currentQuestion < questions.length && answers.length < questions.length) {
        showPage('quiz');
        showQuestion(currentQuestion);
        return;
      }
    } catch (e) {
      console.error('恢复进度失败:', e);
    }
  }
  
  // 清除保存的进度
  localStorage.removeItem('quizProgress');
  
  // 开始新测试
  showPage('quiz');
  showQuestion(0);
}

/**
 * 显示第index题
 * @param {number} index - 题目索引
 */
function showQuestion(index) {
  if (index < 0 || index >= questions.length) {
    console.error('题目索引超出范围');
    return;
  }
  
  const question = questions[index];
  currentQuestion = index;
  
  // 更新题目标题
  const questionTitle = document.getElementById('question-title');
  if (questionTitle) {
    questionTitle.textContent = question.question;
  }
  
  // 更新题目编号徽章
  const questionBadge = document.getElementById('question-badge');
  if (questionBadge) {
    questionBadge.textContent = index + 1;
  }
  
  // 更新选项
  const optionsContainer = document.getElementById('options-container');
  if (optionsContainer) {
    optionsContainer.innerHTML = '';
    
    // 获取当前题目已保存的答案（如果有）
    const savedAnswer = answers[index];
    
    // 创建选项卡片
    const options = ['A', 'B', 'C', 'D'];
    options.forEach(option => {
      if (question.options[option]) {
        // 创建选项卡片容器
        const optionCard = document.createElement('div');
        optionCard.className = 'option-card';
        optionCard.setAttribute('data-option', option);
        
        // 如果该题已有答案，标记为选中状态
        if (savedAnswer === option) {
          optionCard.classList.add('selected');
        }
        
        // 创建选项徽章（左侧圆形）
        const optionBadge = document.createElement('div');
        optionBadge.className = 'option-badge';
        optionBadge.textContent = option;
        
        // 创建选项文字（右侧）
        const optionText = document.createElement('div');
        optionText.className = 'option-text';
        optionText.textContent = question.options[option];
        
        // 组装卡片
        optionCard.appendChild(optionBadge);
        optionCard.appendChild(optionText);
        
        // 添加点击事件
        optionCard.addEventListener('click', () => selectOption(option));
        
        optionsContainer.appendChild(optionCard);
      }
    });
  }
  
  // 更新进度信息
  const currentQuestionSpan = document.getElementById('current-question');
  const totalQuestionsSpan = document.getElementById('total-questions');
  const progressPercent = document.getElementById('progress-percent');
  const progressBarFill = document.getElementById('progress-bar-fill');
  
  if (currentQuestionSpan) {
    currentQuestionSpan.textContent = index + 1;
  }
  if (totalQuestionsSpan) {
    totalQuestionsSpan.textContent = questions.length;
  }
  
  // 更新进度百分比和进度条
  const percent = Math.round(((index + 1) / questions.length) * 100);
  if (progressPercent) {
    progressPercent.textContent = percent + '%';
  }
  if (progressBarFill) {
    progressBarFill.style.width = percent + '%';
  }
  
  // 如果是最后一题，检查是否已选择答案来决定是否显示提交按钮
  const submitContainer = document.getElementById('submit-container');
  if (submitContainer) {
    if (index === questions.length - 1 && answers[index] !== undefined) {
      // 最后一题且已选择答案，显示提交按钮
      submitContainer.classList.remove('hidden');
    } else {
      // 不是最后一题或未选择答案，隐藏提交按钮
      submitContainer.classList.add('hidden');
    }
  }
  
  // 保存进度到 localStorage
  saveProgress();
}

/**
 * 选择答案（A/B/C/D）
 * @param {string} option - 选项：'A', 'B', 'C', 或 'D'
 */
function selectOption(option) {
  console.log('选择答案:', option, '当前题目:', currentQuestion + 1);
  
  // 立即禁用所有选项卡片，防止重复点击
  const optionCards = document.querySelectorAll('.option-card');
  optionCards.forEach(card => {
    card.style.pointerEvents = 'none';
    card.style.opacity = '0.6';
  });
  
  // 保存答案 - 确保数组长度正确
  // 如果数组长度不够，先填充到当前索引
  while (answers.length <= currentQuestion) {
    answers.push(null);
  }
  // 保存当前题目的答案
  answers[currentQuestion] = option;
  
  console.log('答案数组更新后:', answers, '长度:', answers.length);
  
  // 立即保存进度
  saveProgress();
  
  // 标记当前选项为选中状态
  optionCards.forEach(card => {
    card.classList.remove('selected');
    if (card.getAttribute('data-option') === option) {
      card.classList.add('selected');
    }
  });
  
  // 如果是最后一题，显示提交按钮，不自动进入下一题
  if (currentQuestion === questions.length - 1) {
    // 显示提交按钮
    const submitContainer = document.getElementById('submit-container');
    if (submitContainer) {
      submitContainer.classList.remove('hidden');
    }
    // 重新启用卡片，允许用户修改答案
    setTimeout(() => {
      optionCards.forEach(card => {
        card.style.pointerEvents = 'auto';
        card.style.opacity = '1';
      });
    }, 300);
  } else {
    // 自动进入下一题，延迟确保答案已保存
    setTimeout(() => {
      // 再次确认答案已保存
      if (answers[currentQuestion] === option) {
        nextQuestion();
      } else {
        console.error('答案保存失败，重新保存');
        answers[currentQuestion] = option;
        saveProgress();
        nextQuestion();
      }
    }, 300); // 短暂延迟，提供视觉反馈
  }
}

/**
 * 下一题
 */
function nextQuestion() {
  // 检查是否还有下一题
  if (currentQuestion < questions.length - 1) {
    // 确保当前题目的答案已保存
    console.log('进入下一题，当前答案数组:', answers);
    showQuestion(currentQuestion + 1);
  }
  // 注意：最后一题不再自动提交，需要用户点击提交按钮
}

/**
 * 完成测试，调用算法
 */
async function finishQuiz() {
  console.log('开始提交答案，当前答案数组:', answers);
  console.log('答案数量:', answers.length, '题目总数:', questions.length);
  console.log('当前题目索引:', currentQuestion);
  
  // 确保答案数组长度正确
  while (answers.length < questions.length) {
    answers.push(null);
  }
  
  // 检查所有题目是否都有答案
  let allAnswered = true;
  let missingQuestions = [];
  
  for (let i = 0; i < questions.length; i++) {
    const answer = answers[i];
    if (answer === undefined || answer === null || answer === '') {
      console.warn('第', i + 1, '题未回答，答案:', answer);
      missingQuestions.push(i + 1);
      allAnswered = false;
    }
  }
  
  if (!allAnswered) {
    console.warn('答案数量不足，未回答的题目:', missingQuestions);
    alert(`请完成所有题目后再提交！\n未完成的题目：${missingQuestions.join(', ')}`);
    return;
  }
  
  // 验证答案数组长度
  if (answers.length !== questions.length) {
    console.warn('答案数组长度不匹配，当前答案数:', answers.length, '题目总数:', questions.length);
    alert('答案数据不完整，请重新开始测试！');
    return;
  }
  
  // 调用匹配算法
  console.log('调用匹配算法...');
  try {
    const result = matchAnimal(answers, scoreMap, animalArchetypes);
    console.log('匹配结果:', result);
    
    if (result && result.animal) {
      // 清除保存的进度
      localStorage.removeItem('quizProgress');
      
      // 保存测试结果到 localStorage
      try {
        const resultData = {
          animal: result.animal,
          similarity: result.similarity,
          normalizedScores: result.normalizedScores,
          userVector: result.userVector,
          animalVector: result.animalVector,
          rawScores: result.rawScores,
          timestamp: Date.now()
        };
        localStorage.setItem('quizResult', JSON.stringify(resultData));
        console.log('测试结果已保存到 localStorage');
        
        // 调用测试完成API（ast是单视角测试）
        if (window.linkValidator) {
          try {
            await window.linkValidator.completeTest(undefined, resultData);
            console.log('测试完成记录成功');
          } catch (error) {
            console.error('记录测试完成失败:', error);
            // 测试完成记录失败不影响显示结果，只记录错误
          }
        }
      } catch (e) {
        console.error('保存测试结果失败:', e);
      }
      
      // 显示结果
      showResult(result);
    } else {
      console.error('计算失败，result为:', result);
      alert('计算失败，请重试！');
    }
  } catch (error) {
    console.error('匹配算法出错:', error);
    alert('计算过程中出现错误，请重试！');
  }
}

// ==================== 结果展示函数 ====================
/**
 * 显示匹配结果
 * @param {Object} result - 匹配结果对象
 */
function showResult(result) {
  const resultContent = document.getElementById('result-content');
  if (!resultContent) return;
  
  const animal = animalArchetypes[result.animal];
  if (!animal) return;
  
  // 动物emoji映射
  const animalEmojis = {
    "狗": "🐕", "猫": "🐱", "狼": "🐺", "狐": "🦊", "狮": "🦁",
    "熊": "🐻", "兔": "🐰", "仓鼠": "🐹", "天鹅": "🦢", "鹿": "🦌",
    "鹰": "🦅", "乌鸦": "🐦‍⬛", "水豚": "🦫", "鲸": "🐋", "鹦鹉": "🦜",
    "章鱼": "🐙", "鲨鱼": "🦈", "海豚": "🐬", "浣熊": "🦝", "猫鼬": "🐾"
  };
  
  const animalEmoji = animalEmojis[result.animal] || "🐾";
  
  // 维度图标映射
  const dimensionIcons = {
    "DOM": "👑", "STR": "🧠", "COM": "🤝", "SOL": "🌙",
    "AGI": "⚡", "SEC": "🛡️", "AES": "🎨"
  };
  
  // 维度中文名称
  const dimensionNames = {
    "DOM": "支配性", "STR": "策略性", "COM": "社群性", "SOL": "独处性",
    "AGI": "敏捷性", "SEC": "安全性", "AES": "美学性"
  };
  
  // 获取标准化后的分数（0-1区间）
  const scores = result.normalizedScores || {};
  
  // 构建维度分数条HTML
  let dimensionsHTML = '';
  const dimensions = ['DOM', 'STR', 'COM', 'SOL', 'AGI', 'SEC', 'AES'];
  dimensions.forEach(dim => {
    const score = scores[dim] || 0;
    const percent = Math.round(score * 100);
    dimensionsHTML += `
      <div class="dimension-bar-item">
        <div class="dimension-label">
          <span class="dimension-icon">${dimensionIcons[dim]}</span>
          <span class="dimension-name">${dimensionNames[dim]}</span>
        </div>
        <div class="dimension-progress-bar">
          <div class="dimension-progress-fill" style="width: ${percent}%"></div>
        </div>
        <div class="dimension-score">${percent}%</div>
      </div>
    `;
  });
  
  // 构建详细分析HTML
  let detailedAnalysisHTML = '';
  if (animal.strengths || animal.growthAreas || animal.careerSuggestions || animal.professionalSuggestions) {
    detailedAnalysisHTML = `
      <!-- 详细分析卡片 -->
      <div class="detailed-analysis-card">
        ${animal.strengths ? `
          <div class="analysis-section">
            <h3 class="analysis-section-title">✨ 核心优势</h3>
            <ul class="analysis-list">
              ${animal.strengths.map(item => `<li>${item}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        ${animal.growthAreas ? `
          <div class="analysis-section">
            <h3 class="analysis-section-title">📈 成长空间</h3>
            <ul class="analysis-list">
              ${animal.growthAreas.map(item => `<li>${item}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        ${animal.careerSuggestions ? `
          <div class="analysis-section">
            <h3 class="analysis-section-title">💼 职业建议</h3>
            <ul class="analysis-list">
              ${animal.careerSuggestions.map(item => `<li>${item}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        ${animal.professionalSuggestions ? `
          <div class="analysis-section">
            <h3 class="analysis-section-title">🎯 专业建议</h3>
            <ul class="analysis-list">
              ${animal.professionalSuggestions.map(item => `<li>${item}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
  }
  
  // 构建结果HTML
  let html = `
    <!-- 动物展示卡片 -->
    <div class="animal-showcase-card">
      <div class="animal-emoji">${animalEmoji}</div>
      <h2 class="animal-name">${result.animal}</h2>
      <div class="animal-description">
        <p>${animal.description}</p>
      </div>
    </div>
    
    ${detailedAnalysisHTML}
    
    <!-- 性格维度分析区域 -->
    <div class="dimensions-analysis-card">
      <h3 class="dimensions-title">你的性格维度分析</h3>
      <div class="dimensions-list">
        ${dimensionsHTML}
      </div>
    </div>
    
    <!-- 相似度显示 -->
    <div class="similarity-card">
      <div class="similarity-value">匹配度：${(result.similarity * 100).toFixed(1)}%</div>
    </div>
  `;
  
  resultContent.innerHTML = html;
  
  // 显示结果页面
  showPage('result');
  
  // 触发进度条动画（延迟以确保DOM已渲染）
  setTimeout(() => {
    const progressBars = document.querySelectorAll('.dimension-progress-fill');
    progressBars.forEach(bar => {
      const width = bar.style.width;
      bar.style.width = '0%';
      // 强制重排
      bar.offsetHeight;
      // 恢复宽度以触发动画
      bar.style.width = width;
    });
  }, 100);
}

// ==================== 辅助函数 ====================
/**
 * 保存答题进度到 localStorage
 */
function saveProgress() {
  try {
    const progress = {
      currentQuestion: currentQuestion,
      answers: answers,
      timestamp: Date.now()
    };
    localStorage.setItem('quizProgress', JSON.stringify(progress));
  } catch (e) {
    console.error('保存进度失败:', e);
  }
}

// ==================== 初始化 ====================
/**
 * 页面加载完成后初始化
 */
function init() {
  // 检查是否有保存的测试结果
  try {
    const savedResult = localStorage.getItem('quizResult');
    if (savedResult) {
      const resultData = JSON.parse(savedResult);
      console.log('发现保存的测试结果:', resultData);
      
      // 检查结果是否有效（至少包含animal和similarity）
      if (resultData && resultData.animal && resultData.similarity !== undefined) {
        // 直接显示结果页面
        showResult(resultData);
        console.log('已恢复上次的测试结果');
        // 继续执行按钮绑定，确保重新测试按钮可以正常工作
      } else {
        // 如果结果数据不完整，清除它
        localStorage.removeItem('quizResult');
        console.log('保存的结果数据不完整，已清除');
        // 显示开始页面
        showPage('start');
      }
    } else {
      // 如果没有保存的结果，显示开始页面
      showPage('start');
    }
  } catch (e) {
    console.error('恢复测试结果失败:', e);
    // 如果解析失败，清除无效数据
    localStorage.removeItem('quizResult');
    // 显示开始页面
    showPage('start');
  }
  
  // 绑定开始按钮事件（两个按钮）
  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      await startQuiz(false); // 需要验证链接
    });
  }
  
  const startBtnBottom = document.getElementById('start-btn-bottom');
  if (startBtnBottom) {
    startBtnBottom.addEventListener('click', async () => {
      await startQuiz(false); // 需要验证链接
    });
  }
  
  // 绑定重新测试按钮事件
  const restartBtn = document.getElementById('restart-btn');
  if (restartBtn) {
    restartBtn.addEventListener('click', async () => {
      // 构建重新测试URL（需要包含token和restart参数）
      const urlParams = new URLSearchParams(window.location.search);
      let token = urlParams.get('token');
      
      // 如果URL中没有token，尝试从window.linkValidator获取
      if (!token && window.linkValidator && window.linkValidator.token) {
        token = window.linkValidator.token;
      }
      
      // 清除保存的测试结果和进度
      localStorage.removeItem('quizResult');
      localStorage.removeItem('quizProgress');
      
      // 清除SDK保存的结果
      if (window.linkValidator && window.linkValidator.clearLocalResult) {
        window.linkValidator.clearLocalResult(); // ast是单视角测试
      }
      
      // 重置全局变量
      currentQuestion = 0;
      answers = [];
      
      // 如果有token，构建带restart参数的URL并跳转（刷新页面）
      if (token) {
        const newUrlParams = new URLSearchParams();
        newUrlParams.set('token', token);
        newUrlParams.set('restart', 'true');
        
        // 检查是否是无限测试模式
        const isUnlimited = urlParams.get('unlimited') === 'true';
        if (isUnlimited) {
          newUrlParams.set('unlimited', 'true');
        }
        
        const newUrl = window.location.pathname + '?' + newUrlParams.toString();
        window.location.href = newUrl;
      } else {
        // 没有token，直接显示首页
        showPage('start');
      }
    });
  }
  
  
  // 绑定提交按钮事件
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
      console.log('提交按钮被点击');
      e.preventDefault();
      finishQuiz();
    });
    console.log('提交按钮事件已绑定');
  } else {
    console.warn('提交按钮未找到');
  }
  
  console.log('测试系统初始化完成');
}

// DOM 加载完成后执行初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

