import { navigate } from "./router.js";
import { loadCatalog, loadSkin, liveSkins, findSkinMeta } from "./data/skins.js";
import {
  scoreSkin,
  persistProgress,
  loadProgress,
  clearProgress,
  saveResult,
  loadResult,
} from "./quiz/scoring.js";
import { buildOptionOrders, displayOptions, exitModalHtml } from "./quiz/session.js";
import { unlockAssessMock, clearSession, getEntitlements, DEMO_AUTH_CODE } from "./api/mock.js";
import { activateWithAuthCode } from "./api/activate.js";
import { api, isMockMode } from "./api/client.js";
import { checkReportAccess, refreshEntitlementsFromProfile } from "./api/access.js";
import { deviceId } from "./config.js";
import { radarFromResult } from "./viz/radar.js";
import { peerCompareHtml } from "./viz/norms.js";
import { pushHistory, historyCurveHtml } from "./viz/history.js";
import { shareOrDownload } from "./share/exportCard.js";
import { downloadReportPdf } from "./share/exportPdf.js";
import { softValueHtml, fullValueHtml, unlockValueStripHtml, accessBadgeHtml } from "./result/value.js";
import { buildNarrative, narrativeHeroHtml } from "./result/narrative.js";
import { retestBannerHtml, wireRetestBanner } from "./result/retest.js";
import {
  skinDemographics,
  demographicsFormHtml,
  readDemographics,
  injectDemoIntoResult,
} from "./demo/demographics.js";
import {
  getDuoSession,
  startDuoSession,
  setDuoSeat,
  saveDuoResult,
  clearDuoSession,
  duoReady,
  buildDuoCompare,
  duoCompareHtml,
} from "./duo/session.js";
import { buildScenes } from "./result/scenes.js";
import {
  a2hsBannerHtml,
  a2hsButtonHtml,
  wireA2hs,
} from "../base/a2hs.js";
import { baseTopbarHtml } from "../base/shell.js";
import {
  getSelectedStyle,
  setSelectedStyle,
  loadStyleCatalog,
  loadStylePack,
  applyStyleToDocument,
  materializeQuestions,
  resultChrome,
} from "./style/engine.js";

import {
  wireReveal,
  wireHorizontalDrag,
  wireAccordions,
} from "./motion.js";

function topbar(active = "") {
  const activate = active === "activate" ? "激活" : `<a class="topbar-link" href="#/activate">激活</a>`;
  const right = `${activate}<a class="topbar-link" href="#/account">${active === "account" ? "会员中心" : "会员·码"}</a>`;
  return baseTopbarHtml({ brand: "心象测", brandHref: "#/", rightHtml: right });
}

export async function renderHome(root) {
  const catalog = await loadCatalog();
  const live = liveSkins(catalog);
  const featured = live[0];
  if (!featured) {
    root.innerHTML = `${topbar()}<main class="shell"><p>暂无可用测评，请检查 skins/catalog.json</p></main>`;
    return;
  }
  const why = [
    {
      id: "w1",
      t: "一题一屏 · 断点可续",
      d: "对标获奖交互测验的节奏：每屏只做一个决定，离开再回来不会丢进度。",
    },
    {
      id: "w2",
      t: "轻结果有洞察 · 完整报告可行动",
      d: "先给可感知的结构证据，再解锁场景解读与 7 日微实验——不是空标签。",
    },
    {
      id: "w3",
      t: "三风格体验 · 类 App 主屏幕",
      d: "严谨 / 幽默 / 搞笑切换界面与语气；装到桌面后全屏打开，像原生应用。",
    },
  ];

  root.innerHTML = `
    ${topbar()}
    <main class="home-main">
      <section class="home-stage">
        <div class="home-aurora" aria-hidden="true">
          <span class="blob b1"></span>
          <span class="blob b2"></span>
          <span class="blob b3"></span>
        </div>
        <div class="shell home-stage-inner">
          <p class="home-kicker">INK PAPER LAB</p>
          <h1 class="home-brand" aria-label="心象测">
            <span class="brand-char" style="--i:0">心</span>
            <span class="brand-char" style="--i:1">象</span>
            <span class="brand-char" style="--i:2">测</span>
          </h1>
          <p class="home-claim">三分钟，看见另一种自己</p>
          <div class="home-actions">
            <button class="btn btn-primary btn-glow" type="button" data-go="#/t/${featured.id}">开始今日测评</button>
            <button class="btn btn-ghost" type="button" data-go="#/tests">浏览全部</button>
          </div>
        </div>
      </section>

      <section class="home-rail-wrap" id="homeCards">
        <div class="shell">
          <div class="rail-head">
            <div>
              <p class="group-label">横向滑动</p>
              <h2 class="rail-title">今日测评卡</h2>
            </div>
            <p class="muted rail-tip">点卡片即可开始</p>
          </div>
          <div class="home-rail" id="homeRail" tabindex="0" aria-label="测评卡片横向列表">
            ${live
              .map(
                (item, i) => `
              <a class="rail-card" href="#/t/${item.id}">
                <span class="rail-index">${String(i + 1).padStart(2, "0")}</span>
                <strong>${item.title}</strong>
                <span class="muted">约 ${item.minutes} 分钟</span>
                <span class="rail-promise">${item.promise}</span>
                <span class="rail-cta">进入 ›</span>
              </a>`
              )
              .join("")}
            <a class="rail-card rail-card-more" href="#/tests">
              <strong>全部测评</strong>
              <span class="muted">目录与即将上线</span>
              <span class="rail-cta">打开 ›</span>
            </a>
          </div>
        </div>
      </section>

      <section class="shell home-install">
        ${a2hsBannerHtml()}
      </section>

      <section class="shell home-why">
        <div class="rail-head">
          <div>
            <p class="group-label">展开阅读</p>
            <h2 class="rail-title">为什么是心象测</h2>
          </div>
        </div>
        <div class="acc-list">
          ${why
            .map(
              (w, i) => `
            <div class="acc-item">
              <button type="button" class="acc-btn" data-acc="${w.id}" aria-expanded="${i === 0 ? "true" : "false"}">
                <span>${w.t}</span>
                <span class="acc-icon" aria-hidden="true"></span>
              </button>
              <div class="acc-panel ${i === 0 ? "open" : ""}" data-acc-panel="${w.id}">
                <p>${w.d}</p>
              </div>
            </div>`
            )
            .join("")}
        </div>
        <button type="button" class="btn btn-ghost acc-expand-all" id="expandAll">展开全部要点</button>
      </section>

      <section class="shell home-footer-cta">
        <p class="group-label">READY</p>
        <h2 class="rail-title">从一张卡开始</h2>
        <button class="btn btn-ember btn-block btn-glow" type="button" data-go="#/t/${featured.id}">立即开始 · ${featured.title}</button>
      </section>
    </main>
  `;

  root.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault();
      const to = b.getAttribute("data-go") || "";
      navigate(to.startsWith("#") ? to.slice(1) : to);
    })
  );
  wireA2hs(root);
  wireHorizontalDrag(root.querySelector("#homeRail"));
  wireAccordions(root);
  root.querySelector("#expandAll")?.addEventListener("click", () => {
    root.querySelectorAll("[data-acc]").forEach((btn) => {
      btn.setAttribute("aria-expanded", "true");
      root.querySelector(`[data-acc-panel="${btn.getAttribute("data-acc")}"]`)?.classList.add("open");
    });
  });
  requestAnimationFrame(() => root.querySelector(".home-stage")?.classList.add("is-live"));
}

export async function renderCatalog(root) {
  const catalog = await loadCatalog();
  const liveCount = liveSkins(catalog).length;
  root.innerHTML = `
    ${topbar()}
    <main class="shell">
      <h1 class="page-title" data-reveal>全部测评</h1>
      <p class="muted" data-reveal style="--d:0.08s">${liveCount} 套已开放 · 分组对齐复购剧本（职场 / 情感 / 复测 / 双人 / 集邮）</p>
      ${catalog.groups
        .map(
          (g, gi) => `
        <section class="catalog-group" data-reveal style="--d:${0.05 * gi}s">
          <p class="group-label">${g.label}${g.items.some((x) => x.lane) && g.id !== "personality" ? ` · ${g.items.find((x) => x.lane)?.lane || ""}` : ""}</p>
          ${g.desc ? `<p class="muted catalog-group-desc">${g.desc}</p>` : ""}
          ${g.items
            .map((item, i) => {
              const disabled = item.status !== "live";
              const href = disabled ? "#" : `#/t/${item.id}`;
              const lane = item.lane && !disabled ? `<span class="lane-pill">${item.lane}</span>` : "";
              return `
              <div class="catalog-acc">
                <a class="test-row ${disabled ? "disabled" : ""}" href="${href}">
                  <div>
                    <strong>${item.title}${disabled ? " · 即将上线" : ""}</strong>
                    <span class="muted">约 ${item.minutes} 分钟 ${lane}</span>
                  </div>
                  <span class="chev">›</span>
                </a>
                <button type="button" class="acc-btn catalog-more" data-acc="c-${item.id}" aria-expanded="false">
                  <span>展开简介</span>
                  <span class="acc-icon" aria-hidden="true"></span>
                </button>
                <div class="acc-panel" data-acc-panel="c-${item.id}">
                  <p>${item.promise || "更多母题陆续上线"}</p>
                </div>
              </div>
            `;
            })
            .join("")}
        </section>
      `
        )
        .join("")}
    </main>
  `;
  wireReveal(root);
  wireAccordions(root);
}

export async function renderIntro(root, skinId) {
  const catalog = await loadCatalog();
  const meta = findSkinMeta(catalog, skinId);
  if (!meta || meta.status !== "live") {
    root.innerHTML = `${topbar()}<main class="shell"><p>测评未开放</p><a href="#/tests">返回目录</a></main>`;
    return;
  }
  const skin = await loadSkin(skinId);
  const stylesCat = await loadStyleCatalog();
  let styleId = getSelectedStyle();
  await applyStyleToDocument(styleId);
  const qCount = skin.needsRole ? skin.questions.length + 1 : skin.questions.length;

  const paint = async () => {
    const pack = await loadStylePack(styleId);
    const introText =
      (skin.introByStyle && skin.introByStyle[styleId]) || skin.intro;
    root.innerHTML = `
      ${topbar()}
      <main class="shell">
        <h1 class="page-title">${skin.title}</h1>
        <p class="muted">约 ${skin.minutes} 分钟 · ${qCount} 题${skin.duo ? " · 支持双人对照" : ""}${skin.badge ? ` · ${skin.badge}` : ""}</p>
        ${skin.disclaimer ? `<p class="disclaimer-pill">${skin.disclaimer}</p>` : ""}
        <p style="margin:18px 0">${introText}</p>
        ${
          skin.duo
            ? `<p class="disclaimer-pill">双人模式：先完成座位 A，再邀请对方在同一设备完成座位 B，生成对照页。</p>`
            : ""
        }

        <p class="group-label">选择体验风格</p>
        <p class="muted" style="margin:0 0 10px">题目语气、选项措辞、结果页会一起切换——开测前选定。</p>
        <div class="tone-picker">
          ${(stylesCat.styles || [])
            .map(
              (s) => `
            <button type="button" class="tone-card ${styleId === s.id ? "on" : ""}" data-tone="${s.id}">
              <strong>${s.label}</strong>
              <span class="muted">${s.desc}</span>
            </button>`
            )
            .join("")}
        </div>
        <p class="tone-hint muted">当前：${pack.label} · ${pack.tagline}</p>

        <p class="group-label">你会得到</p>
        <ul class="why-list">
          ${skin.youGet.map((x) => `<li>${x}</li>`).join("")}
        </ul>
        <div class="stack" style="margin-top:28px">
          <button class="btn btn-primary btn-block" id="start">以「${pack.label}」风格开始</button>
          <button class="btn btn-ghost" data-go="#/tests">返回目录</button>
        </div>
      </main>
    `;
    root.querySelectorAll("[data-tone]").forEach((b) => {
      b.onclick = async () => {
        styleId = setSelectedStyle(b.dataset.tone);
        await applyStyleToDocument(styleId);
        paint();
      };
    });
    root.querySelector("#start").onclick = () => {
      setSelectedStyle(styleId);
      clearProgress(skinId); // always start fresh in the chosen voice
      if (skin.duo) {
        startDuoSession(skinId);
        setDuoSeat(skinId, "A");
      }
      navigate(`/t/${skinId}/play`);
    };
    root.querySelector("[data-go]").onclick = (e) => {
      e.preventDefault();
      navigate("/tests");
    };
  };

  await paint();
}

function buildQuestionList(skin, roleId) {
  if (!skin.needsRole) return skin.questions;
  const roleQs = skin.roleQuestions?.[roleId] || [];
  return [...skin.questions, ...roleQs];
}

export async function renderPlay(root, skinId) {
  const skin = await loadSkin(skinId);
  const styleId = getSelectedStyle();
  await applyStyleToDocument(styleId);
  let saved = loadProgress(skinId);
  const demoFields = skinDemographics(skin);
  const duo = getDuoSession(skinId);
  const duoSeat = skin.duo ? duo?.seat || "A" : null;

  if (demoFields && !saved?.demographicsDone) {
    root.innerHTML = `
      ${topbar()}
      <main class="shell">
        <h1 class="page-title">开始前 2 问</h1>
        <p class="muted">${skin.duo ? `双人模式 · 当前座位 ${duoSeat}` : "可选 · 让报告更贴你的情境"}</p>
        ${demographicsFormHtml(demoFields)}
        <div class="stack" style="margin-top:20px">
          <button class="btn btn-primary btn-block" id="demoGo">继续答题</button>
          <button class="btn btn-ghost btn-block" id="demoSkip">跳过</button>
        </div>
      </main>
    `;
    const commit = (values) => {
      persistProgress(skinId, {
        ...(saved || {}),
        demographics: values,
        demographicsDone: true,
        styleId,
      });
      renderPlay(root, skinId);
    };
    root.querySelector("#demoGo").onclick = () => {
      const { values } = readDemographics(root, demoFields);
      commit(values);
    };
    root.querySelector("#demoSkip").onclick = () => commit({});
    return;
  }

  if (skin.needsRole && !saved?.roleId) {
    root.innerHTML = `
      ${topbar()}
      <main class="shell">
        <h1 class="page-title">选择人生阶段</h1>
        <p class="muted">用于加载对应专属题，不影响道德评判</p>
        <div class="option-list" style="margin-top:20px">
          ${(skin.roles || [])
            .map((r) => `<button class="option" data-role="${r.id}">${r.label}</button>`)
            .join("")}
        </div>
        <button class="btn btn-ghost" id="back" style="margin-top:16px">返回</button>
      </main>
    `;
    root.querySelectorAll("[data-role]").forEach((btn) => {
      btn.onclick = () => {
        const roleId = btn.dataset.role;
        const qs = buildQuestionList(skin, roleId);
        const optionOrders = buildOptionOrders(qs, null);
        persistProgress(skinId, {
          answers: Array(qs.length).fill(null),
          index: 0,
          roleId,
          optionOrders,
          styleId,
          demographics: saved?.demographics || {},
          demographicsDone: true,
        });
        renderPlay(root, skinId);
      };
    });
    root.querySelector("#back").onclick = () => navigate(`/t/${skinId}`);
    return;
  }

  const roleId = saved?.roleId || null;
  const rawQuestions = buildQuestionList(skin, roleId);
  // Always voice from current style pick — never freeze to an old progress tone
  const questions = materializeQuestions(rawQuestions, styleId);
  let index = saved?.index ?? 0;
  let answers = saved?.answers ? [...saved.answers] : Array(questions.length).fill(null);
  let optionOrders = buildOptionOrders(questions, saved?.optionOrders);
  const demographics = saved?.demographics || {};
  if (answers.length !== questions.length || (saved?.styleId && saved.styleId !== styleId)) {
    answers = Array(questions.length).fill(null);
    index = 0;
    optionOrders = buildOptionOrders(questions, null);
  }

  const save = () =>
    persistProgress(skinId, {
      answers,
      index,
      roleId,
      optionOrders,
      styleId,
      demographics,
      demographicsDone: true,
    });

  const paint = () => {
    const q = questions[index];
    const pct = Math.round((index / questions.length) * 100);
    const opts = displayOptions(q, optionOrders[index]);
    root.innerHTML = `
      ${topbar()}
      <main class="shell quiz-body">
        <div class="quiz-top">
          <div class="progress-meta"><span>${skin.title}${duoSeat ? ` · ${duoSeat}` : ""}</span><span>${index + 1} / ${questions.length}</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
        ${q.d ? `<div class="quiz-dim">${dimLabel(skin, q.d)}${q.t && q.t !== dimLabel(skin, q.d) && q.t !== q.d ? ` · ${q.t}` : ""}${q.reverse ? " · 反向题" : ""}</div>` : ""}
        <div class="quiz-stage" id="quizStage">
          <h2 class="quiz-q">${q.q}</h2>
          <div class="option-list ${opts.every((o) => o.t.length < 12) ? "short" : ""}">
            ${opts
              .map(
                (o) =>
                  `<button class="option ${answers[index] === o.origIdx ? "selected" : ""}" data-orig="${o.origIdx}">${o.t}</button>`
              )
              .join("")}
          </div>
        </div>
        <div class="quiz-nav">
          <button class="btn btn-ghost" id="prev" ${index === 0 ? "disabled" : ""}>上一题</button>
          <button class="btn btn-ghost" id="exit">离开</button>
        </div>
      </main>
    `;
    requestAnimationFrame(() => root.querySelector("#quizStage")?.classList.add("is-in"));
    root.querySelectorAll(".option").forEach((btn) => {
      btn.onclick = () => {
        if (btn.disabled) return;
        const orig = Number(btn.dataset.orig);
        answers[index] = orig;
        root.querySelectorAll(".option").forEach((b) => {
          b.classList.toggle("selected", b === btn);
          b.disabled = true;
        });
        btn.classList.add("is-pop");
        save();
        const stage = root.querySelector("#quizStage");
        setTimeout(() => {
          stage?.classList.add("is-out");
          setTimeout(() => {
            if (index < questions.length - 1) {
              index += 1;
              save();
              paint();
            } else {
              finish();
            }
          }, 160);
        }, 140);
      };
    });
    root.querySelector("#prev").onclick = () => {
      if (index > 0) {
        index -= 1;
        save();
        paint();
      }
    };
    root.querySelector("#exit").onclick = () => showExitRecovery();
  };

  const showExitRecovery = () => {
    save();
    const wrap = document.createElement("div");
    wrap.innerHTML = exitModalHtml();
    root.append(...wrap.children);
    const close = () => {
      root.querySelector("#exitBd")?.remove();
      root.querySelector("#exitDrawer")?.remove();
    };
    root.querySelector("#exitStay").onclick = close;
    root.querySelector("#exitBd").onclick = close;
    root.querySelector("#exitLeave").onclick = () => {
      close();
      navigate(`/t/${skinId}`);
    };
    root.querySelector("#exitReset").onclick = () => {
      clearProgress(skinId);
      close();
      navigate(`/t/${skinId}`);
    };
  };

  const finish = () => {
    root.innerHTML = `
      ${topbar()}
      <main class="shell" style="min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px">
        <div class="ink-pulse" aria-hidden="true"></div>
        <p class="muted">正在生成你的心象…</p>
      </main>
    `;
    let result = scoreSkin(skin, answers, questions);
    result = injectDemoIntoResult(result, demographics);
    clearProgress(skinId);
    pushHistory(skinId, result);
    const rid = saveResult(skinId, result, { duoSeat: duoSeat || undefined });
    if (skin.duo && duoSeat) {
      const session = saveDuoResult(skinId, duoSeat, rid, result);
      if (duoSeat === "A") {
        setTimeout(() => navigate(`/t/${skinId}/result?rid=${rid}&duo=A`), 900);
        return;
      }
      if (duoReady(session)) {
        setTimeout(() => navigate(`/t/${skinId}/duo`), 900);
        return;
      }
    }
    setTimeout(() => navigate(`/t/${skinId}/result?rid=${rid}`), 900);
  };

  paint();
}

function dimLabel(skin, id) {
  return skin.dimensions?.find((d) => d.id === id)?.label || id;
}

export async function renderSoftResult(root, skinId, query) {
  const rid =
    new URLSearchParams(query).get("rid") || localStorage.getItem(`xinxiang_last_result_${skinId}`);
  const packed = rid ? loadResult(rid) : null;
  if (!packed) {
    root.innerHTML = `${topbar()}<main class="shell"><p>暂无结果，请重新测评</p><a href="#/t/${skinId}">返回</a></main>`;
    return;
  }
  const skin = await loadSkin(skinId);
  const r = packed.result;
  const unlocked = await checkReportAccess(skinId);
  const styleId = getSelectedStyle();
  const pack = await applyStyleToDocument(styleId);
  const chrome = resultChrome(pack, r);
  const narr = buildNarrative(skin, r, pack);

  root.innerHTML = `
    ${topbar()}
    <main class="shell tone-result">
      ${narrativeHeroHtml(narr, chrome, pack, skin, r)}
      ${softValueHtml(skin, r, { unlocked })}
      ${
        unlocked
          ? `${radarFromResult(skin, r)}${renderBars(skin, r)}`
          : `<div class="dim-tease" aria-hidden="true">
              <div class="dim-tease-blur">${radarFromResult(skin, r)}${renderBars(skin, r)}</div>
              <p class="dim-tease-hint">雷达图与维度分布在完整报告中解锁</p>
            </div>`
      }
      <div class="unlock-bar ${unlocked ? "is-unlocked" : ""}">
        ${accessBadgeHtml(unlocked)}
        <h3>${unlocked ? "完整报告已解锁" : chrome.ctaUnlock}</h3>
        ${unlockValueStripHtml(unlocked)}
        <p class="muted" style="margin:12px 0">${
          unlocked ? "场景长文、本周动作与 7 日微实验已开放。" : narr.ctaHint
        }</p>
        <button class="btn ${unlocked ? "btn-primary" : "btn-ember"} btn-block" id="cta">
          ${unlocked ? "阅读完整高价值报告" : chrome.ctaUnlock}
        </button>
      </div>
      <div class="share-card" id="shareCard">
        <div class="brand">心象测 · ${pack.label}</div>
        <div class="hook">${narr.hook}</div>
        <div class="type">${chrome.type || r.type}</div>
        <div class="quote">${chrome.quote || r.quote || ""}</div>
      </div>
      <div class="stack" style="margin-bottom:20px">
        <button class="btn btn-primary btn-block" id="shareBtn">${chrome.ctaShare}</button>
        <p class="muted" style="text-align:center;margin:0">高密度分享卡 · 系统分享或下载 PNG</p>
        ${
          skin.duo
            ? packed.duoSeat === "A" || new URLSearchParams(query).get("duo") === "A"
              ? `<button class="btn btn-ember btn-block" id="duoB">邀请对方作答（座位 B）</button>`
              : `<button class="btn btn-ember btn-block" id="duoView">查看双人对照</button>`
            : ""
        }
      </div>
      ${retestBannerHtml(skinId)}
      <button class="btn btn-ghost btn-block" data-go="#/tests">再测一个</button>
    </main>
    <div class="drawer-backdrop" id="bd"></div>
    <div class="drawer" id="drawer"></div>
  `;
  animateBars(root);
  wireRetestBanner(root, skinId, navigate);

  const openDrawer = () => openPayDrawer(root, skinId, rid);
  const closeDrawer = () => {
    root.querySelector("#bd").classList.remove("open");
    root.querySelector("#drawer").classList.remove("open");
  };

  root.querySelector("#cta").onclick = () => {
    if (unlocked) navigate(`/report/${rid}`);
    else openDrawer();
  };
  root.querySelector("#bd").onclick = closeDrawer;
  root.querySelector("#duoB")?.addEventListener("click", () => {
    setDuoSeat(skinId, "B");
    clearProgress(skinId);
    navigate(`/t/${skinId}/play`);
  });
  root.querySelector("#duoView")?.addEventListener("click", () => navigate(`/t/${skinId}/duo`));
  root.querySelector("#shareBtn").onclick = async () => {
    try {
      const mode = await shareOrDownload({
        title: skin.title,
        type: chrome.type || r.type,
        quote: chrome.quote || r.quote,
        tags: r.tags || [],
        hook: narr.hook,
        shareLine: narr.shareLine,
        chips: narr.chips,
        styleId: pack.id,
        styleLabel: pack.label,
      });
      root.querySelector("#shareBtn").textContent =
        mode === "shared" ? "已调起分享" : "已下载分享图";
    } catch {
      alert("出图失败，请重试");
    }
  };
  root.querySelector("[data-go]").onclick = (e) => {
    e.preventDefault();
    navigate("/tests");
  };
}

function filterCheckoutPlans(plans) {
  const assessOnly = (plans || []).filter((x) => {
    const code = String(x.plan_code || x.code || "");
    if (code === "pay_test") return false;
    return code.startsWith("assess");
  });
  if (isMockMode()) return assessOnly.length ? assessOnly : plans;
  return assessOnly.filter((x) => (x.plan_code || x.code) === "assess_single");
}

const FALLBACK_SINGLE_PLAN = {
  plan_code: "assess_single",
  label: "单次完整报告",
  price_yuan: 1.99,
  amount: "1.99",
  summary: "7 天内解锁 1 份完整报告",
};

async function openPayDrawer(root, skinId, rid) {
  const drawer = root.querySelector("#drawer");
  const bd = root.querySelector("#bd");
  bd.classList.add("open");
  drawer.classList.add("open");
  drawer.innerHTML = `<p class="muted">加载支付方案…</p>`;

  let plans = [];
  let channels = [];
  try {
    const p = await api("/api/v1/payment/plans");
    const fromAssess = p.assess_plans || [];
    const fromFilter = (p.plans || []).filter((x) =>
      String(x.plan_code || x.code || "").startsWith("assess")
    );
    plans = fromAssess.length ? fromAssess : fromFilter.length ? fromFilter : p.items || [];
    plans = filterCheckoutPlans(plans);
    if (!plans.length) plans = [FALLBACK_SINGLE_PLAN];
    const c = await api("/api/v1/payment/channels");
    channels = c.channels || c.items || [];
  } catch {
    plans = [FALLBACK_SINGLE_PLAN];
    channels = [
      { channel: "wxpay", label: "微信" },
      { channel: "alipay", label: "支付宝" },
    ];
  }

  const channelOpts = channels
    .map((ch) => {
      const code = typeof ch === "string" ? ch : ch.channel;
      const label = typeof ch === "string" ? ch : ch.label;
      return `<button class="btn btn-ghost" data-ch="${code}">${label}</button>`;
    })
    .join("");

  drawer.innerHTML = `
    <h3 style="font-family:var(--font-display);margin:0 0 8px">解锁完整报告</h3>
    <p class="muted">${
      isMockMode()
        ? "本地验收：选套餐 → 模拟支付，或使用演示授权码"
        : "扫码 ¥1.99 解锁 · 小红书/闲鱼买家可用授权码"
    }</p>
    <div class="stack" style="margin-top:14px">
      ${plans
        .map((pl) => {
          const code = pl.plan_code || pl.code;
          const label = pl.label || pl.title;
          const price = pl.price_yuan ?? pl.amount;
          const tip = pl.summary ? `<span class="plan-tip">${pl.summary}</span>` : "";
          return `<button class="btn btn-ember btn-block plan-pick" data-plan="${code}"><strong>${label} · ¥${price}</strong>${tip}</button>`;
        })
        .join("")}
      <p class="group-label">支付渠道</p>
      <div class="channel-row">${channelOpts}</div>
      <div id="payPanel"></div>
      <p class="group-label">授权码解锁</p>
      <input class="field" id="code" placeholder="${isMockMode() ? DEMO_AUTH_CODE : "输入授权码"}" value="${
        isMockMode() ? DEMO_AUTH_CODE : ""
      }" />
      ${
        isMockMode()
          ? `<p class="muted" style="margin:0;font-size:0.85rem">演示码已填好：<code>${DEMO_AUTH_CODE}</code></p>`
          : ""
      }
      <button class="btn btn-primary btn-block" id="codeBtn">使用授权码登录解锁</button>
      <button class="btn btn-ghost btn-block" id="close">取消</button>
    </div>
  `;

  let channel = (channels[0] && (channels[0].channel || channels[0])) || "wxpay";
  drawer.querySelectorAll("[data-ch]").forEach((b) => {
    b.onclick = () => {
      channel = b.dataset.ch;
      drawer.querySelectorAll("[data-ch]").forEach((x) => x.classList.remove("selected-ch"));
      b.classList.add("selected-ch");
    };
  });
  drawer.querySelector("[data-ch]")?.classList.add("selected-ch");

  drawer.querySelector("#close").onclick = () => {
    bd.classList.remove("open");
    drawer.classList.remove("open");
  };

  drawer.querySelectorAll("[data-plan]").forEach((btn) => {
    btn.onclick = () => startCheckout(drawer, btn.dataset.plan, channel, skinId, rid);
  });

  drawer.querySelector("#codeBtn").onclick = async () => {
    const code = drawer.querySelector("#code").value.trim();
    try {
      await activateWithAuthCode(code);
      bd.classList.remove("open");
      drawer.classList.remove("open");
      const ok = await checkReportAccess(skinId);
      if (ok) navigate(`/report/${rid}`);
      else navigate(`/t/${skinId}/result?rid=${encodeURIComponent(rid)}`);
    } catch (e) {
      alert(e.message || "激活失败");
    }
  };
}

async function completeAccountRegisterForm(panel, orderNo) {
  return new Promise((resolve, reject) => {
    panel.innerHTML = `
      <div class="pay-box">
        <p><strong>支付成功</strong></p>
        <p class="muted">设置账号以绑定本次购买的权益</p>
        <div class="stack" id="registerForm">
          <input class="field" id="regUser" placeholder="用户名（3–64 位）" autocomplete="username" maxlength="64" />
          <input class="field" id="regPass" type="password" placeholder="密码（至少 6 位）" autocomplete="new-password" minlength="6" />
          <p class="muted" id="regHint" style="margin:0;font-size:0.85rem"></p>
          <button class="btn btn-primary btn-block" id="regSubmit">注册并开通</button>
        </div>
      </div>
    `;
    const hint = panel.querySelector("#regHint");
    const submit = panel.querySelector("#regSubmit");
    const run = async () => {
      const username = panel.querySelector("#regUser").value.trim();
      const password = panel.querySelector("#regPass").value;
      if (username.length < 3 || username.length > 64) {
        hint.textContent = "用户名需 3–64 位";
        return;
      }
      if (password.length < 6) {
        hint.textContent = "密码至少 6 位";
        return;
      }
      submit.disabled = true;
      hint.textContent = "注册中…";
      try {
        const res = await api(`/api/v1/payment/orders/${orderNo}/complete`, {
          method: "POST",
          body: JSON.stringify({
            mode: "register",
            username,
            password,
            device_id: deviceId(),
            device_label: "browser",
          }),
        });
        if (res.access_token) localStorage.setItem("xinxiang_token", res.access_token);
        resolve();
      } catch (e) {
        submit.disabled = false;
        hint.textContent = e.message || "注册失败，请重试";
        reject(e);
      }
    };
    submit.onclick = run;
    panel.querySelector("#regPass").addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") run();
    });
  });
}

async function startCheckout(drawer, plan_code, channel, skinId, rid) {
  const panel = drawer.querySelector("#payPanel");
  panel.innerHTML = `<p class="muted">创建订单中…</p>`;
  try {
    const order = await api("/api/v1/payment/orders", {
      method: "POST",
      body: JSON.stringify({ plan_code, channel: channel === "wechat" ? "wxpay" : channel }),
    });
    const qrSrc = order.qrcode
      ? isMockMode()
        ? ""
        : `/api/v1/payment/qrcode?data=${encodeURIComponent(order.qrcode)}`
      : "";
    panel.innerHTML = `
      <div class="pay-box">
        <p><strong>${order.plan_label || plan_code}</strong> · ¥${order.amount || ""}</p>
        <p class="muted">订单 ${order.order_no}</p>
        ${
          qrSrc
            ? `<img class="pay-qr" src="${qrSrc}" alt="支付二维码" />`
            : `<div class="pay-qr mock-qr">MOCK QR<br/>${order.order_no.slice(-8)}</div>`
        }
        ${order.payurl ? `<a href="${order.payurl}" target="_blank" rel="noopener">打开支付链接</a>` : ""}
        <button class="btn btn-primary btn-block" id="poll">我已支付 · 查询订单</button>
        ${
          isMockMode()
            ? `<button class="btn btn-ember btn-block" id="mockPay">模拟支付成功</button>`
            : ""
        }
        <div id="payStatus" class="muted"></div>
      </div>
    `;

    let settled = false;
    let awaitingRegister = false;
    let pollTimer = null;

    const finishAfterPay = async () => {
      await refreshEntitlementsFromProfile();
      const ok = await checkReportAccess(skinId);
      if (ok) {
        navigate(`/report/${rid}`);
        return true;
      }
      const statusEl = panel.querySelector("#payStatus");
      if (statusEl) statusEl.textContent = "已支付但权益未生效，请刷新或联系客服";
      return false;
    };

    const fulfill = async () => {
      if (settled) return true;
      if (awaitingRegister) return false;
      const st = await api(`/api/v1/payment/orders/${order.order_no}`);
      const statusEl = panel.querySelector("#payStatus");
      if (statusEl) statusEl.textContent = `状态：${st.status}`;
      if (st.status !== "paid") return false;

      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }

      if (isMockMode()) {
        await api(`/api/v1/payment/orders/${order.order_no}/complete`, {
          method: "POST",
          body: JSON.stringify({
            mode: "register",
            username: "mock_" + Date.now().toString(36),
            password: "mockpass123",
            device_id: deviceId(),
            device_label: "browser",
          }),
        });
      } else if (st.next_action === "complete_account") {
        awaitingRegister = true;
        try {
          await completeAccountRegisterForm(panel, order.order_no);
        } catch {
          awaitingRegister = false;
          return false;
        }
      } else if (localStorage.getItem("xinxiang_token")) {
        await api(`/api/v1/payment/orders/${order.order_no}/claim`, { method: "POST", body: "{}" });
      }

      settled = true;
      return finishAfterPay();
    };

    panel.querySelector("#poll").onclick = () => {
      fulfill().catch((e) => {
        const el = panel.querySelector("#payStatus");
        if (el) el.textContent = e.message || "处理失败";
      });
    };
    panel.querySelector("#mockPay")?.addEventListener("click", async () => {
      await api("/api/v1/payment/mock-pay", {
        method: "POST",
        body: JSON.stringify({ order_no: order.order_no }),
      });
      await fulfill();
    });

    let n = 0;
    pollTimer = setInterval(async () => {
      n += 1;
      const done = await fulfill().catch(() => false);
      if (done || n > 40) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 3000);
  } catch (e) {
    panel.innerHTML = `<p class="muted">下单失败：${e.message}</p>`;
  }
}

function renderBars(skin, r) {
  if (!r.pct) return "";
  if (r.mode === "mbti") {
    const rows = [
      ["外向 E", r.pct.EI, "内向 I"],
      ["实感 S", 100 - r.pct.SN, "直觉 N"],
      ["思考 T", r.pct.TF, "情感 F"],
      ["判断 J", r.pct.JP, "感知 P"],
    ];
    return `<div class="dim-bars">${rows
      .map(
        ([a, p, b]) => `
      <div class="dim-row">
        <header><span>${a}</span><span>${b}</span></header>
        <div class="dim-track"><div class="dim-fill" data-w="${p}"></div></div>
      </div>`
      )
      .join("")}</div>`;
  }
  return `<div class="dim-bars">${skin.dimensions
    .map((d) => {
      const p = r.pct[d.id] || 0;
      return `<div class="dim-row">
        <header><span>${d.label}</span><span>${p}%</span></header>
        <div class="dim-track"><div class="dim-fill" data-w="${p}"></div></div>
      </div>`;
    })
    .join("")}</div>`;
}

function animateBars(root) {
  requestAnimationFrame(() => {
    root.querySelectorAll(".dim-fill").forEach((n) => {
      n.style.width = `${n.dataset.w}%`;
    });
  });
}

export async function renderFullReport(root, resultId) {
  const packed = loadResult(resultId);
  if (!packed) {
    root.innerHTML = `${topbar()}<main class="shell"><p>报告不存在</p></main>`;
    return;
  }
  const skin = await loadSkin(packed.skinId);
  const r = packed.result;
  const unlocked = await checkReportAccess(packed.skinId);
  if (!unlocked) {
    navigate(`/t/${packed.skinId}/result?rid=${resultId}`);
    return;
  }
  const pack = await applyStyleToDocument(getSelectedStyle());
  const chrome = resultChrome(pack, r);
  const narr = buildNarrative(skin, r, pack);
  const sections = r.full || [];
  root.innerHTML = `
    ${topbar()}
    <main class="shell report-shell tone-result">
      <p class="muted">${skin.title} · 完整报告 · ${pack.label}</p>
      ${narrativeHeroHtml(narr, chrome, pack, skin, r)}
      ${fullValueHtml(skin, r)}
      <section class="report-block">
        <h3>结构证据</h3>
        <p class="muted">雷达与维度条是「证据层」——先看图，再读场景文案。</p>
        ${radarFromResult(skin, r)}
        ${renderBars(skin, r)}
      </section>
      ${peerCompareHtml(skin, r)}
      ${historyCurveHtml(skin, packed.skinId)}
      <p class="group-label" style="margin-top:28px">深度解读</p>
      ${sections
        .map(
          (s) => `
        <article class="report-block">
          <h3>${s.h}</h3>
          <p class="muted">${s.p}</p>
        </article>`
        )
        .join("")}
      <div class="stack" style="margin:24px 0">
        <button class="btn btn-ember btn-block" id="shareBtn">${chrome.ctaShare}</button>
        <button class="btn btn-primary btn-block" id="pdfBtn">下载完整报告 PDF</button>
        <button class="btn btn-primary btn-block" data-go="#/t/${packed.skinId}/play">复测此皮 · 更新曲线</button>
        ${
          skin.duo
            ? `<button class="btn btn-ghost btn-block" data-go="#/t/${packed.skinId}/duo">双人对照</button>`
            : ""
        }
        ${retestBannerHtml(packed.skinId)}
        ${a2hsButtonHtml({ variant: "ghost", label: "添加到主屏幕" })}
        <button class="btn btn-ghost btn-block" data-go="#/tests">返回目录</button>
      </div>
    </main>
  `;
  animateBars(root);
  wireA2hs(root);
  wireRetestBanner(root, packed.skinId, navigate);
  root.querySelector("#shareBtn").onclick = () =>
    shareOrDownload({
      title: `${skin.title} · ${pack.label}`,
      type: chrome.type || r.type,
      quote: chrome.quote || r.quote,
      tags: r.tags || [],
      hook: narr.hook,
      shareLine: narr.shareLine,
      chips: narr.chips,
      styleId: pack.id,
      styleLabel: pack.label,
    });
  root.querySelector("#pdfBtn").onclick = async () => {
    const btn = root.querySelector("#pdfBtn");
    btn.disabled = true;
    btn.textContent = "正在生成 PDF…";
    try {
      const scenes = buildScenes(skin, r);
      await downloadReportPdf({
        title: skin.title,
        type: chrome.type || r.type,
        hook: narr.hook,
        quote: chrome.quote || r.quote,
        chips: narr.chips,
        scenes,
        weekPlan: [],
        shareLine: narr.shareLine,
        demoLine: r.demoLine || "",
        disclaimer: skin.disclaimer,
        styleLabel: pack.label,
        filename: `心象测-${skin.title}-${r.type || "报告"}.pdf`,
      });
      btn.textContent = "已下载 PDF";
    } catch (e) {
      console.error(e);
      btn.textContent = "导出失败，请重试";
    }
    btn.disabled = false;
  };
  root.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.getAttribute("data-go").includes("/play")) clearProgress(packed.skinId);
      navigate(b.getAttribute("data-go").slice(1));
    })
  );
}

export async function renderDuoCompare(root, skinId) {
  const skin = await loadSkin(skinId);
  if (!skin.duo) {
    navigate(`/t/${skinId}`);
    return;
  }
  const session = getDuoSession(skinId);
  if (!duoReady(session)) {
    root.innerHTML = `
      ${topbar()}
      <main class="shell">
        <h1 class="page-title">双人对照未完成</h1>
        <p class="muted">需要座位 A 与 B 各完成一次测评。</p>
        <div class="stack" style="margin-top:20px">
          <button class="btn btn-primary btn-block" id="goA">开始座位 A</button>
          <button class="btn btn-ember btn-block" id="goB" ${session?.a ? "" : "disabled"}>开始座位 B</button>
          <button class="btn btn-ghost btn-block" data-go="#/t/${skinId}">返回介绍</button>
        </div>
      </main>
    `;
    root.querySelector("#goA").onclick = () => {
      startDuoSession(skinId);
      setDuoSeat(skinId, "A");
      clearProgress(skinId);
      navigate(`/t/${skinId}/play`);
    };
    root.querySelector("#goB").onclick = () => {
      setDuoSeat(skinId, "B");
      clearProgress(skinId);
      navigate(`/t/${skinId}/play`);
    };
    root.querySelector("[data-go]").onclick = (e) => {
      e.preventDefault();
      navigate(`/t/${skinId}`);
    };
    return;
  }
  const compare = buildDuoCompare(skin, session.a.result, session.b.result);
  const pack = await applyStyleToDocument(getSelectedStyle());
  root.innerHTML = `
    ${topbar()}
    <main class="shell tone-result">
      <p class="muted">${skin.title} · 双人对照 · ${pack.label}</p>
      ${duoCompareHtml(skin, session, compare)}
      <div class="stack" style="margin:24px 0">
        <button class="btn btn-primary btn-block" id="shareDuo">分享对照句</button>
        <button class="btn btn-ghost btn-block" id="resetDuo">清空双人会话并重测</button>
        <button class="btn btn-ghost btn-block" data-go="#/tests">返回目录</button>
      </div>
    </main>
  `;
  root.querySelector("#shareDuo").onclick = () =>
    shareOrDownload({
      title: `${skin.title} · 双人`,
      type: compare.title,
      quote: compare.tips[0] || "",
      hook: compare.title,
      shareLine: compare.shareLine,
      chips: [
        { k: "A", v: session.a.result.type },
        { k: "B", v: session.b.result.type },
      ],
      styleId: pack.id,
      styleLabel: pack.label,
    });
  root.querySelector("#resetDuo").onclick = () => {
    clearDuoSession(skinId);
    clearProgress(skinId);
    navigate(`/t/${skinId}`);
  };
  root.querySelector("[data-go]").onclick = (e) => {
    e.preventDefault();
    navigate("/tests");
  };
}

export async function renderActivate(root, query) {
  const params = new URLSearchParams(query);
  const initialCode = params.get("code")?.trim() || "";
  const catalog = await loadCatalog();
  const featured = liveSkins(catalog)[0];
  const nextPath = featured ? `/t/${featured.id}` : "/tests";

  root.innerHTML = `
    ${topbar("activate")}
    <main class="shell">
      <h1 class="page-title">激活授权码</h1>
      <p class="muted">小红书 / 闲鱼购买后，在此激活即可解锁完整测评报告。</p>
      <section class="section activate-box">
        <input class="field" id="code" placeholder="粘贴授权码" value="${initialCode.replace(/"/g, "&quot;")}" autocomplete="off" />
        <button class="btn btn-primary btn-block" id="activateBtn">立即激活</button>
        <p class="muted" id="status" style="margin:12px 0 0"></p>
        <div id="successPanel" hidden>
          <p class="access-badge on"><span class="dot"></span>激活成功 · 权益已生效</p>
          <p class="muted">建议截图保存授权码，换设备时可再次输入激活。</p>
          <button class="btn btn-ember btn-block" id="goTest">开始测评</button>
          <button class="btn btn-ghost btn-block" id="goAccount">查看会员中心</button>
        </div>
      </section>
      <p class="muted" style="font-size:0.85rem">自然流量用户可先免费测题，结果页再扫码 ¥1.99 或填码解锁。</p>
    </main>
  `;

  const statusEl = root.querySelector("#status");
  const successPanel = root.querySelector("#successPanel");
  const codeInput = root.querySelector("#code");
  const activateBtn = root.querySelector("#activateBtn");

  const showSuccess = () => {
    successPanel.hidden = false;
    activateBtn.hidden = true;
    statusEl.textContent = "";
  };

  const runActivate = async () => {
    statusEl.textContent = "激活中…";
    try {
      await activateWithAuthCode(codeInput.value);
      showSuccess();
    } catch (e) {
      statusEl.textContent = e.message || "激活失败，请检查授权码";
    }
  };

  activateBtn.onclick = runActivate;
  root.querySelector("#goTest").onclick = () => navigate(nextPath);
  root.querySelector("#goAccount").onclick = () => navigate("/account");

  if (initialCode) runActivate();
}

export async function renderAccount(root) {
  await refreshEntitlementsFromProfile().catch(() => null);
  const ent = getEntitlements();
  let profile = null;
  try {
    profile = await api("/api/v1/member/profile");
  } catch {
    profile = null;
  }
  const assess = ent.products?.assess || {};
  root.innerHTML = `
    ${topbar("account")}
    <main class="shell">
      <h1 class="page-title">会员中心</h1>
      <p class="muted">${profile ? `已登录 · ${profile.username || ""}` : "未登录（可先体验测评）"}</p>
      <p class="muted">API：${isMockMode() ? "mock（加 ?api=live 切真服）" : "live"}</p>
      <section class="section">
        <h2>当前权益</h2>
        <p>套餐：${ent.plan_code || "guest"}</p>
        <p>测评完整报告：${assess.enabled || ent.assess_enabled ? "已开通" : "未开通"}</p>
        <p class="muted">月额度：${assess.quota_per_month ?? 0} · 皮肤：${(assess.skins || []).join(", ") || "—"}</p>
      </section>
      <section class="section">
        <h2>快捷操作</h2>
        <div class="stack" style="margin-top:14px">
          ${
            isMockMode()
              ? `<button class="btn btn-ember btn-block" id="unlock">模拟解锁测评权益</button>
                 <p class="muted" style="margin:0;font-size:0.85rem">演示授权码：<code>${DEMO_AUTH_CODE}</code></p>`
              : ""
          }
          <input class="field" id="code" placeholder="输入授权码" value="${
            isMockMode() ? DEMO_AUTH_CODE : ""
          }" />
          <button class="btn btn-primary btn-block" id="codeBtn">授权码登录</button>
          <button class="btn btn-ghost btn-block" id="clear">清除本地会话</button>
        </div>
      </section>
    </main>
  `;
  root.querySelector("#unlock")?.addEventListener("click", () => {
    unlockAssessMock({ plan_code: "assess_monthly", skins: ["*"] });
    renderAccount(root);
  });
  root.querySelector("#codeBtn").onclick = async () => {
    const code = root.querySelector("#code").value.trim();
    try {
      await activateWithAuthCode(code);
      renderAccount(root);
    } catch (e) {
      alert(e.message || "失败");
    }
  };
  root.querySelector("#clear").onclick = () => {
    clearSession();
    renderAccount(root);
  };
}
