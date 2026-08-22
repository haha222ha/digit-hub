#!/usr/bin/env node
/**
 * past_new / muse_new 端到端验收脚本（本地静态站 + 可选生产探测）
 * Usage: node tools/e2e_psy_dist_acceptance.mjs [--live]
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PSY_DIST = path.join(ROOT, 'apps/psy-dist');
const LIVE = process.argv.includes('--live');
const PORT = 8765;
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
let failed = 0;

function pass(name, detail = '') {
  results.push({ ok: true, name, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  failed += 1;
  results.push({ ok: false, name, detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(cond, name, detail) {
  if (cond) pass(name, detail);
  else fail(name, detail);
}

function readHtml(rel) {
  return fs.readFileSync(path.join(PSY_DIST, rel), 'utf8');
}

function extractAssets(html) {
  const assets = [];
  for (const m of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    const u = m[1];
    if (u.startsWith('http') || u.startsWith('data:') || u.startsWith('#')) continue;
    assets.push(u);
  }
  return assets;
}

function resolveAsset(fromFile, assetUrl) {
  if (assetUrl.startsWith('/')) return path.join(PSY_DIST, assetUrl.replace(/^\//, ''));
  return path.normalize(path.join(path.dirname(fromFile), assetUrl));
}

async function checkStaticAssets() {
  console.log('\n[1/5] 静态资源完整性');
  const pages = [
    'tests/past_new/index.html',
    'tests/muse_new/index.html',
    'preview/index.html',
  ];
  for (const page of pages) {
    const full = path.join(PSY_DIST, page);
    assert(fs.existsSync(full), `页面存在 ${page}`);
    const html = readHtml(page);
    for (const asset of extractAssets(html)) {
      const resolved = resolveAsset(full, asset);
      if (!fs.existsSync(resolved)) {
        fail(`资源缺失 ${page}`, `${asset} → ${resolved}`);
      }
    }
    if (fs.existsSync(full)) pass(`资源引用 ${page}`);
  }

  const nginx = fs.readFileSync(path.join(ROOT, 'deploy/nginx_apply.sh'), 'utf8');
  assert(/past_new\|past_xlx/.test(nginx), 'nginx past 分销路由');
  assert(/muse_new/.test(nginx), 'nginx muse 分销路由');

  const routes = fs.readFileSync(path.join(ROOT, 'services/xhs-cloud/cloud_deploy/cloud_api/dist_routes.py'), 'utf8');
  assert(routes.includes('past_new'), 'API past 302 回退');
  assert(routes.includes('muse_new'), 'API muse 302 回退');
}

async function checkScoringAndRender() {
  console.log('\n[2/5] 评分与结果渲染（Node）');

  const pastScoring = await import(pathToFileURL(path.join(PSY_DIST, 'tests/past_new/vendor/scoring-CuPx53JQ-rBnOF_ZDsobST.js')).href);
  const pastQ = await import(pathToFileURL(path.join(PSY_DIST, 'tests/past_new/vendor/questions-Ct3o4EnI-rBnOF_ZDsobST.js')).href);
  const pastQuestions = pastQ.a.questions;
  const pastAnswers = pastQuestions.map((q) => ({
    questionId: String(q.id),
    optionId: 'A',
  }));
  pastAnswers.push({ questionId: '__historyGenderPreference', optionId: 'all' });
  const pastPayload = pastScoring.scoreAnswers(pastAnswers, pastQuestions, '历史人物匹配·新');
  assert(!!pastPayload?.result?.primary?.name, 'past 评分', pastPayload?.result?.primary?.name);

  const museScoring = await import(pathToFileURL(path.join(PSY_DIST, 'tests/muse_new/vendor/scoring-CcgIfi_e-rBnOF_ZDsobST.js')).href);
  const museQ = await import(pathToFileURL(path.join(PSY_DIST, 'tests/muse_new/vendor/questions-DpFs-59k-rBnOF_ZDsobST.js')).href);
  const museAnswers = museQ.questions.map((q) => ({
    questionId: String(q.id),
    optionId: 'A',
  }));
  const musePayload = museScoring.scoreAnswers(museAnswers, museQ.questions, '文学原型·新');
  assert(!!musePayload?.result?.title, 'muse 评分', musePayload?.result?.title);
  assert(!!musePayload?.result?.extra?.primary?.soul?.length, 'muse 完整数据 soul 段');

  const { buildPastResultHtml } = await import(pathToFileURL(path.join(PSY_DIST, 'shared/past-result-ui.js')).href);
  const { buildMuseResultHtml } = await import(pathToFileURL(path.join(PSY_DIST, 'shared/muse-result-ui.js')).href);

  const pastHtml = buildPastResultHtml(pastPayload.result, { showActions: false });
  assert(pastHtml.includes('past-history-result'), 'past 结果 DOM');
  assert(pastHtml.includes('radar-note'), 'past 雷达说明');

  const museHtml = buildMuseResultHtml(musePayload.result, { showActions: false });
  assert(museHtml.includes('wx-hero__name'), 'muse 结果 hero');
  assert(museHtml.includes('wx-mirror'), 'muse 灵魂镜像');
  assert(museHtml.includes('wx-books'), 'muse 配套剧本');

  const pastWelcome = readHtml('tests/past_new/index.html');
  assert(pastWelcome.includes('心象测'), 'past 欢迎页心象测品牌');
  assert(!pastWelcome.includes('HISTORIA'), 'past 无 HISTORIA 残留');
}

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(PSY_DIST, urlPath.replace(/^\//, ''));
      if (!filePath.startsWith(PSY_DIST)) {
        res.writeHead(403); res.end(); return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      const ext = path.extname(filePath);
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
      };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function runPlaywrightE2E(server) {
  console.log('\n[3/5] 浏览器端到端（Playwright）');
  const py = path.join(ROOT, 'tools', '_e2e_playwright_runner.py');
  fs.writeFileSync(py, `import sys, time
from playwright.sync_api import sync_playwright

BASE = "${BASE}"
errors = []

def run_flow(page, test_code, steps):
    url = f"{BASE}/tests/{test_code}/index.html"
    page.goto(url, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(800)
    if page.locator("body").evaluate("el => el.classList.contains('page-disabled')"):
        page.evaluate("document.body.classList.remove('page-disabled')")
    for action, selector in steps:
        if action == "click":
            page.locator(selector).first.click(timeout=15000)
            page.wait_for_timeout(400)
        elif action == "click_option":
            page.locator(selector).first.click(timeout=5000)
            page.wait_for_timeout(350)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = context.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))

    # past_new
    page.goto(f"{BASE}/tests/past_new/index.html", wait_until="networkidle")
    page.wait_for_timeout(600)
    page.evaluate("""() => {
      document.body.classList.remove('page-disabled');
      document.querySelectorAll('#link-validator-modal, [id*="validator-modal"]').forEach(el => el.remove());
      window.linkValidator = null;
    }""")
    page.locator("#btn-start").click(force=True)
    page.wait_for_selector("#pref-flow:not([hidden])", timeout=10000)
    page.locator("#btn-pref-next").click()
    page.wait_for_selector("#quiz-flow:not([hidden])", timeout=10000)
    for _ in range(26):
        page.locator(".fig-quiz-option").first.click()
        page.wait_for_timeout(380)
    page.wait_for_selector("#screen-result.active", timeout=20000)
    page.wait_for_selector("[data-past-result] .hero-cn-name", timeout=10000)
    past_name = page.locator("[data-past-result] .hero-cn-name").inner_text()
    print(f"PAST_RESULT={past_name}")

    # muse_new
    page.goto(f"{BASE}/tests/muse_new/index.html", wait_until="networkidle")
    page.wait_for_timeout(600)
    page.evaluate("""() => {
      document.body.classList.remove('page-disabled');
      document.querySelectorAll('#link-validator-modal, [id*="validator-modal"]').forEach(el => el.remove());
      window.linkValidator = null;
    }""")
    page.locator("#btn-start").click(force=True)
    page.wait_for_selector("#screen-quiz.active", timeout=10000)
    for _ in range(26):
        page.locator(".wx-quiz__option").first.click()
        page.wait_for_timeout(380)
    page.wait_for_selector("#muse-transition:not([hidden])", timeout=10000)
    page.wait_for_selector("#screen-result.active", timeout=25000)
    page.wait_for_selector("[data-muse-result] .wx-hero__name", timeout=10000)
    muse_name = page.locator("[data-muse-result] .wx-hero__name").inner_text()
    print(f"MUSE_RESULT={muse_name}")

    # dist redirect simulation (local static: direct path only)
    for code in ("past_new", "muse_new"):
        r = page.goto(f"{BASE}/tests/{code}/index.html", wait_until="domcontentloaded")
        if r.status != 200:
            errors.append(f"{code} status {r.status}")

    browser.close()

if errors:
    print("PLAYWRIGHT_ERRORS=" + "|".join(errors))
    sys.exit(1)
print("PLAYWRIGHT_OK=1")
`);

  return new Promise((resolve) => {
    const proc = spawn('python', [py], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    proc.stderr.on('data', (d) => { err += d; process.stderr.write(d); });
    proc.on('close', (code) => {
      if (code === 0 && out.includes('PLAYWRIGHT_OK=1')) {
        const past = (out.match(/PAST_RESULT=(.+)/) || [])[1]?.trim();
        const muse = (out.match(/MUSE_RESULT=(.+)/) || [])[1]?.trim();
        pass('past 浏览器全流程', past);
        pass('muse 浏览器全流程（含过渡屏）', muse);
      } else {
        fail('Playwright 端到端', err || out || `exit ${code}`);
      }
      resolve();
    });
  });
}

async function checkLiveSite() {
  if (!LIVE) {
    console.log('\n[4/5] 生产探测（跳过，加 --live 启用）');
    return;
  }
  console.log('\n[4/5] 生产站点探测');
  const host = 'https://psy.xhs365.cn';
  const paths = [
    '/tests/past_new/index.html',
    '/tests/muse_new/index.html',
    '/test/past_new/duVuY16qoqqqs5qJtmN3KQ',
    '/test/muse_new/duVuY16qoqqqs5qJtmN3KQ',
  ];
  for (const p of paths) {
    try {
      const res = await fetch(host + p, { redirect: 'manual' });
      const ok = res.status === 200 || res.status === 302;
      assert(ok, `生产 ${p}`, `status ${res.status}`);
      if (res.status === 302) {
        const loc = res.headers.get('location') || '';
        assert(loc.includes('/tests/'), `生产重定向 ${p}`, loc);
      }
    } catch (e) {
      fail(`生产 ${p}`, e.message);
    }
  }
}

async function main() {
  console.log('=== psy-dist 端到端验收 ===');
  await checkStaticAssets();
  await checkScoringAndRender();

  const server = await startStaticServer();
  try {
    await runPlaywrightE2E(server);
  } catch (e) {
    fail('Playwright 启动', e.message);
  } finally {
    server.close();
  }

  await checkLiveSite();

  console.log('\n[5/5] 汇总');
  const total = results.length;
  const ok = results.filter((r) => r.ok).length;
  console.log(`通过 ${ok}/${total}，失败 ${failed}`);
  if (failed > 0) {
    console.log('\n失败项:');
    results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
    process.exit(1);
  }
  console.log('\n验收通过：past_new / muse_new 本地全流程可用。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
