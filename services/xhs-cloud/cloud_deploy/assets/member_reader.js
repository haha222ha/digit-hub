/**
 * 会员站 AI 阅读器 — ES5
 * 依赖：MemberCore.api / global.api
 */
var MemberReader = (function () {
  'use strict';

  var apiFn = function (path, opts) {
    if (typeof window.api === 'function') return window.api(path, opts);
    if (window.MemberCore && window.MemberCore.api) return window.MemberCore.api(path, opts);
    return Promise.reject(new Error('api 未加载'));
  };

  var escFn = function (s) {
    if (typeof window.esc === 'function') return window.esc(s);
    if (window.MemberCore && window.MemberCore.esc) return window.MemberCore.esc(s);
    return String(s || '');
  };

  var getToken = function () {
    if (window.MemberCore && window.MemberCore.getToken) return window.MemberCore.getToken();
    try { return localStorage.getItem('xhs_member_token') || ''; } catch (e) { return ''; }
  };

  var state = 'IDLE';
  var current = { date: '', node: null, sourcePanel: 'archive' };
  var dashData = { today: {}, insightTree: [] }; // 全局保存 dashboard 数据，供卡片视图使用
  var readerViewMode = 'list'; // 'list' | 'cards'
  var dashboard = null;
  var archiveItems = [];
  /** 类目解读筛选：当前视图内存态，scope → 'ALL' | category */
  var insightCatFilters = {};

  function insightCatTag(ins) {
    var t = String((ins && ins.category) || '').trim();
    return t || '未分类';
  }

  function buildInsightCatCounts(items) {
    var map = {};
    var order = [];
    for (var i = 0; i < (items || []).length; i++) {
      var tag = insightCatTag(items[i]);
      if (!map[tag]) {
        map[tag] = 0;
        order.push(tag);
      }
      map[tag]++;
    }
    order.sort(function (a, b) {
      try { return a.localeCompare(b, 'zh'); } catch (e) { return a < b ? -1 : a > b ? 1 : 0; }
    });
    var options = [];
    for (var j = 0; j < order.length; j++) {
      options.push({ tag: order[j], count: map[order[j]] });
    }
    return { total: (items || []).length, options: options };
  }

  function buildInsightCatBarHtml(items, scopeKey) {
    var counts = buildInsightCatCounts(items);
    if (!counts.options.length) return '';
    var active = insightCatFilters[scopeKey] || 'ALL';
    if (active !== 'ALL') {
      var found = false;
      for (var i = 0; i < counts.options.length; i++) {
        if (counts.options[i].tag === active) { found = true; break; }
      }
      if (!found) {
        active = 'ALL';
        insightCatFilters[scopeKey] = 'ALL';
      }
    }
    var html = '<div class="cat-bar" data-cat-scope="' + escFn(scopeKey) + '">';
    html += '<span class="cat-label">类目划分</span>';
    html += '<button type="button" class="cat-chip' + (active === 'ALL' ? ' active' : '') + '" data-cat-filter="ALL">全部<span class="n">'
      + counts.total + '</span></button>';
    for (var j = 0; j < counts.options.length; j++) {
      var c = counts.options[j];
      html += '<button type="button" class="cat-chip' + (active === c.tag ? ' active' : '') + '" data-cat-filter="'
        + escFn(c.tag) + '">' + escFn(c.tag) + '<span class="n">' + c.count + '</span></button>';
    }
    html += '</div>';
    return html;
  }

  function applyInsightCatFilter(container) {
    if (!container) return;
    var bar = container.querySelector('.cat-bar');
    if (!bar) return;
    var scope = bar.getAttribute('data-cat-scope') || '';
    var filter = insightCatFilters[scope] || 'ALL';
    var chips = bar.querySelectorAll('.cat-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('active', (chips[i].getAttribute('data-cat-filter') || '') === filter);
    }
    var grid = container.querySelector('.reader-card-grid');
    if (!grid) return;
    var cells = grid.querySelectorAll('.reader-card-cell');
    for (var k = 0; k < cells.length; k++) {
      var cat = String(cells[k].getAttribute('data-category') || '').trim() || '未分类';
      cells[k].style.display = (filter === 'ALL' || cat === filter) ? '' : 'none';
    }
  }

  function bindInsightCatBar(container) {
    if (!container) return;
    var bar = container.querySelector('.cat-bar');
    if (!bar) return;
    var scope = bar.getAttribute('data-cat-scope') || '';
    var chips = bar.querySelectorAll('.cat-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].onclick = function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        var tag = this.getAttribute('data-cat-filter') || 'ALL';
        insightCatFilters[scope] = tag;
        applyInsightCatFilter(container);
      };
    }
    applyInsightCatFilter(container);
  }

  function bindInsightCatBars(root) {
    if (!root) return;
    var bars = root.querySelectorAll('.cat-bar[data-cat-scope]');
    for (var i = 0; i < bars.length; i++) {
      bindInsightCatBar(bars[i].parentNode);
    }
  }

  // ===== AI 生成进度条 overlay（即使是预生成也显示，模拟实时调用） =====
  var aiGenTimers = [];
  var aiGenStageIdx = 0;
  // 阶段文案：模拟云端真实 LLM 调用流程
  var AI_GEN_STAGES = [
    { pct: 8,  sub: '正在连接云端 AI 模型…',          stage: '初始化' },
    { pct: 18, sub: '读取榜单数据（28 个维度）…',  stage: '读取数据' },
    { pct: 32, sub: '调用 DeepSeek V4 分析日销量增量榜…', stage: '榜单 1/10' },
    { pct: 42, sub: '调用 DeepSeek V4 分析低竞争机会榜…', stage: '榜单 2/10' },
    { pct: 52, sub: '调用 DeepSeek V4 分析新品动量榜…',  stage: '榜单 3/10' },
    { pct: 62, sub: '调用 DeepSeek V4 分析价格带榜单…',  stage: '榜单 4/10' },
    { pct: 72, sub: '调用 DeepSeek V4 分析类目榜单…',    stage: '榜单 5/10' },
    { pct: 82, sub: '生成跨榜综述与方向交集分析…',       stage: '跨榜综述' },
    { pct: 92, sub: '校验合规（商品 ID 拦截）…',  stage: '合规校验' },
    { pct: 98, sub: '打包发布到会员阅读区…',             stage: '发布' }
  ];

  function clearAiGenTimers() {
    for (var i = 0; i < aiGenTimers.length; i++) {
      clearTimeout(aiGenTimers[i]);
      clearInterval(aiGenTimers[i]);
    }
    aiGenTimers = [];
  }

  function showAiGenOverlay(inline) {
    var ov = el('aiGenOverlay');
    if (!ov) return;
    clearAiGenTimers();
    aiGenStageIdx = 0;
    // inline 模式：把 overlay 移入 reader-detail，只覆盖详情视图区域
    if (inline) {
      var detail = el('readerDetail');
      if (detail && detail !== ov.parentNode) {
        detail.appendChild(ov);
      }
      ov.classList.add('inline');
    } else {
      var shell = el('memberShell');
      if (shell && shell !== ov.parentNode) {
        shell.appendChild(ov);
      }
      ov.classList.remove('inline');
    }
    ov.classList.remove('hidden', 'leaving');
    // 立即显示第一帧
    updateAiGenStage(0);
    // 分阶段推进：inline 模式用更短的总时长（~0.9s），全屏模式 1.6s
    var stageDelay = inline ? 100 : 170;
    for (var i = 1; i < AI_GEN_STAGES.length; i++) {
      aiGenTimers.push(setTimeout((function (idx) {
        return function () { updateAiGenStage(idx); };
      })(i), stageDelay * i));
    }
  }

  function updateAiGenStage(idx) {
    if (idx < 0 || idx >= AI_GEN_STAGES.length) return;
    var s = AI_GEN_STAGES[idx];
    aiGenStageIdx = idx;
    var fill = el('aiGenBarFill');
    var pct = el('aiGenPct');
    var sub = el('aiGenSub');
    var stage = el('aiGenStage');
    if (fill) fill.style.width = s.pct + '%';
    if (pct) pct.textContent = s.pct + '%';
    if (sub) sub.textContent = s.sub;
    if (stage) stage.textContent = s.stage;
  }

  function hideAiGenOverlay(opts) {
    opts = opts || {};
    var ov = el('aiGenOverlay');
    if (!ov || ov.classList.contains('hidden')) return;
    // 推到 100%
    updateAiGenStage(AI_GEN_STAGES.length - 1);
    var fill = el('aiGenBarFill');
    var pct = el('aiGenPct');
    var sub = el('aiGenSub');
    var stage = el('aiGenStage');
    if (fill) fill.style.width = '100%';
    if (pct) pct.textContent = '100%';
    if (sub) sub.textContent = 'AI 选品报告已就绪';
    if (stage) stage.textContent = '完成';
    clearAiGenTimers();
    // 短暂停留再淡出
    setTimeout(function () {
      if (ov) {
        ov.classList.add('leaving');
        setTimeout(function () {
          if (ov) ov.classList.add('hidden');
          if (ov) ov.classList.remove('leaving', 'inline');
          // 恢复 overlay 到 memberShell（如果在 inline 模式下被移到了 reader-main）
          var shell = el('memberShell');
          if (shell && ov.parentNode && ov.parentNode.id !== 'memberShell') {
            shell.appendChild(ov);
          }
        }, 250);
      }
    }, opts.delay || 120);
  }

  function setState(s) {
    state = s;
    document.body.dataset.readerState = s;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function renderEmptyWaiting(msg) {
    var body = el('readerBody');
    var frameWrap = el('readerFrameWrap');
    if (frameWrap) frameWrap.classList.add('hidden');
    if (body) {
      body.classList.remove('hidden');
      body.innerHTML = '<div class="reader-empty">' + escFn(msg || '今日 AI 分析尚未发布，请稍后再来。类目情报将在右侧树中展示。') + '</div>';
    }
    var chrome = el('readerChrome');
    if (chrome) chrome.innerHTML = '<h2>报告中心</h2><p>等待云端发布…</p>';
    setState('IDLE');
  }

  function renderPendingState(today) {
    var hint = '报告生成中，预计今日 18:30 前更新。';
    if (today && today.report_date) {
      hint += ' 可先浏览侧栏类目情报或「历史归档」。';
    }
    renderEmptyWaiting(hint);
    setState('PENDING');
    var chrome = el('readerChrome');
    if (chrome) {
      var hero = chrome.getAttribute('data-hero-html') || '';
      chrome.innerHTML = hero + '<h2>报告中心</h2><p>生成中 · 预计 18:30 前更新</p>';
    }
  }

  function bindReadingProgress() {
    var bar = el('readerProgress');
    if (!bar) return;
    var span = bar.querySelector('span');
    function onScroll(target) {
      if (!target) return;
      var h = target.scrollHeight - target.clientHeight;
      var pct = h > 0 ? Math.min(100, Math.round((target.scrollTop / h) * 100)) : 0;
      if (span) span.style.width = pct + '%';
      bar.setAttribute('aria-hidden', pct <= 2 ? 'true' : 'false');
    }
    var body = el('readerBody');
    if (body) body.addEventListener('scroll', function () { onScroll(body); });
  }

  function bindReaderUX() {
    var mobileNav = el('readerMobileNav');
    if (mobileNav) {
      mobileNav.classList.remove('hidden');
      mobileNav.querySelectorAll('[data-route]').forEach(function (btn) {
        btn.onclick = function () {
          var route = btn.getAttribute('data-route') || 'today';
          // switchDash → switchAppPanel → MemberRouter.go，避免重复触发
          if (typeof switchDash === 'function') {
            switchDash(route);
          } else if (window.MemberRouter) {
            MemberRouter.go(route);
          }
          mobileNav.querySelectorAll('.reader-mobile-nav-btn').forEach(function (b) {
            b.classList.toggle('active', b === btn);
          });
        };
      });
    }
    bindReadingProgress();
  }

  function renderHero(radar, recommendations) {
    var chrome = el('readerChrome');
    if (!chrome) return;
    var parts = [];
    if (radar && radar.items && radar.items.length) {
      parts.push('<div class="reader-hero-block"><span class="reader-hero-label">机会雷达</span> ');
      for (var i = 0; i < Math.min(3, radar.items.length); i++) {
        var it = radar.items[i];
        parts.push('<button type="button" class="reader-hero-chip" data-insight-cat="' + escFn(it.category) + '" data-insight-date="' + escFn(it.report_date || '') + '">'
          + escFn(it.category || '') + '</button>');
      }
      parts.push('</div>');
    }
    if (recommendations && recommendations.items && recommendations.items.length) {
      parts.push('<div class="reader-hero-block"><span class="reader-hero-label">推荐阅读</span> ');
      for (var j = 0; j < Math.min(3, recommendations.items.length); j++) {
        var rec = recommendations.items[j];
        parts.push('<button type="button" class="reader-hero-chip" data-insight-cat="' + escFn(rec.category) + '" data-insight-date="' + escFn(rec.report_date || '') + '">'
          + escFn(rec.category || '') + '</button>');
      }
      parts.push('</div>');
    }
    var heroHtml = parts.length ? '<div class="reader-hero">' + parts.join('') + '</div>' : '';
    chrome.setAttribute('data-hero-html', heroHtml);
  }

  function applyChrome(title, subtitle) {
    var chrome = el('readerChrome');
    if (!chrome) return;
    var hero = chrome.getAttribute('data-hero-html') || '';
    chrome.innerHTML = hero + '<h2>' + escFn(title || '报告中心') + '</h2>'
      + (subtitle ? '<p>' + escFn(subtitle) + '</p>' : '');
    chrome.querySelectorAll('.reader-hero-chip').forEach(function (btn) {
      btn.onclick = function () {
        selectNode({
          type: 'insight',
          date: btn.getAttribute('data-insight-date') || '',
          category: btn.getAttribute('data-insight-cat') || ''
        });
      };
    });
  }

  // ===== 8 列等宽规整卡片网格（v2） =====
  function renderCardList(today, insightTree) {
    today = today || {};
    insightTree = insightTree || [];
    dashData.today = today;
    dashData.insightTree = insightTree;

    var body = el('readerCardListBody');
    var dateEl = el('cardListDate');
    if (!body) return;
    var date = today.report_date || '';
    if (dateEl) {
      if (today.status === 'pending') {
        dateEl.textContent = date ? ('报告日期 ' + date + ' · 生成中') : '报告生成中';
      } else if (date) {
        dateEl.textContent = '报告日期 ' + date;
      } else {
        dateEl.textContent = '暂无报告';
      }
    }

    var html = '';
    var seenInsight = {};
    var opportunities = today.opportunities || [];

    // 今日研究简报
    if (today.overview) {
      var oppN = today.overview.opportunity_count || opportunities.length || 0;
      html += '<div class="reader-card-group">';
      html += '<div class="reader-card-group-title">今日研究<span class="count">1</span></div>';
      html += '<div class="reader-card-grid">';
      html += buildCardCell({
        icon: '📊',
        badge: '研究',
        title: today.overview.title || '今日选品研究',
        tags: oppN ? [{ text: oppN + ' 个机会', cls: '' }] : [{ text: 'AI 研究', cls: '' }],
        node: { type: 'overview', date: date }
      });
      html += '</div></div>';
    }

    // 机会卡（doc 49 主卖点：综合 / 高增速 / 高加速度）
    if (opportunities.length) {
      var trackAll = [];
      var trackGrowth = [];
      var trackAccel = [];
      var trackOverall = [];
      for (var ti = 0; ti < opportunities.length; ti++) {
        var t0 = opportunities[ti];
        var st = t0.signal_track || '综合机会';
        if (st === '高增速') trackGrowth.push(t0);
        else if (st === '高加速度') trackAccel.push(t0);
        else trackOverall.push(t0);
        trackAll.push(t0);
      }
      html += '<div class="reader-card-group" id="oppCardGroup">';
      html += '<div class="reader-card-group-title">今日机会<span class="count">' + opportunities.length + '</span></div>';
      html += '<div class="dir-entity-filters opp-track-filters" role="tablist" aria-label="机会轨道筛选">';
      html += '<button type="button" class="dir-entity-chip active" data-opp-filter="all">全部<span class="count">' + trackAll.length + '</span></button>';
      if (trackOverall.length) html += '<button type="button" class="dir-entity-chip" data-opp-filter="综合机会">综合<span class="count">' + trackOverall.length + '</span></button>';
      if (trackGrowth.length) html += '<button type="button" class="dir-entity-chip" data-opp-filter="高增速">高增速<span class="count">' + trackGrowth.length + '</span></button>';
      if (trackAccel.length) html += '<button type="button" class="dir-entity-chip" data-opp-filter="高加速度">高加速度<span class="count">' + trackAccel.length + '</span></button>';
      html += '</div>';

      var renderOppSub = function (list, groupKey, title) {
        if (!list.length) return '';
        var h = '<div class="reader-card-subgroup" data-opp-group="' + groupKey + '">';
        h += '<div class="reader-card-subgroup-title">' + title + '<span class="count">' + list.length + '</span></div>';
        h += '<div class="reader-card-grid">';
        for (var i = 0; i < list.length; i++) {
          var op = list[i];
          var otags = [];
          if (op.opportunity_score != null) otags.push({ text: '指数 ' + op.opportunity_score, cls: 'stars' });
          if (op.signal_track && op.signal_track !== '综合机会') otags.push({ text: op.signal_track, cls: '' });
          if (op.growth_band) otags.push({ text: op.growth_band, cls: 'growth-up' });
          if (op.accel_band) otags.push({ text: op.accel_band, cls: '' });
          if (op.competition_level) otags.push({ text: '竞争' + op.competition_level, cls: '' });
          if (op.price_band) otags.push({ text: op.price_band, cls: '' });
          h += buildCardCell({
            icon: '✨',
            badge: (op.entity_class === 'virtual') ? '虚拟' : '实体',
            title: op.concept_name || op.opportunity_id,
            tags: otags,
            node: { type: 'opportunity', date: date, key: op.opportunity_id }
          });
        }
        h += '</div></div>';
        return h;
      };
      html += renderOppSub(trackOverall, '综合机会', '综合机会');
      html += renderOppSub(trackGrowth, '高增速', '高增速 TOP');
      html += renderOppSub(trackAccel, '高加速度', '高加速度 TOP');
      html += '</div>';
    }

    // 决策简报（原方向解读）
    if (today.directions && today.directions.length) {
      // 按 category_type 分组
      var physicalDirs = [];
      var virtualDirs = [];
      var mixedDirs = [];
      var uncatDirs = [];
      for (var di = 0; di < today.directions.length; di++) {
        var dd = today.directions[di];
        var ct = (dd.category_type || '').toLowerCase();
        if (ct === 'physical') physicalDirs.push(dd);
        else if (ct === 'virtual') virtualDirs.push(dd);
        else if (ct === 'mixed') mixedDirs.push(dd);
        else uncatDirs.push(dd);
      }

      html += '<div class="reader-card-group" id="dirCardGroup">';
      html += '<div class="reader-card-group-title">决策简报<span class="count">' + today.directions.length + '</span></div>';
      html += '<div class="dir-entity-filters" role="tablist" aria-label="简报虚实筛选">';
      html += '<button type="button" class="dir-entity-chip active" data-dir-filter="all">全部<span class="count">' + today.directions.length + '</span></button>';
      if (physicalDirs.length) {
        html += '<button type="button" class="dir-entity-chip" data-dir-filter="physical">实体<span class="count">' + physicalDirs.length + '</span></button>';
      }
      if (virtualDirs.length) {
        html += '<button type="button" class="dir-entity-chip" data-dir-filter="virtual">虚拟<span class="count">' + virtualDirs.length + '</span></button>';
      }
      var otherDirs = mixedDirs.concat(uncatDirs);
      if (otherDirs.length) {
        html += '<button type="button" class="dir-entity-chip" data-dir-filter="mixed">混合<span class="count">' + otherDirs.length + '</span></button>';
      }
      html += '</div>';

      // 实体商品子分组
      if (physicalDirs.length) {
        html += '<div class="reader-card-subgroup" data-dir-group="physical">';
        html += '<div class="reader-card-subgroup-title">实体商品<span class="count">' + physicalDirs.length + '</span></div>';
        html += '<div class="reader-card-grid">';
        for (var pi = 0; pi < physicalDirs.length; pi++) {
          var pd = physicalDirs[pi];
          var ptags = [];
          if (pd.key) ptags.push({ text: pd.key, cls: '' });
          html += buildCardCell({
            icon: '🎯',
            badge: '实体',
            title: pd.title || pd.key,
            tags: ptags,
            node: { type: 'direction', date: date, key: pd.key }
          });
        }
        html += '</div></div>';
      }

      // 虚拟商品子分组
      if (virtualDirs.length) {
        html += '<div class="reader-card-subgroup" data-dir-group="virtual">';
        html += '<div class="reader-card-subgroup-title">虚拟商品<span class="count">' + virtualDirs.length + '</span></div>';
        html += '<div class="reader-card-grid">';
        for (var vi = 0; vi < virtualDirs.length; vi++) {
          var vd = virtualDirs[vi];
          var vtags = [];
          if (vd.key) vtags.push({ text: vd.key, cls: '' });
          html += buildCardCell({
            icon: '🎯',
            badge: '虚拟',
            title: vd.title || vd.key,
            tags: vtags,
            node: { type: 'direction', date: date, key: vd.key }
          });
        }
        html += '</div></div>';
      }

      // 混合 + 未分类子分组（合并展示，避免老报告无 category_type 时整组消失）
      if (otherDirs.length) {
        html += '<div class="reader-card-subgroup" data-dir-group="mixed">';
        var otherTitle = mixedDirs.length && uncatDirs.length ? '混合 / 其他' : (mixedDirs.length ? '混合商品' : '方向解读');
        html += '<div class="reader-card-subgroup-title">' + otherTitle + '<span class="count">' + otherDirs.length + '</span></div>';
        html += '<div class="reader-card-grid">';
        for (var oi = 0; oi < otherDirs.length; oi++) {
          var od = otherDirs[oi];
          var otags = [];
          if (od.key) otags.push({ text: od.key, cls: '' });
          html += buildCardCell({
            icon: '🎯',
            badge: '混合',
            title: od.title || od.key,
            tags: otags,
            node: { type: 'direction', date: date, key: od.key }
          });
        }
        html += '</div></div>';
      }

      html += '</div>'; // /reader-card-group
    }

    // 类目情报分组
    var insightItems = [];
    if (insightTree.length) {
      for (var g = 0; g < insightTree.length; g++) {
        var group = insightTree[g];
        var gdate = group.report_date || '';
        var items = group.items || [];
        for (var j = 0; j < items.length; j++) {
          var ins = items[j];
          var cat = ins.category || '';
          var key = gdate + ':' + cat;
          if (seenInsight[key]) continue;
          seenInsight[key] = true;
          insightItems.push({ ins: ins, gdate: gdate });
        }
      }
    } else if (today.insights && today.insights.length) {
      for (var k = 0; k < today.insights.length; k++) {
        insightItems.push({ ins: today.insights[k], gdate: today.insights[k].report_date || date });
      }
    }

    if (insightItems.length) {
      var cardCatScope = 'cards:' + (date || 'latest');
      html += '<div class="reader-card-group">';
      html += '<div class="reader-card-group-title">类目情报<span class="count">' + insightItems.length + '</span></div>';
      var cardInsList = [];
      for (var pre = 0; pre < insightItems.length; pre++) cardInsList.push(insightItems[pre].ins);
      html += buildInsightCatBarHtml(cardInsList, cardCatScope);
      html += '<div class="reader-card-grid">';
      for (var m = 0; m < insightItems.length; m++) {
        var item = insightItems[m];
        var ins2 = item.ins;
        var gdate2 = item.gdate;
        var catTag2 = insightCatTag(ins2);
        var stars = ins2.stars || 0;
        var growth = ins2.growth_rate;
        var growthStr = (growth !== null && growth !== undefined && growth !== '') ? (growth + '%') : '';
        var growthCls = growth > 0 ? 'growth-up' : (growth < 0 ? 'growth-down' : '');
        var trend = ins2.trend_label || '';
        var tags = [];
        if (stars) tags.push({ text: '★' + stars, cls: 'stars' });
        if (growthStr) tags.push({ text: (growth > 0 ? '↑' : growth < 0 ? '↓' : '') + growthStr, cls: growthCls });
        if (trend) tags.push({ text: trend, cls: '' });
        if (ins2.lifecycle_stage) tags.push({ text: ins2.lifecycle_stage, cls: '' });
        html += buildCardCell({
          icon: '📈',
          badge: stars ? ('★' + stars) : '类目',
          title: catTag2,
          tags: tags,
          node: { type: 'insight', date: gdate2, category: ins2.category || '' }
        });
      }
      html += '</div></div>';
    }

    if (!html) {
      if (today.status === 'pending') {
        html = '<div class="reader-empty">报告生成中，预计今日 18:30 前更新。</div>';
      } else {
        html = '<div class="reader-empty">今日 AI 分析尚未发布，请稍后再来。</div>';
      }
    }
    body.innerHTML = html;

    bindInsightCatBars(body);
    bindDirEntityFilters(body);
    bindOppTrackFilters(body);

    // 绑定卡片点击
    var cells = body.querySelectorAll('.reader-card-cell');
    for (var r = 0; r < cells.length; r++) {
      cells[r].onclick = function () {
        selectNode({
          type: this.getAttribute('data-node'),
          date: this.getAttribute('data-date') || '',
          key: this.getAttribute('data-key') || '',
          category: this.getAttribute('data-category') || ''
        }, true);
      };
    }
  }

  function bindDirEntityFilters(root) {
    if (!root) return;
    var chips = root.querySelectorAll('.dir-entity-chip');
    if (!chips.length) return;
    function applyFilter(filter) {
      var groups = root.querySelectorAll('.reader-card-subgroup[data-dir-group]');
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i];
        var kind = g.getAttribute('data-dir-group') || '';
        g.style.display = (filter === 'all' || filter === kind) ? '' : 'none';
      }
      for (var c = 0; c < chips.length; c++) {
        var chip = chips[c];
        var active = (chip.getAttribute('data-dir-filter') || '') === filter;
        if (active) chip.classList.add('active');
        else chip.classList.remove('active');
      }
    }
    for (var j = 0; j < chips.length; j++) {
      chips[j].onclick = function (ev) {
        ev.preventDefault();
        applyFilter(this.getAttribute('data-dir-filter') || 'all');
      };
    }
  }

  function bindOppTrackFilters(root) {
    if (!root) return;
    var chips = root.querySelectorAll('.opp-track-filters .dir-entity-chip');
    if (!chips.length) return;
    function applyFilter(filter) {
      var groups = root.querySelectorAll('#oppCardGroup .reader-card-subgroup[data-opp-group]');
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i];
        var kind = g.getAttribute('data-opp-group') || '';
        g.style.display = (filter === 'all' || filter === kind) ? '' : 'none';
      }
      for (var c = 0; c < chips.length; c++) {
        var chip = chips[c];
        var active = (chip.getAttribute('data-opp-filter') || '') === filter;
        if (active) chip.classList.add('active');
        else chip.classList.remove('active');
      }
    }
    for (var j = 0; j < chips.length; j++) {
      chips[j].onclick = function (ev) {
        ev.preventDefault();
        applyFilter(this.getAttribute('data-opp-filter') || 'all');
      };
    }
  }

  function buildCardCell(opts) {
    var node = opts.node || {};
    var tags = opts.tags || [];
    var tagHtml = '';
    if (tags.length) {
      tagHtml = '<div class="rcc-tags">';
      for (var t = 0; t < tags.length && t < 4; t++) {
        var tg = tags[t] || {};
        tagHtml += '<span class="rcc-tag ' + escFn(tg.cls || '') + '">' + escFn(String(tg.text || '')) + '</span>';
      }
      tagHtml += '</div>';
    }
    return '<button type="button" class="reader-card-cell"'
      + ' data-node="' + escFn(node.type || '') + '"'
      + ' data-date="' + escFn(node.date || '') + '"'
      + (node.key ? ' data-key="' + escFn(node.key) + '"' : '')
      + (node.category ? ' data-category="' + escFn(node.category) + '"' : '')
      + '>'
      + '<div class="rcc-icon">' + opts.icon + '</div>'
      + '<div class="rcc-title">' + escFn(opts.title) + '</div>'
      + tagHtml
      + '</button>';
  }

  function highlightCard(node) {
    var roots = [el('archiveList'), el('readerCardListBody')].filter(Boolean);
    if (!roots.length) return;
    for (var r = 0; r < roots.length; r++) {
      var cells = roots[r].querySelectorAll('.reader-card-cell');
      for (var i = 0; i < cells.length; i++) {
        var btn = cells[i];
        var match = btn.getAttribute('data-node') === node.type
          && (btn.getAttribute('data-date') || '') === (node.date || '');
        if (node.type === 'direction' || node.type === 'opportunity') match = match && btn.getAttribute('data-key') === node.key;
        if (node.type === 'insight') match = match && btn.getAttribute('data-category') === node.category;
        btn.classList.toggle('active', match);
      }
    }
  }

  // 切换到详情视图（报告中心 browse ↔ detail）
  function showDetailView() {
    var browse = el('archiveBrowse') || el('readerCardList');
    var detail = el('readerDetail');
    if (browse) browse.classList.add('hidden');
    if (detail) detail.classList.remove('hidden');
  }

  // 返回报告中心网格
  function backToCardList() {
    var browse = el('archiveBrowse') || el('readerCardList');
    var detail = el('readerDetail');
    if (detail) detail.classList.add('hidden');
    if (browse) browse.classList.remove('hidden');
    var frameWrap = el('readerFrameWrap');
    var body = el('readerBody');
    if (frameWrap) frameWrap.classList.add('hidden');
    if (body) body.classList.add('hidden');
    current.node = null;
    current.sourcePanel = 'archive';
    setState('IDLE');
    if (window.MemberRouter && MemberRouter.current() !== 'archive') {
      MemberRouter.go('archive');
    }
  }

  function updateChrome(title, subtitle) {
    applyChrome(title, subtitle);
  }

  // 轻量 Markdown → HTML 渲染（ES5 兼容，支持 emoji/标题/引用/列表/加粗/代码/分隔线）
  function renderMarkdown(md) {
    if (!md) return '';
    var text = String(md);
    // 1. 转义 HTML 特殊字符
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // 2. 标题（#### ### ## #）
    text = text.replace(/^#### (.+)$/gm, '\n<h4>$1</h4>\n');
    text = text.replace(/^### (.+)$/gm, '\n<h3>$1</h3>\n');
    text = text.replace(/^## (.+)$/gm, '\n<h2>$1</h2>\n');
    text = text.replace(/^# (.+)$/gm, '\n<h1>$1</h1>\n');
    // 3. 引用块（> ...）
    text = text.replace(/^&gt; (.+)$/gm, '\n<blockquote>$1</blockquote>\n');
    // 4. 分隔线 ---
    text = text.replace(/^---+$/gm, '\n<hr>\n');
    // 5. 无序列表（- ... 或 * ...）
    text = text.replace(/^[\-\*] (.+)$/gm, '\n<li>$1</li>\n');
    // 6. 有序列表（1. ...）
    text = text.replace(/^\d+\. (.+)$/gm, '\n<li>$1</li>\n');
    // 7. 把连续 <li> 包成 <ul>
    text = text.replace(/(?:<li>[\s\S]*?<\/li>\s*)+/g, function (m) {
      return '<ul>' + m.replace(/\s+/g, ' ') + '</ul>';
    });
    // 8. 加粗 **...**
    text = text.replace(/\*\*([^\*]+?)\*\*/g, '<strong>$1</strong>');
    // 9. 行内代码 `...`
    text = text.replace(/`([^`]+?)`/g, '<code>$1</code>');
    // 10. 段落处理：按空行分块
    var blocks = text.split(/\n{2,}/);
    var out = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i].replace(/^\n+|\n+$/g, '');
      if (!b) continue;
      if (/^<(h[1-6]|ul|ol|blockquote|hr|pre|table|div|p)/.test(b)) {
        out.push(b);
      } else {
        b = b.replace(/\n/g, '<br>');
        out.push('<p>' + b + '</p>');
      }
    }
    return out.join('\n');
  }

  function renderSourceRefsBlock(refs) {
    if (!refs || !refs.length) return '';
    var rows = '';
    for (var i = 0; i < refs.length; i++) {
      var r = refs[i] || {};
      rows += '<tr><td><code>' + escFn(String(r.id || '')) + '</code></td>'
        + '<td>' + escFn(String(r.label || '')) + '</td>'
        + '<td>' + escFn(String(r.value == null ? '—' : r.value)) + '</td>'
        + '<td class="src-origin">' + escFn(String(r.origin || '')) + '</td></tr>';
    }
    return '<details class="advisor-source-refs">'
      + '<summary>数据来源（程序事实 · 可核对）</summary>'
      + '<p class="src-hint">正文中的 [sr_…] 引用对应下列程序侧事实；AI 不得编造清单外数字。</p>'
      + '<div class="src-table-wrap"><table class="src-table"><thead><tr>'
      + '<th>引用 ID</th><th>含义</th><th>数值</th><th>来源</th></tr></thead><tbody>'
      + rows + '</tbody></table></div></details>';
  }

  function renderMarkdownArticle(data, node) {
    var body = el('readerBody');
    var frameWrap = el('readerFrameWrap');
    if (frameWrap) frameWrap.classList.add('hidden');
    if (!body) return;

    var html = '';
    var title = '';
    var refs = data.source_refs || [];
    if (data.daily_overview) {
      title = data.daily_overview.title || '今日市场观察';
      html = data.daily_overview.content || data.daily_overview.summary || '';
      if (!refs.length && data.daily_overview.source_refs) {
        refs = data.daily_overview.source_refs;
      }
    } else if (data.content) {
      title = data.title || '分析';
      html = data.content;
    } else if (data.title) {
      title = data.title;
      html = data.summary || '';
    }

    updateChrome(title, node && node.date ? '报告日期 ' + node.date : '');
    body.classList.remove('hidden');
    body.innerHTML = '<article class="advisor-prose">' + renderMarkdown(html) + '</article>'
      + renderSourceRefsBlock(refs)
      + '<footer class="advisor-disclaimer">仅供参考，不构成投资建议。数据基于公开信息与系统计算，存在延迟与误差。</footer>';
    setState('READING');
  }

  function loadInsightIframe(url) {
    var body = el('readerBody');
    var frameWrap = el('readerFrameWrap');
    var frame = el('readerFrame');
    if (body) body.classList.add('hidden');
    if (frameWrap) frameWrap.classList.remove('hidden');
    if (frame) {
      var t = getToken();
      frame.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'access_token=' + encodeURIComponent(t);
    }
    setState('READING');
    // iframe 加载完成后隐藏 AI overlay（如有）
    if (frame) {
      frame.onload = function () { hideAiGenOverlay(); };
    }
  }

  function loadAdvisorHtml(date) {
    var body = el('readerBody');
    var frameWrap = el('readerFrameWrap');
    var frame = el('readerFrame');
    if (body) body.classList.add('hidden');
    if (frameWrap) frameWrap.classList.remove('hidden');
    if (frame) {
      var t = getToken();
      frame.src = '/api/v1/member/advisor/' + encodeURIComponent(date) + '/view?access_token=' + encodeURIComponent(t);
    }
    updateChrome('AI 选品顾问', date);
    setState('READING');
    if (frame) {
      frame.onload = function () { hideAiGenOverlay(); };
    }
  }

  function handleError(err) {
    var locked = el('readerLocked');
    var errEl = el('readerError');
    if (err && err.status === 402) {
      setState('LOCKED');
      if (locked) locked.style.display = 'flex';
      if (errEl) errEl.style.display = 'none';
      return;
    }
    if (err && err.status === 410) {
      setState('ERROR');
      var mig = '/member#today';
      try {
        var det = err.data && err.data.detail;
        if (det && typeof det === 'object' && det.migration_url) mig = det.migration_url;
      } catch (e) {}
      if (errEl) {
        errEl.style.display = 'block';
        errEl.innerHTML = '表格数据包已下线，请前往 <a href="' + escFn(mig) + '" style="color:var(--reader-accent)">AI 分析中心</a> 阅读。';
      }
      return;
    }
    if (err && err.status === 401) {
      setState('ERROR');
      if (locked) locked.style.display = 'none';
      if (errEl) {
        errEl.style.display = 'block';
        errEl.textContent = '登录已失效，请退出后重新登录';
      }
      return;
    }
    setState('ERROR');
    if (locked) locked.style.display = 'none';
    if (errEl) {
      errEl.style.display = 'block';
      errEl.textContent = (err && err.message) || '加载失败';
    }
  }

  function selectNode(node, isUserClick, _src) {
    current.node = node;
    current.date = node.date || '';
    // 统一入口为报告中心；兼容旧调用传入的 sourcePanel
    current.sourcePanel = (typeof _src === 'string' && _src) ? _src : 'archive';
    setState('LOADING');
    highlightCard(node);

    // 切换到详情视图
    showDetailView();

    var locked = el('readerLocked');
    var errEl = el('readerError');
    if (locked) locked.style.display = 'none';
    if (errEl) errEl.style.display = 'none';

    // 用户点击卡片时，模拟 AI 实时生成动画（inline 模式，只覆盖详情视图区域）
    if (isUserClick) {
      showAiGenOverlay(true);
    }

    if (node.type === 'insight') {
      updateChrome(node.category, node.date);
      var insUrl = '/api/v1/member/insight/' + encodeURIComponent(node.date) + '/' + encodeURIComponent(node.category) + '/view';
      loadInsightIframe(insUrl);
      return;
    }

    if (node.type === 'overview' && node.date) {
      apiFn('/api/v1/member/advisor/' + encodeURIComponent(node.date), { auth: true })
        .then(function (data) { renderMarkdownArticle(data, node); })
        .then(function () { if (isUserClick) hideAiGenOverlay(); })
        .catch(function (e) {
          if (isUserClick) hideAiGenOverlay();
          if (e && e.status === 404) loadAdvisorHtml(node.date);
          else handleError(e);
        });
      return;
    }

    if ((node.type === 'direction' || node.type === 'opportunity') && node.date && node.key) {
      apiFn('/api/v1/member/advisor/' + encodeURIComponent(node.date) + '/articles/' + encodeURIComponent(node.key), { auth: true })
        .then(function (data) { renderMarkdownArticle(data, node); })
        .then(function () { if (isUserClick) hideAiGenOverlay(); })
        .catch(function (e) {
          if (isUserClick) hideAiGenOverlay();
          handleError(e);
        });
      return;
    }

    if (node.type === 'archive' && node.date) {
      apiFn('/api/v1/member/advisor/' + encodeURIComponent(node.date), { auth: true })
        .then(function (data) { renderMarkdownArticle(data, node); })
        .then(function () { if (isUserClick) hideAiGenOverlay(); })
        .catch(function (e) {
          if (isUserClick) hideAiGenOverlay();
          if (e && e.status === 404) loadAdvisorHtml(node.date);
          else handleError(e);
        });
      return;
    }

    if (isUserClick) hideAiGenOverlay();
    renderEmptyWaiting();
  }

  function updateKPIs(data) {
    data = data || {};
    var today = data.today || {};
    var insightTree = data.insight_tree || [];
    var directions = today.directions || [];
    var insights = today.insights || [];
    // 今日榜单 = 类目情报数（优先 insight_tree 第一组的 items 数，回退 today.insights）
    var rankingCount = 0;
    if (insightTree.length && insightTree[0] && insightTree[0].items) {
      rankingCount = insightTree[0].items.length;
    } else {
      rankingCount = insights.length;
    }
    // 方向解读 = directions 数量
    var dirCount = directions.length;
    // 蓝海机会 = 高星级（≥4星）类目情报数
    var blueOcean = 0;
    var allInsights = [];
    if (insightTree.length) {
      for (var i = 0; i < insightTree.length; i++) {
        var items = (insightTree[i] || {}).items || [];
        for (var j = 0; j < items.length; j++) allInsights.push(items[j]);
      }
    } else {
      allInsights = insights;
    }
    for (var k = 0; k < allInsights.length; k++) {
      if ((allInsights[k].stars || 0) >= 4) blueOcean++;
    }
    // 报告日期
    var dateStr = today.report_date || '';
    var dateShort = dateStr ? dateStr.slice(5) : '—'; // MM-DD
    // 模式标签
    var mode = today.status === 'published' ? 'AI 已生成' : '生成中';

    var set = function (id, val) {
      var n = document.getElementById(id);
      if (n) n.textContent = val;
    };
    set('kpiRankings', rankingCount || '—');
    set('kpiDirections', dirCount || '—');
    set('kpiBlueOcean', blueOcean || '—');
    set('kpiDate', dateShort);
    set('kpiMode', mode);
    set('kpiRankingsDelta', rankingCount ? '类目情报' : '暂无');
    set('kpiDirectionsDelta', dirCount ? '个方向' : '暂无');
    // 侧栏会员标签
    var planLabel = (data.membership && (data.membership.plan_label || data.membership.plan_code)) || '会员版';
    var planNode = document.getElementById('sidebarPlanLabel');
    if (planNode) planNode.textContent = planLabel;
  }

  function loadDashboard() {
    setState('LOADING');
    // 显示 AI 生成中 overlay（即使是预生成也走这个动画，让用户感觉是实时调用）
    showAiGenOverlay();
    return Promise.all([
      apiFn('/api/v1/member/advisor/dashboard', { auth: true }),
      apiFn('/api/v1/member/insight/radar', { auth: true }).catch(function () { return null; }),
      apiFn('/api/v1/member/insight/recommendations', { auth: true }).catch(function () { return null; })
    ]).then(function (results) {
      var data = results[0];
      var radar = results[1];
      var recommend = results[2];
      dashboard = data;
      // 至少展示 1.4s，避免动画闪过；API 快的话也走完阶段
      return new Promise(function (resolve) {
        setTimeout(function () { resolve({ data: data, radar: radar, recommend: recommend }); }, 1400);
      });
    }).then(function (bundle) {
      renderHero(bundle.radar, bundle.recommend);
      // 渲染横排卡片瀑布流列表（今日简报 / 方向解读 / 类目情报）
      renderCardList(bundle.data.today || {}, bundle.data.insight_tree || []);
      var today = bundle.data.today || {};
      applyChrome('报告中心', today.report_date ? '报告日期 ' + today.report_date : '');
      updateKPIs(bundle.data);
      hideAiGenOverlay();
      return bundle.data;
    }).catch(function (err) {
      hideAiGenOverlay();
      return handleError(err);
    });
  }

  function loadArchive() {
    var host = el('archiveList');
    if (!host) return Promise.resolve();
    // 正在阅读详情时勿刷列表（从收藏/账户切回也不会中断）
    var detail = el('readerDetail');
    if (detail && !detail.classList.contains('hidden') && current.node) {
      return Promise.resolve();
    }
    host.innerHTML = '<div class="reader-empty">加载中…</div>';
    return Promise.all([
      apiFn('/api/v1/member/advisor/library', { auth: true }),
      apiFn('/api/v1/member/insight/library', { auth: true }).catch(function () { return { items: [] }; })
    ]).then(function (results) {
      var data = results[0] || {};
      var insightLib = results[1] || {};
      archiveItems = data.items || [];

      // 类目解读（原「今日分析」类目情报）按日期汇总
      var insightsByDate = {};
      var insightItems = insightLib.items || [];
      for (var ii = 0; ii < insightItems.length; ii++) {
        var ins0 = insightItems[ii];
        var idate = String(ins0.report_date || '').slice(0, 10);
        if (!idate) continue;
        if (!insightsByDate[idate]) insightsByDate[idate] = [];
        insightsByDate[idate].push(ins0);
      }
      var insightDates = Object.keys(insightsByDate);
      for (var is = 0; is < insightDates.length; is++) {
        insightsByDate[insightDates[is]].sort(function (a, b) {
          return (b.stars || 0) - (a.stars || 0);
        });
      }

      // 仅有类目、无顾问的日期，补进报告中心
      var seenDates = {};
      for (var ai = 0; ai < archiveItems.length; ai++) {
        seenDates[archiveItems[ai].report_date || ''] = true;
      }
      for (var id2 = 0; id2 < insightDates.length; id2++) {
        var dOnly = insightDates[id2];
        if (seenDates[dOnly]) continue;
        archiveItems.push({
          report_date: dOnly,
          directions: [],
          direction_count: 0,
          physical_count: 0,
          virtual_count: 0,
          mixed_count: 0,
          insight_only: true
        });
      }
      archiveItems.sort(function (a, b) {
        return String(b.report_date || '').localeCompare(String(a.report_date || ''));
      });

      if (!archiveItems.length) {
        host.innerHTML = '<div class="reader-empty">暂无报告与类目解读，生成后会在此置顶展示。</div>';
        return;
      }

      // 1) 按月份分组（YYYY-MM → items[]），月份内按日期新→旧
      var groups = {};
      var groupOrder = [];
      for (var i = 0; i < archiveItems.length; i++) {
        var it = archiveItems[i];
        var ym = (it.report_date || '').slice(0, 7);
        if (!ym) continue;
        if (!groups[ym]) { groups[ym] = []; groupOrder.push(ym); }
        groups[ym].push(it);
      }
      groupOrder.sort().reverse();
      for (var gs = 0; gs < groupOrder.length; gs++) {
        groups[groupOrder[gs]].sort(function (a, b) {
          return String(b.report_date || '').localeCompare(String(a.report_date || ''));
        });
      }

      var now = new Date();
      var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      var currentYM = todayStr.slice(0, 7);
      var latestDate = archiveItems[0] ? (archiveItems[0].report_date || '') : '';
      // 有「今天」的报告则置顶展开今天；否则展开最新一日
      var pinDate = '';
      for (var pi = 0; pi < archiveItems.length; pi++) {
        if (archiveItems[pi].report_date === todayStr) { pinDate = todayStr; break; }
      }
      if (!pinDate) pinDate = latestDate;

      var dateEl = el('cardListDate');
      if (dateEl) {
        dateEl.textContent = pinDate === todayStr
          ? ('今日 ' + todayStr + ' 已置顶 · 点选日期卡片查看报告')
          : ('最新 ' + (pinDate || '—') + ' · 月份 → 日期网格 → 方向 / 类目');
      }

      // 2) 月份 → 日期 → 虚拟/实体 → 电商网格卡片
      var html = '<div class="archive-list">';
      for (var g = 0; g < groupOrder.length; g++) {
        var ymKey = groupOrder[g];
        var items = groups[ymKey];
        var isCurrent = (ymKey === currentYM);
        var monthExpanded = isCurrent || g === 0;
        var ymLabel = formatMonthLabel(ymKey);
        var monthIcon = monthExpanded ? '📂' : '📁';
        var monthArrow = monthExpanded ? '▼' : '▶';
        var totalDirs = 0;
        for (var td = 0; td < items.length; td++) {
          totalDirs += (items[td].direction_count || (items[td].directions || []).length || 0);
        }

        html += '<div class="archive-month-group' + (isCurrent ? ' current' : '') + '">';
        html += '<div class="archive-month-head" data-ym="' + escFn(ymKey) + '">';
        html += '<span class="archive-month-icon">' + monthIcon + '</span>';
        html += '<span class="archive-month-title">' + escFn(ymLabel) + '</span>';
        html += '<span class="archive-month-count">' + items.length + ' 天 · ' + totalDirs + ' 篇</span>';
        html += '<span class="archive-month-arrow">' + monthArrow + '</span>';
        html += '</div>';
        html += '<div class="archive-month-body"' + (monthExpanded ? '' : ' style="display:none"') + '>';

        // 日期横排网格（电商列表风格）+ 下方展开选中日内容
        var dayGridHtml = '';
        var dayPanelsHtml = '';
        for (var k = 0; k < items.length; k++) {
          var it2 = items[k];
          var rd = it2.report_date || '';
          var dayLabel = rd.slice(5);
          var dirs = it2.directions || [];
          var dirCount = it2.direction_count || dirs.length || 0;
          var dayInsights = insightsByDate[rd] || [];
          var insightCount = dayInsights.length;
          var physicalCnt = it2.physical_count || 0;
          var virtualCnt = it2.virtual_count || 0;
          var mixedCnt = it2.mixed_count || 0;
          var isToday = (rd === todayStr);
          var dayExpanded = (rd === pinDate);

          var metaBits = [];
          if (dirCount) metaBits.push(dirCount + '方向');
          if (insightCount) metaBits.push(insightCount + '类目');
          if (!metaBits.length) metaBits.push('暂无');

          dayGridHtml += '<button type="button" class="reader-card-cell archive-day-cell'
            + (dayExpanded ? ' active' : '')
            + (isToday ? ' is-today' : '')
            + '" data-date="' + escFn(rd) + '">';
          dayGridHtml += '<div class="rcc-icon">' + (isToday ? '📅' : '🗂') + '</div>';
          dayGridHtml += '<div class="rcc-title">' + escFn(dayLabel) + '</div>';
          if (isToday) dayGridHtml += '<div class="archive-today-badge">今日</div>';
          dayGridHtml += '<div class="archive-day-cell-meta">' + escFn(metaBits.join(' · ')) + '</div>';
          if (physicalCnt || virtualCnt || insightCount) {
            dayGridHtml += '<div class="archive-day-cell-badges">'
              + (physicalCnt ? '<span class="cat-badge cat-physical">🏷️' + physicalCnt + '</span>' : '')
              + (virtualCnt ? '<span class="cat-badge cat-virtual">💾' + virtualCnt + '</span>' : '')
              + (insightCount ? '<span class="cat-badge cat-insight">📈' + insightCount + '</span>' : '')
              + '</div>';
          }
          dayGridHtml += '</button>';

          dayPanelsHtml += '<div class="archive-day-panel' + (dayExpanded ? ' expanded' : '') + '"'
            + ' data-date="' + escFn(rd) + '"'
            + (dayExpanded ? '' : ' style="display:none"') + '>';
          dayPanelsHtml += '<div class="archive-day-panel-title">'
            + (isToday ? '今日 ' : '') + escFn(rd) + ' 报告'
            + '</div>';

          if (!it2.insight_only) {
            dayPanelsHtml += '<div class="reader-card-group">';
            dayPanelsHtml += '<div class="reader-card-group-title">整日报告<span class="count">1</span></div>';
            dayPanelsHtml += '<div class="reader-card-grid">';
            dayPanelsHtml += buildCardCell({
              icon: '📄',
              badge: isToday ? '今日' : '整日',
              title: isToday ? '今日整日报告' : (dayLabel + ' 整日报告'),
              node: { type: 'archive', date: rd }
            });
            dayPanelsHtml += '</div></div>';
          }

          if (dirs.length) {
            var buckets = { physical: [], virtual: [], other: [] };
            for (var di = 0; di < dirs.length; di++) {
              var dInfo = dirs[di];
              var ct0 = (dInfo.category_type || '').toLowerCase();
              if (ct0 === 'physical') buckets.physical.push(dInfo);
              else if (ct0 === 'virtual') buckets.virtual.push(dInfo);
              else buckets.other.push(dInfo);
            }
            var typeSpecs = [
              { key: 'physical', label: '实体商品', icon: '🏷️', cls: 'cat-physical', list: buckets.physical },
              { key: 'virtual', label: '虚拟商品', icon: '💾', cls: 'cat-virtual', list: buckets.virtual },
              { key: 'other', label: (buckets.physical.length || buckets.virtual.length) ? '混合 / 其他' : '全部方向', icon: '📂', cls: 'cat-mixed', list: buckets.other }
            ];
            for (var ts = 0; ts < typeSpecs.length; ts++) {
              var spec = typeSpecs[ts];
              if (!spec.list.length) continue;
              dayPanelsHtml += '<div class="archive-type-group expanded">';
              dayPanelsHtml += '<div class="archive-type-head" data-type="' + spec.key + '">';
              dayPanelsHtml += '<span class="archive-type-icon">📂</span>';
              dayPanelsHtml += '<span class="archive-type-title ' + spec.cls + '">' + spec.icon + ' ' + spec.label + '</span>';
              dayPanelsHtml += '<span class="archive-type-count">' + spec.list.length + ' 篇</span>';
              dayPanelsHtml += '<span class="archive-type-arrow">▼</span>';
              dayPanelsHtml += '</div>';
              dayPanelsHtml += '<div class="archive-type-body">';
              dayPanelsHtml += '<div class="reader-card-grid">';
              for (var di2 = 0; di2 < spec.list.length; di2++) {
                var d2 = spec.list[di2];
                dayPanelsHtml += buildCardCell({
                  icon: '🎯',
                  badge: spec.label,
                  title: d2.title || d2.key,
                  node: { type: 'direction', date: rd, key: d2.key }
                });
              }
              dayPanelsHtml += '</div></div></div>';
            }
          } else if (!it2.insight_only) {
            dayPanelsHtml += '<div class="archive-dir-empty">该日无方向解读数据</div>';
          }

          if (dayInsights.length) {
            var dayCatScope = 'archive:' + rd;
            dayPanelsHtml += '<div class="archive-type-group expanded">';
            dayPanelsHtml += '<div class="archive-type-head" data-type="insight">';
            dayPanelsHtml += '<span class="archive-type-icon">📂</span>';
            dayPanelsHtml += '<span class="archive-type-title cat-insight">📈 类目解读</span>';
            dayPanelsHtml += '<span class="archive-type-count">' + dayInsights.length + ' 篇</span>';
            dayPanelsHtml += '<span class="archive-type-arrow">▼</span>';
            dayPanelsHtml += '</div>';
            dayPanelsHtml += '<div class="archive-type-body">';
            dayPanelsHtml += buildInsightCatBarHtml(dayInsights, dayCatScope);
            dayPanelsHtml += '<div class="reader-card-grid">';
            for (var mi = 0; mi < dayInsights.length; mi++) {
              var ins2 = dayInsights[mi];
              var dayCatTag = insightCatTag(ins2);
              dayPanelsHtml += buildCardCell({
                icon: '📈',
                badge: ins2.stars ? ('★' + ins2.stars) : '类目',
                title: dayCatTag,
                node: { type: 'insight', date: rd, category: ins2.category || '' }
              });
            }
            dayPanelsHtml += '</div></div></div>';
          }

          dayPanelsHtml += '</div>'; // /archive-day-panel
        }

        html += '<div class="reader-card-group archive-day-picker">';
        html += '<div class="reader-card-group-title">日期<span class="count">' + items.length + '</span></div>';
        html += '<div class="reader-card-grid archive-day-grid">' + dayGridHtml + '</div>';
        html += '</div>';
        html += '<div class="archive-day-panels">' + dayPanelsHtml + '</div>';

        html += '</div></div>'; // month-body / month-group
      }
      html += '</div>';
      host.innerHTML = html;

      bindInsightCatBars(host);

      var monthHeads = host.querySelectorAll('.archive-month-head');
      for (var h = 0; h < monthHeads.length; h++) {
        monthHeads[h].onclick = function () { toggleArchiveGroup(this, 'month'); };
      }
      // 日期网格：点击切换下方该日内容（同月内单选）
      var dayCells = host.querySelectorAll('.archive-day-cell');
      for (var dh = 0; dh < dayCells.length; dh++) {
        dayCells[dh].onclick = function (e) {
          e.stopPropagation();
          var date = this.getAttribute('data-date') || '';
          var monthBody = this.closest ? this.closest('.archive-month-body') : null;
          if (!monthBody) {
            var p = this.parentNode;
            while (p && !(p.className && String(p.className).indexOf('archive-month-body') >= 0)) p = p.parentNode;
            monthBody = p;
          }
          if (!monthBody) return;
          var cellsInMonth = monthBody.querySelectorAll('.archive-day-cell');
          for (var ci = 0; ci < cellsInMonth.length; ci++) {
            cellsInMonth[ci].classList.toggle('active', cellsInMonth[ci].getAttribute('data-date') === date);
          }
          var panels = monthBody.querySelectorAll('.archive-day-panel');
          for (var pi2 = 0; pi2 < panels.length; pi2++) {
            var show = panels[pi2].getAttribute('data-date') === date;
            panels[pi2].style.display = show ? '' : 'none';
            panels[pi2].classList.toggle('expanded', show);
          }
        };
      }
      var typeHeads = host.querySelectorAll('.archive-type-head');
      for (var th = 0; th < typeHeads.length; th++) {
        typeHeads[th].onclick = function (e) {
          e.stopPropagation();
          toggleArchiveGroup(this, 'type');
        };
      }
      // 内容卡片：进入阅读（排除日期选择格）
      var cells = host.querySelectorAll('.reader-card-cell:not(.archive-day-cell)');
      for (var c = 0; c < cells.length; c++) {
        cells[c].onclick = function (e) {
          e.stopPropagation();
          selectNode({
            type: this.getAttribute('data-node'),
            date: this.getAttribute('data-date') || '',
            key: this.getAttribute('data-key') || '',
            category: this.getAttribute('data-category') || ''
          }, true, 'archive');
        };
      }
    }).catch(function (e) {
      host.innerHTML = '<div class="reader-empty">' + escFn(e.message || '加载失败') + '</div>';
    });
  }

  // 通用折叠切换（month / day / type）—— 选择器必须带 archive- 前缀
  function toggleArchiveGroup(headEl, level) {
    var group = headEl.parentNode;
    var body = group.querySelector('.archive-' + level + '-body');
    if (!body) return;
    var isOpen = body.style.display !== 'none';
    var icon = headEl.querySelector('.archive-' + level + '-icon');
    var arrow = headEl.querySelector('.archive-' + level + '-arrow');
    if (isOpen) {
      body.style.display = 'none';
      if (icon) icon.textContent = '📁';
      if (arrow) arrow.textContent = '▶';
      group.classList.remove('expanded');
    } else {
      body.style.display = '';
      if (icon) icon.textContent = '📂';
      if (arrow) arrow.textContent = '▼';
      group.classList.add('expanded');
    }
  }

  function formatMonthLabel(ym) {
    var parts = ym.split('-');
    if (parts.length < 2) return ym;
    return parts[0] + '年' + parseInt(parts[1], 10) + '月';
  }

  function boot() {
    bindReaderUX();
    return loadDashboard();
  }

  // 暴露为全局，供 HTML onclick 调用
  window.backToCardList = backToCardList;
  window.selectNode = function (node, isUserClick, _src) {
    selectNode(node, isUserClick !== undefined ? isUserClick : true, _src);
  };

  return {
    boot: boot,
    loadDashboard: loadDashboard,
    loadArchive: loadArchive,
    selectNode: selectNode,
    backToCardList: backToCardList,
    getDashboard: function () { return dashboard; }
  };
})();
